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
保存するたびに `ai_models` は `{ "features": { … } }` だけの形に書き直される（昔の全体の上書き
`provider` / `fast` / `rich` / `rich_premium` は消え、読まれもしない）。

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

---

## iOS 画面の組み立て（Web と同じ並び）

1. 1行目: `status.ok` なら緑「AI は動いています（既定: {provider}）」、でなければ赤で `status.error`。
2. 「機能ごとの AI」: `features` を順に。名前（`label`）・説明（`description`）・「いま: …」・選択肢
   （「自動（最新 {Gemini Flash|Gemini Flash-Lite}）」+ `hasKey` の会社ごとにモデル。鍵の無い会社は押せない行）。
   選んだら即 `adminSetAiFeature` → 成功したら `adminGetAiSettings` を読み直す。
3. 「画像（文字検索の AI 画像）」: 会社（鍵の無い物は押せない）・モデル（空なら既定）・保存・「試しに1枚作る」（`adminTestImage`。**画面でいま選んでいる `provider` / `model` を送る** — 保存前の選び方を試せる）。
4. 「発音の声」: 台湾華語 / 英語 / 日本語 の3行。会社・（台湾華語の Azure/Gemini は性別）・声・モデル・試しに鳴らす・保存。

管理者でない人には、この欄ごと出さない（`adminGetAiSettings` が `{ "isAdmin": false }`）。
