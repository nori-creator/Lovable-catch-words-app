# 開発者の「AI の設定」API（Web・iOS 共通）

オーナー決定 2026-10-09:

- 既定: **スキャンは最新の Gemini Flash-Lite（`latest-flash-lite`）、ほかの AI 機能は全部最新の Gemini Flash（`latest-flash`）**。
- アプリの**すべての AI 機能**を、開発者（管理者）の設定から別の会社・モデルに切り替えられる。**Web と iOS の両方**から。
- 文字検索の AI 画像（`image_generation`）と発音の声（`tts_voice`）も同じ「AI の設定」の中で切り替える。

Web の画面は `src/components/AdminAiSettingsCard.tsx`（設定 → 開発者 →「AI の設定（開発者）」）。
iOS の開発者画面は、この文書の口だけを使って同じ物を作る。

実装: `src/lib/admin-ai.server.ts`（中身）、`src/lib/admin-ai.functions.ts`（サーバ関数）、
`src/lib/ai-features.ts`（機能の表と値の形）、`src/lib/ai-provider.server.ts` の `getAiFor`（実際の振り分け）。

---

## 呼び方

iOS は既存の `/api/native-fn` を使う（`src/lib/native-fn.ts`）。

```
POST /api/native-fn
Authorization: Bearer <Supabase のアクセストークン>
Content-Type: application/json

{ "fn": "adminGetAiSettings", "data": {} }
```

- 成功: `200 { "result": <下の各口の返事> }`
- 失敗: `{ "error": "利用者に見せてよい文" }` と状態コード
  - `401` ログインしていない / トークンが古い
  - `403` **管理者でない人が書き込みの口を呼んだ**
  - `400` **送った値が使えない**（項目の不足・知らない言語・知らない機能・知らない会社・形の違う
    `"会社:モデル"`・**鍵が無い会社を選んだ**・写真を読めないモデルをスキャンに選んだ・空の声 等）。
    `error` に理由がそのまま入る（画面にそのまま出してよい）。何も保存しない。
  - `500` そのほか（サーバ側の失敗。保存できなかった等）

Web は同じ関数を `useServerFn` で直に呼ぶ（返事の形は同じ）。

### 権限と秘密

- どの口も、関数の中で `has_role(auth.uid, 'admin')` を確かめる。
- **管理者でない人**: `adminGetAiSettings` は `{ "isAdmin": false }` **だけ**を返す（設定・会社の一覧・鍵の有無も返さない）。書き込みの口は `403`。
- **鍵の値は絶対に返さない。** 返すのは `hasKey: true/false` だけ。鍵は Lovable Cloud の Secrets（環境変数）に置き、画面からは入れない。
- 設定は `app_config`（RLS で管理者だけ）に、呼んだ人の権限で読み書きする。

---

## 機能の一覧

| id              | 段（既定）                          | 写真を読む | 何に使うか                                                                              |
| --------------- | ----------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `scan`          | `flash-lite`（`latest-flash-lite`） | はい       | 写真の物・文字の検出、単語の候補、チュートリアルの写真、単語帳の頁の読み取り            |
| `card`          | `flash`（`latest-flash`）           | いいえ     | 単語・フレーズのカード生成、項目の作り直し（Pro は `latest-pro`）、読む人の言語での意味 |
| `review`        | `flash`                             | いいえ     | 復習のスピーキング添削・ヒント                                                          |
| `journal`       | `flash`                             | いいえ     | 日記の添削・書き出しの質問（`/api/native-ai` の `text` も）                             |
| `audit`         | `flash`                             | いいえ     | 自己点検（報告された項目の特定・作り直しの判定・読みの1人目）                           |
| `reading_check` | `flash`                             | いいえ     | 読み・品詞の突き合わせの2人目（`audit` と別の AI にすると独立に確かめられる）           |
| `lexicon`       | `flash`                             | いいえ     | 辞書の点検・利用者の報告の検証・生きた例文の生成（毎日の裏方）                          |

値は **`"auto"`** か **`"会社:モデル"`**（例 `"openai:gpt-5-mini"`、`"openrouter:anthropic/claude-sonnet-4.5"`、`"google:latest-pro"`）。

### 優先順位（上が勝つ。隠れた上書きは無い）

1. この設定 `app_config.ai_models.features[id]`（`"会社:モデル"`。その会社の鍵が無ければ 2 へ落ちる）
2. 環境変数 `AI_PROVIDER` / `AI_MODEL_FAST` / `AI_MODEL_RICH` / `AI_MODEL_RICH_PREMIUM`
3. 合言葉の既定（上の表の段。Google の公式のモデル一覧から、いちばん新しい安定版に実行時に置き換わる）

どの段で失敗しても機能は止めない: モデルが無い（404）時は `withModelFallback` が控えのモデルへ、
スキャンは別の設定済みの AI へ1回だけやり直す。

---

## `adminGetAiSettings`

`data`: `{}`

返事（管理者）:

```json
{
  "isAdmin": true,
  "status": { "ok": true, "provider": "google", "error": null },
  "features": [
    {
      "id": "scan",
      "tier": "flash-lite",
      "needsVision": true,
      "labelKey": "aiSet.feature.scan",
      "label": { "ja": "スキャン", "en": "Scan", "zh-TW": "掃描" },
      "description": {
        "ja": "写真の物・文字の検出、単語の候補、単語帳の読み取り（写真を読めるモデルだけ）。",
        "en": "Finds objects and text in photos, suggests words and reads wordbook pages (image-capable models only).",
        "zh-TW": "偵測照片中的物品與文字、提出單字候選、讀取單字本（僅限能讀圖片的模型）。"
      },
      "value": "auto",
      "provider": "google",
      "model": "latest-flash-lite",
      "resolved": "gemini-3.8-flash-lite",
      "error": null
    },
    {
      "id": "journal",
      "tier": "flash",
      "needsVision": false,
      "labelKey": "aiSet.feature.journal",
      "label": { "ja": "日記の添削", "en": "Diary correction", "zh-TW": "日記批改" },
      "description": { "ja": "…", "en": "…", "zh-TW": "…" },
      "value": "openrouter:anthropic/claude-sonnet-4.5",
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4.5",
      "resolved": "anthropic/claude-sonnet-4.5",
      "error": null
    }
  ],
  "providers": [
    {
      "id": "google",
      "name": "Google Gemini",
      "hasKey": true,
      "models": [
        "latest-flash-lite",
        "latest-flash",
        "latest-pro",
        "gemini-3.8-flash",
        "gemini-3.8-flash-lite"
      ],
      "visionModels": [
        "latest-flash-lite",
        "latest-flash",
        "latest-pro",
        "gemini-3.8-flash",
        "gemini-3.8-flash-lite"
      ],
      "error": null
    },
    {
      "id": "openai",
      "name": "OpenAI (ChatGPT)",
      "hasKey": false,
      "models": [],
      "visionModels": [],
      "error": null
    },
    {
      "id": "anthropic",
      "name": "Anthropic Claude",
      "hasKey": false,
      "models": [],
      "visionModels": [],
      "error": null
    },
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "hasKey": false,
      "models": [],
      "visionModels": [],
      "error": null
    },
    {
      "id": "kimi",
      "name": "Kimi (Moonshot)",
      "hasKey": false,
      "models": [],
      "visionModels": [],
      "error": null
    },
    {
      "id": "lovable",
      "name": "Lovable Gateway",
      "hasKey": false,
      "models": [],
      "visionModels": [],
      "error": null
    },
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "hasKey": true,
      "models": ["anthropic/claude-sonnet-4.5", "openai/gpt-5-mini"],
      "visionModels": ["anthropic/claude-sonnet-4.5", "openai/gpt-5-mini"],
      "error": null
    }
  ],
  "image": {
    "provider": "lovable",
    "model": "openai/gpt-image-1-mini",
    "saved": null,
    "providers": [
      {
        "id": "lovable",
        "name": "Lovable AI",
        "hasKey": true,
        "defaultModel": "openai/gpt-image-1-mini"
      },
      {
        "id": "openrouter",
        "name": "OpenRouter",
        "hasKey": true,
        "defaultModel": "bytedance-seed/seedream-5-0-pro"
      },
      {
        "id": "google",
        "name": "Google AI Studio",
        "hasKey": true,
        "defaultModel": "gemini-2.5-flash-image"
      },
      { "id": "openai", "name": "OpenAI", "hasKey": false, "defaultModel": "gpt-image-1-mini" },
      {
        "id": "higgsfield",
        "name": "Higgsfield",
        "hasKey": false,
        "defaultModel": "bytedance/seedream/v4/text-to-image"
      },
      { "id": "off", "name": "Off", "hasKey": true, "defaultModel": "" }
    ]
  },
  "tts": {
    "defaultEngine": "OpenAI-compatible TTS",
    "languages": {
      "zh-TW": {
        "provider": "azure",
        "voice": "zh-TW-HsiaoChenNeural",
        "model": null,
        "gender": "female",
        "incomplete": false
      },
      "en": {
        "provider": "default",
        "voice": "",
        "model": null,
        "gender": null,
        "incomplete": false
      },
      "ja": {
        "provider": "default",
        "voice": "",
        "model": null,
        "gender": null,
        "incomplete": false
      }
    },
    "providers": [
      {
        "id": "azure",
        "name": "Azure AI Speech",
        "hasKey": true,
        "keyEnvs": ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
        "models": [],
        "voices": {
          "zh-TW": ["zh-TW-HsiaoChenNeural", "zh-TW-HsiaoYuNeural", "zh-TW-YunJheNeural"],
          "en": [
            "en-US-AvaMultilingualNeural",
            "en-US-AndrewMultilingualNeural",
            "en-US-JennyNeural"
          ],
          "ja": ["ja-JP-NanamiNeural", "ja-JP-KeitaNeural", "ja-JP-AoiNeural"]
        }
      },
      {
        "id": "gemini",
        "name": "Gemini TTS（3.8）",
        "hasKey": true,
        "keyEnvs": ["GEMINI_API_KEY"],
        "models": ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"],
        "voices": { "zh-TW": [], "en": [], "ja": [] }
      },
      {
        "id": "elevenlabs",
        "name": "ElevenLabs",
        "hasKey": false,
        "keyEnvs": ["ELEVENLABS_API_KEY"],
        "models": ["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_v3"],
        "voices": { "zh-TW": [], "en": [], "ja": [] }
      }
    ]
  }
}
```

返事（管理者でない）:

```json
{ "isAdmin": false }
```

項目の意味:

- `features[].value` — 保存されている値（`"auto"` か `"会社:モデル"`）。画面の選択の現在値。
- `features[].provider` / `model` — **いま実際に使う**会社とモデル（合言葉のまま）。
- `features[].resolved` — 実際に呼ぶ版付きのモデル（例 `gemini-3.8-flash`）。画面には
  `value == "auto"` なら「自動（最新 Gemini Flash）→ {resolved}」、それ以外は「{value} → {resolved}」と出す。
- `features[].error` — 選んだ会社の鍵が消えて既定で動いている、等の説明（無ければ `null`）。
- `features[].label` / `description` — 表示言語ごとの文言（`ja` / `en` / `zh-TW`）。iOS は辞書を持たずにこれを出せる。
- `providers[].models` — その鍵でいま使えるモデル（各社の `GET /models` を1時間ためた物。Google は先頭に合言葉 3つ）。
  `needsVision: true` の機能（スキャン）には `visionModels` だけを並べる。
- `providers[].error` — 鍵はあるが一覧を取れなかった理由（鍵の誤り・期限切れ・支払い停止など）。
- `image.saved` — 開発者が保存した値。`null` なら環境変数 `IMAGE_PROVIDER` / `IMAGE_MODEL` の既定で動いている。
- `tts.languages[lang].provider` — `"default"` は何も選んでいない（`defaultEngine` の声が鳴る）。
  台湾華語で `azure` / `gemini` を選ぶと**アプリ全体で1つの台湾の声**（`gender` つき。ほかの声に切り替えない）。
- `tts.languages[lang].incomplete` — 台湾の声に Gemini を選んだが声が未選択で、既定の声で鳴っている。

---

## `adminSetAiFeature`

`data`:

```json
{ "feature": "journal", "value": "openrouter:anthropic/claude-sonnet-4.5" }
```

既定に戻す:

```json
{ "feature": "journal", "value": "auto" }
```

返事:

```json
{ "ok": true, "feature": "journal", "value": "openrouter:anthropic/claude-sonnet-4.5" }
```

断る場合（`400`。`error` に理由。何も保存しない）:

- `feature` が上の表に無い
- `value` が `"auto"` でも `"会社:モデル"` でもない（モデル名だけ・空のモデル・使えない字）
- 会社が `providers` に無い / **その会社の鍵がサーバに無い**
- `scan` に写真を読めないモデルを選んだ

保存すると、そのサーバでは次の呼び出しから新しい設定で動く（ほかのサーバも 30 秒以内）。
保存するたびに `ai_models` は `{ "features": { … }, "tasks": { … }, "backups": { … } }` だけの形に
書き直される（空の表は書かない。昔の全体の上書き `provider` / `fast` / `rich` / `rich_premium` は
消え、読まれもしない）。

---

## 用途ごとの AI と控え（2026-10-14〜）

オーナー依頼「このアプリで使われている全ての AI の機能を、開発者の私だけ AI のモデル設定、機能と
モデルごとのコスト管理できるようにして」「すべての AI 機能が失敗したときのバックアップを作って」
「iOS にない奴は消して」。表と純粋な関数は `src/lib/ai-task-settings.ts`。

- **用途**（`ai-call-log.ts` の `AI_TASKS`。例 `section_regen` = 項目の作り直し）ごとに、使う AI と
  落ちた時の控えを選べる。保存先は `ai_models.tasks[用途]` / `ai_models.backups[用途]`。
- 優先順位: 用途の設定 → 機能の設定（`features`）→ 環境変数 → 既定（合言葉）。
- **控え**: `getAiFor` が返すモデルは全部、失敗したら同じ依頼を控えへ1回だけ送り直す
  （`src/lib/ai-backup.server.ts`。止めた・締め切りの来た依頼は回さない）。控えは
  開発者が選んだ物 → 無ければ既定（1番手と**別の会社**で鍵のある最初の物: Lovable の
  `google/gemini-2.5-flash` → Google の最新の版 → OpenRouter の `google/gemini-2.5-flash`）。
  `"off"` で控えを使わない。2番手を持つ用途（写真の候補・カード・画像）も、選んだ控えを2番手にする。
- `adminGetAiSettings` の返事に `tasks` が増えた（全部の用途。`ios: true` が iOS 版で AI が動く用途）:

```json
{
  "id": "section_regen",
  "feature": "card",
  "needsVision": false,
  "ios": true,
  "label": { "ja": "項目の作り直し", "en": "Section rewrite", "zh-TW": "重新產生項目" },
  "description": { "ja": "…", "en": "…", "zh-TW": "…" },
  "value": "auto",
  "backup": "auto",
  "provider": "google",
  "model": "latest-flash",
  "resolved": "gemini-3.8-flash",
  "backupProvider": "lovable",
  "backupModel": "google/gemini-2.5-flash",
  "backupResolved": "google/gemini-2.5-flash",
  "error": null
}
```

iOS 版で AI が動く用途: `photo_candidates` `word_candidates` `card` `reader_meaning` `section_regen`
`report_locate` `reading_check_1` `reading_check_2` `correction_judge` `image_sense` `image_verify`。
4択の誤答の作り置き（`distractors`）は **iOS で保存した語では作らない**（iOS の4択は語を選ぶ形で、
AI の誤答＝意味を使わない。`stickers.functions.ts`）。

## `adminSetAiTask`

`data`（`value` と `backup` の片方だけでもよい）:

```json
{
  "task": "section_regen",
  "value": "anthropic:claude-sonnet-5-5",
  "backup": "lovable:google/gemini-2.5-flash"
}
```

- `value`: `"auto"`（機能の設定・既定のまま）か `"会社:モデル"`
- `backup`: `"auto"`（既定の控え）・`"off"`（控えを使わない）・`"会社:モデル"`

返事: `{ "ok": true, "task": "section_regen", "value": "…", "backup": "…" }`。
断る場合（`400`）: 知らない用途・形の違う値・鍵の無い会社・写真を読む用途に写真を読めないモデル・
`value` も `backup` も無い。

## `adminGetAiCosts`（用途ごと・モデルごと・日ごとの費用）

`data`: `{ "days": 1 | 7 | 30 }`（既定 30）。管理者でなければ `{ "isAdmin": false }`。

数える物は AI を呼んだ1回ずつの記録（`ai_runs` の `ai_call`）の使った量（入力・出力のトークン）×
単価（米ドル / 100 万トークン）。単価は `src/lib/ai-model-prices.ts` の確かめた表に、開発者が入れた値
（`app_config.ai_prices`）を重ねる。**単価の分からないモデル（Lovable・OpenRouter の口など）は費用に
入れず**、`unpricedCalls` に数える。円は `usdJpy`（既定 156、2026-09-16 の公開値）で換算する。
日付は日本時間。中身は `src/lib/ai-costs.ts` の `AiCostReport`:

```json
{
  "isAdmin": true,
  "truncated": false,
  "days": 30,
  "since": "2026-09-14T12:00:00.000Z",
  "usdJpy": 156,
  "total": {
    "calls": 120,
    "ok": 80,
    "failed": 40,
    "tokensIn": 400000,
    "tokensOut": 90000,
    "usd": 0.42,
    "unpricedCalls": 35
  },
  "tasks": [
    {
      "task": "card",
      "feature": "card",
      "ios": true,
      "label": { "ja": "単語カード", "en": "…", "zh-TW": "…" },
      "calls": 58,
      "ok": 33,
      "failed": 25,
      "tokensIn": 333000,
      "tokensOut": 78000,
      "usd": 0.3,
      "unpricedCalls": 25,
      "models": [
        { "model": "google:gemini-3.8-flash", "calls": 19, "usd": 0.04 },
        { "model": "lovable:google/gemini-2.5-flash", "calls": 25, "usd": null }
      ]
    }
  ],
  "models": [
    {
      "model": "google:gemini-3.8-flash",
      "calls": 19,
      "ok": 3,
      "failed": 16,
      "tokensIn": 30487,
      "tokensOut": 4850,
      "usd": 0.04,
      "unpricedCalls": 0,
      "price": { "inUsd": 0.75, "outUsd": 3.75, "source": "ai.google.dev/…", "custom": false }
    },
    { "model": "lovable:google/gemini-2.5-flash", "calls": 25, "price": null, "…": "…" }
  ],
  "daily": [{ "day": "2026-10-14", "calls": 12, "usd": 0.05 }],
  "customPrices": [{ "model": "lovable:google/gemini-2.5-flash", "inUsd": 0.3, "outUsd": 2.5 }]
}
```

## `adminSetAiPrice`（単価・為替）

- 為替: `{ "usdJpy": 150 }`（50〜500）
- 単価を入れる: `{ "model": "lovable:google/gemini-2.5-flash", "inUsd": 0.3, "outUsd": 2.5 }`
  （`model` は記録に出る `会社:モデル`。米ドル / 100 万トークン、0〜1000）
- 入れた単価を消す（確かめた表の値・未登録に戻る）: `{ "model": "…", "remove": true }`

返事: `{ "ok": true, "usdJpy": 150, "models": { "…": { "in": 0.3, "out": 2.5 } } }`。

---

## `adminSetImageConfig`

`data`:

```json
{ "provider": "google", "model": "" }
```

- `provider`: `lovable` | `openrouter` | `google` | `openai` | `higgsfield` | `off`
- `model`: 空ならその会社の `defaultModel`。英数字と `. _ / : -` だけ、120 字まで。`off` は無視されて `""`。

返事:

```json
{ "ok": true, "provider": "google", "model": "gemini-2.5-flash-image" }
```

鍵の無い会社（`off` 以外）は断る（`400`）。

## `adminTestImage`

**本当に1枚作る**（その会社の残高を使う）。**何も保存しない。**

`data`（どれも任意）:

```json
{ "query": "柚子", "provider": "google", "model": "gemini-3-pro-image" }
```

- `query`: 1〜60 字（既定 `"柚子"`）。
- `provider` / `model`: **画面でいま選んでいる（まだ保存していない）会社・モデル**で試す時に送る。
  形と確かめは `adminSetImageConfig` と同じ（`model` が空ならその会社の `defaultModel`、
  鍵の無い会社・知らない会社・使えない字は `400`）。`model` だけを送るのも `400`。
- `provider` を送らなければ、**本番と同じ**（保存した設定 → 環境変数）で試す
  （これまでの `{}` / `{ "query": … }` はそのまま動く）。

返事:

```json
{
  "provider": "google",
  "model": "gemini-2.5-flash-image",
  "credentialName": null,
  "ok": true,
  "image": "data:image/png;base64,iVBORw0…",
  "error": null,
  "ms": 6120
}
```

- `credentialName` — Higgsfield の時だけ、鍵を見つけた**環境変数の名前**（値ではない）。
- 失敗時は `ok: false`、`image: null`、`error` に短い理由（例 `"生成できませんでした"`、`"画像生成は停止中です"`）。

---

## `adminSetTtsVoice`

`data`:

```json
{ "language": "zh-TW", "provider": "azure", "voice": "zh-TW-YunJheNeural", "gender": "male" }
```

```json
{
  "language": "zh-TW",
  "provider": "gemini",
  "voice": "<診断で出た zh-TW の声の id>",
  "model": "gemini-3.8-flash-lite-tts",
  "gender": "female"
}
```

```json
{
  "language": "en",
  "provider": "elevenlabs",
  "voice": "<Voice Library の id>",
  "model": "eleven_flash_v2_5"
}
```

既定の声に戻す:

```json
{ "language": "ja", "provider": "default" }
```

- `language`: `zh-TW` | `en` | `ja`
- `provider`: `default` | `azure` | `gemini` | `elevenlabs`
- `voice`: 声の ID（`default` 以外は必須。台湾華語の Azure は `tts.providers[azure].voices["zh-TW"]` の中から、性別に合う物だけ）
- `model`: 任意（その会社の `models` から）
- `gender`: 台湾華語で `azure` / `gemini` の時だけ使う（`female` | `male`）

返事:

```json
{
  "ok": true,
  "language": "zh-TW",
  "row": {
    "provider": "azure",
    "voice": "zh-TW-YunJheNeural",
    "model": null,
    "gender": "male",
    "incomplete": false
  }
}
```

鍵の無い会社・空の声・性別に合わない台湾の Azure の声・使えない字は断る（`400`）。

## `adminPreviewTtsVoice`（試しに鳴らす。保存しない）

`data`:

```json
{
  "language": "ja",
  "text": "はじめまして。",
  "choice": { "provider": "azure", "voice": "ja-JP-NanamiNeural" }
}
```

返事: `{ "audio_url": "data:audio/mpeg;base64,…", "ms": 812 }`（`ms` は届くまでの時間）

## `adminDiagnoseGeminiTts`（Gemini の台湾の声の一覧。課金の無い問い合わせだけ）

`data`: `{}`

返事:

```json
{
  "keyPresent": true,
  "keyEnv": "GEMINI_API_KEY",
  "models": [{ "id": "gemini-3.8-flash-lite-tts", "ok": true, "status": 200 }],
  "voices": {
    "female": [
      { "id": "…", "name": "…", "gender": "female", "accent": "zh-TW", "languages": ["zh-TW"] }
    ],
    "male": []
  },
  "voicesError": null
}
```

## `adminGetAiStats`（機能ごと・用途ごと・モデルごとの速さと正確さ）

オーナー依頼 2026-10-11「開発者の設定から、それぞれの機能で使う AI を切り替えたときの結果を計測し、
分析できるようにして」。数え方は `src/lib/ai-model-stats.ts`、記録は `src/lib/ai-call-log.ts`。

`data`: `{ "days": 1 | 7 | 30, "mine": false }`（`mine: true` = 自分の使った分だけ。`days` が
それ以外なら 7）。管理者でなければ `{ "isAdmin": false }`。

返事（数だけ。誰の行か・写真・語は返さない）:

```json
{
  "isAdmin": true,
  "truncated": false,
  "days": 7,
  "mine": false,
  "since": "2026-10-04T09:00:00.000Z",
  "tasks": [
    {
      "task": "photo_candidates",
      "feature": "scan",
      "models": [
        {
          "model": "google:gemini-3.5-flash-lite",
          "calls": 120,
          "ok": 118,
          "failed": 0,
          "timeouts": 2,
          "cancelled": 9,
          "okPct": 98.3,
          "p50": 2104,
          "p90": 3380,
          "p99": 6900,
          "avgIn": 1850,
          "avgOut": 320,
          "avgReasoning": null,
          "costUsd": 0.00135,
          "unusable": { "n": 1, "of": 129, "pct": 0.8 },
          "picks": {
            "n": 85,
            "top1": 61,
            "top3": 77,
            "nativeSearch": 4,
            "top1Pct": 71.8,
            "top3Pct": 90.6
          }
        }
      ]
    }
  ],
  "tests": [
    {
      "task": "photo_candidates",
      "model": "anthropic:claude-haiku-5-5",
      "variant": "thinking-off",
      "lang": "zh-TW",
      "n": 33,
      "ok": 33,
      "failed": 0,
      "top1": 24,
      "top3": 30,
      "top1Pct": 72.7,
      "top3Pct": 90.9,
      "p50": 1650,
      "p90": 2400,
      "costUsd": 0.0003,
      "lastAt": "2026-10-11T08:12:00.000Z"
    }
  ]
}
```

- 時間（`p50` など）は ms。AI に頼んでから答えが揃うまで（利用者の待ち時間全体ではない）。
- `calls` = 答えた回 + 失敗 + 時間切れ。`cancelled`（追いかけで負けた・枠の確保で止めた）は AI の
  失敗ではないので `calls` にも時間にも入れない。
- `unusable`（形が崩れて捨てた返事）・`picks`（候補の当たり）は測れる用途だけ。無い用途は `null`。
  `picks` の分母は「一覧から選んだ回 + 一覧に無く母語で調べ直した回」（`/admin/beta` と同じ）。
- `costUsd` は有料枠の単価での1回の目安（単価の分かるモデルだけ。`ai-model-prices.ts`）。
- `task` の名前と並びは `AI_TASKS`（`ai-call-log.ts`）。画面の名前は `aiStats.task.<task>`。
  チュートリアルは候補（`tutorial_candidates`）・カード（`tutorial_card`）・その人に合わせた
  レッスン（`tutorial_lesson`）に分かれる。
- `mine: false` の時は、**登録前の人のチュートリアル**も入る（`app_config` の `first-catch-run:`
  の各回の結果。`ai_runs` に行を持てないため）。量（トークン）と費用は無く、残すのは 14 日なので、
  30 日の表でもその分は 14 日まで。
- `picks` は、選んだ回を「候補を出した時刻」が直前の撮影に結び付ける（撮った後の候補の行は返事の後に
  書くので、行の時刻ではなく返事ができた時刻 `meta.at` で比べる。`meta.at` の無い古い行は
  書き込みの遅れを 3 秒まで見込む）。
- `tests` はモデル × 呼び方（`variant`）× 学習言語（`lang`）ごとに1行。`failed` = 答えが返らなかった
  写真（時間切れ・会社の失敗）。`top1Pct` / `top3Pct` は `n`（失敗も入れる）が分母で、失敗は外れ。
  `p50` / `p90` は答えた写真だけの時間なので、`failed` と並べて見る。`lang` は古い行で無ければ `null`。
- 読む行が多すぎる時は**新しい順に**上限まで読み、`truncated: true`。

## `adminGetAiTestPhotos`（固定の写真で試す: 写真の一覧）

`data`: `{}`。返事: `{ "isAdmin": true, "languages": ["zh-TW","en","ja"], "photos": [{ "id": "cafe", "kind": "photo", "path": "/ai-test/photos/cafe.jpg" }] }`。
写真はアプリの入口（`https://catchwords.lovable.app`）に `path` を付けて取る。正解はサーバが持つ
（`src/lib/ai-test-photos.ts`）。

## `adminTestPhotoCandidates`（固定の写真で試す: 1枚）

本番の設定を変えずに、選んだモデルに1枚流す（撮った後の候補と同じ指示文・同じ並べ直し）。
管理者だけ・1日（24 時間）300 枚まで（超えると `AI_TEST_DAILY_LIMIT`、native-fn では 429）。

`data`:

```json
{
  "value": "anthropic:claude-haiku-5-5",
  "photo": "cafe",
  "targetLanguage": "zh-TW",
  "thinking": "default",
  "imageBase64": "data:image/jpeg;base64,…"
}
```

`value` は `"auto"`（いまのスキャンの AI）か `"会社:モデル"`（写真を読めるモデル）。
`thinking` は `"default"`（省略可。本番と同じ呼び方）か `"off"`（Claude に考えさせない: Haiku 5.5 は
`thinking: {type: "disabled"}`、Sonnet 5.5 は `{type: "between_tools"}`、Opus 5 系と Claude 以外は何も変えない）。
Claude 5 は何も渡さないと考えてから答える（Anthropic の OpenAI 互換の口の資料）。

返事: `{ "ok": true, "ms": 1640, "model": "anthropic:claude-haiku-5-5", "variant": null, "rank": 1, "heads": ["咖啡","拿鐵"], "want": "咖啡", "code": null }`
（`variant` = `"thinking-off"` なら考えさせない呼び方で測った。`tests` の行も `variant` ごとに分かれる）
（`rank` = 正解が候補の何番目か。無ければ `null`。`code` は失敗の印 — `timeout` / `unusable` / `http_429` など）。
結果は `adminGetAiStats` の `tests` に入る。一度に 2 枚ずつ流すのが目安（無料枠の1分あたりの上限）。

サーバは届いた写真が `photo` の写真か（SHA-256 が `AI_TEST_PHOTO_SHA256` と同じか）を確かめる。
違えば AI を呼ばずに `AI_TEST_PHOTO_MISMATCH` で断る（native-fn では 400。記録も数えもしない）。
写真は加工せず、`path` から取ったままの中身を送ること。

画面で数える時: 答えが返った写真（`ok: false` も入れる。サーバの記録と同じ）を分母にする。写真の
読み込み・通信・権限の失敗（返事が無い）はモデルの外れではないので、分母に入れず数だけ別に出す。

## `logCandidatePick`（候補の何番目を選んだか — iOS からも送る）

`data`: `{ "via": "photo" | "native_search" | "typed" | "scan", "rank": 1, "n": 5 }`
（`rank` = 選んだ語が AI の並びで何番目か、1 から。`native_search` = 写真の候補に無く母語で調べ直した）。
語・写真は送らない。サーバはこの1回を、その人へ直前（15 分以内）に候補を出したモデルに結び付けて
`picks` を数える。

---

## iOS 画面の組み立て（Web と同じ並び）

1. 1行目: `status.ok` なら緑「AI は動いています（既定: {provider}）」、でなければ赤で `status.error`。
2. 「機能ごとの AI」: `features` を順に。名前（`label`）・説明（`description`）・「いま: …」・選択肢
   （「自動（最新 {Gemini Flash|Gemini Flash-Lite}）」+ `hasKey` の会社ごとにモデル。鍵の無い会社は押せない行）。
   選んだら即 `adminSetAiFeature` → 成功したら `adminGetAiSettings` を読み直す。
3. 「速さと正確さ（モデルごと）」: 期間（1日 / 7日 / 30日）と「自分の分だけ」で `adminGetAiStats`。
   機能ごとに用途 → モデルの順に、回数・成功率・中央値・90%・候補の当たり・使えない返事・1回の費用。
   機能の「いま」のモデル（`features[].provider` + `resolved`）の行に「いま」。下に「固定の写真で試す」
   （モデル・学習言語を選び、`adminGetAiTestPhotos` の写真を2枚ずつ `adminTestPhotoCandidates` へ。
   終わったら `adminGetAiStats` を読み直す）。
4. 「画像（文字検索の AI 画像）」: 会社（鍵の無い物は押せない）・モデル（空なら既定）・保存・「試しに1枚作る」（`adminTestImage`。**画面でいま選んでいる `provider` / `model` を送る** — 保存前の選び方を試せる）。
5. 「発音の声」: 台湾華語 / 英語 / 日本語 の3行。会社・（台湾華語の Azure/Gemini は性別）・声・モデル・試しに鳴らす・保存。

管理者でない人には、この欄ごと出さない（`adminGetAiSettings` が `{ "isAdmin": false }`）。
