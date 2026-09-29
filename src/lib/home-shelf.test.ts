import { describe, expect, it } from "vitest";
import { SHELF_ROW_MAX, monthDays, shelfMonths } from "./home-shelf";

const at = (y: number, m: number, d: number, h = 12) => ({
  created_at: new Date(y, m - 1, d, h).toISOString(),
});

describe("shelfMonths（ホームの一番上の本棚）", () => {
  it("撮った月ごとに1冊。古い月が左、新しい月が右。枚数が背の厚さ", () => {
    const books = shelfMonths([at(2026, 9, 1), at(2026, 8, 3), at(2026, 9, 20), at(2026, 7, 9)]);
    expect(books.map((b) => b.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(books.map((b) => b.count)).toEqual([1, 1, 2]);
  });

  it("1段に収まる冊数まで、新しい月を残す", () => {
    const items = Array.from({ length: 12 }, (_, i) => at(2025, i + 1, 5));
    const books = shelfMonths(items);
    expect(books).toHaveLength(SHELF_ROW_MAX);
    expect(books[books.length - 1].key).toBe("2025-12");
  });

  it("同じ月は並びが変わっても同じ色", () => {
    const a = shelfMonths([at(2026, 9, 1)]);
    const b = shelfMonths([at(2026, 8, 1), at(2026, 9, 1)]);
    expect(a[0].color).toBe(b[1].color);
  });
});

describe("monthDays（本を開くと、その月の最初の日から）", () => {
  it("その月の日だけを、古い日から並べる。束の中は撮った順・1日4枚まで", () => {
    const items = [
      at(2026, 9, 28, 9),
      at(2026, 9, 3, 18),
      at(2026, 9, 3, 8),
      at(2026, 8, 31),
      ...Array.from({ length: 6 }, (_, i) => at(2026, 9, 10, 8 + i)),
    ];
    const days = monthDays(items, 2026, 9);
    expect(days.map((d) => d.d)).toEqual([3, 10, 28]);
    expect(days[0].items[0].created_at).toBe(at(2026, 9, 3, 8).created_at);
    expect(days[1].items).toHaveLength(4);
  });
});

import { SHELF_DIMS, tightShelfSize } from "./home-shelf";

describe("tightShelfSize（本にぴったりの棚）", () => {
  it("内側の高さは本の高さちょうど（上に空きを作らない）", () => {
    const { h } = tightShelfSize(3);
    const board = SHELF_DIMS.board * ((SHELF_DIMS.bookH + 0.002) / SHELF_DIMS.innerH);
    expect(h - 2 * board).toBeCloseTo(SHELF_DIMS.bookH + 0.002, 6);
  });
  it("幅は並ぶ冊数ぶん（冊数が増えると横に伸びる）", () => {
    expect(tightShelfSize(4).w).toBeGreaterThan(tightShelfSize(2).w);
    expect(tightShelfSize(20).w).toBe(tightShelfSize(8).w);
  });
});
