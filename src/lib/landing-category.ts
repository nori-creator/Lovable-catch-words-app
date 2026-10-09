import { DEX_OTHER_KEY, dexCategoryKey, dexCategoryOf } from "./dex-catalog";
import { isBuiltinCategory } from "./user-category";
import { wordCategoryKey } from "./category";

/**
 * **着地の受け口にするカテゴリーの鍵**（`landing-target.ts` の3番目、`[data-dex-cat]`）。
 *
 * 図鑑の写真の升目の節は**20のカテゴリーの代表の鍵**（`dexCategoryKey`）で印を付けている
 * （`dex-book.ts` の `dexSections`）。語の分類の鍵（54）をそのまま渡すと、代表の鍵と違う
 * 語（例: `cat` は「動物」の節 `animal`）では見出しが見つからず、タブへ降りていた。
 *
 * - その人だけの新しい棚（既定の54に無い鍵）は、節の鍵そのものなので**そのまま**。
 *   既定の鍵の提案は保存側で捨てられる（`normalizeShelfProposal`）ので、見ない。
 * - それ以外は図鑑と同じ決め方（表に在る見出し語ならその物のカテゴリー、無ければ分類の鍵）
 *   で20のカテゴリーを出し、その代表の鍵にする。
 */
export function landingCategoryKey(opts: {
  headword: string | null | undefined;
  categoryKey: string | null | undefined;
  newShelfKey?: string | null;
  lang: string | null | undefined;
}): string | null {
  const shelf = (opts.newShelfKey ?? "").trim();
  if (shelf && !isBuiltinCategory(shelf)) return shelf;
  // 既定の鍵の「新しい棚」は保存側が捨てる（`normalizeShelfProposal`）ので、語の分類で決める。
  if (!opts.categoryKey && !opts.headword) return null;
  // 分類の鍵は図鑑と同じく見出し語で直してから（`dexPlaceOf` — 蘑菇が other のままだと
  // 図鑑は「植物・花」に置くのに、着地は「その他」へ向かう）。
  const key = wordCategoryKey({ headword: opts.headword, category_key: opts.categoryKey });
  const no = dexCategoryOf(opts.headword, key, opts.lang);
  // どの20にも入らない語は図鑑の「その他」の節（`dexPlaceOf` と同じ決め方）。
  return no == null ? DEX_OTHER_KEY : dexCategoryKey(no);
}
