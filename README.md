# Video Storyboard Builder

MP4動画から任意のフレームをキャプチャーし、ストーリーボード用のグリッド画像を書き出す静的Webアプリです。

## 主な機能

- MP4 / H.264動画のローカル読み込み
- タイムラインによるシーク
- 現在フレームのキャプチャー
- キャプチャーフレームの個別削除・全削除
- 1〜12列のグリッド設定
- パネル番号の表示切り替え
- 1280 / 1920 / 2560 / 3840px幅のPNG書き出し
- 縦動画、横動画、正方形など任意アスペクト比に対応
- PC・モバイル対応
- 動画・画像を外部へ送信しない端末内処理

## ローカル起動

ビルド工程や依存パッケージはありません。静的HTTPサーバーでこのディレクトリを公開してください。

```bash
python -m http.server 8080
```

その後、ブラウザで `http://localhost:8080` を開きます。

## Cloudflare Pages

Cloudflare Pagesでは以下の設定で公開できます。

- Framework preset: `None`
- Build command: 空欄
- Build output directory: `/`

GitHubリポジトリを接続すると、`main` ブランチへの更新がそのままデプロイされます。

## 技術構成

- HTML
- CSS
- Vanilla JavaScript
- HTMLVideoElement
- Canvas 2D API
- File API / Blob URL

サーバー、API、データベースは使用していません。
