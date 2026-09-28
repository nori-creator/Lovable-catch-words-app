# 言語を足す手順（表示言語・学習言語）

最終確認: 2026-09-27 ／ 対象: 開発を頼む人（オーナー）と、実作業をする AI・開発者

## 2種類の「言語」

| 種類 | 決めるもの | いまある言語 | 置き場所 |
|---|---|---|---|
| **表示言語（母語）** | 画面の文字、AI が書く解説・意味・訳の言語 | 日本語 `ja` / 英語 `en` / 繁體中文 `zh-TW` | `src/lib/i18n.tsx` の `UI_LANGS` |
| **学習言語** | 見出し語・例文・読み・発音・級 | 台湾華語 `zh-TW` / 英語 `en` | `src/lib/target-lang.ts` の `TARGET_LANGUAGES` と `src/lib/target-profile.ts` |

## 仕組み: 足し忘れは「型」と「テスト」で止まる

- 画面の文字の表（`DICT`）は、どの鍵も**全部の表示言語の訳を持つ形**で書かれています（`Record<UiLang, string>`）。表示言語を1つ足すと、訳が無い鍵が全部**ビルドのエラー**になります。訳し忘れたまま公開されることはありません。
- 学習言語の性質（読み・級・例文の作らせ方・4択の受け皿など）は `target-profile.ts` の1か所にまとめてあり、足した言語の欄が欠けるとテストが落ちます。
- 画面に日本語を直に書くと、`src/lib/hardcoded-japanese.test.ts` が落ちます（この回に追加）。

## 表示言語を足す（例: 韓国語 `ko`）

作業は AI に頼めます。頼むときは「docs/adding-a-language.md の手順で表示言語 ko を足して」と伝えてください。

1. `src/lib/i18n.tsx`
   - `UiLang` と `UI_LANGS` に `ko` を足す
   - `UI_LANG_LABEL_KEYS`（設定に出す名前）、`UI_LANG_PROMPT_NAMES`（AI への指示で使う言語名）、`LOCALES`（日付の書き方）に `ko` を足す
   - `DICT` の全部の鍵に `ko: "…"` を足す（約1,230件。AI に訳させ、**人が画面で読んで確かめる**）
   - `src/lib/i18n.test.ts` の鍵の数の期待値は、鍵を増やしていなければ変わらない
2. ビルドのエラーが出る所（`Record<UiLang, …>` の表）を全部埋める。2026-09-27 時点で次のファイル:
   `StickerSheet.tsx`、`FirstCatchFlow.tsx`、`use-language-prefs.ts`、`quiz-choices.ts`（4択の受け皿の意味）、`place-reminder.ts`、`errors.ts`、`settings.tsx`、`terms.tsx`、`privacy.tsx`
3. `src/lib/l1.ts` — 母語ごとの「つまずきやすい所」の表に `ko` を足す（発音のコツ・添削の質が上がる）
4. `src/lib/meaning-language.ts` — 「その文が読み手の言語か」を文字の種類で見分けている。**ハングルの判定を足す**（足さないと、4択や通知で韓国語の意味が別の言語と見なされる）
5. 規約・プライバシー（`terms.tsx` / `privacy.tsx`）— 法的な文なので**機械訳のまま出さない**。訳が用意できるまでは、英語版＋「この言語の版はまだ無い」の一言を出す形（繁體中文と同じ）
6. 確認: `npx tsc --noEmit`、`npx vitest run`、確認用ページで表示言語を `ko` にして主要画面を見る（`?lang=ko`）

## 学習言語を足す（例: 韓国語 `ko`）

1. `src/lib/target-lang.ts` — `TARGET_LANGUAGES` に `ko`
2. `src/lib/target-profile.ts` — `ko` のプロフィールを1つ作る。中身の例:
   - 表記（`scriptLang`）、読み（`readings`。韓国語なら読みの欄は要らない等）
   - 級の体系（TOPIK など）と各級の説明
   - 単語カードに出す項目（`sections`）
   - AI に候補・例文・チャンクを作らせる言い方（`capture`、`chunkPrompt`、`commonFirstExamples`）
   - 4択の受け皿の語と読み（`quizFallbackHeadwords` / `quizFallbackReadings`）
3. `src/lib/text-language.ts` — 例文が本当にその言語で書かれているかの判定を足す
4. `src/lib/tts-providers.ts` — その言語の声の候補（Azure なら `ko-KR-…Neural` など）
5. 辞書（任意）— 管理画面の辞書の取り込みで、その言語の辞書を入れると候補と読みが安定する
6. 確認: 型・テスト・確認用ページ。**実際の AI の出力は本番で数語試して、別の言語が混ざらないか読む**

## 注意（リスク）

- 訳の質は AI 任せにしないでください。特にボタンの短い言葉は、画面で見て不自然なら直す必要があります。
- 学習言語を足すと、AI への指示（プロンプト）も増えます。最初の数十語は出力を人が確認してください。
- 表示言語と学習言語が同じ組み合わせ（韓国語で韓国語を学ぶ）は、母語の判定が成り立たないので選べない作りです（`reader-language.ts`）。
