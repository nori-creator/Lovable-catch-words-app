# 語彙収集アプリへのピボット

## ゴール
インスタ的な機能をUIから外し、「撮る・入力する → 意味と発音がわかる → 楽しく集まる → 文脈で覚える → SRSで忘れない」のループに集中。

---

## Phase 1: インスタ機能をUIから隠す（DBは温存）

ナビゲーションとルートから以下を非表示／無効化。ファイルとDBテーブルは残す。

- 非表示: `feed`, `post.$postId`, `u.$userId`, `discover`, `notifications`（後で復習リマインド土台として再利用）
- `AppShell` のボトムナビ刷新: **ホーム / 撮る・入力 / 図鑑 / 復習 / マップ**
- `home` から「フィード」「ランキング」セクションを削除し、今日のクエスト・連続記録・新着収集をメインに

---

## Phase 2: テキスト入力による収集経路（新規）

`capture.tsx` に「📷 写真 / ⌨️ 単語入力」のタブを追加。

### 単語入力フロー
1. ユーザーが単語を入力（例: 「咖啡」または日本語「コーヒー」）
2. AIで `headword / 注音 / 拼音 / 意味 / 例文` を生成（既存 `generateCard` を再利用）
3. **画像候補を生成**（後述）→ 3〜4枚から選ぶ
4. または **自分でアップロード** ボタンで端末から選択
5. 確定 → `saveSticker` で登録（自撮り・位置はオプション）

### 画像候補の取得方針
- **Unsplash API** を採用。ユーザーから Access Key を `secrets--add_secret` で受け取り、`UNSPLASH_ACCESS_KEY` として保存
- 新規 server fn `searchUnsplashImages({ query })` → 4件の `regular` URL を返却
- 候補ゼロ件 or 失敗時のフォールバック: Lovable AI `google/gemini-3.1-flash-image` で1枚生成
- 選択後、画像URLを `fetch` してBlob化 → `stickers` バケットに保存し既存 `object_image_url` に格納（既存表示ロジックを再利用）

---

## Phase 3: 発音TTS（台湾華語音声）

- 新規ルート `src/routes/api/tts.ts`（SSE ストリーミング、`openai/gpt-4o-mini-tts`）
- `PronunciationPanel` に🔊ボタン追加。`headword` と `example_sentence` を別ボタンで再生
- 同じテキストはクライアントでキャッシュ（`Map<text, AudioBuffer>`）してクレジット節約
- 図鑑詳細・復習カード・収集確定モーダルから利用可能に

---

## Phase 4: 忘却曲線の可視化

`review.tsx` 上部と `dex.$stickerId` に「記憶度グラフ」を追加。

### 計算方法（SM-2の値から推定）
各レビュー時点の retention を Ebbinghaus 風に推定:
```
R(t) = exp(-t / S)
S ≒ interval_days × ease  （安定性の近似）
```

### 表示
- **全体ビュー（review画面）**: 全カードの平均記憶率を折れ線で14日分。「今日学べば◯%回復」のヒントを併記
- **単語別ビュー（dex詳細）**: その単語の過去レビュー履歴をドットで、推定 retention カーブを線で重ねる。次回の due_at を縦線で表示
- ライブラリは `recharts`（既にshadcn `chart.tsx` あり）

### データソース
- 既存 `reviews` テーブルの `ease, interval_days, repetitions, last_reviewed_at, last_score, due_at` から計算
- より精密にするため新テーブル `review_history` を追加: `review_id, reviewed_at, score, interval_days_after, ease_after`
- `gradeReview` で `review_history` にも INSERT

---

## Phase 5: 報酬感UIの強化（小タスク）

- 収集成功時のシルエット→カラー化に「キラッ」エフェクト（CSS gradient sweep + 軽いhaptic `navigator.vibrate`）
- レアリティバッジ（カテゴリ初収集=⭐SR、3件目以降=N など簡易ルール）
- カテゴリ別コンプリ率を図鑑トップにバー表示

---

## 段階リリース

ユーザーの希望どおり段階実装。今回のターンでは **Phase 1 + Phase 2 + Phase 4 の忘却曲線グラフ** をまず実装。Phase 3（TTS）と Phase 5 は次ターン以降。

---

## 技術詳細セクション

### 変更ファイル
- 編集: `src/components/AppShell.tsx`, `src/routes/_authenticated/home.tsx`, `src/routes/_authenticated/capture.tsx`, `src/routes/_authenticated/review.tsx`, `src/routes/_authenticated/dex.$stickerId.tsx`, `src/lib/reviews.functions.ts`, `src/lib/stickers.functions.ts`
- 新規: `src/lib/images.functions.ts`（Unsplash検索 + 画像取得→Storage保存）, `src/components/ForgettingCurveChart.tsx`, `src/components/ImagePicker.tsx`
- 削除しない: `feed`, `post.*`, `u.userId`, `discover`, `notifications`, `social.functions.ts`（ルート登録はそのまま、ナビからのリンクのみ除去）

### DBマイグレーション
- `CREATE TABLE public.review_history(...)` + GRANT + RLS（ユーザー自身のみ select/insert）
- `gradeReview` 内で INSERT を追加

### シークレット
- `UNSPLASH_ACCESS_KEY` を `add_secret` で要求（実装ターンで提示）

### 互換性
- 既存の `stickers / words / reviews` スキーマはそのまま。テキスト入力経路でも同じ `saveSticker` を通すので図鑑・SRS・マップは無修正で動作

---

このプランで進めてOKであれば、Phase 1+2+4 を1ターンで実装します。
