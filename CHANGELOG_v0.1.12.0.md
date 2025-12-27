# v0.1.12.0 (2025-12-26)

## 新機能と改善 (New Features & Improvements)

### カメラ操作 (Camera Control)
- **カメラコントロールの統合**: 
  - アバター（VRM）を右クリックした際のコンテキストメニューに「Camera Control」を追加しました。
  - デバッグモード以外でもカメラ操作が可能になりました。
- **操作性の向上**:
  - **中クリック (Middle Click)**: カメラの回転 (Rotate)。
  - **右ドラッグ (Right Drag)**: カメラの平行移動 (Pan)（Camera Control ON時）。
  - **左ドラッグ (Left Drag)**: ウィンドウの移動（Camera Controlの状態に関わらず常に移動可能）。
- **終了方法の追加**:
  - キーボードの `Esc` キーでCamera Controlを終了できるようになりました。
  - UI上のボタンに終了方法 (`Esc to Exit`) を明記しました。

### ウィンドウ操作 (Window Management)
- **移動速度の最適化**:
  - 高解像度ディスプレイ（High DPI）環境において、マウスの移動量とウィンドウの移動量が 1:1 になるように補正しました。
- **ドラッグ領域の改善**:
  - システム的なドラッグ領域 (`-webkit-app-region: drag`) を廃止し、JavaScriptによる制御に移行しました。これにより、右クリックメニューが表示されない問題が解消されました。

## ビルド情報 (Build Info)
- 出力ディレクトリ: `dist_release_v0.1.12.0`
