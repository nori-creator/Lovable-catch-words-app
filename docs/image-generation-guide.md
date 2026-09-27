# 文字検索の画像を AI で作る — 切り替えの手順（初心者向け）

最終確認: 2026-09-27

## 何ができるか

文字で単語を探したとき、単語の絵として次のどれかを出します。

- **写真**: Unsplash（鍵があるとき）→ Wikimedia Commons（鍵なし）
- **AI が作った絵**: 下の設定で「どこで作るか」を切り替えられる

## 言葉の説明

| 言葉 | 意味 |
|---|---|
| 秘密（Secret） | アプリのサーバだけが読める設定の値。鍵や切り替えをここに書く |
| OpenRouter | いろいろな会社の AI を1つの鍵で使える窓口 |
| Seedream | ByteDance の画像生成 AI。OpenRouter から使える |
| 型番（モデル ID） | AI の名前。例 `bytedance-seed/seedream-5-0-pro` |

## 設定する値（Lovable Cloud → Secrets に追加）

| 名前 | 入れる値 | 何が変わるか |
|---|---|---|
| `IMAGE_PROVIDER` | `lovable`（何も入れないときと同じ）/ `openrouter` / `off` | AI の絵をどこで作るか。`off` で作らない |
| `IMAGE_MODEL` | 例 `bytedance-seed/seedream-5-0-pro` | `openrouter` のときに使う AI。空なら左の例が使われる |
| `IMAGE_SEARCH_MODE` | `photo-first`（既定）/ `ai-first` | 写真を先に出すか、AI の絵を先に出すか |

`openrouter` を使うには、OpenRouter の鍵 `OPENROUTER_API_KEY` が Secrets に入っている必要があります（開発者の AI 切り替えで既に使っているものと同じ）。

## 手順（OpenRouter の Seedream に切り替える例）

1. OpenRouter にログインし、残高（クレジット）があることを確認する。
2. OpenRouter のモデル一覧で、使いたい画像モデルの**型番**と**1枚あたりの値段**を確認する。
   - 画像モデルの一覧: https://openrouter.ai/collections/image-models
   - 使い方の公式説明: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
3. Lovable のプロジェクト → Cloud → Secrets を開く。
4. `IMAGE_PROVIDER` を `openrouter` にする。
5. `IMAGE_MODEL` に手順2の型番を入れる（例 `bytedance-seed/seedream-5-0-pro`）。
6. AI の絵を先に出したいときは `IMAGE_SEARCH_MODE` を `ai-first` にする。
7. アプリで文字検索を1回して、絵が出るか確かめる。出ないときは `IMAGE_PROVIDER` を消せば元に戻ります。

## 仕組み（開発者向けの補足）

- 設定の読み方: `src/lib/image-provider.ts`（テストあり）
- 作る所: `src/lib/images.functions.ts` の `generateOneAiImage`
- Seedream のような画像専用モデルは OpenRouter の `/api/v1/images` で受け付けます。そこで断られた型は `/api/v1/chat/completions`（`modalities: ["image","text"]`）で頼み直します。

## 注意（リスク）

- **お金がかかります。** 検索1回ごとに1枚作るので、`ai-first` にすると検索の回数だけ費用が出ます。まず値段を確認してください。
- 作るのに数秒〜十数秒かかります。写真より遅いので、速さ優先なら `photo-first` のままを勧めます。
- 型番や値段は OpenRouter 側で変わります。この文書の例がいつまでも使えるとは限りません。
- 実際に AI を呼んで絵が出るかは、この環境（確認用ページ）では試せません。設定したら本番のアプリで1回確かめてください。
