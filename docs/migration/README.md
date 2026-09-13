# Lovable が私たちの代わりにやっていること — 全部の棚卸し

**調べた日: 2026-08-31 / 対象: 本番で動いているコード全部**

オーナー指示:

> 「ラボブルーがないと使えなくなる機能や使える機能をすべて調べて。
>  ラバブルが自動的に私のかわりにやってるAPIや全ての機能を洗い出してほしい。
>  それらを全て自分で管理したい。」

---

## いちばん先に読む所 — 数えた結果

Lovable が代わりにやっていることは **14個**あります。そのうち

- **自分に移すのが必須（無いと機能が死ぬ）… 7個**
- **移さなくてもいい（好みの問題）… 4個**
- **Lovable を使い続けるなら残す … 3個**

そして重要な事実がひとつ:

> **AI の切り替えは、コードの側ではもう完成しています。**
> `src/lib/ai-provider.server.ts` が最初からその作りになっていて、
> 環境変数を差し替えるだけで Google・OpenAI・Claude・その他どこへでも向きます。
> **書き直す必要はありません。**

---

## ① 移さないと機能が死ぬもの（7個）

| # | Lovable がやっていること | 場所 | 無くなると死ぬ機能 | 自分で持つ方法 | コード変更 |
|---|---|---|---|---|---|
| 1 | **データベース・ログイン・写真置き場**の親を Lovable の口座で持っている | Supabase `arjicopbmvseztldpxpk` | **全部** | 自分の Supabase（`Bubble`）へ移す | 不要（設定だけ） |
| 2 | **AI の中継**<br>`ai.gateway.lovable.dev/v1` | `ai-provider.server.ts:22` | カード生成・スキャン・候補・4択・日記添削・スピーキング採点 | `AI_PROVIDER=google` + `GEMINI_API_KEY` | **不要** ✅ |
| 3 | **読み上げ音声の生成**<br>`…/v1/audio/speech` | `ai-provider.server.ts:771` | 新しい語の音声（既存4,149個は残る） | `TTS_BASE_URL` + `TTS_API_KEY` | **不要** ✅ |
| 4 | **AI画像の生成**<br>`…/v1/images/generations` | `images.functions.ts:103` | 「AIが絵を描く」候補 | OpenAI と直接契約 | **要** ⚠ |
| 5 | **地図の中継**<br>`connector-gateway.lovable.dev/google_maps` | `geocode.functions.ts:35` | キャッチした場所の名前 | Google Maps API を直接叩く | **要** ⚠ |
| 6 | **Google / Apple ログインの中継**<br>`@lovable.dev/cloud-auth-js` | `integrations/lovable/index.ts` | ソーシャルログイン（**ノリさんの本アカウントもこれ**） | Supabase Auth の OAuth を直接使う | **要** ⚠ |
| 7 | **サイトの置き場**<br>`word-snap-journey.lovable.app` | ホスティング | サイトそのもの | Cloudflare Workers / Vercel など | 済 ✅ |

**#4・#5・#6 の3つだけが、私が書き直す必要のある所です。** 他は設定だけ。

---

## ② 移さなくてもいいもの（4個）

| # | 何 | 場所 | 無くなるとどうなる |
|---|---|---|---|
| 8 | **「Edit with Lovable」バッジ** | Lovable のホスティングが差し込む（コードには無い） | 消えるだけ。**自前ホスティングにすれば自動的に消える** |
| 9 | エラーの収集 `window.__lovableEvents` | `lovable-error-reporting.ts` | エラーが Lovable の画面に出なくなるだけ。アプリは動く |
| 10 | MCP（ChatGPT 等からアプリを操作する口） | `@lovable.dev/mcp-js` | その連携だけ止まる |
| 11 | 切り抜きの有料版 remove.bg の**鍵の保管** | Lovable Secrets | 鍵を自分の環境変数に移すだけ。remove.bg 自体は Lovable と無関係 |

---

## ③ Lovable を使い続けるなら残すもの（3個）

オーナー指示「**ラバブールでもこのアプリを使えるようにしときたい**」なので、これらは**消しません**。

| # | 何 | 場所 |
|---|---|---|
| 12 | ビルド設定 `@lovable.dev/vite-tanstack-config` | `vite.config.ts` |
| 13 | プレビュー中のログイン保持 | `integrations/supabase/previewAuthStorage.ts` |
| 14 | Lovable エディタとの同期 | GitHub 連携 |

> ⚠ この3つは**公開されている npm パッケージ**なので、Lovable の契約を切っても
> `npm install` は通り、ビルドもできます。閉じ込められてはいません。

---

## 秘密の鍵は、いま何処に在るか

**`.env`（git に入っている）** — 公開してよい値だけ。触らないでください。

```
SUPABASE_PROJECT_ID / SUPABASE_PUBLISHABLE_KEY / SUPABASE_URL
VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY   ← ブラウザに出る前提の鍵
VITE_SUPABASE_*
```

**Lovable Secrets（git には無い）** — 本物の秘密。移行のとき手で移します。

```
LOVABLE_API_KEY            ← AI・音声・画像の中継すべての鍵
SUPABASE_SERVICE_ROLE_KEY  ← すべての行を読める鍵
GOOGLE_MAPS_API_KEY
GOOGLE_TTS_API_KEY
REMOVE_BG_API_KEY
```

---

## 移すデータの実測（2026-08-31 に本番で数えた）

| 中身 | 量 |
|---|---|
| 利用者アカウント | **4人**（identities も4） |
| 撮った札 `stickers` | 91 |
| 単語 `words` | 171 |
| 解説キャッシュ `word_explanations` | 150 |
| 辞書 `dictionary_entries` | **32,878** |
| 復習 `reviews` / 履歴 | 91 / 256 |
| 日記 | 3 |
| スキャン記録 | 425 |
| **写真・切り抜き・動画** `stickers` バケツ | **315 個 / 133 MB** |
| **読み上げ音声** `tts` バケツ | **4,149 個 / 104 MB** |
| アイコン `avatars` | 2 個 / 39 kB |

### ⚠ いちばん危ないのはここ

> **データベースの書き出し（`pg_dump` / Lovable の Export）に、写真と音声の
> 中身は入りません。** 入るのは「どこに何が在るか」の台帳だけです。

台帳だけ移すと、図鑑には札が並ぶのに**写真が全部壊れた画像になります**。
札の数は合っているので、移した直後は気づけません。

→ だから `scripts/migrate/storage.mjs`（237 MB を運ぶ道具）を別に用意しました。

### ⚠ 二番目に危ないのはここ

> **写真の保存先は `{利用者のUUID}/…` です。**

UUID が変わると、**撮った写真が全部迷子**になります。移行では UUID を
そのまま引き継ぐ必要があります。→ `scripts/migrate/audit.mjs` が
UUID を1つずつ突き合わせて確かめます。

---

## 手順は別の紙に

→ **[手順.md](./手順.md)** に、1つずつ書いてあります。
