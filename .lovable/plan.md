# Catchwords ─ 根本リデザイン計画
Deep Ocean 進化版 × Vision Pro スキャン × Instagram/TikTok 的「無限に見てしまう」ホーム

---

## 1. 戦略の核 — なぜユーザーが無意識に開き続けるか

心理学的な3本柱に絞り、UI 要素はこの3つに奉仕するものだけ残す。他は削除。

1. **変動報酬 (Variable Reward)** — 次にスワイプすると何の思い出が出るか分からない。Instagram/TikTok の中毒性の根源。
2. **達成の視覚化 (Peak-End Rule)** — 1回のスキャン体験のピーク(粒子解析→単語pop)と締め(図鑑に落ちる音)を極上に磨く。数値・ストリーク・ミッションは一切見せない。
3. **所有と再訪 (Endowed Progress)** — 撮った写真は「自分だけの美術館」に育つ。誰かに見せたくなる = 自慢の外化。

**捨てるもの**: ストリーク数字表示、ミッションリスト、バッジ、ゲーム的アイコン、複数タブに散らばる機能ボタン群、装飾的グラデーションバッジ。

---

## 2. 情報アーキテクチャの再構築

現状: Home / Dex / Scan / Review / Settings + 内部に大量の画面。
再構築後: **3面 + 1モーダル**。全機能はこの4つに凝縮。

```text
┌─────────────────────────────────────────┐
│  ホーム (Feed)     図鑑 (Museum)        │  ← 上部に2タブのみ (segmented)
│  ─────────────────────────────          │
│                                          │
│    [ 縦スクロール1枚全画面フィード ]      │
│    or [ ミュージアム格子 ]                │
│                                          │
│                                          │
│                                          │
│              ●  スキャン(FAB)             │  ← 中央下、常時浮遊
└─────────────────────────────────────────┘
```

- **下部5タブは廃止**。代わりに**上部 segmented (Home ⇔ Museum)** + **中央下の巨大 Scan FAB (呼吸する光)**。
- 復習 = ホームフィード内に自然に混ざる (「この単語、覚えてる?」カードが5枚に1枚)。専用タブ不要。
- 設定 = 右上のプロフィール円アイコンから薄いシート。ナビ占有しない。
- 通知/ジャーナル/マップ/フィード共有 = 全てホーム内カード種別 or 図鑑からの詳細シート。

**この構造で「全機能はある、でも常に見えるボタンは3つ」を実現。**

---

## 3. ホーム画面 = 縦スクロール1枚フィード (Instagram Reels × Apple Photos For You)

### 3.1 レイアウト
- **1画面=1カード全画面表示**。写真がヒーロー、下端に単語 / 発音 / 場所 / 日付を最小限。
- 縦スワイプで次のカードへ。**変動報酬**: 最新 → ランダムな過去 → 「今日の1年前」 → 復習カード → 未解禁のワードツリー枝プレビュー、をアルゴリズム混合。
- スクロールは**慣性 + snap**。Reels の気持ち良さを再現 (framer-motion `useScroll` + snap-y-mandatory)。
- 各カードは Ken Burns 効果 (ゆっくり zoom/pan) で写真が生きて見える → 「静止画なのに動画のインパクト」。

### 3.2 カード種別 (全て同じ全画面キャンバス、内容だけ違う)
1. **Sticker Card** — 撮った写真 + 単語 + タップで発音波形が写真に描かれる
2. **Recap Card** — 週/月の自動生成「今週の8枚」(Spotify Wrapped 風、静かな写真スライドショー)
3. **On this day** — 「1週間前、あなたはこれを覚えた」
4. **Reunion Card** — 街で同じ単語を再発見→金色の粒子が写真周辺で舞う
5. **Review Card** — 「この単語、覚えてる?」写真は霧、タップで晴れる (Peak体験)
6. **Ghost Card** — 未捕獲の仮画像、「探しに行く」CTA
7. **Locked Branch Preview** — ワードツリーの次の枝のシルエット、解禁条件は数字でなく詩的コピー「もう一度出会えたら」

### 3.3 なぜアルバムより優れているか
- アルバム格子 = 認知負荷高、選択のパラドックス、開いた瞬間の感情が薄い。
- 全画面フィード = **開いた瞬間に1つの美しい写真が飛び込む**。判断不要、ただ味わう。TikTok/Reels がこの設計で世界を支配した理由。
- 「全体を俯瞰したい」欲求は **図鑑タブ** で満たす → 用途分離。

---

## 4. 図鑑画面 = Apple Photos 級ミニマルミュージアム

- 3列 (mobile) / 5列 (tablet) のミニマル正方形格子、gap-1、影なし、角丸小 → 写真そのものが主役。
- 上部: 検索 (単語/場所/色) + 静かな stats「247 words · 12 places · 3 languages」(1行、装飾なし)。
- ドット状態システム (§3.1b) は**格子の右下に極小の光点**として表現:
  - 新発見 = 白の脈動 (2秒周期)
  - 再会 = 金の脈動
  - 取得済み = 光なし (写真そのもの = 証)
  - 通常 = ドット無し (未捕獲は薄いシルエット枠)
- タップで**共有詳細シート** (今の StickerSheet を磨く): 写真拡大 → ワードツリー木ビュー → 発音 → 出典。
- **長押しで即share** (Instagram風、瞬時に自慢できる)。

---

## 5. スキャン体験 — Vision Pro 風「格子スキャン + 粒子解析」

### 5.1 3幕構成 (Peak-End 最大化)
```text
Act 1 (0-400ms): 準備     Act 2 (400-1400ms): 解析    Act 3 (1400-1800ms): 顕現
─────────────────────    ─────────────────────       ────────────────────────
呼吸する円 → タップ         格子(6x8)がカメラ映像上に      粒子が対象に集束
触覚: 軽 (impactLight)     フェードイン、順次点灯 →      → 単語カードにpop
ハプティック: 心拍風        対象を囲む格子だけが           → 触覚: 成功(notif)
音: 微かな水滴音           シアン(#7DD3FC)にハイライト   音: きらめき (0.2s)
                         AI粒子が対象周辺を舞う          カードは Ken Burns で
                         音: 低周波の解析音              静かに息づく
```

### 5.2 実装技術
- **Canvas 2D + requestAnimationFrame** で格子(SVG stroke, opacity アニメ)と粒子(位置/寿命配列, 60fps)。
- 対象領域は既存の scan API 結果 (bounding box) を受け取り、そこだけシアンにハイライト。結果待ち中は**格子がループ**するので体感待ち時間ゼロ。
- **ハプティック**: `navigator.vibrate` (Android) + iOS では Web の限界を認めつつ、Safari 17+ の `hapticFeedback` を feature detect。
- **音**: Web Audio API で生成 (ファイル不要)。水滴 = sine 800Hz→200Hz エンベロープ、解析音 = 低周波ノイズ、成功 = 三度和音 arpeggio。全て -18dB、ユーザーが muted なら鳴らさない。
- **削除**: 現状の「ダサい」スキャンフレーム、緑の枠、進捗bar。

### 5.3 待ち時間を報酬にする心理設計
- 格子点灯パターンは**毎回微妙にランダム** (変動報酬)。
- 粒子の色は**その日の時刻で変化** (朝=淡いシアン, 夜=深いブルーグロー) → 「またこの時間帯に開きたい」。
- 解析中に**過去に捕まえた関連単語のシルエット**がフッと横切る → 「あ、あの単語だ」の予感。

---

## 6. カラーシステム (Deep Ocean 進化版)

現行の Apple 深青を軸に、以下に置き換え/追加:

```text
--background     #0A0F1E   夜の海の底
--surface        #101830   浮遊カードの底面
--surface-2      #182348   上位カード
--primary        #1E3A8A   深い信頼のブルー (現行より少し深)
--primary-glow   #3B6FE8   浮遊光
--accent-cyan    #7DD3FC   スキャン/AI/発見のシアン
--accent-gold    #E8B84A   再会/達成 (絞って使う、乱用禁止)
--foreground     #F5F7FA   / muted #7A8BA8
```

- **Light mode**: 同じ配色ロジックで反転 (背景 = 極淡いブルーグレー #F7F9FC)。
- **グラデ**: `radial-gradient` を全画面に薄く敷き、深海の光の揺らぎ。既存の body グラデを強化。
- **影**: 現行の浮遊感を維持、`shadow-elegant` を primary の 8% mix で統一。

---

## 7. タイポグラフィ (アプリ全体で一貫)

- **英語**: `"SF Pro Display"` (fallback: Inter) — heading tight -0.03em, body -0.011em
- **日本語**: `"Hiragino Sans"` → `"Noto Sans JP"` weight 400/600/700 のみ
- **繁体字**: `"PingFang TC"` → `"Noto Sans TC"`
- **単語カードの単語表示のみ**: `"Instrument Serif"` を使うか検討(1つの選択肢としてプロトタイプで比較) — 「学び=知的」の記号性。ただし決めうちせず、実装後A/B。
- サイズは 5段のみ: 44 / 28 / 20 / 15 / 12。中間サイズ禁止 → 秩序。

---

## 8. マイクロインタラクション (全画面共通ルール)

| 動作 | 効果 | 実装 |
|---|---|---|
| ボタン tap | scale 0.96, 120ms cubic-bezier(0.34,1.56,0.64,1), 触覚 light | `.lift` class 拡張 |
| ページ遷移 | fade + 4px translateY, 260ms | Router transition wrapper |
| カード出現 | staggered pop-in 40ms delay | framer-motion |
| スワイプ次カード | snap + spring bounce 8% | scroll-snap-y + CSS |
| 発音tap | 波形が写真上に描画 (300ms) | Canvas overlay |
| 再会検出 | 金粒子2秒 + 触覚 success | scanEffects module |
| 長押しシェア | 触覚 heavy + カード浮上 | React pointer events |

**削除**: 現状の派手なshimmer多用、pulse-ring の乱用、装飾的グラデバッジ。使うのは金ドット/スキャン中のみ。

---

## 9. 音とバイブレーション

- **サウンドセット** (Web Audio 生成、ファイル0個): scan_start / scan_pulse (loop) / scan_success / capture / reunion / review_correct / review_wrong / page_snap
- 全て -18dB、ユーザー設定で3段階 (Off / Subtle / Full)。デフォルト Subtle。
- **ハプティック**: iOS 17+ / Android で使い分け、feature-detect でグレースフル。
- 設定画面に「静音モード」トグル1つだけ (詳細調整は隠す)。

---

## 10. 実装スコープ (フェーズ分割)

### Phase A — 基盤 (この計画で最初にやる)
1. カラートークン更新 (`src/styles.css`) → Deep Ocean 進化版
2. ナビゲーション再構築: AppShell を **上部 segmented + 中央 FAB** に (下部タブ削除)
3. Home = 縦フルスクリーンフィード (`src/routes/_authenticated/home.tsx` 全書き換え)
4. Dex = ミニマルミュージアム格子リファイン
5. Scan エフェクト刷新: `src/components/ScanEffect.tsx` 新規 (Canvas格子+粒子)
6. サウンドエンジン新規: `src/lib/sound-engine.ts` (Web Audio 生成)
7. ハプティックユーティリティ: `src/lib/haptics.ts`
8. マイクロインタラクション統一: `.lift` `.snap-card` `.hero-pop` を再定義

### Phase B — 磨き込み
9. カード種別7種のバリアント実装
10. Ken Burns エフェクト
11. Recap 自動生成 (週次の8枚を選ぶロジック)
12. 長押しシェア
13. Light mode 対応

### Phase C — 検証
14. Playwright で各画面キャプチャ、Peak-End の見栄え確認
15. パフォーマンス: フィード60fps維持、Canvas粒子は最大80個

**Phase 6 (入力キャッチ/ゴースト/ワードツリー) の既存機能は保持**、見た目だけ新デザインシステムに乗せ替え。

---

## 11. 技術詳細 (エンジニア向け)

- 縦フィード: `scroll-snap-type: y mandatory` + `IntersectionObserver` で active card 判定 → Ken Burns アニメ開始/停止
- 中央FAB: `position: fixed`、SVG `<circle>` の `r` を `animate` で 0.8s ease-in-out 呼吸 (Vision Pro 風)
- スキャン Canvas: 単一 `<canvas>` 全画面、`ResizeObserver` で dpr 対応、粒子は typed array で GC 削減
- 音: `AudioContext` を最初のユーザー tap で unlock (既存 `primeAudio` パターンを流用)
- ハプティック: `if ('vibrate' in navigator)` + iOS は `<button>` の内部で発火する `Haptics.impact()` (Capacitor 将来対応の抽象化)
- Framer Motion は既に入っていれば活用、無ければ CSS + Web Animations API で完結 (依存追加最小)
- 既存 Supabase / MCP / RLS / SRS / ワードツリーロジックは**触らない**。UI 層のみ再構築。

---

## 12. 受入基準

- [ ] ホーム = 縦スワイプ全画面フィード、7カード種別が混在、Ken Burns が動く
- [ ] 下部タブが消え、上部 segmented (Home/Museum) + 中央 FAB のみ
- [ ] スキャン = 格子 + 粒子 + 音 + 触覚、待ち時間 1.8s が「短く感じる」体験になる
- [ ] Deep Ocean 進化版カラーが全画面に一貫適用
- [ ] ストリーク数字/ミッション/バッジが視界から消えている
- [ ] 図鑑 = ミニマル格子、金/白ドットで状態を極小表現、長押しシェア動作
- [ ] 全ボタンに .lift 触覚とサウンド (Subtle default)
- [ ] Phase 6 の既存機能 (入力キャッチ, ゴースト, ワードツリー) は動作維持

---

承認後、Phase A から着手します。プロトタイプで色/フォント候補を並べて比較したい場合は「デザイン方向を先に見たい」と言ってください、`create_directions` で3案レンダリングします。
