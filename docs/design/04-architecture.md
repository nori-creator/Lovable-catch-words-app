# 04. 技術アーキテクチャ

## 1. いま何がどこで動いているか(現状の図解)

Lovable が「勝手にやっている」ことの正体は以下のとおり。**すべてこのリポジトリのコードと Supabase 上にあり、ブラックボックスはAIゲートウェイだけ**。

```
[スマホのブラウザ]
   │  React 19 + TanStack Start(このリポジトリの src/)
   │  ・切り抜きは端末内で実行(@imgly/background-removal)= サーバ費用ゼロ
   │  ・地図は Google Maps(キーは .env の VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_*)
   ▼ createServerFn(src/lib/*.functions.ts)= サーバ側で動く関数
[アプリサーバ(Lovableがホスティング / ローカルでは vite dev)]
   │
   ├── Supabase(あなた専用のプロジェクト)
   │     ・Auth: ログイン
   │     ・Postgres: words / stickers / reviews / posts / journal_entries …
   │       (RLS = 行レベルの権限制御で「自分の行しか読めない」を実現)
   │     ・Storage: stickers バケット(撮影画像・切り抜き・自撮り)
   │     ・スキーマ変更の履歴は supabase/migrations/*.sql に全部残っている
   │
   └── Lovable AI Gateway(https://ai.gateway.lovable.dev)
         ・唯一の Lovable 依存。LOVABLE_API_KEY で認証
         ・中身は OpenAI互換API のプロキシで、現在
           google/gemini-3-flash-preview(画像解析・カード生成・添削)と
           openai/gpt-4o-mini-tts(音声合成)に転送しているだけ
```

つまり「Lovable に縛られている」度合いは実際には低い。**依存は (a) ホスティング (b) AIゲートウェイ (c) 開発UI の3つ**で、(a)(b) は差し替え可能、(c) は Claude Code で代替できる。

## 2. Claude Code でこのまま開発を進める手順

リポジトリはローカル(またはClaude Codeのクラウド環境)でそのまま動く構成になっている。

```bash
# 1. 依存インストール(bun.lock があるので bun を使う)
bun install

# 2. 環境変数(.env はリポジトリ直下に既にある)
#    SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY などは設定済み。
#    AI機能を動かすには LOVABLE_API_KEY(または §3 の代替キー)を追記する。

# 3. 開発サーバ
bun run dev   # → vite dev

# 4. Lint / フォーマット
bun run lint
bun run format
```

運用ルール(Lovable と Claude Code の併用時):
1. **DB変更は必ず `supabase/migrations/` にSQLファイルとして残す**(Lovable も Claude Code も同じ履歴を見る)。Supabase MCP や dashboard で直接いじった場合も、同じSQLをマイグレーションとして追加する
2. コミットは main に直接せず、ブランチ→PR→マージ(Lovable 側は published ブランチの履歴書き換えに弱い。`AGENTS.md` の注意書きどおり force push 禁止)
3. Lovable の編集とローカル編集を同時にしない(コンフリクトの元)。「今日はどちらで作業するか」を決めてから触る
4. 型は `src/integrations/supabase/types.ts` が正。スキーマ変更後は Supabase の型生成で更新する

## 3. AIプロバイダ抽象化(Lovable 依存の解消)

現状の `src/lib/ai-gateway.server.ts` は `createOpenAICompatible` の薄いラッパー(12行)なので、差し替えは簡単。

仕様: `createAiProvider()` に一般化し、環境変数で切替える

```ts
// 置き換え後のイメージ(src/lib/ai-provider.server.ts)
// AI_PROVIDER=lovable | openai-compatible | google | anthropic
// AI_BASE_URL / AI_API_KEY / AI_MODEL_FAST / AI_MODEL_RICH / AI_MODEL_TTS
export function createAiProvider() {
  switch (process.env.AI_PROVIDER ?? "lovable") {
    case "lovable":  // 現状維持(後方互換)
    case "openai-compatible": // Gemini APIのOpenAI互換エンドポイント等
    case "anthropic": // @ai-sdk/anthropic を追加して差し替え
  }
}
```

設計ポイント:
- 呼び出し側(`ai.functions.ts` / `reviews.functions.ts` / `journal.functions.ts` / `quests.functions.ts` / `tts.functions.ts`)は全て Vercel AI SDK の `generateText` + `Output.object` を使っているので、**プロバイダ差し替えでコードはほぼ変わらない**。ハードコードされた `const MODEL = "google/gemini-3-flash-preview"`(4ファイルに重複)を env 参照の1箇所に集約するのが実作業のほぼ全て
- 例外は `suggestWords`(`ai.functions.ts:114`)と TTS が fetch 直叩きなこと。これも同じ抽象に寄せる
- モデルは役割で分ける: `AI_MODEL_FAST`(速報パス・誤答生成: 小型で安いもの)/ `AI_MODEL_RICH`(詳細カード・添削: 品質重視)/ `AI_MODEL_TTS`。用途別に env で差し替えて比較できる状態にしておき、コストと品質は実測で決める(`ai_runs` / `usage_events` に記録して比較)
- **キーの置き場所に注意**: AIキーはサーバ側 env のみ。`VITE_` プレフィックスを付けるとブラウザに露出するので絶対に付けない

ホスティングの代替(Lovable をやめる場合): TanStack Start は Node サーバとしてビルドされるので、Vercel / Fly.io / Railway 等にデプロイ可能。Supabase はそのまま(何も移行しなくてよい)。ドメインだけ張り替えれば移行完了、というのがこの構成の強み。

## 4. ストア公開までの道: PWA → Capacitor

React Native 等での書き直しは不要。**同じコードベースのまま**2段階で進める。

### Phase A: PWA(先にやる。ストア審査なしで「アプリ体験」になる)

1. `manifest.webmanifest`(名前・アイコン・`display: standalone`・テーマ色)
2. Service Worker: 静的アセットのキャッシュ+オフライン撮影キュー([03 §6](./03-overlooked.md))
3. Web Push: SRS due 通知・ストリーク保護通知・友達アクティビティ
   - `push_subscriptions` テーブル(§6)+ 通知送信は Supabase Edge Function を cron 起動(毎朝「今日の復習n件」)
   - 制約: iOS は 16.4 以降かつ**ホーム画面に追加された PWA のみ** Web Push 可。だからこそ「ホーム画面に追加」導線をオンボーディングに組み込む
4. 共有ターゲット(Web Share Target): カメラロールから写真を Catchwords に共有→captureフローへ

### Phase B: Capacitor ラップ(App Store / Google Play)

- Capacitor は既存の web ビルドをネイティブアプリの殻に入れる技術。UIコードは共通のまま、必要な所だけネイティブプラグインに差し替える:
  - カメラ(起動が速い・画質制御)/ プッシュ通知(APNs/FCM、iOSのバージョン制約が消える)/ ジオフェンス([02 §7](./02-core-experience.md) Phase 3)/ アプリ内課金(RevenueCat)
- 審査要件([03 §3](./03-overlooked.md)): 通報・ブロック・アカウント削除・規約表示を先に済ませておく
- ストア課金手数料(15–30%)を踏まえ、Web(Stripe)とストア課金の併存方針は [05 §3](./05-roadmap-and-business.md)

## 5. 多言語対応の設計

「対応言語を増やす」= 3つの独立した軸に分解して、順にやる:

| 軸 | 内容 | 現状 |
|---|---|---|
| A. 学習対象言語 | zh-TW 以外の単語カード | `words.language` 列あり。プロンプトが zh-TW 特化の分岐(`ai.functions.ts:94` ほか)なのでテンプレート化が必要 |
| B. 母語(解説言語) | meaning_ja / feedback_ja を他言語に | カラム名から ja 固定。`meaning`(jsonb: `{ja: "...", en: "..."}`)化 or ユーザー母語列の追加が必要 |
| C. UI言語 | ボタン・ラベル | 日本語ハードコード。i18n ライブラリ導入 |

推奨順序: **A(英語・簡体字を追加)→ C → B**。初期ターゲット(日本人)を守ったまま市場を広げられるのがA。

言語固有の設計を一般化するポイント:
- 読み表記: zhuyin/pinyin は中国語専用 → `readings jsonb`(`{"zhuyin": "...", "pinyin": "..."}` / 英語なら `{"ipa": "..."}` / 韓国語なら不要)に一般化
- レベル体系: TOCFL / HSK / CEFR / JLPT を `vocab_lists.level_system` で持つ
- プロンプト: `prompts/{language}.ts` にテンプレートを分離し、「その言語の学習で重要な項目」(中国語=語源・部首、英語=句動詞・発音記号)を言語ごとに定義
- TTS voice / STT locale のマッピング表を言語設定に持たせる

## 6. データモデル変更案(SQLスケッチ)

実装時は個別マイグレーションに分割する。ここでは設計意図のみ。

```sql
-- (1) 個人カスタマイズの分離(words を読み取り専用マスターに)[03 §1]
CREATE TABLE public.user_word_overrides (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id uuid REFERENCES public.words(id) ON DELETE CASCADE,
  extras_patch jsonb NOT NULL DEFAULT '{}',   -- 項目単位の上書き
  card_layout jsonb,                          -- 項目の並び/表示非表示
  PRIMARY KEY (user_id, word_id)
);
-- words への UPDATE 権限を authenticated から剥がすマイグレーションを同時に。

-- (2) 4択誤答の事前生成キャッシュ [02 §3.3]
CREATE TABLE public.review_choices (
  word_id uuid REFERENCES public.words(id) ON DELETE CASCADE,
  difficulty smallint NOT NULL DEFAULT 2,     -- 1=easy 2=normal 3=hard
  distractors text[] NOT NULL,                -- 3件以上のプール
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (word_id, difficulty)
);

-- (3) 再遭遇 [02 §4]
CREATE TABLE public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES public.stickers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path text,                            -- 再遭遇時の写真(任意)
  lat double precision, lng double precision, location_name text,
  recalled boolean,                           -- 思い出しクイズの結果
  created_at timestamptz NOT NULL DEFAULT now()
);
-- stickers には encounter_count int を非正規化して図鑑ソートに使う。

-- (4) TTSキャッシュ [02 §3.2]
ALTER TABLE public.words ADD COLUMN audio_path text;            -- headword音声
ALTER TABLE public.words ADD COLUMN example_audio_path text;    -- 例文音声

-- (5) ゲーム経済の一本化 [02 §9]
CREATE TABLE public.xp_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,                         -- capture / reencounter / review / quest / journal / pronounce
  amount int NOT NULL,
  ref_id uuid,                                -- 対象(sticker等)
  created_at timestamptz NOT NULL DEFAULT now()
);
-- profiles に streak_count int, streak_frozen_used int, last_active_date date。

-- (6) 使用量と無料枠 [03 §5, 05 §3]
CREATE TABLE public.usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,                         -- suggest / card / tts / correction ...
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',          -- free / pro
  valid_until timestamptz,
  source text                                 -- stripe / app_store / play / promo
);

-- (7) 通知 [04 §4]
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- (8) 語彙表(頻度・級の真実源)[03 §4]
CREATE TABLE public.vocab_lists (
  language text NOT NULL,
  level_system text NOT NULL,                 -- TOCFL / HSK / CEFR
  level text NOT NULL,
  headword text NOT NULL,
  rank int,
  category_key text REFERENCES public.categories(key),
  PRIMARY KEY (language, level_system, headword)
);
```

すべての新テーブルに RLS(自分の行のみ。review_choices / vocab_lists は全員SELECT可・書き込みはサーバのみ)を必ず付ける。

## 7. 品質基盤(最小限でいいので早めに)

- **テスト**: まず純関数から。`nextSrs`(SM-2、`reviews.functions.ts:198`)、保持率モデル、誤答プール選定、無料枠判定 — この4つは金と学習効果に直結するのでユニットテスト必須。vitest を dev dependency に追加するだけで始められる
- **CI**: GitHub Actions で `bun run lint` + `vitest` + `bun run build` をPRごとに実行
- **計測**: PostHog 等を入れ、[05 §5](./05-roadmap-and-business.md) のイベント設計に従って最初から仕込む(後から入れると過去が見えない)
- **エラー監視**: 既存の `error-capture.ts` は Lovable 向け。Sentry 等への差し替えを Lovable 脱却時に
