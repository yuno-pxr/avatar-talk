# widget_prj 拡張開発ロードマップ
（複数アバター / 発話アサイン / モード切替対応）

## 目的
- widget_prj をフォークし、
  - 複数アバター対応
  - 発話の話者アサイン
  - 会話モード切替（ソロ / 掛け合い）
  - 将来の割り込み・外部会話エンジン連携
を可能にする。

本プロジェクトは **表示・音声再生・UI** に責務を限定し、
LLM・会話ロジック・メモリは外部エンジンに委譲する。

---

## 全体方針（重要）

- 既存挙動は壊さない（後方互換を維持）
- まず内部構造だけを「複数対応可能」にする
- 機能は **段階的に有効化** する
- 各 Phase 完了時点で「動く状態」を保証する

---

## Phase 0｜事前準備

### 0.1 フォークと初期設定
- widget_prj を fork (完了: `avatar-talk` として作成済み)
- README に以下を明記：
  - 本プロジェクトは `widget_prj` の拡張版
  - 会話エンジンは外部プロセス
  - 本体は表示・再生に専念

### 0.2 ブランチ戦略
- main：安定版
- feature/multi-avatar
- feature/speech-assign
- feature/mode-switch
- feature/interrupt-ui

---

## Phase 1｜内部構造の下地変更（見た目不変）

### 1.1 Avatar 管理を単体 → コレクションへ変更
**目的**
- 将来の複数同時表示に備える

**作業内容**
- AvatarView を直接使う構造を廃止
- AvatarManager を新設
- AvatarInstance 構造体を定義

```ts
type AvatarInstance = {
  id: string
  state: AvatarState
  position: { x: number; y: number }
  visible: boolean
}
```
※ この段階では 1体のみ生成・表示 すること

### 1.2 発話イベント構造の拡張
**目的**
- 話者アサインを後付けしないため

```ts
type SpeechEvent = {
  speakerId: string
  text: string
  emotion?: "neutral" | "happy" | "thinking"
  isInterrupt?: boolean
}
```
- speakerId は必須
- UI 側はまだ speakerId を無視してもよい

---

## Phase 2｜会話モード切替（最小構成）

### 2.1 ConversationMode の導入
```ts
type ConversationMode =
  | "solo"
  | "dialogue"
```
- デフォルトは solo
- 設定画面 or トレイメニューから切替可能にする

### 2.2 Dialogue モード用キャラ定義
- 2キャラ分の AvatarInstance を生成
- 同時表示はしない
- 発話イベントの speakerId に応じて表示するアバターを切替

**✅ 完了条件**
- 見た目は1体
- 内部的には「話者が2人存在」する状態

---

## Phase 3｜発話アサイン（話者 → ボイス）

### 3.1 speakerId → voice のマッピング
```ts
const speakerVoiceMap: Record<string, VoiceId> = {
  ai1: "voice_a",
  ai2: "voice_b"
}
```
- TTS 再生時に speakerId を必須にする
- 話者ごとに音声キューを分離

### 3.2 発話中アバターの強調
- 発話中 speakerId のアバターに対して「表情変更」「前面表示」「軽いアニメーション」を付与

---

## Phase 4｜複数アバター同時表示

### 4.1 AvatarManager による複数描画
- AvatarInstance 配列を描画
- 2体を左右配置（レイアウト固定でOK）
```tsx
avatars.map(a => (
  <AvatarView key={a.id} avatar={a} />
))
```

### 4.2 同時発話ルール
- 原則：同時発話は禁止
- 例外：相槌、笑い声
- ルールベースで制御（ミキサ実装はしない）

---

## Phase 5｜割り込み表示（UI側のみ）

### 5.1 isInterrupt 対応
- `SpeechEvent.isInterrupt === true` の場合：小さめ表示、横からスライドイン、テロップ風

### 5.2 割り込み可能ポイント
- 以下を検知した場合のみ割り込みを許可：文末、改行、無音 300ms 以上
- ※ 割り込み可否の最終判断は widget 側で行う

---

## Phase 6｜外部会話エンジン連携

### 6.1 IPC / WebSocket 接続
- widget_prj ←→ conversation-engine
- 受信イベント：SPEECH, INTERRUPT, MODE_CHANGE

### 6.2 セキュリティ方針
- widget_prj に以下を持たせない：LLM 推論, API キー, DB
- あくまで「再生クライアント」に徹する

---

## Phase 7｜ログ & 将来拡張フック

### 7.1 発話イベントログ
- JSON Lines 形式で保存
- speakerId / mode / interrupt を含める

### 7.2 Zettelkasten 連携フック
- widget 側ではログ送信のみ
- 要約・リンク生成は外部エンジンで実施

---

## 工数目安（1人）
| Phase | 日数 |
| :--- | :--- |
| Phase 0 | 0.5–1 |
| Phase 1 | 1–2 |
| Phase 2 | 2–3 |
| Phase 3 | 3–5 |
| Phase 4 | 4–7 |
| Phase 5 | 2–4 |
| Phase 6 | 2–3 |
| Phase 7 | 1–2 |
| **合計** | **15–25人日** |

---

## 最小完成ライン（MVP）
- Phase 3 完了時点
- 話者アサイン可能
- 2キャラ掛け合い成立
- 外部会話エンジン接続可能
