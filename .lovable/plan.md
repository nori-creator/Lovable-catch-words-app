
# フェーズ2計画

参考記事の核 — 「AIをループで回す（目的→計画→実行→検証→修正）」「作る側と検証する側を分ける（Maker/Checker）」「停止条件とコスト管理」— をこのアプリの中核体験に組み込む。1リクエスト1回答の弱いAIではなく、**自走するAIコーチ**にする。

## 1. フェーズ1の弱点を先に潰す（Polish Sprint・半日）

実装済みだが体験を損ねている部分：

- **単語提案の品質**：Gemini単発呼び出しなので「ピントが外れた語」「TOCFL外」が混ざる。→ Maker/Checkerループ化（下記§2）
- **キャプチャ画面のテンポ**：背景除去 → 提案 → カード生成 が直列で体感3〜6秒空く。→ 楽観UI＋シマー、選択肢を先に出してカード生成は裏で
- **図鑑のシルエット**：今は空欄。→ カテゴリごとの薄いアイコン or AI生成のぼかしシルエットを seed words に事前生成
- **オンボーディング**：チュートリアル未実装。→ 初回 `/capture` で吹き出し3枚（撮る→AI→選ぶ）
- **デザイントークン**：Apple風「白・青・余白」をもう一段引き締める（後述§6）
- **エラー境界**：各ルートに errorComponent / notFoundComponent を確認・追加

## 2. AIループの導入（このアプリの差別化の核）

参考記事の5部品（自動化／スキル／サブエージェント／コネクタ／検証ゲート）を**4つの体験**に適用する：

### ループA：単語提案（Maker/Checker）
- Maker: `gemini-3-flash` が写真＋セルフィー＋ユーザーレベルから候補語10
- **Checker**: 別プロンプトで「TOCFL ≤ユーザー目標」「台湾教育部辞書に存在」「写真と意味が一致」を採点 → 不合格は破棄
- 検証ゲート：辞書テーブル `words` にヒット or 教育部APIで存在確認（ハード検証）
- 停止条件：合格5件 or 3周まで
- 表示は必ずシマー越しで「AIが選別中…」と見せる（ドーパミン演出）

### ループB：SRS（ぼやけペナルティ＋4択＋発音）
- 1セッション = 「目標：今日の弱点語を75%以上で克服」というゴールを与え、AIが出題順を自律調整
- 各問のあと「次に何を出すべきか」をAIが State（誤答履歴・反応時間・ぼやけ判定）から決定
- 検証：正答率が閾値を超えるか、10問で停止
- データ：`reviews(user_id, sticker_id, ease, interval_days, due_at, last_score, blur_seen)` を新設、SM-2を簡略化

### ループC：AI日記
- 1日の取得スタンプを入力、Maker が日記ドラフト、Checker が「学習語を3つ以上自然に含むか」「ユーザーの母語の文体か」を検証 → 不合格なら書き直し
- 完成日記は SNS 投稿の下書きにそのまま使える

### ループD：デイリークエスト
- AI が前日までの State（取得カテゴリ偏り、SRSの弱点）から翌朝6時に1件生成（cron は `/api/public/daily-quest` を pg_cron で叩く）
- 検証：「今日の天気/位置で実行可能か」「ユーザーのレベルに合うか」をChecker

**コスト制御**：全ループに `max_iterations=3`、コンテキスト要約、Flashモデル固定、ユーザー単位の1日トークン上限。無料ユーザーはMaker only、プレミアムでChecker有効。

## 3. ソーシャル & フィード（MVP）

- `posts(id, user_id, sticker_id, caption, visibility, created_at)` ＋ `likes`、`comments`、`follows`、`hashtags`
- `/feed`：フォロー中＋人気の2タブ、Instagram風の縦スクロール、各カードはステッカー＋セルフィー重ね＋日記抜粋
- 公開範囲：private / friends / public をステッカー単位で
- 「友達がこんなものを撮ったよ」通知は `notifications` テーブル＋メール（フェーズ3でPush）

## 4. ネイティブ台湾華語TTS

Lovable AI GatewayにTTSが無ければ、Google Cloud TTS（`cmn-TW` の `Wavenet`）をサーバ関数経由で。音声は `stickers.audio_url` にキャッシュしてコスト削減。無料は1日3再生、プレミアム無制限。

## 5. 新規追加提案（最初の案を超える機能）

- **「キャッチコンボ」**：連続日数で図鑑カードに金枠／虹枠（Pokémon GO的ドーパミン）
- **「写真の中の他の語を後から発見」**：保存済み写真にAIが追加候補を後から提案（受動的な再訪動機）
- **「グループクエスト」**：MTCクラス単位の共同図鑑、週次ランキング
- **「会話モード」**：撮った語をその場で例文音読チャレンジ。録音→発音採点（Google Speech-to-Text + 類似度）
- **「ストーリー」**：24時間で消える今日のスタンプ集、Instagram風
- **「店舗コラボの種」**：将来のため、`venues(place_id, partner_flag)` を今から用意

## 6. デザインの洗練（Apple白×青の本気版）

- 配色：背景 `oklch(0.99 0.005 240)`、primary `oklch(0.58 0.22 250)`、glow `oklch(0.72 0.18 240)`、罫線 `oklch(0.93 0.01 240)`
- タイポ：見出し `SF Pro Display` 風 → `Inter Display`／本文 `Inter`／注音は `Noto Sans TC`。日本語は `Hiragino Sans` フォールバック
- 余白：1セクション最低32px、カードは外周24px角丸＋羽のような影 `0 8px 30px -12px oklch(0.58 0.22 250 / .25)`
- マイクロアニメ（CapWords系）：
  - 単語出現：1文字ずつ blur→clear 60ms スタガー
  - カード生成：1.04倍 overshoot + 軽いhaptic（モバイル時 `navigator.vibrate(8)`）
  - 図鑑取得：ステッカーが基本グリッドに**飛んで収まる**FLIPアニメ
- ダークモード：夜の撮影が多いので最優先で対応

## 7. 技術詳細（実装メモ）

- 新テーブル：`reviews`、`posts`、`likes`、`comments`、`follows`、`hashtags`、`post_hashtags`、`notifications`、`quests`、`user_quests`、`venues`
- すべてに GRANT＋RLS＋`has_role()` を介した管理者例外
- サーバ関数：`suggestWordsWithChecker`、`gradeReview`、`generateDiary`、`generateDailyQuest`、`scorePronunciation`、`createPost`、`likePost`、`followUser`
- 公開エンドポイント：`/api/public/daily-quest`（pg_cron署名つき）、`/api/public/tts-webhook`
- 認証保護：`_authenticated` 配下のままで、loaderは触らずコンポーネントから `useServerFn` で呼ぶ
- フロント分割：`/feed`、`/review`、`/diary`、`/quest`、`/profile/$handle`、`/post/$postId`
- ループの観測：`ai_runs(user_id, loop, iterations, tokens_in, tokens_out, accepted, created_at)` で「accept率」を可視化（記事の cost-per-accepted-change を実装）

## 8. 優先順位と進め方

```text
Sprint 1 (Polish)        : §1 + §6 のデザイントークン更新
Sprint 2 (Loop core)     : §2 ループA・B + §7 reviews/ai_runs
Sprint 3 (Social)        : §3 フィード・投稿・公開範囲
Sprint 4 (AI Diary+Quest): §2 ループC・D + §5 コンボ/ストーリー
Sprint 5 (Voice)         : §4 TTS + §5 発音採点
```

一気に作るか、スプリント単位で確認しながら進めるかを次のメッセージで選んでください。

## 確認したい点（実装前に必要）

1. **AIループのChecker**を**全ユーザーに常時ON**にするか、**プレミアム限定**にするか（コストに直結）
2. **TTS**は Google Cloud TTS（高品質・有料）で進めてOKか、または当面は Web Speech API（無料・品質劣る）で妥協するか
3. **発音採点**は Sprint 5 まで待ってOKか、それともSRSと同時に欲しいか
4. **ダークモード**を Sprint 1 で入れるか、後回しか
