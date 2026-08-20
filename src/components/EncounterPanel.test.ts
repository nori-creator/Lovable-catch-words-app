import { describe, it, expect } from "vitest";
import { monthRange } from "./EncounterPanel";

/**
 * 旬の月の書き方。
 * **「月」を末尾に1つだけ付けると「1〜2ヶ月と12月」と読める。**
 * 検査の絵で気づいた誤読なので、規則を試験に置く。
 */
describe("monthRange", () => {
  it("続いている月はまとめる", () => {
    expect(monthRange([5, 6, 7, 8])).toBe("5〜8月");
  });

  it("1つだけならそのまま", () => {
    expect(monthRange([2])).toBe("2月");
  });

  it("**区間ごとに「月」を付ける**(まとめて末尾に付けない)", () => {
    expect(monthRange([12, 1, 2])).toBe("1〜2月・12月");
    expect(monthRange([1, 5, 9])).toBe("1月・5月・9月");
  });

  it("年をまたぐ旬を1つの区間に畳まない(間の月まで旬だと言わない)", () => {
    // 12→1 を繋げると「12〜1月」になり、3〜11月も旬だと読める。
    expect(monthRange([11, 12, 1])).not.toContain("12〜1");
  });

  it("順番がばらばらでも重複していても直る", () => {
    expect(monthRange([8, 5, 6, 5, 7])).toBe("5〜8月");
  });

  it("範囲の外や壊れた数は数えない", () => {
    expect(monthRange([0, 13, -1, 6])).toBe("6月");
    expect(monthRange([Number.NaN, 3.5, 3])).toBe("3月");
  });

  it("空なら空(空の札を描かせない)", () => {
    expect(monthRange([])).toBe("");
  });
});
