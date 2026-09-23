import { describe, expect, it } from "vitest";
import { coverFlowPose, poseTransform, settleIndex } from "./cover-flow";

describe("coverFlowPose", () => {
  it("真ん中は正面・手前・いちばん上", () => {
    const p = coverFlowPose(0);
    expect(p.rotateY).toBe(-0);
    expect(p.translateZ).toBe(-0);
    expect(p.scale).toBe(1);
    expect(p.zIndex).toBe(100);
  });

  it("左右の札は真ん中へ顔を向ける（左は右向き＝正の角度、右は負）", () => {
    expect(coverFlowPose(-1).rotateY).toBeGreaterThan(0);
    expect(coverFlowPose(1).rotateY).toBeLessThan(0);
    expect(Math.abs(coverFlowPose(1).rotateY)).toBe(Math.abs(coverFlowPose(-1).rotateY));
  });

  it("1枚より先は角度が増えず、奥へ下がって小さくなる。2枚より先は止まる", () => {
    expect(coverFlowPose(1.5).rotateY).toBe(coverFlowPose(1).rotateY);
    expect(coverFlowPose(1.5).translateZ).toBeLessThan(coverFlowPose(1).translateZ);
    expect(coverFlowPose(5).translateZ).toBe(coverFlowPose(2).translateZ);
  });

  it("真ん中に近い札ほど上に重なる", () => {
    expect(coverFlowPose(0.4).zIndex).toBeGreaterThan(coverFlowPose(1.2).zIndex);
    expect(coverFlowPose(3).zIndex).toBeGreaterThan(coverFlowPose(4).zIndex);
  });

  it("動きを減らす設定では傾けない", () => {
    expect(coverFlowPose(1, true).rotateY).toBe(0);
    expect(coverFlowPose(1, true).scale).toBeLessThan(1);
  });

  it("transform の文字列", () => {
    expect(poseTransform(coverFlowPose(0))).toBe("translateZ(0.0px) rotateY(0.00deg) scale(1.000)");
  });
});

import { dotWindow } from "./cover-flow";

describe("カードの下の点（オーナー指示 2026-09-23）", () => {
  it("少なければ全部。いまの1枚が大", () => {
    expect(dotWindow(4, 1)).toEqual([
      { i: 0, size: 1 },
      { i: 1, size: 2 },
      { i: 2, size: 1 },
      { i: 3, size: 1 },
    ]);
  });
  it("多ければ7つだけ。続きのある端は小", () => {
    const d = dotWindow(100, 50);
    expect(d).toHaveLength(7);
    expect(d[3]).toEqual({ i: 50, size: 2 });
    expect(d[0].size).toBe(0);
    expect(d[6].size).toBe(0);
  });
  it("先頭と末尾では窓が端に寄る", () => {
    expect(dotWindow(100, 0)[0]).toEqual({ i: 0, size: 2 });
    expect(dotWindow(100, 0)[6].size).toBe(0);
    expect(dotWindow(100, 99)[6]).toEqual({ i: 99, size: 2 });
  });
  it("空なら何も出さない", () => {
    expect(dotWindow(0, 0)).toEqual([]);
  });
});

describe("settleIndex（離したときに着く札）", () => {
  it("止めて離せば、いちばん近い札", () => {
    expect(settleIndex(140, 0, 100, 10)).toBe(1);
    expect(settleIndex(160, 0, 100, 10)).toBe(2);
  });
  it("速く払うほど先の札へ。逆向きも同じ", () => {
    expect(settleIndex(100, 1500, 100, 30)).toBeGreaterThan(3);
    expect(settleIndex(1000, -1500, 100, 30)).toBeLessThan(7);
  });
  it("端は越えない", () => {
    expect(settleIndex(0, -5000, 100, 10)).toBe(0);
    expect(settleIndex(900, 5000, 100, 10)).toBe(9);
    expect(settleIndex(0, 0, 100, 0)).toBe(0);
  });
});
