import { describe, it, expect } from "vitest";
import { ALBUM_SPANS } from "./album-span";
import {
  isPhotoFocus,
  paginateSpread,
  photoPages,
  rightPageIsJournal,
  splitSpread,
  tileLayout,
  tilesPerPage,
} from "./album-spread";

/**
 * オーナー指摘「週ごとと月ごとは、画像の大きさを小さく調整して、多くの画像が
 * 見えるようにして」の受け皿。
 *
 * ここで一番怖いのは**撮った絵が黙って消えること**なので、
 * 「全部どこかの見開きに載る」を重点的に見る。
 */

describe("tileLayout", () => {
  it("束ねる幅が広いほど、小さく・多く並べる", () => {
    expect(tileLayout("day").cols).toBeLessThan(tileLayout("week").cols);
    expect(tileLayout("week").cols).toBeLessThan(tileLayout("month").cols);
    expect(tileLayout("day").rowHeight).toBeGreaterThan(tileLayout("week").rowHeight);
    expect(tileLayout("week").rowHeight).toBeGreaterThan(tileLayout("month").rowHeight);
  });

  it("**どの束ね方でも 1枚は見える大きさを持つ**(点にしない)", () => {
    for (const s of ALBUM_SPANS) {
      expect(tileLayout(s).rowHeight).toBeGreaterThanOrEqual(40);
      expect(tileLayout(s).cols).toBeGreaterThan(0);
    }
  });
});

describe("splitSpread", () => {
  it("左右に半分ずつ割る", () => {
    expect(splitSpread([1, 2, 3, 4])).toEqual({ left: [1, 2], right: [3, 4] });
  });

  it("**奇数のときは左を厚くする**(右だけ詰まって見えない)", () => {
    const got = splitSpread([1, 2, 3]);
    expect(got.left).toEqual([1, 2]);
    expect(got.right).toEqual([3]);
    expect(got.left.length).toBeGreaterThanOrEqual(got.right.length);
  });

  it("1枚でも落ちない", () => {
    expect(splitSpread([1])).toEqual({ left: [1], right: [] });
  });

  it("空でも落ちない", () => {
    expect(splitSpread([])).toEqual({ left: [], right: [] });
  });

  it("**1枚も落とさない**", () => {
    for (let n = 0; n < 30; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      const { left, right } = splitSpread(items);
      expect([...left, ...right]).toEqual(items);
    }
  });
});

describe("paginateSpread", () => {
  it("入りきるうちは1組", () => {
    const items = Array.from({ length: 6 }, (_, i) => i);
    expect(paginateSpread(items, "day")).toHaveLength(1);
  });

  it("**溢れたら次の見開きへ送る**(黙って捨てない)", () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const pages = paginateSpread(items, "month");
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => [...p.left, ...p.right])).toEqual(items);
  });

  it("**どの束ね方でも1枚も落とさない**", () => {
    for (const span of ALBUM_SPANS) {
      for (const n of [0, 1, 7, 24, 25, 99, 300]) {
        const items = Array.from({ length: n }, (_, i) => i);
        const flat = paginateSpread(items, span).flatMap((p) => [...p.left, ...p.right]);
        expect(flat).toEqual(items);
      }
    }
  });

  it("空でも**1組は返す**(白紙の見開きが開く)", () => {
    expect(paginateSpread([], "day")).toEqual([{ left: [], right: [] }]);
  });

  it("1組に詰める枚数は片面の目安の2倍まで", () => {
    for (const span of ALBUM_SPANS) {
      const items = Array.from({ length: 500 }, (_, i) => i);
      for (const p of paginateSpread(items, span)) {
        expect(p.left.length).toBeLessThanOrEqual(tilesPerPage(span));
        expect(p.right.length).toBeLessThanOrEqual(tilesPerPage(span));
      }
    }
  });
});

describe("rightPageIsJournal", () => {
  it("**日ごとだけ右が日記**", () => {
    expect(rightPageIsJournal("day")).toBe(true);
    expect(rightPageIsJournal("week")).toBe(false);
    expect(rightPageIsJournal("month")).toBe(false);
  });
});

describe("isPhotoFocus", () => {
  it("1枚選んでいるかを見る", () => {
    expect(isPhotoFocus("s1")).toBe(true);
    expect(isPhotoFocus(null)).toBe(false);
    expect(isPhotoFocus(undefined)).toBe(false);
    expect(isPhotoFocus("")).toBe(false);
  });
});

describe("photoPages", () => {
  it("**日ごとは左に全部、右は空**(右は日記が入る)", () => {
    const items = [1, 2, 3, 4, 5];
    const pages = photoPages(items, "day");
    expect(pages).toHaveLength(1);
    expect(pages[0].left).toEqual(items);
    expect(pages[0].right).toEqual([]);
  });

  it("日ごとでも入りきらなければページを送る", () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    const pages = photoPages(items, "day");
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.left)).toEqual(items);
    for (const p of pages) expect(p.right).toEqual([]);
  });

  it("週・月は左右の両面に並べる", () => {
    for (const span of ["week", "month"] as const) {
      const items = [1, 2, 3, 4];
      const pages = photoPages(items, span);
      expect(pages[0].right.length).toBeGreaterThan(0);
    }
  });

  it("**どの束ね方でも1枚も落とさない**", () => {
    for (const span of ALBUM_SPANS) {
      for (const n of [0, 1, 13, 25, 200]) {
        const items = Array.from({ length: n }, (_, i) => i);
        const flat = photoPages(items, span).flatMap((p) => [...p.left, ...p.right]);
        expect(flat).toEqual(items);
      }
    }
  });

  it("空でも1組は返す", () => {
    expect(photoPages([], "day")).toEqual([{ left: [], right: [] }]);
  });
});
