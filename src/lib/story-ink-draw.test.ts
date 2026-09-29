import { describe, expect, it } from "vitest";
import { eraseAt, strokeStyle } from "./story-ink-draw";

describe("落書きの道具（2026-09-28 R11「IG等を参考に使いやすく」）", () => {
  it("消しゴムは触れた線を丸ごと消す（他の線は残す）", () => {
    const a = {
      width: 8,
      pts: [
        [0, 0],
        [100, 0],
      ] as Array<[number, number]>,
    };
    const b = {
      width: 8,
      pts: [
        [0, 300],
        [100, 300],
      ] as Array<[number, number]>,
    };
    expect(eraseAt([a, b], [50, 5], 20)).toEqual([b]);
    expect(eraseAt([a, b], [500, 500], 20)).toEqual([a, b]);
  });

  it("マーカーは半透明で太い、ネオンは白い芯に色の光", () => {
    expect(strokeStyle("marker", "#ff0", 10)).toMatchObject({
      strokeOpacity: 0.45,
      strokeWidth: 18,
    });
    expect(strokeStyle("neon", "#0af", 10)).toMatchObject({ stroke: "#ffffff", glow: "#0af" });
    expect(strokeStyle(undefined, "#000", 10)).toMatchObject({ stroke: "#000", strokeWidth: 10 });
  });
});
