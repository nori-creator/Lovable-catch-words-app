import { describe, it, expect } from "vitest";
import { compareByMemory, memoryLevel, type MemorySortable } from "./memory";

const w = (o: Partial<MemorySortable>): MemorySortable => ({
  retention: 100,
  interval_days: 1,
  repetitions: 3,
  ...o,
});

describe("記憶の並べ替え", () => {
  /**
   * オーナー報告 2026-09-15 の画面そのもの。**9語すべてが 100%** で、
   * 「覚えた」と「長期記憶」が交互に現れていた。記憶率だけで並べると
   * 100% 同士の順が決まらないので、取得順のまま出ていた。
   */
  it("同じ 100% でも、段が混ざらない（覚えた → 長期記憶 の順になる）", () => {
    const words = [
      w({ headword: "紅茶", interval_days: 40 }), // 長期記憶
      w({ headword: "海綿", interval_days: 5 }), // 覚えた
      w({ headword: "床", interval_days: 60 }), // 長期記憶
      w({ headword: "手", interval_days: 3 }), // 覚えた
    ];
    const order = [...words].sort(compareByMemory).map((x) => x.headword);
    const levels = [...words]
      .sort(compareByMemory)
      .map((x) => memoryLevel(x.retention, x.interval_days, x.repetitions).level);
    // 段は単調に増える（弱い順）。
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(order).toEqual(["手", "海綿", "紅茶", "床"]);
  });

  it("弱い段が先に来る", () => {
    const weak = w({ retention: 20, interval_days: 1, repetitions: 1 });
    const strong = w({ retention: 100, interval_days: 40 });
    expect(compareByMemory(weak, strong)).toBeLessThan(0);
    expect(compareByMemory(strong, weak)).toBeGreaterThan(0);
  });

  it("同じ段なら、記憶率が低いほうが先", () => {
    expect(compareByMemory(w({ retention: 90 }), w({ retention: 95 }))).toBeLessThan(0);
  });

  /**
   * **明日忘れる 100% と、1か月もつ 100% は同じではない。**
   * ここで決着させないと、100% が並ぶ所が取得順のまま残る。
   */
  it("同じ記憶率なら、次に忘れるまでが短いほうが先", () => {
    const soon = w({ stability_days: 2, interval_days: 40 });
    const later = w({ stability_days: 90, interval_days: 40 });
    expect(compareByMemory(soon, later)).toBeLessThan(0);
  });

  it("全部同じなら見出し語で決める（開くたびに順が変わらない）", () => {
    const a = w({ headword: "あ" });
    const b = w({ headword: "い" });
    expect(compareByMemory(a, b)).toBeLessThan(0);
    expect(compareByMemory(a, a)).toBe(0);
  });

  it("並べ替えても語は1つも落ちない", () => {
    const words = Array.from({ length: 30 }, (_, i) =>
      w({ headword: `w${i}`, retention: (i * 7) % 101, interval_days: (i % 5) * 12 }),
    );
    expect([...words].sort(compareByMemory)).toHaveLength(30);
  });
});
