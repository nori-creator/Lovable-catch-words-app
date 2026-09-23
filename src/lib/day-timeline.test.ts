import { describe, expect, it } from "vitest";
import { dayKeyOf, layoutTimeline, monthCells, weekOf } from "./day-timeline";

describe("monthCells", () => {
  it("2026年9月は火曜はじまり。前に空の升が2つ、行は7の倍数", () => {
    const c = monthCells(2026, 8);
    expect(c.slice(0, 3)).toEqual([null, null, 1]);
    expect(c.filter((x) => x != null)).toHaveLength(30);
    expect(c.length % 7).toBe(0);
  });
});

describe("weekOf", () => {
  it("日曜はじまりの7日。月をまたいでもよい", () => {
    expect(weekOf("2026-09-22")).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
    expect(weekOf("2026-10-01")[0]).toBe("2026-09-27");
  });
  it("dayKeyOf はゼロ埋め", () => {
    expect(dayKeyOf(2026, 0, 5)).toBe("2026-01-05");
  });
});

describe("layoutTimeline", () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it("時刻の順に上から置く（渡した順ではなく）", () => {
    const { rows } = layoutTimeline([
      { id: "b", minutes: at(15) },
      { id: "a", minutes: at(9) },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[1].y).toBeGreaterThan(rows[0].y);
  });

  it("間が長いほど縦も空く。ただし札が重ならない最小と、画面から消えない最大がある", () => {
    const { rows } = layoutTimeline(
      [
        { id: "a", minutes: at(9) },
        { id: "b", minutes: at(9, 1) }, // 1分後 → 最小
        { id: "c", minutes: at(10, 31) }, // 90分後 → 比例（108）
        { id: "d", minutes: at(21) }, // 10時間後 → 最大
      ],
      { pxPerMin: 1.2, minGap: 100, maxGap: 220 },
    );
    const gaps = rows.slice(1).map((r, i) => r.y - rows[i].y);
    expect(gaps[0]).toBe(100);
    expect(gaps[1]).toBeCloseTo(108);
    expect(gaps[2]).toBe(220);
  });

  it("長い間には、挟まるちょうどの時刻を目盛りとして置く（札に近い目盛りは落とす）", () => {
    const { rows, ticks } = layoutTimeline([
      { id: "a", minutes: at(9, 30) },
      { id: "b", minutes: at(14, 30) },
    ]);
    const hours = ticks.map((t) => t.hour);
    // 10,11,12,13,14 のうち、札から離れた所だけ。間引きで詰まりすぎない。
    expect(hours.length).toBeGreaterThan(0);
    expect(hours.every((h) => h >= 10 && h <= 14)).toBe(true);
    for (const tk of ticks) {
      expect(tk.y).toBeGreaterThan(rows[0].y);
      expect(tk.y).toBeLessThan(rows[1].y);
      for (const r of rows) expect(Math.abs(r.y - tk.y)).toBeGreaterThan(28);
    }
    for (let i = 1; i < ticks.length; i++)
      expect(ticks[i].y - ticks[i - 1].y).toBeGreaterThanOrEqual(28);
  });

  it("1枚だけでも高さがある", () => {
    const { rows, height } = layoutTimeline([{ id: "a", minutes: at(12) }]);
    expect(rows[0].y).toBe(0);
    expect(height).toBeGreaterThan(0);
  });
});
