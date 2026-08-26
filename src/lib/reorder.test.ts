import { describe, expect, it } from "vitest";
import { moveItem, rowAtY, dragTarget, LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from "./reorder";

const L = ["a", "b", "c", "d"];

describe("moveItem", () => {
  it("下へ動かす", () => {
    expect(moveItem(L, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
  it("上へ動かす", () => {
    expect(moveItem(L, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("同じ所なら何も変わらない", () => {
    expect(moveItem(L, 1, 1)).toEqual(L);
  });
  it("**元の配列を変えない**", () => {
    const src = [...L];
    moveItem(src, 0, 3);
    expect(src).toEqual(L);
  });
  it("範囲の外は端に丸める(落とさない)", () => {
    expect(moveItem(L, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(L, 3, -5)).toEqual(["d", "a", "b", "c"]);
  });
  it("在りえない掴み位置では何もしない", () => {
    expect(moveItem(L, -1, 2)).toEqual(L);
    expect(moveItem(L, 9, 2)).toEqual(L);
  });
  it("空でも落ちない", () => {
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});

const ROWS = [
  { top: 0, bottom: 20 },
  { top: 24, bottom: 44 },
  { top: 48, bottom: 68 },
];

describe("rowAtY", () => {
  it("行の中なら its index", () => {
    expect(rowAtY(ROWS, 10)).toBe(0);
    expect(rowAtY(ROWS, 30)).toBe(1);
    expect(rowAtY(ROWS, 68)).toBe(2);
  });
  it("**行と行の隙間では null**", () => {
    expect(rowAtY(ROWS, 22)).toBeNull();
    expect(rowAtY(ROWS, 46)).toBeNull();
  });
  it("一覧の外でも null(先頭に飛ばさない)", () => {
    expect(rowAtY(ROWS, -100)).toBeNull();
    expect(rowAtY(ROWS, 999)).toBeNull();
  });
  it("端はその行に含める", () => {
    expect(rowAtY(ROWS, 0)).toBe(0);
    expect(rowAtY(ROWS, 20)).toBe(0);
  });
});

describe("dragTarget", () => {
  it("指の下の行へ動かす", () => {
    expect(dragTarget(ROWS, 0, 30)).toBe(1);
    expect(dragTarget(ROWS, 2, 10)).toBe(0);
  });
  it("**隙間や一覧の外では動かさない**", () => {
    // ここで 0 を返すと、指を外へ出しただけで先頭に飛ぶ
    // — 触っていて一番驚く壊れ方。
    expect(dragTarget(ROWS, 2, 22)).toBe(2);
    expect(dragTarget(ROWS, 2, -50)).toBe(2);
    expect(dragTarget(ROWS, 1, 9999)).toBe(1);
  });
  it("行が1つも無くても落ちない", () => {
    expect(dragTarget([], 0, 10)).toBe(0);
  });
});

describe("長押しの決めごと", () => {
  it("すぐ動かすのはスクロールとして通す", () => {
    // 0 だと指の微動で長押しが一度も成立しない。
    expect(LONG_PRESS_SLOP_PX).toBeGreaterThan(0);
    // 大きすぎるとスクロールのつもりが並べ替えになる。
    expect(LONG_PRESS_SLOP_PX).toBeLessThanOrEqual(16);
  });
  it("長押しは押し間違いと区別できる長さ", () => {
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(300);
    expect(LONG_PRESS_MS).toBeLessThanOrEqual(700);
  });
});
