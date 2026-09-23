import { describe, expect, it } from "vitest";
import { BEST_R, buildMemoryCurve, curveTicks, gradientStops, groupReviews } from "./memory-curve";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 22, 12);

describe("buildMemoryCurve", () => {
  it("5回復習した語は、5回とも印が残る（古い復習も同じ日の復習も落とさない）", () => {
    const events = [
      { t: NOW - 120 * DAY, stability: 4 }, // 45日より前
      { t: NOW - 60 * DAY, stability: 10 },
      { t: NOW - 20 * DAY, stability: 20 },
      { t: NOW - 3 * DAY, stability: 30 },
      { t: NOW - 3 * DAY + 2 * 3600_000, stability: 40 }, // 同じ日にもう1回
    ];
    const c = buildMemoryCurve(events, NOW)!;
    expect(c.reviews).toHaveLength(5);
    // 範囲は一番古い復習から始まる（45日で切らない）。
    expect(c.domain[0]).toBeLessThanOrEqual(-120);
    // 復習の瞬間はどれも 100 に戻っている。
    for (const d of c.reviews) {
      expect(c.past.some((p) => p.d === d && p.r === 100)).toBe(true);
    }
  });

  it("線は今日で終わり、予測は今日から始まる（同じ値でつながる）", () => {
    const c = buildMemoryCurve([{ t: NOW - 5 * DAY, stability: 10 }], NOW)!;
    const lastPast = c.past[c.past.length - 1];
    expect(lastPast.d).toBe(0);
    expect(c.future[0]).toEqual({ d: 0, r: c.todayR });
    expect(lastPast.r).toBe(c.todayR);
    // 予測は下がり続ける（復習しなければ忘れる）。
    for (let i = 1; i < c.future.length; i++) {
      expect(c.future[i].r).toBeLessThanOrEqual(c.future[i - 1].r);
    }
  });

  it("復習どきは保持率が狙いの値（90%）になる日。予測線の上でその日の値もその前後", () => {
    const c = buildMemoryCurve([{ t: NOW - 1 * DAY, stability: 30 }], NOW)!;
    expect(c.bestDay).toBeGreaterThan(0);
    const near = c.future.reduce((a, b) =>
      Math.abs(b.d - c.bestDay) < Math.abs(a.d - c.bestDay) ? b : a,
    );
    expect(Math.abs(near.r - BEST_R)).toBeLessThanOrEqual(3);
  });

  it("復習どきを過ぎていれば bestDay は 0 以下", () => {
    const c = buildMemoryCurve([{ t: NOW - 30 * DAY, stability: 10 }], NOW)!;
    expect(c.bestDay).toBeLessThanOrEqual(0);
    expect(c.ticks.some((tk) => tk.kind === "best")).toBe(false);
  });

  it("右端は復習どきより先まで入り、1週間〜半年に収まる", () => {
    const short = buildMemoryCurve([{ t: NOW, stability: 1 }], NOW)!;
    expect(short.domain[1]).toBeGreaterThanOrEqual(7);
    const long = buildMemoryCurve([{ t: NOW, stability: 2000 }], NOW)!;
    expect(long.domain[1]).toBeLessThanOrEqual(180);
    const mid = buildMemoryCurve([{ t: NOW, stability: 40 }], NOW)!;
    expect(mid.domain[1]).toBeGreaterThan(mid.bestDay);
  });

  it("出会った日だけの語は、復習の印も目盛りも付けない", () => {
    const c = buildMemoryCurve([], NOW, { encounter: { t: NOW - 2 * DAY, stability: 9 } })!;
    expect(c.reviews).toEqual([]);
    expect(c.ticks.every((tk) => tk.kind !== "review")).toBe(true);
  });

  it("今日キャッチした語でも線が描ける", () => {
    const c = buildMemoryCurve([], NOW, { encounter: { t: NOW, stability: 9 } })!;
    expect(c.todayR).toBe(100);
    expect(c.domain[0]).toBe(0);
    expect(c.future.length).toBeGreaterThan(10);
  });

  it("撮った日から線が始まり、撮った日は復習に数えない", () => {
    const c = buildMemoryCurve([{ t: NOW - 10 * DAY, stability: 20 }], NOW, {
      encounter: { t: NOW - 14 * DAY, stability: 9 },
    })!;
    expect(c.domain[0]).toBe(-14);
    expect(c.reviews).toEqual([-10]);
  });

  it("出来事が無ければ null", () => {
    expect(buildMemoryCurve([], NOW)).toBeNull();
  });
});

describe("curveTicks", () => {
  it("今日・復習どき・復習日だけ。近すぎる目盛りは落とす", () => {
    const ticks = curveTicks({
      reviews: [-40, -39.5, -20, -0.2],
      bestDay: 12,
      domain: [-40, 30],
    });
    expect(ticks.map((t) => t.kind)).toContain("today");
    expect(ticks.map((t) => t.kind)).toContain("best");
    // -0.2 は今日に近すぎるので落ちる。-39.5 と -40 はどちらか1つ。
    expect(ticks.find((t) => t.d === -0.2)).toBeUndefined();
    expect(ticks.filter((t) => t.d <= -39).length).toBe(1);
    // 並びは左から右。
    const ds = ticks.map((t) => t.d);
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
    // 数は少ない（多すぎる目盛りは読まれない）。
    expect(ticks.length).toBeLessThanOrEqual(6);
  });
});

describe("gradientStops", () => {
  it("段の境目ごとに同じ位置へ2つ置き、上から下へ段が下がる", () => {
    const stops = gradientStops([100, 60, 20])!;
    expect(stops[0]).toEqual({ offset: 0, level: 5 });
    expect(stops[stops.length - 1]).toEqual({ offset: 1, level: 0 });
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].offset).toBeGreaterThanOrEqual(stops[i - 1].offset);
      expect(stops[i].level).toBeLessThanOrEqual(stops[i - 1].level);
    }
    // 85% の境目は (100-85)/(100-20) の位置。
    const at85 = stops.filter((s) => Math.abs(s.offset - 15 / 80) < 1e-9);
    expect(at85.map((s) => s.level)).toEqual([4, 3]);
  });

  it("高さの無い線は単色（SVG は高さ0の外接矩形にグラデーションを塗らない）", () => {
    expect(gradientStops([80, 80, 80])).toBeNull();
    expect(gradientStops([])).toBeNull();
  });
});

describe("curveTicks の優先", () => {
  it("復習どきが今日に近すぎるときは、復習どきの日付を残す（今日は点の注記が言う）", () => {
    const ticks = curveTicks({ reviews: [-60], bestDay: 2, domain: [-60, 40] });
    expect(ticks.map((t) => t.kind)).toContain("best");
    expect(ticks.map((t) => t.kind)).not.toContain("today");
  });
});

describe("未来の幅", () => {
  it("復習の歴が長くても、未来に横幅の4割ほどは残す", () => {
    const c = buildMemoryCurve(
      [
        { t: NOW - 69 * DAY, stability: 5 },
        { t: NOW - 1 * DAY, stability: 27 },
      ],
      NOW,
    )!;
    const [lo, hi] = c.domain;
    expect(hi / (hi - lo)).toBeGreaterThanOrEqual(0.39);
  });
});

describe("groupReviews", () => {
  it("同じ日の復習は1つの印にまとめ、回数を数える（合計は復習回数と一致）", () => {
    const g = groupReviews([-30, -29.9, -10, -3, -2.95]);
    expect(g).toEqual([
      { d: -30, n: 2 },
      { d: -10, n: 1 },
      { d: -3, n: 2 },
    ]);
    expect(g.reduce((a, b) => a + b.n, 0)).toBe(5);
  });
});
