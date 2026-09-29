/**
 * **カテゴリーの側から、入れる単語を選ぶ**（オーナー指示 2026-09-28「図鑑のカテゴリーに
 * 入れる単語をユーザーが編集できるようにして。ある単語をあるカテゴリーに追加削除できる
 * ようにして」）。
 *
 * 1枚がどのカテゴリーに載るかは `stickers.shelf_key ?? 語の分類`（`stickerCategoryKey`）。
 * ここは「このカテゴリーに入れる／外す」の選び方を、1枚ごとの `shelf_key` の書き換えに
 * 直す計算だけ（通信しない）。
 *
 * - 入れる … `shelf_key` をそのカテゴリーにする
 * - 外す   … その人が移していただけなら `null`（語の分類へ戻す）。語の分類そのものが
 *            このカテゴリーなら、戻す先が無いので「その他」へ移す
 */
import { stickerCategoryKey } from "./user-category";

export type MemberItem = {
  id: string;
  shelf_key?: string | null;
  word: { category_key?: string | null };
};

export type MemberChange = { sticker_id: string; key: string | null };

/** 戻す先の無い物を外した時の置き場。 */
export const FALLBACK_CATEGORY = "other";

/** いまこのカテゴリーに載っている1枚の id。 */
export function membersOf(
  items: readonly MemberItem[],
  key: string,
  userKeys?: ReadonlySet<string>,
): Set<string> {
  return new Set(items.filter((it) => stickerCategoryKey(it, userKeys) === key).map((it) => it.id));
}

/** 外せるか（「その他」は外す先が無い）。 */
export function canRemoveFrom(key: string): boolean {
  return key !== FALLBACK_CATEGORY;
}

/**
 * 選び終えた集合 `selected` と今の状態の差を、書き換えの一覧にする。
 * 変わらない1枚は含めない（1枚も変わらなければ空）。
 */
export function membershipChanges(
  items: readonly MemberItem[],
  key: string,
  selected: ReadonlySet<string>,
  userKeys?: ReadonlySet<string>,
): MemberChange[] {
  const out: MemberChange[] = [];
  for (const it of items) {
    const now = stickerCategoryKey(it, userKeys) === key;
    const want = selected.has(it.id);
    if (now === want) continue;
    if (want) {
      out.push({ sticker_id: it.id, key });
      continue;
    }
    if (!canRemoveFrom(key)) continue;
    const base = stickerCategoryKey({ word: it.word });
    out.push({ sticker_id: it.id, key: base === key ? FALLBACK_CATEGORY : null });
  }
  return out;
}
