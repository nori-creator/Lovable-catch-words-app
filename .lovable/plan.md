
# Catchwords — 芸術・心理・所有欲の再設計

回答を反映した最終方針。**配色は現行(Light=Apple白/Blue, Dark=Deep Ocean)を踏襲**。スキャン=**液体金属×単語結晶化**。ホーム=**Appleコレクション棚メタファ**(時計ケース/ワインセラー/万年筆コレクションの視覚言語で、ポケモン図鑑やDuolingo風のチープさは徹底排除)。

---

## 1. 心理設計の柱 (このアプリを一日中触ってしまう理由)

| 心理原理 | 適用箇所 |
|---|---|
| **Endowed Progress** (自分の手で埋めた棚) | ホームのコレクション棚に「今日のカード」が物理的に加わる着地アニメ |
| **Peak-End Rule** | スキャンのピーク(結晶化) / エンド(棚への着地) を最も丁寧に |
| **Variable Reward** | スキャン結果に稀に「Reunion(金の縁)」「On this day」が混ざる |
| **IKEA Effect** | 撮った写真=自分の作品。編集(タイトル/一言/場所)で愛着が線形に増える |
| **Zeigarnik** | 棚に1つだけ薄いシルエットで「次に会う予定の言葉」を控えめに表示 |
| **Social Proof(自慢)** | 長押しで棚の一段を「ポスター」として書き出し(縦比率、色調統一) |

**禁止事項** (仕様に明記): レア度%, XP, ストリーク数値, レベル表記, ゲージ, バッジコレクション画面, ポケモン風シルエット当てクイズ, デュオリンゴ風キャラ, 派手なConfetti, 絵文字装飾。数値は「今週の言葉 24」のような**単一の詩的な数字**のみ許容。

---

## 2. ホーム = 「Collector's Cabinet」パラダイム

Reels型スクロールは**捨てる**。代わりに**時計コレクションケース / ワインセラーの棚**の視覚メタファを採用。Apple Photos の "Days" / Things に近い、静謐で密度のあるレイアウト。

### 2.1 構造 (3層)

```text
┌──────────────────────────────────┐
│  Header: 今日  ·  10月18日 土曜日  │  ← Instrument Serif, 極小
├──────────────────────────────────┤
│                                  │
│    ┌────┐  Today's Catch         │  ← 最上段: 今日の1枚だけ大きく
│    │▓▓▓▓│  珈琲                   │    (Ken Burns で微動)
│    │▓▓▓▓│  Coffee · 台北市大安區   │
│    └────┘  ────                  │
│                                  │
│  ── This Week ──                 │  ← 木製棚の細い区切り線
│  ┌──┐┌──┐┌──┐┌──┐┌──┐          │  ← 5列グリッド, 各カード=写真+単語
│  │  ││  ││  ││  ││  │           │    (正方形サムネ, 下1行に単語のみ)
│  └──┘└──┘└──┘└──┘└──┘          │
│  ┌──┐┌──┐┌──┐┌  ┐               │  ← 空きスロットは薄いシルエット
│  │  ││  ││  ││ ?│               │    (Zeigarnik: 次に会う予定の語)
│  └──┘└──┘└──┘└──┘               │
│                                  │
│  ── August ──                    │  ← 月ごとに段が積まれる
│  ...                             │
└──────────────────────────────────┘
```

- **1枚=1つの物**という視覚原則。写真は**正方形にトリミング統一**(コレクションケースの区画感)。
- 棚の区切り線は**極細のヘアライン(1px, opacity 0.08)** + わずかな**内側シャドウ**で「木製の段」を暗示。物理的な質感、木目テクスチャは使わない(スキュアモーフィズム回避)。
- カードは**hover/tapで持ち上がり微回転(rotateX 4deg)**、Appleの製品カードの浮遊感。
- 今日のカードだけ**Instrument Serif の大きな単語**が写真の下に。他のカードは単語を**8pt SF Monoで極小**(整然感)。
- 「?」スロット: 直近スキャンで検出したが未キャッチの単語シルエット。ここが Zeigarnik のフック。
- スクロールは**通常スクロール**(スナップなし)。棚を「眺める」体験。

### 2.2 タップ体験

- カードtap → **カード自体がフリップ**して裏面: 単語詳細(発音波形, 場所小地図, 一言メモ, 出会った日)。物理カード的。
- 長押し → 段全体を**Instagram Story縦比率のポスター**として書き出し(自慢動線)。
- 今日のカードだけダブルタップで**再訪モード**(同じ言葉に街で再会したときの記録)。

### 2.3 空状態

「まだ、白い棚。」 + 極小のスキャンCTA1つ。詩的な余白。

---

## 3. スキャン = 液体金属 × 単語結晶化 (3幕構成)

**幕構成は現行維持(sensing → reading → matching)、視覚言語を全面刷新**。

### Act 1 · Sensing (0-500ms) 「銀の露が広がる」
- カメラフィード上に**液体銀のリップル**が中央から広がる(SVG filter: `feTurbulence` + `feDisplacementMap` で有機的な波)。
- 銀は**現行 primary (Apple blue) の高輝度側**へ微グラデーション(色の一貫性維持)。
- 音: 低音サブベース + 水滴の chime。触覚: `light`。

### Act 2 · Reading (500-1400ms) 「金属が世界を舐める」
- リップルが**画面全体を覆う液体金属層**に成長。カメラ映像は液体越しに歪んで見える (backdrop-filter で歪ませる)。
- 液体表面に**AIの「注視点」**が3-5個、水面が凹むように現れる(radial gradient darker centers)。
- 各注視点の周辺に**極細のパーティクル**(現行維持だが色を銀に)。
- 待ち時間の「報酬化」: 注視点が定まるたびに`selection`触覚 + かすかな chime。プログレスバーは**画面下の細い水位ライン**(液体のメタファに統一)。

### Act 3 · Matching (1400-2000ms) 「単語が結晶化する」
- 検出座標に**液体金属が収束**(水銀のような表面張力アニメ)。
- 収束点で**単語の文字が1文字ずつ結晶(crystalline)として析出**:
  - 各文字が `scale 0.3 → 1.0` + `filter: blur(8px) → 0` + `letter-spacing 0.5em → 0`
  - 80ms スタガー、cubic-bezier(0.34, 1.56, 0.64, 1)
  - 文字の輪郭が**プリズム的な微細な色収差**(chromatic aberration filter, 0.5px)
- 結晶化と同時に**サブテキスト(発音・意味)** が液体の底からゆっくり浮上。
- 音: 3音アルペジオ(現行) + 結晶が「鳴る」高音の ping。触覚: `success`。

### Act 4 (新設) · Landing (2000-2600ms) 「棚に収まる」
- **単語カードが縮小しながらホーム棚の空きスロット位置へ飛ぶ**(FLIP animation, ページ跨ぎでも予約座標を保持)。
- 着地時、そのスロットが**内側から一瞬光り**、棚全体が0.5°揺れる(物理的な着地感)。
- これが Peak-End の End。次に開いたホームで「自分の棚が育った」と即座に認知させる。

### 技術要点
- SVG filter (`feTurbulence`, `feDisplacementMap`, `feGaussianBlur`) と canvas を併用。パフォーマンス上、液体レイヤーはSVGを1枚固定してdisplacementMapのseedとscaleだけアニメ。
- 60fps 維持のため wireframe/lattice(現行)は撤去、液体1レイヤ + パーティクル + 結晶化テキストの3層に整理。

---

## 4. タイポグラフィ・色・マイクロインタラクション

### 4.1 タイポ (統一)
- **Display (単語・章見出し・大数字)**: `Instrument Serif` — 静謐で芸術的
- **UI/Body**: `Inter` — 現行維持
- **Mono (発音記号・日付・場所)**: `SF Mono → JetBrains Mono` fallback
- 単語は常に**イタリック体の Instrument Serif**(コレクション目録の視覚言語)

### 4.2 色 (現行維持を明記)
- Light: `oklch(0.99 0.005 240)` bg / `oklch(0.62 0.21 255)` primary (現行)
- Dark: `oklch(0.14 0.03 258)` bg (Deep Ocean, 現行)
- **アクセント金**: `oklch(0.80 0.13 85)` — **再会カードの縁のみ**に使用 (面積 <1%)
- **液体銀**: `oklch(0.92 0.02 240)` — スキャンAct1-3専用

### 4.3 マイクロインタラクション (styles.css に追加)
- `.lift-glass` — hover/tap で backdrop-blur 12→20px
- `.press-in` — tap で scale(0.97) + shadow減少 120ms cubic-bezier(0.34,1.56,0.64,1)
- `.card-flip` — 3D flip 500ms, perspective 1200px
- `.shelf-tilt` — 棚全体が0.5°揺れる(着地時)
- `.crystal-in` — 文字結晶化アニメ (blur+scale+color-shift)
- FAB呼吸: 現行3.2s → **4.0s** (静かな鼓動へ)

### 4.4 音・触覚 (統一)
- **音は3種のみ**: `tap`(0.22音量), `success`(結晶化+着地), `reunion`(金の縁が付く再会)
- **触覚は3種のみ**: `selection`(操作), `success`(完了), `heartbeat`(再会)
- 現行のsound-engineに `Sound.crystalize()`, `Sound.shelfLand()` を追加

---

## 5. 実装スコープと順序 (build時)

以下すべてUI/演出層のみ。バックエンド・スキーマ・server functions は変更しない。

1. **`src/styles.css`** — Instrument Serif token, `.lift-glass`, `.press-in`, `.card-flip`, `.shelf-tilt`, `.crystal-in` 追加, 金アクセント token
2. **`src/routes/__root.tsx`** — Instrument Serif の Google Fonts `<link>`
3. **`src/lib/sound-engine.ts`** — `crystalize`, `shelfLand` 追加, 音量調整
4. **`src/components/ScanEffect.tsx`** — 液体金属+結晶化に全面書き直し (SVG filter層+canvas粒子層+DOM結晶化テキスト層)
5. **`src/routes/_authenticated/scan.tsx`** — matching後にAct4(飛翔→棚着地)を追加。ホーム空きスロット座標をsessionStorage経由で受け渡し
6. **`src/routes/_authenticated/home.tsx`** — Reels破棄 → **Collector's Cabinet** に全面書き直し。今日1枚 + 週の棚(5列) + 月別棚 + Zeigarnikシルエット
7. **`src/components/StickerSheet.tsx`** — カードフリップ演出でopen (裏面=詳細)
8. **`src/components/AppShell.tsx`** — FAB呼吸緩和、More Sheet色調微調整
9. **`.lovable/plan.md`** — 本方針を追記(次回セッション向け)

**触らないもの**: Supabase/RLS/migrations, MCP, 認証, Museum(dex)のロジック(見た目は追随), server functions。

---

## 6. 受入基準

- ホームを開いた瞬間に「棚に自分のコレクションが並んでいる」と3秒以内に認知できる
- スキャン中の1.5秒がストレスではなく「見ていたい」と感じる(液体が有機的に動く)
- 単語結晶化から棚着地までが1シーケンスとして途切れない
- 画面上のアイコン数がホーム全体で **5個以下**(戻る/検索/シェア/設定/FAB以外は禁止)
- 色/フォント/音/触覚が3画面(ホーム/スキャン/カード詳細)で完全一貫
- 数値表示は「今週N」の1箇所のみ、%やレベルは0箇所

---

## 7. 参考にした心理設計の秘密 (実装への根拠)

- **Apple Photos For You / Memories** — 受動的に「思い出が向こうから来る」快感。→ ホーム最上段の「Today's Catch」
- **Instagram (feed)** — 正方形統一の整然感。→ 棚の5列正方形グリッド
- **TikTok** — Variable Reward。→ 稀な金縁再会カード
- **腕時計コレクション(Hodinkee等)** — 一列に並んだ所有物の陶酔。→ 棚メタファ
- **Pinterest** — 「自分だけのボード」の所有感。→ 段の書き出し機能
- **無印良品/Aesop** — 余白と1色アクセントの品格。→ 金1%ルール
- **Duolingo/Pokemon** — **反面教師**として全排除。ゲージ・レア度・キャラ・ストリーク数値・XPを禁止事項に明記

以上で進めてよろしければ Implement を押してください。実装時に「Landing → 棚着地」を確実に見せたいので、初回は空棚に1枚が加わるデモ経路も同時に確認できるようにします。
