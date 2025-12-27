# スキン作成ガイド (Skin Creation Guide)

Monolith Widget は、JSON定義ファイルとアセット（画像、動画、CSS）を組み合わせた「スキン」機能により、外観を自由にカスタマイズできます。

## スキンの基本構成

スキンは1つのフォルダとして構成されます。フォルダ内には必ず `skin.json` が必要です。

```text
my-cool-skin/
├── skin.json       (必須: 定義ファイル)
├── styles.css      (任意: カスタムCSS)
├── assets/         (任意: 画像や動画)
│   ├── background.png
│   ├── idle.riv
│   └── loading.json
```

## skin.json の仕様

`skin.json` はスキンのメタデータ、アセットのパス、スタイル設定を定義します。

```json
{
  "metadata": {
    "name": "My Cool Skin",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "A dark futuristic theme."
  },
  "styles": {
    "cssFile": "styles.css",
    "colors": {
      "primary": "#ff0000",
      "background": "#000000",
      "text": "#ffffff"
    }
  },
  "assets": {
    "images": {
      "background": "assets/background.png",
      "logo": "assets/logo.svg"
    },
    "animations": {
      "idle_character": {
        "type": "rive",
        "path": "assets/idle.riv",
        "stateMachine": "State Machine 1",
        "autoplay": true
      },
      "loading_spinner": {
        "type": "lottie",
        "path": "assets/loading.json",
        "loop": true
      }
    }
  }
}
```

### フィールド詳細

#### metadata
- `name`: スキン名（必須）
- `version`: バージョン（必須）
- `author`: 作成者名
- `description`: 説明

#### styles
- `cssFile`: スキン固有のCSSファイルへのパス（スキンフォルダからの相対パス）。
- `colors`: アプリケーションの基本カラーを上書きします。
  - `primary`: メインアクセントカラー
  - `background`: 背景色
  - `text`: 基本文字色

#### assets
- `images`: キーとファイルパスのペア。アプリ内で `getAssetPath('key')` で参照されます。
- `animations`: Rive または Lottie アニメーションの定義。
  - `type`: `"rive"` または `"lottie"`
  - `path`: アニメーションファイルへのパス
  - `stateMachine`: (Riveのみ) 再生するステートマシン名
  - `autoplay`: 自動再生するか (default: true)
  - `loop`: ループするか (default: true)

## CSSカスタマイズ

`styles.css` を読み込むことで、アプリ全体のスタイルを上書きできます。詳細なセレクタはアプリのソースコードを参照してください。

```css
/* 例: 背景をグラデーションにする */
.app-container {
  background: linear-gradient(to right, black, #333);
}
```
