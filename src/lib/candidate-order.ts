/**
 * **候補の並び**（オーナー指示 2026-09-27「ネイティブが一般的によく使う呼び方を
 * 上に。正確な名前や固有名詞は下に、ただし消さない」）。
 *
 * AI の返す順は「確からしい順」だが、同じ物の呼び方が複数あるときに
 * 正確な名前（文旦）や固有名詞（女王頭）を上に置くことがある。AI には
 * 呼び方ごとに `register` を付けさせ、ここで**ふだんの呼び方 → 正確な名前 →
 * 固有名詞**の順に並べ直す。同じ段の中は AI の順（確からしさ）を保つ。
 */
export type Register = "common" | "specific" | "proper";

const RANK: Record<Register, number> = { common: 0, specific: 1, proper: 2 };

export function orderByRegister<T extends { register?: Register | null }>(
  items: readonly T[],
): T[] {
  return items
    .map((it, i) => ({ it, i, r: RANK[it.register ?? "common"] ?? 0 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.it);
}
