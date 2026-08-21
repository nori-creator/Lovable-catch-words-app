/**
 * 「裏で、上から順に」埋める並びを決める。
 *
 * オーナー:
 * > 「ユーザーが**候補を選択した瞬間から裏で単語の詳細のすべての項目を
 * >  作り始めてる。項目の上から順に。** また単語の詳細の項目は
 * >  **未生成の場合はユーザーに項目自体を見せない**。生成されたら
 * >  項目を表示するようにする。」
 *
 * ## 何をここに置き、何を置かないか
 * 「どの節を、どの順で、いくつ作るか」だけを置く。実際に呼ぶのは画面側の
 * hook。ここが純粋なら、**上限や並びが壊れたことをテストで捕まえられる** —
 * 上限が効かないまま出ていくと、1枚のカードで1日の生成回数を使い切る。
 *
 * ## 1度に作る数に上限を置く理由
 * 節ごとに1回 AI を呼ぶので、11節あれば11回。生成の回数には1日の上限が
 * あり(いまは200)、1枚のカードで11回使うと18語で打ち止めになる。
 * ふつうは一括生成でほとんど埋まっているので、ここに来るのは
 * 取りこぼした数節だけ。**取りこぼしが異常に多い語で暴走させない**ための蓋。
 */
import type { RegenSection } from "./card-sections";

/** 1回カードを開いたときに、裏で作る節の数の上限。 */
export const MAX_AUTO_FILL = 6;

/** 続けて失敗したらやめる回数。 */
export const MAX_FAILURES = 2;

/**
 * 裏で作る節を、**画面に並ぶ順のまま**、上限まで返す。
 *
 * `attempted` はこの画面で既に試した節。**失敗した節も入れる** —
 * 入れないと、失敗 → 一覧が変わらない → もう一度試す、を繰り返す。
 */
export function nextAutoFillQueue(
  missing: readonly RegenSection[],
  attempted: ReadonlySet<string>,
  max: number = MAX_AUTO_FILL,
): RegenSection[] {
  const out: RegenSection[] = [];
  for (const id of missing) {
    // **上限は詰める前に見る。** 詰めてから見ると、上限0でも1つ通る
    // (テストで捕まえた)。
    if (out.length >= max) break;
    if (attempted.has(id)) continue;
    out.push(id);
  }
  return out;
}
