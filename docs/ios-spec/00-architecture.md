# 00. 全体の形

## アプリ2つ、データベース1つ

```
                        ┌── Lovable の Web版（今のまま。編集も利用も続ける）
   自分の Supabase ─────┤
   （自分のアカウント）   └── iPhone アプリ（Swift・別リポジトリ）
```

両方が**同じ Supabase を見ます**。だから iPhone で撮った写真が Web 版にも出ます。
「片方でしか見られない記録」を作らないこと — これがこの構成の目的です。

## 3つの層

| 層 | 何をするか | iPhone からの触り方 |
|---|---|---|
| **Supabase** | データ・ログイン・写真と音声の保管 | `supabase-swift` で**直接** |
| **サーバー処理**（96個） | AI・音声合成・地名・画像検索・判断 | `/api/v1/*` を **HTTP** で |
| **端末** | カメラ・切り抜き・音声認識・触覚 | iOS ネイティブ |

### なぜ Supabase には直接つなぐのか

読み書きは RLS（行ごとの権限）で守られていて、`auth.uid() = user_id` の形が
全テーブルに入っています。サーバーを経由させても安全性は上がらず、遅くなるだけです。

### なぜ AI などはサーバー経由なのか

**鍵を端末に置けない**からです。AI の鍵・サービスロール鍵をアプリに埋め込むと、
アプリを解析した誰でも使えてしまいます。サーバーが鍵を持ち、端末は結果だけ受け取ります。

---

## 認証

**Cookie ではなく Bearer トークン。** これは iPhone 版にとって都合がよい形です。

- ログイン後、Supabase が `access_token` を返す
- サーバーを呼ぶときは毎回 `Authorization: Bearer <token>`
  （Web 版では `src/integrations/supabase/auth-attacher.ts` がやっている）
- サーバー側は `src/integrations/supabase/auth-middleware.ts` で検証し、
  `context.userId` と、その人の権限で動く `context.supabase` を作る

Swift 側も同じにします。`supabase-swift` の `session.accessToken` を
API 呼び出しのヘッダに載せるだけです。

⚠️ **Cookie を使わないので CORS が楽です。** ただし `/api/v1/*` を
別ドメインに置くなら、`Access-Control-Allow-Headers: Authorization` は要ります。

### ログインしていないとき

Web 版は `_authenticated` の入口で判定し、無ければ `/auth` へ送ります
（`src/routes/_authenticated/route.tsx`）。ここに**過去に壊れた跡**があります:

⚠️ セッション確認に `.catch` も時間切れも無かった頃、通信が失敗すると
**文字の無いスピナーが回り続けるだけ**になっていました（地下鉄でアプリを開くと必ずこれ）。
いまは **8秒で時間切れ**にし、理由を出してやり直させます。
**iPhone 版でも同じにすること。** 電波の悪い場所は日常です。

---

## API の面（`/api/v1/*`）

いまの96個の処理は TanStack 独自の `/_serverFn/<自動生成ID>` で呼ばれます。
**ID がビルドごとに変わりうる**ので、Swift からはこれを直接叩きません。

安定した入口を**新しいファイルとして足します**（既存は1行も変えない）。
書き方の手本はリポジトリ内にあります: `src/routes/sitemap[.]xml.ts` の `server: { handlers }`。

### 面の一覧（第一版）

| 入口 | 中身を持つ既存ファイル | 用途 |
|---|---|---|
| `POST /api/v1/scan/detect` | `scan.functions.ts` | 写真から単語候補 |
| `POST /api/v1/scan/frame` | `scan.functions.ts` | ライブカメラの1コマ判定 |
| `POST /api/v1/card/generate` | `ai.functions.ts` | 単語カードを作る |
| `POST /api/v1/card/section` | `ai.functions.ts` | 項目1つを作り直す |
| `POST /api/v1/cutout` | `cutout.functions.ts` | 背景の切り抜き（iOS では原則使わない・下記） |
| `POST /api/v1/tts` | `tts.functions.ts` | 読み上げ音声（署名付きURLを返す） |
| `POST /api/v1/geocode` | `geocode.functions.ts` | 座標 → 地名 |
| `POST /api/v1/images/search` | `images.functions.ts` | 単語に合う写真を探す |
| `GET /api/v1/encounter` | `encounters.functions.ts` | 出会う見込み |
| `POST /api/v1/review/grade` | `reviews.functions.ts` | スピーキングの採点 |
| `POST /api/v1/journal/correct` | `journal.functions.ts` | 日記の添削 |
| `GET /api/v1/word/:id/card` | `word-explanation.functions.ts` | **判断済みの**カード内容 |

⚠️ **最後の1本がいちばん大事です。** `/api/v1/word/:id/card` は
「どの節を出すか・どの札を出すか・どの型を残すか」を**サーバー側で決めた結果**を返します。
Swift は並べるだけ。これで試験1,562件が iPhone 版も守ります。

### 決まりごと

- 認証: `Authorization: Bearer <Supabase の access_token>`
- ⚠️ **画像は base64 で最大 8MB**（`src/lib/scan.functions.ts:23` の上限）。
  Swift 側は送る前に縮めること。Web 版は 1600px / 品質0.9 に落としてから送っている
  （`src/lib/cutout.ts` の `downscaleDataUrl`）
- AI の呼び出しは**数秒かかる**（streaming なし）。時間切れは長めに取る
- 1日の上限がある処理がある（`assertWithinDailyCap`）。無料/課金の線引きに直結

### どこで動かすか

まず **(a) いまの Lovable のホスティングをそのまま使う**（追加作業ゼロ）。
必要になったら **(b) 同じリポジトリを Cloudflare Workers にもデプロイ**。
いまのビルドは既に Cloudflare 向け（`.output/server/wrangler.json` が出る）ので、
共存できてどちらも壊れません。

⚠️ Workers に出すときの注意（調査で判明）:
`src/lib/scan.functions.ts:190,289` と `src/lib/ai.functions.ts:577` に
**応答を返したあとに走る処理**（辞書の自動蓄積・日次の自己改善）があり、
Workers では途中で切られます。`ctx.waitUntil` で包む必要があります。

---

## Swift 側の原則

### 1. 判断はサーバーに置く

| Swift に置いてよい | サーバーに残す |
|---|---|
| 触った感じ・アニメーション | どの節を出すか（`card-sections.ts`） |
| オフラインのときの見せ方 | どの札を出すか（`scene-bubbles.ts`） |
| 画面の遷移 | どの型を落とすか（`generic-chunks.ts` / `extras.ts`） |
| 端末の設定（テーマ・音量） | 級の出し方（`level-scale.ts` / `level-source.ts`） |
| カメラ・切り抜き・音声認識 | 復習の出題形式（`review-format.ts`） |
| | 採点（`speaking-grade.ts` / `srs.ts`） |

### 2. 「出せない物は、欄ごと出さない」

これはオーナーの明示的な指示（2026-08-27 ④）で、**アプリ全体の規則**です。

> 「解説、画像が表示されない時はまずその項目を表示しないで。
>  解説、画像が生成されて始めて項目を表示して。」

⚠️ **描く条件と数える条件を必ず一致させること。** このアプリは
ここを3回壊しています（片方だけ直して「見出しだけの空の節」が出る）。
サーバーが「出す節の一覧」を返す形にすれば、Swift 側でズレようがありません。

### 3. 押せる物は 44px

絵の検査（`npm run ui:audit`）が 44px 未満を落とします。
iOS の指針も同じ 44pt なので、そのまま持ち込めます。

### 4. 動きを止めたい人には止める

`prefers-reduced-motion` に相当するのは iOS の
`UIAccessibility.isReduceMotionEnabled`。**揺れ・跳ね・視差は止める。**
ただし**情報は1つも減らさない**（札は全部そこに在る、動かないだけ）。

---

## 端末側でネイティブに置き換えるもの

| いまの Web 版 | iPhone 版 | なぜ |
|---|---|---|
| `@imgly/background-removal`（WASM 93MB）＋ remove.bg（課金） | **Vision** `VNGenerateForegroundInstanceMaskRequest` | 端末内・無料・高速・オフライン。⚠️ **シミュレータでは動かない** |
| `SpeechRecognition` | **`SFSpeechRecognizer`** | ⚠️ Web 版の音声認識は **iOS の WebView に存在しない**。いま iPhone では必ず失敗して手入力に落ちている |
| `getUserMedia` + canvas | **`AVFoundation`** | ズーム・露出が WKWebView では効かなかった |
| `navigator.vibrate` | **`UIImpactFeedbackGenerator`** | iOS は `vibrate` 非対応。いま無反応 |
| `new Audio()` + `speechSynthesis` | **`AVAudioPlayer`** + `AVSpeechSynthesizer` | 音の重なりを OS 側で管理できる |
| `localStorage` / IndexedDB | **`UserDefaults`** / ファイル or SwiftData | 端末の設定とオフラインの控え |

詳細は `22-native-gaps.md`。

---

## 確認項目

- [ ] iPhone でログインし、`supabase-swift` のトークンで `/api/v1/*` が通る
- [ ] **Web 版で撮った写真311枚が iPhone にも出る**（同じ DB を見ている証拠）
- [ ] **iPhone で撮った写真が Web 版にも出る**
- [ ] 電波を切ってアプリを開く → 8秒以内に理由が出る（無言のスピナーにならない）
- [ ] 8MB を超える写真を送ろうとしても落ちない（先に縮める）
