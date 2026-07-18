const elements = {
  videoInput: document.querySelector("#videoInput"),
  dropZone: document.querySelector("#dropZone"),
  fileInfo: document.querySelector("#fileInfo"),
  errorMessage: document.querySelector("#errorMessage"),
  playerArea: document.querySelector("#playerArea"),
  video: document.querySelector("#video"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  playButton: document.querySelector("#playButton"),
  playIcon: document.querySelector("#playIcon"),
  timeline: document.querySelector("#timeline"),
  currentTime: document.querySelector("#currentTime"),
  duration: document.querySelector("#duration"),
  captureButton: document.querySelector("#captureButton"),
  captureMarkers: document.querySelector("#captureMarkers"),
  frameGrid: document.querySelector("#frameGrid"),
  emptyFrames: document.querySelector("#emptyFrames"),
  frameCount: document.querySelector("#frameCount"),
  clearFramesButton: document.querySelector("#clearFramesButton"),
  resetButton: document.querySelector("#resetButton"),
  columnsInput: document.querySelector("#columnsInput"),
  exportWidthSelect: document.querySelector("#exportWidthSelect"),
  numberingToggle: document.querySelector("#numberingToggle"),
  previewEmpty: document.querySelector("#previewEmpty"),
  previewViewport: document.querySelector("#previewViewport"),
  previewCanvas: document.querySelector("#previewCanvas"),
  gridSummary: document.querySelector("#gridSummary"),
  exportButton: document.querySelector("#exportButton"),
  statusMessage: document.querySelector("#statusMessage"),
  frameTemplate: document.querySelector("#frameTemplate"),
};

const state = {
  sourceFile: null,
  sourceUrl: null,
  videoWidth: 0,
  videoHeight: 0,
  duration: 0,
  frames: [],
  isSeeking: false,
  isCapturing: false,
  previewRenderToken: 0,
};

const PREVIEW_MAX_WIDTH = 1100;
const PREVIEW_MAX_HEIGHT = 1400;
const GRID_GAP_RATIO = 0.008;
const GRID_PADDING_RATIO = 0.012;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.000";

  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  const base = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${base}` : base;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function setError(message = "") {
  elements.errorMessage.textContent = message;
  elements.errorMessage.hidden = !message;
}

function setStatus(message = "") {
  elements.statusMessage.textContent = message;
}

function revokeFrame(frame) {
  if (frame?.url) URL.revokeObjectURL(frame.url);
}

function resetFrames() {
  state.frames.forEach(revokeFrame);
  state.frames = [];
  renderFrames();
  renderCaptureMarkers();
  void renderPreview();
}

function resetProject() {
  elements.video.pause();
  resetFrames();

  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);

  state.sourceFile = null;
  state.sourceUrl = null;
  state.videoWidth = 0;
  state.videoHeight = 0;
  state.duration = 0;
  state.isSeeking = false;
  state.isCapturing = false;

  elements.video.removeAttribute("src");
  elements.video.load();
  elements.videoInput.value = "";
  elements.dropZone.hidden = false;
  elements.fileInfo.hidden = true;
  elements.playerArea.hidden = true;
  elements.resetButton.hidden = true;
  elements.timeline.value = "0";
  elements.timeline.max = "0";
  elements.currentTime.textContent = "00:00.000";
  elements.duration.textContent = "00:00.000";
  elements.playIcon.textContent = "▶";
  elements.captureButton.disabled = true;
  elements.playButton.setAttribute("aria-label", "再生");
  setError();
  setStatus();
}

function isMp4File(file) {
  const nameLooksValid = file.name.toLowerCase().endsWith(".mp4");
  const typeLooksValid = !file.type || file.type === "video/mp4";
  return nameLooksValid && typeLooksValid;
}

async function loadVideoFile(file) {
  setError();
  setStatus();

  if (!isMp4File(file)) {
    setError("MP4形式の動画を選択してください。正式対応はMP4 / H.264です。");
    return;
  }

  if (state.sourceFile && state.frames.length > 0) {
    const shouldReplace = window.confirm("現在のキャプチャーを破棄して、新しい動画を読み込みますか？");
    if (!shouldReplace) {
      elements.videoInput.value = "";
      return;
    }
  }

  resetFrames();
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);

  state.sourceFile = file;
  state.sourceUrl = URL.createObjectURL(file);
  elements.loadingOverlay.hidden = false;
  elements.captureButton.disabled = true;
  elements.dropZone.hidden = true;
  elements.playerArea.hidden = false;
  elements.resetButton.hidden = false;
  elements.fileInfo.hidden = false;
  elements.fileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong><br>${formatBytes(file.size)} / メタデータを読み込み中…`;

  elements.video.src = state.sourceUrl;
  elements.video.load();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function updatePlayButton() {
  const isPaused = elements.video.paused;
  elements.playIcon.textContent = isPaused ? "▶" : "❚❚";
  elements.playButton.setAttribute("aria-label", isPaused ? "再生" : "一時停止");
}

function updateTimeline() {
  if (!state.isSeeking) {
    elements.timeline.value = String(elements.video.currentTime || 0);
  }
  elements.currentTime.textContent = formatTime(elements.video.currentTime || 0);
}

function waitForSeek(video, targetTime) {
  return new Promise((resolve, reject) => {
    const safeTarget = Math.max(0, Math.min(targetTime, state.duration || 0));
    if (Math.abs(video.currentTime - safeTarget) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("シークがタイムアウトしました。"));
    }, 6000);

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("動画のシークに失敗しました。"));
    };

    function cleanup() {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    }

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = safeTarget;
  });
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像データを生成できませんでした。"));
      },
      type,
      quality,
    );
  });
}

async function captureCurrentFrame() {
  if (!state.sourceFile || state.isCapturing || state.isSeeking) return;
  if (elements.video.readyState < 2 || !state.videoWidth || !state.videoHeight) {
    setError("動画フレームの準備ができていません。少し位置を移動して再度お試しください。");
    return;
  }

  state.isCapturing = true;
  elements.captureButton.disabled = true;
  setError();

  try {
    const canvas = document.createElement("canvas");
    canvas.width = state.videoWidth;
    canvas.height = state.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvasを初期化できませんでした。");

    context.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const frame = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      timestamp: elements.video.currentTime,
      blob,
      url: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
    };

    state.frames.push(frame);
    renderFrames();
    renderCaptureMarkers();
    await renderPreview();
    setStatus(`${formatTime(frame.timestamp)} をキャプチャーしました。`);
  } catch (error) {
    console.error(error);
    setError(error instanceof Error ? error.message : "フレームを取得できませんでした。");
  } finally {
    state.isCapturing = false;
    elements.captureButton.disabled = false;
  }
}

function deleteFrame(frameId) {
  const index = state.frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) return;
  const [removed] = state.frames.splice(index, 1);
  revokeFrame(removed);
  renderFrames();
  renderCaptureMarkers();
  void renderPreview();
  setStatus("フレームを削除しました。");
}

function renderFrames() {
  elements.frameGrid.replaceChildren();
  elements.frameCount.textContent = String(state.frames.length);
  elements.emptyFrames.hidden = state.frames.length > 0;
  elements.clearFramesButton.hidden = state.frames.length === 0;

  const aspect = state.videoWidth && state.videoHeight ? `${state.videoWidth} / ${state.videoHeight}` : "16 / 9";

  state.frames.forEach((frame, index) => {
    const fragment = elements.frameTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".frame-card");
    const seekButton = fragment.querySelector(".frame-seek");
    const image = fragment.querySelector("img");
    const number = fragment.querySelector(".frame-number");
    const time = fragment.querySelector("time");
    const deleteButton = fragment.querySelector(".delete-frame");

    card.style.setProperty("--video-aspect", aspect);
    image.src = frame.url;
    image.alt = `キャプチャーフレーム ${index + 1}、${formatTime(frame.timestamp)}`;
    number.textContent = String(index + 1);
    number.hidden = !elements.numberingToggle.checked;
    time.textContent = formatTime(frame.timestamp);
    time.dateTime = `PT${frame.timestamp.toFixed(3)}S`;

    seekButton.addEventListener("click", async () => {
      try {
        elements.video.pause();
        await waitForSeek(elements.video, frame.timestamp);
        updateTimeline();
      } catch (error) {
        setError(error instanceof Error ? error.message : "指定位置へ移動できませんでした。");
      }
    });
    deleteButton.addEventListener("click", () => deleteFrame(frame.id));

    elements.frameGrid.append(fragment);
  });

  elements.exportButton.disabled = state.frames.length === 0;
}

function renderCaptureMarkers() {
  elements.captureMarkers.replaceChildren();
  if (!state.duration) return;

  state.frames.forEach((frame, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "capture-marker";
    marker.style.left = `${(frame.timestamp / state.duration) * 100}%`;
    marker.title = `フレーム ${index + 1}: ${formatTime(frame.timestamp)}`;
    marker.setAttribute("aria-label", marker.title);
    marker.addEventListener("click", async () => {
      try {
        elements.video.pause();
        await waitForSeek(elements.video, frame.timestamp);
        updateTimeline();
      } catch (error) {
        setError(error instanceof Error ? error.message : "指定位置へ移動できませんでした。");
      }
    });
    elements.captureMarkers.append(marker);
  });
}

function getGridConfig(targetWidth) {
  const columns = clampInteger(elements.columnsInput.value, 1, 12, 3);
  elements.columnsInput.value = String(columns);
  const rows = Math.ceil(state.frames.length / columns);
  const aspect = state.videoWidth > 0 && state.videoHeight > 0 ? state.videoWidth / state.videoHeight : 16 / 9;
  const padding = Math.max(8, Math.round(targetWidth * GRID_PADDING_RATIO));
  const gap = Math.max(4, Math.round(targetWidth * GRID_GAP_RATIO));
  const availableWidth = targetWidth - padding * 2 - gap * Math.max(0, columns - 1);
  const cellWidth = Math.max(1, availableWidth / columns);
  const cellHeight = Math.max(1, Math.round(cellWidth / aspect));
  const canvasWidth = targetWidth;
  const canvasHeight = padding * 2 + cellHeight * rows + gap * Math.max(0, rows - 1);

  return { columns, rows, padding, gap, cellWidth, cellHeight, canvasWidth, canvasHeight };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("キャプチャー画像を読み込めませんでした。"));
    image.src = url;
  });
}

async function drawGrid(canvas, width, renderToken = null) {
  const config = getGridConfig(width);
  canvas.width = config.canvasWidth;
  canvas.height = config.canvasHeight;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvasを初期化できませんでした。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < state.frames.length; index += 1) {
    if (renderToken !== null && renderToken !== state.previewRenderToken) return null;

    const frame = state.frames[index];
    const image = await loadImage(frame.url);
    const column = index % config.columns;
    const row = Math.floor(index / config.columns);
    const x = config.padding + column * (config.cellWidth + config.gap);
    const y = config.padding + row * (config.cellHeight + config.gap);

    context.fillStyle = "#000000";
    context.fillRect(x, y, config.cellWidth, config.cellHeight);
    context.drawImage(image, x, y, config.cellWidth, config.cellHeight);

    if (elements.numberingToggle.checked) {
      const fontSize = Math.max(15, Math.round(config.cellWidth * 0.055));
      const horizontalPadding = Math.max(7, Math.round(fontSize * 0.55));
      const verticalPadding = Math.max(5, Math.round(fontSize * 0.32));
      const margin = Math.max(7, Math.round(config.cellWidth * 0.025));
      const label = String(index + 1);

      context.font = `800 ${fontSize}px Inter, sans-serif`;
      context.textBaseline = "top";
      const textWidth = context.measureText(label).width;
      const boxWidth = textWidth + horizontalPadding * 2;
      const boxHeight = fontSize + verticalPadding * 2;
      const boxX = x + margin;
      const boxY = y + margin;

      context.fillStyle = "rgba(0, 0, 0, 0.74)";
      roundRect(context, boxX, boxY, boxWidth, boxHeight, Math.max(5, fontSize * 0.25));
      context.fill();
      context.fillStyle = "#ffffff";
      context.fillText(label, boxX + horizontalPadding, boxY + verticalPadding);
    }
  }

  return config;
}

function roundRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

async function renderPreview() {
  const token = ++state.previewRenderToken;
  if (state.frames.length === 0) {
    elements.previewEmpty.hidden = false;
    elements.previewViewport.hidden = true;
    elements.gridSummary.textContent = "—";
    elements.previewCanvas.width = 1;
    elements.previewCanvas.height = 1;
    return;
  }

  elements.previewEmpty.hidden = true;
  elements.previewViewport.hidden = false;

  try {
    let previewWidth = PREVIEW_MAX_WIDTH;
    let config = getGridConfig(previewWidth);
    if (config.canvasHeight > PREVIEW_MAX_HEIGHT) {
      previewWidth = Math.max(320, Math.floor(previewWidth * (PREVIEW_MAX_HEIGHT / config.canvasHeight)));
    }

    config = await drawGrid(elements.previewCanvas, previewWidth, token);
    if (!config || token !== state.previewRenderToken) return;

    const exportWidth = clampInteger(elements.exportWidthSelect.value, 320, 7680, 1920);
    const exportConfig = getGridConfig(exportWidth);
    elements.gridSummary.textContent = `${config.columns}列 × ${config.rows}行 / ${exportConfig.canvasWidth} × ${exportConfig.canvasHeight}px`;
  } catch (error) {
    console.error(error);
    setError(error instanceof Error ? error.message : "プレビューを生成できませんでした。");
  }
}

function sanitizeBaseName(fileName) {
  return fileName
    .replace(/\.mp4$/i, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim() || "storyboard";
}

function dateStamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "_",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

async function exportGrid() {
  if (state.frames.length === 0 || !state.sourceFile) return;

  elements.exportButton.disabled = true;
  elements.exportButton.textContent = "画像を生成中…";
  setError();
  setStatus("高解像度画像を生成しています。");

  try {
    const outputWidth = clampInteger(elements.exportWidthSelect.value, 320, 7680, 1920);
    const config = getGridConfig(outputWidth);
    const estimatedBytes = config.canvasWidth * config.canvasHeight * 4;
    const estimatedMegabytes = estimatedBytes / 1024 / 1024;

    if (config.canvasWidth > 8192 || config.canvasHeight > 16384 || estimatedMegabytes > 300) {
      const proceed = window.confirm(
        `生成画像は ${config.canvasWidth} × ${config.canvasHeight}px（処理時推定 ${Math.round(estimatedMegabytes)}MB）です。端末によっては失敗します。続行しますか？`,
      );
      if (!proceed) return;
    }

    const exportCanvas = document.createElement("canvas");
    await drawGrid(exportCanvas, outputWidth);
    const blob = await canvasToBlob(exportCanvas, "image/png");
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `${sanitizeBaseName(state.sourceFile.name)}_grid_${dateStamp()}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    setStatus(`${config.canvasWidth} × ${config.canvasHeight}px のPNGを書き出しました。`);
  } catch (error) {
    console.error(error);
    setError(
      error instanceof Error
        ? `書き出しに失敗しました。${error.message}`
        : "書き出しに失敗しました。出力解像度かフレーム数を減らしてください。",
    );
  } finally {
    elements.exportButton.disabled = state.frames.length === 0;
    elements.exportButton.textContent = "PNG画像を書き出す";
  }
}

elements.videoInput.addEventListener("change", () => {
  const [file] = elements.videoInput.files ?? [];
  if (file) void loadVideoFile(file);
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer?.files ?? [];
  if (file) void loadVideoFile(file);
});

elements.video.addEventListener("loadedmetadata", () => {
  state.videoWidth = elements.video.videoWidth;
  state.videoHeight = elements.video.videoHeight;
  state.duration = elements.video.duration;

  if (!Number.isFinite(state.duration) || !state.videoWidth || !state.videoHeight) {
    setError("動画情報を取得できませんでした。ファイルが破損している可能性があります。");
    return;
  }

  elements.timeline.max = String(state.duration);
  elements.duration.textContent = formatTime(state.duration);
  elements.currentTime.textContent = formatTime(0);
  elements.fileInfo.innerHTML = [
    `<strong>${escapeHtml(state.sourceFile?.name ?? "")}</strong>`,
    `${formatBytes(state.sourceFile?.size ?? 0)} / ${state.videoWidth} × ${state.videoHeight}px / ${formatTime(state.duration)}`,
  ].join("<br>");
  elements.loadingOverlay.hidden = true;
  elements.captureButton.disabled = false;
  void renderPreview();
});

elements.video.addEventListener("error", () => {
  elements.loadingOverlay.hidden = true;
  setError("この動画を再生できません。MP4コンテナ、H.264映像コーデックの動画を選択してください。");
});

elements.video.addEventListener("timeupdate", updateTimeline);
elements.video.addEventListener("play", updatePlayButton);
elements.video.addEventListener("pause", updatePlayButton);
elements.video.addEventListener("ended", updatePlayButton);

elements.playButton.addEventListener("click", async () => {
  try {
    if (elements.video.paused) await elements.video.play();
    else elements.video.pause();
  } catch (error) {
    setError(error instanceof Error ? error.message : "動画を再生できませんでした。");
  }
});

elements.timeline.addEventListener("input", () => {
  state.isSeeking = true;
  elements.currentTime.textContent = formatTime(Number(elements.timeline.value));
  elements.captureButton.disabled = true;
});

elements.timeline.addEventListener("change", async () => {
  try {
    await waitForSeek(elements.video, Number(elements.timeline.value));
  } catch (error) {
    setError(error instanceof Error ? error.message : "指定位置へ移動できませんでした。");
  } finally {
    state.isSeeking = false;
    elements.captureButton.disabled = false;
    updateTimeline();
  }
});

elements.captureButton.addEventListener("click", () => void captureCurrentFrame());
elements.clearFramesButton.addEventListener("click", () => {
  if (window.confirm("キャプチャーしたフレームをすべて削除しますか？")) {
    resetFrames();
    setStatus("すべてのフレームを削除しました。");
  }
});
elements.resetButton.addEventListener("click", () => {
  if (!state.sourceFile || window.confirm("読み込んだ動画とキャプチャーをすべて破棄しますか？")) resetProject();
});

elements.columnsInput.addEventListener("input", () => void renderPreview());
elements.exportWidthSelect.addEventListener("change", () => void renderPreview());
elements.numberingToggle.addEventListener("change", () => {
  renderFrames();
  void renderPreview();
});
elements.exportButton.addEventListener("click", () => void exportGrid());

window.addEventListener("beforeunload", () => {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.frames.forEach(revokeFrame);
});

resetProject();
