# widget_prj

**Lightweight desktop widget framework with EMG-lite avatar support**  
**EMG-lite 対応の軽量デスクトップウィジェットフレームワーク**

---

## Overview / 概要

widget_prj is a lightweight desktop widget framework designed for  
always-on desktop avatars, status widgets, and small visual companions.

It focuses on:
- Low resource usage (no GPU required)
- PNG-based avatar rendering
- Simple state-driven image switching
- Open and extensible design

This project is intended to be **forked and extended for learning, experimentation, and non-commercial use**.

---

widget_prj は、  
デスクトップ常駐型アバターやステータス表示、軽量なビジュアルウィジェットを目的とした  
**軽量デスクトップウィジェットフレームワーク**です。

以下を重視しています：
- GPU を必要としない低リソース設計
- PNG ベースのアバター表示
- 状態（state）によるシンプルな画像切り替え
- フォーク・改変しやすい構造

本プロジェクトは **学習・検証・非商用利用を主目的**としています。

---

## Features / 特徴

- 🧩 Standalone desktop widget framework  
- 🖼 PNG-based avatar rendering  
- 🔄 State-based image switching  
- 📄 **EMG-lite (`.emgl`) file loading support**  
- 🪶 Lightweight and suitable for low-spec environments  

---

## EMG-lite Support / EMG-lite 対応

widget_prj supports loading **EMG-lite (`.emgl`) files**, which define:
- Avatar image assets
- Logical states (e.g. `normal`, `happy`, `angry`)
- Image mappings per state

EMG-lite is treated as an open, editor-friendly avatar definition format.

This project intentionally avoids being a full animation or Live2D system  
and stays minimal and state-driven.

---

## Philosophy / 設計思想

This project separates responsibilities clearly:

- **Rendering / display** → widget_prj
- **Timeline / editing / automation** → external tools
- **Avatar definition** → EMG-lite

By keeping the widget minimal, it remains easy to understand, fork, and adapt.

---

## Forking & Contributions / フォーク・貢献について

Forking is allowed and encouraged **for non-commercial purposes**, including:

- Learning and research
- Prototyping
- Personal tools
- Experimental or internal projects

Pull requests are welcome, but not required.

---

## License / ライセンス

### Source Code / ソースコード

The source code of this project is licensed under the  
**Apache License, Version 2.0**.

Commercial use is **legally permitted** under the Apache License 2.0.  
However, **commercial use is strongly discouraged without prior consultation**.

This is because:
- The code is under active development
- Code quality, behavior, and long-term stability are **not guaranteed**
- The author does **not** provide commercial-level support, maintenance, or warranty

If you intend to use this project in a commercial product or service  
and require reliability, guarantees, or long-term support,  
please contact us in advance via the inquiry form.

---

本プロジェクトのソースコードは  
**Apache License 2.0** のもとで公開されています。

Apache License 2.0 に基づき、**商用利用は法的には可能**です。  
ただし、**事前の相談なしでの商用利用は強く非推奨**とします。

その理由は以下の通りです：
- 本コードは開発途上であり、仕様変更の可能性があります
- 動作・品質・長期的な安定性は保証されません
- 作者は商用利用に対するサポート・保守・保証を提供できません

商用プロダクトやサービスへの利用を検討されており、  
信頼性や継続的なサポートが必要な場合は、  
必ず事前に問い合わせフォームよりご相談ください。


---

### Release Binaries / リリースバイナリについて

Official release binaries provided by this project are intended for:
- Evaluation
- Testing
- Personal use

While redistribution or commercial use may be legally possible under the license,  
such usage is **strongly discouraged**.

The author does not guarantee:
- Correct behavior in production environments
- Security, performance, or stability
- Compatibility with future versions

For any production or commercial use, please contact us in advance.


---

本プロジェクトが配布する公式リリースバイナリは、  
主に以下の用途を想定しています：

- 評価
- 検証
- 個人利用

ライセンス上、再配布や商用利用が可能な場合がありますが、  
**そのような利用は強く非推奨**とします。

作者は以下を保証しません：
- 本番環境での正確な動作
- セキュリティ・性能・安定性
- 将来バージョンとの互換性

商用・本番用途での利用を検討される場合は、  
必ず事前にご相談ください。


---

### Assets / アセットについて（重要）

Assets included in this repository (images, characters, icons, sample avatars, etc.)  
are **NOT covered by the Apache License 2.0**.

Assets are provided for demonstration and development purposes only.  
Commercial use requires prior permission.

See **ASSETS_LICENSE.md** for details.

---

## Commercial Use / 商用利用について

For any commercial use involving:
- Source code
- Release binaries
- Assets

please contact us **in advance** via the inquiry form.

Commercial use without explicit permission is prohibited.

---

## Related Project / 関連プロジェクト

- EMG / EMG-lite  
  https://github.com/pxrllc/emg

---

## Status / 開発状況

This project is under active development.  
APIs and internal structures may change without notice.

---

## Disclaimer / 免責事項

This software is provided **“as is”**, without warranty of any kind.
