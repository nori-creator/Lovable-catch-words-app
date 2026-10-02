import { describe, expect, it } from "vitest";
import { fitAlbumPage, PAGE_FIT_MAX_W } from "./album-page-fit";

/** 本の左ページ（写真を貼れる所）とほぼ同じ大きさ。単位は何でもよい（割合でも px でも同じ計算）。 */
const PAGE = { w: 616, h: 834 };
const GAP = 22;
const photo = (ratio: number, below = 40) => ({ ratio, below: () => below });

describe("ページの形の台紙に写真を全部収める（オーナー決定 2026-10-02「台紙を本のページの形に」）", () => {
  it("7枚の日は、1本の細い列ではなく複数の列でページの幅を使う", () => {
    const fit = fitAlbumPage(
      [0.75, 1.33, 1.25, 1.33, 0.8, 1.33, 1.2].map((r) => photo(r)),
      PAGE,
      GAP,
    );
    expect(fit.cols).toBeGreaterThanOrEqual(2);
    const left = Math.min(...fit.boxes.map((b) => b.x));
    const right = Math.max(...fit.boxes.map((b) => b.x + b.w));
    expect(right - left).toBeGreaterThan(PAGE.w * 0.8);
    // 何列目かが付く（傾きの向きに使う）。
    for (const b of fit.boxes) expect(b.col).toBeLessThan(fit.cols);
  });

  it("どの写真もページの中に収まり、重ならない", () => {
    const items = [0.75, 1.33, 1.25, 1.33, 0.8, 1.33, 1.2].map((r) => photo(r, 60));
    const { boxes } = fitAlbumPage(items, PAGE, GAP);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-0.01);
      expect(b.x + b.w).toBeLessThanOrEqual(PAGE.w + 0.01);
      expect(b.y + b.h + 60).toBeLessThanOrEqual(PAGE.h + 0.01);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart =
          a.x + a.w <= b.x + 0.01 ||
          b.x + b.w <= a.x + 0.01 ||
          a.y + a.h + 60 <= b.y + 0.01 ||
          b.y + b.h + 60 <= a.y + 0.01;
        expect(apart, `${i} と ${j}`).toBe(true);
      }
    }
  });

  it("字だけの札（比 0）は字の高さぶんだけ場所を取る", () => {
    const { boxes } = fitAlbumPage([photo(1), { ratio: 0, below: () => 50 }, photo(1)], PAGE, GAP);
    expect(boxes[1].h).toBe(0);
    // 同じ列に続く札は、字の高さ＋間を空けて始まる。
    const same = boxes.filter((b) => b.col === boxes[1].col && b !== boxes[1]);
    for (const b of same) {
      if (b.y > boxes[1].y) expect(b.y - boxes[1].y).toBeGreaterThanOrEqual(50 + GAP - 0.01);
    }
  });

  it("1枚の日も、紙いっぱいにはしない（幅の上限）", () => {
    const { boxes } = fitAlbumPage([photo(0.75)], PAGE, GAP);
    expect(boxes[0].w).toBeLessThanOrEqual(PAGE.w * PAGE_FIT_MAX_W + 0.01);
    // 横は真ん中に寄せる。
    expect(boxes[0].x + boxes[0].w / 2).toBeCloseTo(PAGE.w / 2, 0);
  });

  it("**何度計算しても同じ**（乱数を使わない）", () => {
    const items = [1, 0.8, 1.15].map((r) => photo(r));
    expect(fitAlbumPage(items, PAGE, GAP)).toEqual(fitAlbumPage(items, PAGE, GAP));
  });

  it("写真が無い日は何も置かない", () => {
    expect(fitAlbumPage([], PAGE, GAP).boxes).toEqual([]);
  });
});
