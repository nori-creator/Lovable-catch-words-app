import { describe, it, expect } from "vitest";
import { DURATION_MAX_MS, DURATION_MIN_MS, MAX_LIFT_PX, floatStyle } from "./bubble-float";

/**
 * 札の浮遊感（オーナー指示 2026-08-28 ①）。
 *
 * 位置は整列させたので、ここで縛るのは**揺れ方**だけ。
 * いちばん怖いのは「描き直すたびに揺れ方が変わる」— 目には
 * 「札がちらつく」としか映らず、原因を追えない。
 */

describe("floatStyle", () => {
  it("**同じ札なら必ず同じ揺れ方**（描き直しでちらつかない）", () => {
    expect(floatStyle("place:夜市", 0)).toEqual(floatStyle("place:夜市", 0));
  });

  it("札が違えば揺れ方も違う（全部が同時に上下しない）", () => {
    const a = floatStyle("place:夜市", 0);
    const b = floatStyle("time:朝", 1);
    expect([a.delayMs === b.delayMs, a.durationMs === b.durationMs]).not.toEqual([true, true]);
  });

  it("並びの中の位置も混ぜる（近い名前が揃って揺れない）", () => {
    expect(floatStyle("place:所1", 0)).not.toEqual(floatStyle("place:所1", 1));
  });

  it("**振れ幅は行が崩れない範囲**（0 にもしない）", () => {
    for (const id of ["a", "夜市", "台南限定", "🌸", ""]) {
      const f = floatStyle(id);
      expect([id, f.liftPx >= 1, f.liftPx <= MAX_LIFT_PX]).toEqual([id, true, true]);
    }
  });

  it("速さは決めた幅に収まる（速すぎ・止まって見える、を作らない）", () => {
    for (let i = 0; i < 200; i++) {
      const f = floatStyle(`札${i}`, i);
      expect([i, f.durationMs >= DURATION_MIN_MS, f.durationMs <= DURATION_MAX_MS]).toEqual([
        i,
        true,
        true,
      ]);
      expect([i, f.delayMs >= 0, f.delayMs < 1400]).toEqual([i, true, true]);
      expect([i, [0, 1, 2].includes(f.depth)]).toEqual([i, true]);
    }
  });

  it("奥行きは3段とも出る（全部が同じ高さに見えない）", () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => floatStyle(`札${i}`, i).depth));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("空の名前でも落ちない", () => {
    expect(Number.isFinite(floatStyle("").durationMs)).toBe(true);
  });
});
