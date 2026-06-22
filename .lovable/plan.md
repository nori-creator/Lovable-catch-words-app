# 言語学習SNSアプリ — フェーズ1 実装計画

## ゴール

「街で見つけたモノを撮る → AIが切り抜き → 単語カードになる → 図鑑に並ぶ」を**1人で完結する体験**としてWeb/PWAで成立させる。SRS・ソーシャル・AI日記・マップリマインダー・課金はフェーズ2以降。ただしGoogle Mapsだけは「撮影場所」の保存と地図表示に使うため**MVPに含める**。

## 技術スタック

- フロント: TanStack Start + React 19 + Tailwind v4（既存テンプレート）
- バックエンド: Lovable Cloud（Supabase: 認証・PostgreSQL・Storage）
- AI: Lovable AI Gateway
  - 画像理解＋単語提案: `google/gemini-3-flash-preview`（画像→単語5候補＋カード）
  - 切り抜き: 画像セグメンテーションはMVPでは**クライアント側の `@imgly/background-removal`**（ブラウザWASM、無料・オフライン可）。Gemini側にはマスクAPIがないため。手動修正UIも提供。
  - 例文・難易度・4択ダミー: Geminiで生成
  - 音声(zh-TW): 後段で Google Cloud TTS の `cmn-TW` 話者に接続する想定。フェーズ1は再生UIだけ作る（音声ファイル未生成でもOK）。
- 地図: Google Maps connector（ブラウザキー + ゲートウェイ経由のGeocoding）
- 将来ネイティブ移植: ロジックを `src/lib/*` に集約、画像処理・カメラはWeb APIで抽象化

## 画面構成（フェーズ1）

```text
/auth                ログイン / サインアップ（メール+Google）
/                    ホーム（今日のアルバム + クイックアクション: 撮る）
/capture             撮影フロー（対象物 → 自撮り → AI処理 → 単語選択 → カード確認 → 保存）
/dex                 図鑑キャンバス（ジャンル別バスケット + 未取得シルエット）
/dex/$stickerId      ステッカー詳細（表: 切り抜き / 裏: 自撮り+カード）
/map                 撮影マップ（取得場所をピンで表示）
/settings            プロフィール（表示名・アバター・母語・表示言語・学習言語・目標レベル）
```

`_authenticated/` 配下に `/`, `/capture`, `/dex`, `/dex/$stickerId`, `/map`, `/settings` を配置。

## データモデル（Supabase）

```text
profiles
  id (uuid, FK auth.users), display_name, avatar_url,
  native_language, ui_language, target_language ('zh-TW'…),
  level_goal ('TOCFL-2'…), pronunciation_strictness ('easy'|'normal'|'strict'),
  created_at

words                          辞書マスタ（同言語の語彙シード+ユーザー獲得語）
  id, language ('zh-TW'), headword (例: '蘋果'), reading_zhuyin,
  pinyin, ipa, meaning_ja, part_of_speech, level (TOCFL等),
  category ('fruit'|'vehicle'|...), example_sentence,
  example_translation, source ('seed'|'ai'), created_at

stickers                       ユーザーがキャッチしたカード
  id, user_id, word_id, language,
  object_image_url, cutout_image_url, selfie_image_url,
  caption (一言感想, 任意), location_name, lat, lng,
  taken_at, created_at

categories                     ジャンル（自動追加）
  id, key, label_ja, icon_emoji
```

RLS: 全テーブルでユーザー自身のデータのみ参照可。`words` は `source='seed'` または自分が獲得したものを読み取り可。`GRANT`を migration に同梱。

## コアフロー詳細

### 1. 撮影（/capture）

1. ステップ1「対象物」: `<input type="file" accept="image/*" capture="environment">` ＋ ファイルアップロード両対応。プレビュー表示。
2. ステップ2「自撮り」: `capture="user"`。スキップ可（あとで追加できる）。
3. ステップ3「AI処理（待機UX）」並列で:
   - 切り抜き: `@imgly/background-removal` をブラウザで実行（PNG透過出力）
   - 単語提案: 元画像をbase64でserver fn `suggestWords` に送る → Geminiに「画像から学習対象として有用な単語を5つ。台湾華語、注音つき」と依頼 → JSON配列で受け取る
   - 待機中はCapWords風のシマー＋単語が次々浮かぶマイクロアニメーション
4. ステップ4「単語選択」: 提案5つ + 「他の単語を入力」。手動入力時はその単語で `regenerateCard` を再実行。
5. ステップ5「カード確認」: 表（切り抜き）/ 裏（自撮り＋意味・注音・例文）をフリップで確認。
6. ステップ6「位置情報」: `navigator.geolocation` → Google Maps Geocoding（ゲートウェイ経由）で `location_name` 取得。失敗時はnull。
7. 「図鑑に追加」: Storage に object/cutout/selfie 3画像をアップロード → `stickers` と必要なら `words` を挿入。

### 2. 図鑑キャンバス（/dex）

- ジャンル別バスケットレイアウト（果物・乗り物・食べ物…）。CSSで「白い紙＋影＋ステッカー散らし」を表現。
- 未取得シルエット: seed済 `words` のうち、自分が `stickers` に持っていないものを薄いグレーシルエット＋語形だけで表示。シルエット画像は seed投入時に用意（フェーズ1は絵文字代用OK、後で画像差し替え）。
- 進捗バー: 目標レベルの単語に対する獲得率を「12 / 80」と横バーで表示。
- ステッカータップで `/dex/$stickerId` → カードフリップ。

### 3. マップ（/map）

- Google Maps JavaScript APIを `loading=async&callback=initMap` で読み込み。
- 取得済 `stickers` を `google.maps.Marker` で表示（AdvancedMarkerはmapId不要のため不使用）。
- ピンタップで該当カードへ。
- フェーズ1では「近づくと通知」はやらない（通知許可フローは別フェーズ）。

### 4. 認証・プロフィール

- Lovable Cloud 有効化 → Email/Password + Google サインイン。
- 初回ログイン後オンボーディング: 表示名・母語・学習言語（既定: zh-TW）・目標レベル（既定: TOCFL Level 2）・発音判定厳しさ（既定: normal）を選択 → `profiles` に保存。
- サインアップトリガで `profiles` 自動作成。

## サーバー関数（`src/lib/*.functions.ts`）

| 関数 | 入力 | 出力 | 説明 |
|---|---|---|---|
| `suggestWords` | image (base64), target_language | `{word, reading_zhuyin, pinyin, meaning_ja, category}[5]` | Gemini に画像＋指示プロンプト |
| `generateCard` | word, target_language | `{example, example_translation, level, category}` | カード詳細生成 |
| `geocodeLocation` | lat, lng | `{location_name}` | Google Maps Geocoding（ゲートウェイ） |
| `saveSticker` | 画像URL3つ + word + location | sticker | DBに保存 |

## シードデータ

`zh-TW` の TOCFL Level 1–2 から 80語ほどを `words` に投入（migration内）。category付き。フェーズ1完成時の「図鑑シルエット」表示に必要。

## 範囲外（フェーズ2以降）

- SRS（ぼやけ・発音・4択）/ ネイティブ音声生成
- AI日記 / フィード / タグ付け / いいね / ストーリーズ / ランキング
- デイリークエスト / 課金 / 店舗コラボ
- マップ近接通知 / プッシュ通知
- オフライン撮影キュー / ネイティブアプリ化（Capacitor）

## 受け入れ条件（フェーズ1完了の定義）

1. メール or Google でサインアップ → オンボーディング → ホーム到達
2. `/capture` で写真2枚 → AI切り抜き＋単語5候補表示 → 1つ選ぶ → カード完成 → 図鑑に追加
3. `/dex` に獲得ステッカーがジャンル別に並び、未獲得語はシルエット表示
4. `/map` に撮影地のピンが表示される
5. `/settings` でプロフィール・学習設定が変更できる

## 提案（任意で採否を聞きたい）

- **カテゴリ自動追加**: AIにcategoryを自由入力させると爆発するので、固定の20カテゴリ + `other` から選ばせる形を推奨。
- **シルエット画像生成**: seed語の絵柄を画像生成しておくとPokédex感が一気に出る。フェーズ1終盤で `imagegen` で一括生成するのもアリ。
- **「気持ちいい取得演出」**: ステッカー保存時にカードがホームに吸い込まれる演出（GSAP不要、CSS transformで実現可能）。

---

承認いただければ Lovable Cloud 有効化 → Google Maps connector 接続依頼 → DB スキーマ＋シード → 認証＋オンボ → 撮影フロー → 図鑑 → マップの順で実装します。
