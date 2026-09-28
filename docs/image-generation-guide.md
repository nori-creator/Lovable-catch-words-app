# 文字で探した単語のAI画像 — 初期設定

最終確認: 2026-09-28

## まず結論

文字で単語を探すと、単語の詳細と復習に使う画像を1枚生成して保存します。ホームのアルバムにはその画像を載せません。ホームに写真を残したいときは、実際に撮影してください。

現在の既定は **Lovable AI / `openai/gpt-image-1-mini`** です。ただし実際に動くにはサーバに `LOVABLE_API_KEY` が必要です。管理者の設定 →「文字検索のAI画像」を開くと、**今サーバで選ばれている提供元・モデルとキーの有無**が分かります。管理者が以前切り替えていればその設定が優先です。

## 一番簡単な設定

1. Lovable のプロジェクトで **Cloud → Secrets** を開く。
2. 使いたいサービスで発行した API キーを、下表の名前で追加する。キーをアプリの画面には入力しない。
3. アプリを管理者アカウントで開き、**設定 → 開発者用 → 文字検索のAI画像**でそのサービスを選んで保存する。モデル名はそのままでよい。
4. 文字で単語を検索して保存し、**単語の詳細・復習に画像があり、ホームには文字だけ**なのを確かめる。

| 選ぶサービス | Lovable Secrets に追加する名前 | 初期モデル | 請求元 |
|---|---|---|---|
| Lovable AI（既定） | `LOVABLE_API_KEY`（Lovable Cloud が提供する場合は追加不要） | `openai/gpt-image-1-mini` | Lovable の AI 利用枠 |
| OpenRouter | `OPENROUTER_API_KEY` | `bytedance-seed/seedream-5-0-pro` | OpenRouter |
| Google AI Studio | `GEMINI_API_KEY` | `gemini-2.5-flash-image` | Google |
| OpenAI API | `OPENAI_API_KEY` | `gpt-image-1-mini` | OpenAI API |

**おすすめの最初の選択:** すでに Lovable AI が動いていれば何もしなくてよい。Lovable の画像生成枠とは別に画像費用を管理したいなら、ひとつだけ外部サービスを選んで、そのキーだけ追加する。OpenRouter/Google/OpenAIのキーを全部用意する必要はない。

## クレジットの区別

- **Lovable のクレジット**: 現在はアプリの編集、Cloud（ホスティング・バックエンド）、内蔵AIが同じクレジット残高で計上されます。使い道ごとの明細は Lovable の利用画面で確認します。Lovable AI を選ぶと画像生成も内蔵AI利用に計上されます。
- **外部のAPIキーを使う場合**: 生成リクエストはそのサービスに送られ、そのサービスの利用料金が発生します。Lovable Cloud にアプリを置くなら Cloud の利用は引き続き Lovable のクレジットに計上されます。キーを Secrets に**保存するだけ**で Lovable 内蔵AIの画像利用料金が発生するわけではありません。

「OpenAI の ChatGPT 契約」と「OpenAI API」は別です。OpenAI API に直接切り替える場合は API キーと API 側の課金設定を確認してください。画像生成は検索・保存ごとに費用がかかるので、各サービスで利用上限や残高を設定してください。

## 画像が出ないとき

1. 設定の「文字検索のAI画像」で選択先のキーが「あります」になっているか確認。
2. 提供元でモデルの利用権限・残高・APIキーの有効性を確認。
3. 管理者設定のモデル名を元の値に戻す。モデル ID は提供元によって違う。通常の「AIモデル切替」（スキャン・カード・添削）とは別の設定です。
4. 画像生成が失敗しても単語は保存できます。管理者設定を直してから新しく文字検索して確かめてください。

APIキーはサーバだけが読む Secrets に置き、アプリの公開環境変数・画面・`app_config` には入れません。管理者画面には鍵の有無だけを表示します。

参考: https://docs.lovable.dev/features/cloud / https://docs.lovable.dev/features/ai / https://ai.google.dev/gemini-api/docs/generate-content/image-generation / https://platform.openai.com/docs/guides/image-generation / https://openrouter.ai/docs/guides/overview/multimodal/image-generation
