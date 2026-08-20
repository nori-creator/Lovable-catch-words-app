import { describe, it, expect } from "vitest";
import {
  cutoutAtCatch,
  normalizeCatchSpeed,
  summarizeCatchTimings,
  type CatchTiming,
} from "./catch-speed";

describe("normalizeCatchSpeed / cutoutAtCatch", () => {
  it("速さを選んだときだけ切り抜きを飛ばす", () => {
    expect(cutoutAtCatch("fast")).toBe(false);
    expect(cutoutAtCatch("detail")).toBe(true);
  });

  /**
   * **既定は「今まで通り」でなければならない。**
   * 保存が壊れていた回に黙って見た目が落ちるのは、いちばん困る形。
   */
  it.each([null, undefined, "", "FAST", "はやい", 0, 1, true, {}, []])(
    "知らない値 %p は detail(今まで通り)に落ちる",
    (bad) => {
      expect(normalizeCatchSpeed(bad)).toBe("detail");
      expect(cutoutAtCatch(bad as never)).toBe(true);
    },
  );
});

const t = (ms: number, speed: "detail" | "fast"): CatchTiming => ({
  ms,
  speed,
  cutout: speed === "detail",
  at: 0,
});

describe("summarizeCatchTimings", () => {
  it("切り抜きあり/なしを別々に数える", () => {
    const s = summarizeCatchTimings([
      t(3000, "detail"),
      t(3400, "detail"),
      t(900, "fast"),
      t(1100, "fast"),
      t(1000, "fast"),
    ]);
    expect(s.detail).toEqual({ median: 3200, n: 2 });
    expect(s.fast).toEqual({ median: 1000, n: 3 });
  });

  /**
   * **記録が無いほうを 0 にしない。**
   * 「0ミリ秒で終わった」と読めてしまい、比較の意味が逆になる。
   */
  it("片方しか記録が無ければ、無いほうは null", () => {
    const s = summarizeCatchTimings([t(2000, "detail")]);
    expect(s.detail.median).toBe(2000);
    expect(s.fast.median).toBeNull();
    expect(s.fast.n).toBe(0);
  });

  it("記録が1件も無ければ両方 null", () => {
    const s = summarizeCatchTimings([]);
    expect(s.detail.median).toBeNull();
    expect(s.fast.median).toBeNull();
  });

  it("中央値であって平均ではない(1回の外れ値で歪ませない)", () => {
    const s = summarizeCatchTimings([
      t(1000, "fast"),
      t(1100, "fast"),
      t(1200, "fast"),
      t(60_000, "fast"),
      t(1300, "fast"),
    ]);
    // 平均なら 12,920ms になるところ。
    expect(s.fast.median).toBe(1200);
  });

  it("記録の速さが壊れていても detail として数える(既定に落ちる)", () => {
    const broken = [{ ms: 500, speed: "はやい", cutout: false, at: 0 }] as unknown as CatchTiming[];
    const s = summarizeCatchTimings(broken);
    expect(s.detail.n).toBe(1);
    expect(s.fast.n).toBe(0);
  });
});
