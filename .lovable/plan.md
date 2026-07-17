# Phase B — Catchwords 芸術的再設計

Phase A で骨格 (Deep Ocean トークン / Reels 型フィード / Vision Pro スキャン雛形 / 音・触覚エンジン / トップ Segmented + FAB + More Sheet) は実装済み。Phase B はそこに「Apple 製品のような芸術性」と「TikTok/Instagram 的な無意識継続」を注入する仕上げフェーズ。

## 設計原則 (再確認)

1. **Peak-End Rule** — スキャンの Peak (認識の瞬間) と End (単語カード着地) を最も美しく。
2. **Variable Reward** — スワイプの次に何が来るか分からない (Sticker / Recap / Reunion / On this day / Ghost)。
3. **Endowed Progress** — 撮った写真はすべて「自分の美術館」に貯まる感覚。
4. **Sensory Consistency** — 色・字体・音・振動が全画面で同じ言語を話す。

「チープなアイコン」「ゲーム的ストリーク」「ボタン過多」は絶対排除。

---

## 1. スキャン演出の刷新 (最優先)

現在の `ScanEffect.tsx` はグリッド + パーティクル + レティクルだが「等速でループしているだけ」で高級感が弱い。3 幕構成に作り直す。

### Act 1 — Sensing (0–500ms)「世界を感じる」
- カメラフィード上に **深度リング**が呼吸 (breath 1.2s)。中央にごく細い十字。
- 淡い青のオーラが画面外周から中央へ **ゆっくり収束** (radial gradient を時間で半径縮小)。
- 音: `Sound.scanStart` (現状の下降 sine) + 低いサブベース (40Hz sine 0.6s フェード)。
- 触覚: `light`。

### Act 2 — Reading (500–1400ms)「AI が対象を読む」
- 画面を 12×8 の**格子スキャン**が上→下へ 900ms でスイープ (現状の horizon を格子ハイライトに変更)。
- スイープが通過したセルだけ短く発光し、その中の 3〜5 セルがランダムに「注視ロック」して四隅マーカー (Vision Pro の視線トラッキング風) を出す。
- カメラ映像の上に**深度ワイヤーフレーム** (三角ポリゴンをキャンバスに疎に描画) を 0.3 の透明度で重ねる → 「AI が3D的に世界を理解している」感。
- 音: 700ms ごとに `scanPulse` (現状維持)。
- 触覚: 250ms ごとに `selection` (微振動 = 分析中)。

### Act 3 — Matching → Reveal (1400–2000ms)「単語が立ち上がる」
- 検出座標に**パーティクルが全方向から収束** (現状は生成のみ→ここでは既存粒子を吸引ベクトルで一点へ)。
- 収束点で**光の玉が一瞬拡大→単語カードに展開** (scale 0.3→1.0 with cubic-bezier(0.34,1.56,0.64,1))。
- 単語カードは背景写真を Ken Burns でゆっくりズームしながら、単語・発音・意味が **50ms スタガー** でフェードイン。
- 音: `scanSuccess` (現状維持、3音アルペジオ)。
- 触覚: `success`。

### 技術メモ
- `ScanEffect.tsx` に `stage` prop はすでに存在。親 (`scan.tsx`) から Act の切り替えを渡す。
- 幕ごとの描画関数を分割 (`drawSensing`, `drawReading`, `drawMatching`) して読みやすく。
- 60fps 維持のため最大パーティクル 80、DPR は 2 でキャップ (現状通り)。
- 時間帯アクセント色 (現状の hour ロジック) は維持 → 毎回微妙に違う = variable reward。

---

## 2. ホームフィードの芸術性強化

Reels 型スナップは維持。以下を追加して「自慢したくなる美術館」へ。

### 2-1. カード種別を 4 種に絞る (ごちゃごちゃ回避)
| 種別 | 頻度 | 目的 |
|---|---|---|
| **Sticker** (通常写真+単語) | 主 | Endowed progress |
| **Recap** (7日/30日) | 週1・月1 | Spotify Wrapped 的自慢 |
| **On this day** (1年前) | 該当日のみ | 思い出の再訪 |
| **Reunion** (同じ単語に再遭遇) | 稀 | Variable reward の頂点 |

Review カード・Ghost カード・Locked Branch はホームから外し、Museum タブ or More Sheet 内に移す (ボタン過多回避)。

### 2-2. Sticker カードの視覚
- 画面いっぱいの写真 (現行維持)。
- 底部に**すりガラスのバー** (`backdrop-blur-2xl bg-white/8`) を薄く敷き、単語 (Instrument Serif 44pt) + 発音 (SF Mono 13pt) + 場所/日付 (11pt 60%不透明) を配置。
- 右下に**金の小点** (再遭遇済み) or **シアンの小点** (未再遭遇) のみ。バッジ・ボタンは置かない。
- タップ = 発音再生 (波形リップルが単語の下に 400ms 走る)。
- 長押し = Share Sheet (画像+単語を1枚のポスターとして書き出し、Instagram Story 縦比率)。

### 2-3. Recap カード (週1・自動生成)
- 背景は今週の代表写真 3〜5 枚のモザイクにゴールドグレイン。
- 中央に大数字「**24**」 + 「words this week」(Instrument Serif)。
- 下部に「Share Recap」1ボタンのみ。

### 2-4. スクロールの気持ちよさ
- `scroll-snap-type: y mandatory` (現行) に加え、各カード進入時に **背景音がわずかにピッチシフト** (Sound.pageSnap を音程ランダム化)。
- 各カード進入時にヒーロー画像の **Ken Burns** を re-trigger (scale 1.02→1.08 を 8s ease-out)。

---

## 3. カラー方向 — Deep Ocean 進化版 (確定)

現在の Deep Ocean を維持し、以下を微調整:
- Primary: `oklch(0.55 0.20 250)` (現行やや彩度上げ)
- Accent Cyan: `oklch(0.85 0.14 220)` (現行)
- Accent Gold: `oklch(0.80 0.13 85)` — 再遭遇・Recap 数字にのみ使用 (使用面積 1% 以下厳守)
- Background: `oklch(0.14 0.02 250)` (現行やや暖かく)
- Surface: `oklch(0.18 0.025 250)` + `backdrop-blur`

**フォント統一** (アプリ全体):
- Display: **Instrument Serif** (単語・大数字・見出し) — 芸術性
- UI/Body: **Inter** (現行維持)
- Mono/発音記号: **SF Mono fallback → JetBrains Mono**

`src/routes/__root.tsx` の `<head>` に Google Fonts `Instrument Serif` を追加、`styles.css` に `--font-display` トークン。

---

## 4. サウンド & 触覚の一貫性チューニング

`sound-engine.ts` / `haptics.ts` は Phase A で実装済み。以下を追加/調整:
- `Sound.scanReading()` を新設 (Act 2 用の低音サブベース)。
- `Sound.cardEnter()` を新設 (カードスワイプ着地、pageSnap を +200Hz ランダム)。
- 全ボタンの `Sound.tap` 音量を現行 0.3 → 0.22 (控えめに)。
- 触覚は「操作フィードバック = selection / 完了 = success / 再遭遇 = heartbeat」の 3 種に限定。

---

## 5. マイクロインタラクション (styles.css)

`.lift` (現行) に加え:
- `.lift-glass` — hover/tap で `backdrop-blur` が 12→20px にトランジション。
- `.press-in` — tap 時 scale(0.97) + shadow 減少 120ms cubic-bezier(0.34,1.56,0.64,1)。
- `.reveal-stagger > *` — 子要素に 50ms ずつ fade-in-up。

FAB の呼吸 (`breathe`) は 3.2s → 4.0s に緩めて「静かな鼓動」に。

---

## 6. 実装順序

1. `src/styles.css` — Instrument Serif トークン, `.lift-glass`, `.press-in`, `.reveal-stagger`, カラー微調整。
2. `src/routes/__root.tsx` — Instrument Serif の `<link>` 追加。
3. `src/lib/sound-engine.ts` — `scanReading` / `cardEnter` 追加, tap 音量調整。
4. `src/components/ScanEffect.tsx` — 3幕構成に全面書き直し (深度ワイヤーフレーム, 収束アニメ)。
5. `src/routes/_authenticated/scan.tsx` — stage を時間で `sensing → reading → matching` と進める。
6. `src/routes/_authenticated/home.tsx` — カード種別を 4 種に整理, すりガラスバー適用, 長押しシェア追加, Recap 自動生成ロジック。
7. `src/components/AppShell.tsx` — FAB 呼吸を 4.0s に, More Sheet の色調整。

## 触らないもの

- バックエンド (Supabase / RLS / server functions)
- MCP まわり
- 認証フロー
- Museum (dex) のロジック — 見た目のみ追随

---

これで進めてよろしいですか？色パレット (Deep Ocean 進化版) の微調整だけ 3 案並べて先に選ぶことも可能です。
