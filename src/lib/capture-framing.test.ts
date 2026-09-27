import { describe, expect, it } from "vitest";
import { containRect, cutoutClippedEdges, residualZoom, viewfinderCrop } from "./capture-framing";

describe("captured photo matches the viewfinder", () => {
  it("crops landscape video to the portrait viewport without stretching", () => {
    const crop = viewfinderCrop(1920, 1080, 390, 780);
    expect(crop).toEqual({ sx: 690, sy: 0, sw: 540, sh: 1080 });
  });
  it("preserves decimal digital zoom in the saved photo", () => {
    const crop = viewfinderCrop(1920, 1080, 390, 780, 1.5);
    expect(crop).toEqual({ sx: 780, sy: 180, sw: 360, sh: 720 });
  });
  it("keeps a square camera centered in a wide viewport", () => {
    expect(viewfinderCrop(1200, 1200, 800, 400)).toEqual({ sx: 0, sy: 300, sw: 1200, sh: 600 });
  });
});

/**
 * 覗いている絵と撮れる写真の倍率を、**同じ1つの数**から出す
 * （オーナー報告 2026-09-22「撮った後の画像が引きになる」）。
 */
describe("見た目で補うぶんの倍率", () => {
  it("レンズが頼んだとおり効いたなら、見た目は何もしない", () => {
    expect(residualZoom(2, 2)).toBe(1);
    expect(residualZoom(1, 1)).toBe(1);
  });

  it("**レンズが受け取っただけで何もしなかったら、頼んだぶんを見た目で補う**", () => {
    // これが実機で起きていた形。`applyConstraints` は解決するのに
    // `getSettings().zoom` は 1 のまま。
    expect(residualZoom(2, 1)).toBe(2);
    expect(residualZoom(3, 1)).toBe(3);
  });

  it("途中まで効いたなら、残りだけを補う", () => {
    expect(residualZoom(4, 2)).toBe(2);
    expect(residualZoom(3, 1.5)).toBe(2);
  });

  it("端末が倍率を報告しないときは、頼んだぶんをそのまま使う", () => {
    expect(residualZoom(2, undefined)).toBe(2);
    expect(residualZoom(2, null)).toBe(2);
    expect(residualZoom(2, 0)).toBe(2);
    expect(residualZoom(2, Number.NaN)).toBe(2);
  });

  it("**1 より小さくしない**（広角側はレンズの仕事で、切り出しでは作れない）", () => {
    expect(residualZoom(1, 2)).toBe(1);
    expect(residualZoom(0.5, 1)).toBe(1);
  });
});

describe("映像を枠に収める（2026-09-27「寄りすぎ・見切れ」）", () => {
  it("縦長の枠に横長の映像: 上下に帯、横幅はすべて見える", () => {
    expect(containRect(1600, 1200, 390, 520)).toEqual({ x: 0, y: 113.75, w: 390, h: 292.5 });
  });
  it("縦横比が同じなら帯は出ない（撮る写真は映像のすべて）", () => {
    expect(containRect(1200, 1600, 390, 520)).toEqual({ x: 0, y: 0, w: 390, h: 520 });
    expect(viewfinderCrop(1200, 1600, 1200, 1600)).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 1600 });
  });
});

describe("切り抜いた物が写真の縁で切れているか", () => {
  const grid = (w: number, h: number, on: (x: number, y: number) => boolean) => {
    const a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = on(x, y) ? 255 : 0;
    return a;
  };
  it("真ん中に収まった物は、どの縁にも触れない", () => {
    const a = grid(100, 100, (x, y) => x > 20 && x < 80 && y > 20 && y < 80);
    expect(cutoutClippedEdges(a, 100, 100)).toEqual([]);
  });
  it("下と右にはみ出した物は、その2辺を返す", () => {
    const a = grid(100, 100, (x, y) => x > 40 && y > 50);
    expect(cutoutClippedEdges(a, 100, 100)).toEqual(["bottom", "right"]);
  });
  it("縁にほんの少し触れただけ（ノイズ）は数えない", () => {
    const a = grid(100, 100, (x, y) => y === 0 && x < 2);
    expect(cutoutClippedEdges(a, 100, 100)).toEqual([]);
  });
});
