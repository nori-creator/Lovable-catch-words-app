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

/**
 * **写真に写った物ごとに束ねる**（オーナー指示 2026-09-27「写真に映る候補
 * それぞれ別々の名詞を第一画面に一覧。名詞をタップしたら2段階目として、
 * 最も自然な普段の言い方を一番大きく、下に専門的な言い方や固有名詞。
 * 他の言い方が無い場合は2段階目を表示しない」）。
 *
 * AI は物ごとに `group` の番号を振る（同じ物の別の呼び方は同じ番号）。
 * 束の中は `orderByRegister` の順 — 先頭がふだんの呼び方（1段目に出す語）、
 * 残りが2段目の「ほかの言い方」。束の並びは AI の順（確からしさ）のまま。
 *
 * **番号が無い候補は1つで1束**（打ち込んだ語の候補や、古い返事）。
 * そのときは今までどおりの1列になり、2段目は出ない。
 */
export type CandidateGroup<T> = { main: T; others: T[] };

export function groupCandidates<T extends { register?: Register | null; group?: number | null }>(
  items: readonly T[],
): CandidateGroup<T>[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  items.forEach((it, i) => {
    const key = typeof it.group === "number" ? `g${it.group}` : `solo${i}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(it);
  });
  return order.map((k) => {
    const [main, ...others] = orderByRegister(buckets.get(k)!);
    return { main, others };
  });
}
