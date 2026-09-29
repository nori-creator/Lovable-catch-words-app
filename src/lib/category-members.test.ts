import { describe, expect, it } from "vitest";
import { membersOf, membershipChanges } from "./category-members";

/** 2026-09-28「ある単語をあるカテゴリーに追加削除できるようにして」。 */
describe("カテゴリーに入れる・外す", () => {
  const items = [
    { id: "a", shelf_key: null, word: { category_key: "food" } }, // 語の分類が food
    { id: "b", shelf_key: "food", word: { category_key: "drink" } }, // 本人が food へ移した
    { id: "c", shelf_key: null, word: { category_key: "drink" } },
  ];

  it("いま載っている物を数える（本人が移した物も含む）", () => {
    expect([...membersOf(items, "food")].sort()).toEqual(["a", "b"]);
  });

  it("入れる → そのカテゴリーへ。変わらない物は書かない", () => {
    expect(membershipChanges(items, "food", new Set(["a", "b", "c"]))).toEqual([
      { sticker_id: "c", key: "food" },
    ]);
  });

  it("外す → 移していただけなら語の分類へ戻す／語の分類そのものなら「その他」へ", () => {
    expect(membershipChanges(items, "food", new Set())).toEqual([
      { sticker_id: "a", key: "other" },
      { sticker_id: "b", key: null },
    ]);
  });

  it("「その他」からは外す先が無いので外さない", () => {
    const o = [{ id: "x", shelf_key: null, word: { category_key: "other" } }];
    expect(membershipChanges(o, "other", new Set())).toEqual([]);
  });

  it("自分で作ったカテゴリーへも入れられる", () => {
    const mine = new Set(["u_trip"]);
    expect(membershipChanges(items, "u_trip", new Set(["c"]), mine)).toEqual([
      { sticker_id: "c", key: "u_trip" },
    ]);
  });
});
