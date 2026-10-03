# 写真の候補の精度を測る（candidate benchmark）

ROADMAP.md Phase 3.1 / 3.2、QA.md › AI quality benchmark の道具（2026-10-03）。
モデルや指示文を替える**前と後に同じ写真の組を流して**、Top-1 / Top-3 と待ち時間を比べる。

実地の数（ベータの人が実際に何番目を選んだか・母語で調べ直したか）は `/admin/beta` の
「候補の当たり方」に出る（`candidate_pick` の記録、`src/lib/beta-metrics.ts`）。
こちらは**決まった写真の組**で、モデルの違いだけを比べるための物。

## 写真の置き方（オーナーが用意する）

```
benchmarks/candidates/
  zh-TW/
    umbrella.jpg
    bubble-tea.jpg
    labels.json
  en/
    umbrella.jpg
    labels.json
```

`labels.json` は「写真の名前 → 正解の見出し」。先頭がいちばん欲しい語で、残りも正解として数える
（同じ物の言い方の揺れ）。短く配列だけでもよい。

```json
{
  "umbrella.jpg": { "accept": ["雨傘", "傘"], "note": "折りたたみ傘を手に持った写真" },
  "bubble-tea.jpg": ["珍珠奶茶", "波霸奶茶"]
}
```

- 言語ごとに 30〜50 枚が目安。食べ物・身の回りの物・店先・看板・乗り物・体の部位を混ぜ、
  物が1つの写真と、複数写っている写真の両方を入れる。
- 写真の長い辺は 1024px 以下（アプリが AI に送るのは 768px）。jpg / png / webp。
- 人の顔・住所・個人の書類が写る写真は入れない（リポジトリに残る）。
- 正解の無い写真・写真の無い正解は、走らせた時に名前を出す（数には入れない）。

## 走らせ方

```sh
node scripts/candidate-benchmark.mjs                  # 写真が無ければ、何を置けばよいかを出して終わる
node scripts/candidate-benchmark.mjs --lang zh-TW     # 1つの言語だけ
node scripts/candidate-benchmark.mjs --json out.json  # 結果を JSON にも書く（比べる時に残す）
node scripts/candidate-benchmark.mjs --check          # AI を呼ばずに、サーバの関数が読めるかだけ
```

AI の鍵は**サーバと同じ環境変数**（`GEMINI_API_KEY` など。`docs/ai-keys-guide.md`）。
1枚 = 候補の AI 1回ぶんの費用がかかる。

## 何を通しているか

**本物のサーバの関数** `suggestWords`（`src/lib/ai.functions.ts`）をそのまま呼ぶ — 同じ指示文、
同じ「学習言語の語だけ残す」、同じ並べ直し（ふだんの呼び方を上へ）、同じ台湾の読みの検め。
TanStack Start の組み立ての外で読むため、次の2つだけを差し替える:

| 差し替える物                           | 代わり                                                                           | 理由                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `@tanstack/react-start`（通信の入口）  | `scripts/ui-harness/stubs/react-start.ts`                                        | 組み立て無しでは解けない。handler をそのまま呼ぶ                |
| Supabase（`client` / `client.server`） | `scripts/candidate-benchmark/fake-supabase.ts`（どの問い合わせにも「行は無い」） | 本番の DB に触らない（1日の上限を減らさない・人の行を読まない） |

そのため:

- 学習者の級は**既定**（入門〜基礎の細かさ）で測る。
- 管理画面のモデルの上書き（`app_config`）は読まない。**環境変数で決まるモデル**で測る。
  別のモデルを測る時は環境変数を替えて流す。

## 数え方

- **Top-1** = AI の返した並び（アプリの画面と同じ順）の1番目が正解だった割合。
- **Top-3** = 3番目までに正解があった割合。
- 失敗した回（時間切れ・形が合わない）も分母に入れ、待ち時間にも入れる（利用者はその間待っていた）。
- 待ち時間は p50 / p90 / p99（最も近い順位の方式、`beta-metrics.ts` の `percentile` と同じ）。
  写真を読んでから AI の返事が整うまで。アプリの「撮影 → 候補が並ぶ」には写真を縮める時間と
  通信の往復が足されるので、実地の数（`/admin/beta`）の方が長くなる。
