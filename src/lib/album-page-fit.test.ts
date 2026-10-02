import { describe, expect, it } from "vitest";
import { fitAlbumPage, keepHomeLayout, PAGE_FIT_MAX_W } from "./album-page-fit";

/** 本のページ（`paintPlacedPhotos` の写真を貼れる所）とほぼ同じ大きさ。 */
const PAGE = { w: 616, h: 834 };
const GAP = 22;
const photo = (ratio: number, below = 40) => ({ ratio, below: () => below });

describe("本の左ページに写真を収め直す（オーナー指示 2026-10-02）", () => {
  it("ホームの並びを細い列に縮める日・下が大きく空く日だけ並べ直す", () => {
    expect(keepHomeLayout(1, 0.9)).toBe(true);
    expect(keepHomeLayout(0.54, 1)).toBe(false); // 縦に長い日（7枚）
    expect(keepHomeLayout(1, 0.35)).toBe(false); // 写真が少ない日
  });

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

  it("1枚の日も、紙いっぱいにはしない（幅の上限）", () => {
    const { boxes } = fitAlbumPage([photo(0.75)], PAGE, GAP);
    expect(boxes[0].w).toBeLessThanOrEqual(PAGE.w * PAGE_FIT_MAX_W + 0.01);
    // 横は真ん中に寄せる。
    expect(boxes[0].x + boxes[0].w / 2).toBeCloseTo(PAGE.w / 2, 0);
  });

  it("写真が無い日は何も置かない", () => {
    expect(fitAlbumPage([], PAGE, GAP).boxes).toEqual([]);
  });
});
