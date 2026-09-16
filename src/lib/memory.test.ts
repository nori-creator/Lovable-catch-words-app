import { describe, it, expect } from "vitest";
import {
  compareByMemory,
  memoryLevel,
  memoryOf,
  memoryStrength,
  type MemorySortable,
} from "./memory";
import { stabilityOf } from "./srs";

const w = (o: Partial<MemorySortable>): MemorySortable => ({
  retention: 100,
  interval_days: 1,
  ...o,
});

/**
 * **段と % が食い違わない。**（オーナー報告 2026-09-16「SRSは長期記憶なのに、
 * %が覚えたの状態より低いのが変。一番下に行けば行くほど、記憶の状態が
 * より高く % も高くして」）
 *
 * 前の作りは、段と % が**別の軸**から出ていた:
 *   ・長期記憶 … 間隔30日以上 かつ 定着度80%以上
 *   ・覚えた   … 定着度85%以上 かつ 復習3回以上
 * 条件が重なっていたので「長期記憶 82%」が「覚えた 95%」より上に並んだ。
 *
 * いまは**記憶の強さ**という1本の数を6つに区切るだけなので、
 * 逆転のしようがない。ここはその形を留める門。
 */
describe("記憶の強さと段", () => {
  it("段は強さだけで決まり、境目は重ならない", () => {
    const table: Array<[number, number]> = [
      [0, 0],
      [29, 0],
      [30, 1],
      [49, 1],
      [50, 2],
      [69, 2],
      [70, 3],
      [84, 3],
      [85, 4],
      [94, 4],
      [95, 5],
      [100, 5],
    ];
    for (const [strength, level] of table) {
      expect([strength, memoryLevel(strength).level]).toEqual([strength, level]);
    }
  });

  it("強さが上がれば段は下がらない（単調）", () => {
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const lv = memoryLevel(s).level;
      expect(lv).toBeGreaterThanOrEqual(prev);
      prev = lv;
    }
  });

  /**
   * **いちばん直したかった逆転そのもの。**
   * 間隔が長い語（＝出題日が近く定着度が下がっている）が、
   * 間隔の短い語より低い段・低い % になっていないこと。
   */
  it("間隔が長い語のほうが、強さも段も高い", () => {
    // 昨日どちらも正解した。片方は間隔3日、片方は間隔90日。
    const young = memoryOf({ retention: 97, interval_days: 3 });
    const mature = memoryOf({ retention: 100, interval_days: 90 });
    expect(mature.strength).toBeGreaterThan(young.strength);
    expect(mature.level.level).toBeGreaterThan(young.level.level);
  });

  /**
   * **今日キャッチしたばかりの語は、いちばん強くならない。**
   *
   * 定着度だけで並べると、未復習の語は必ず 100% なので**一覧のいちばん下
   * （＝いちばん覚えている側）**に来てしまう。熟し（安定度）を掛けている
   * ので、そうならない。
   */
  it("キャッチ直後(未復習)の 100% は、育った語より弱い", () => {
    const fresh = memoryOf({ retention: 100, interval_days: 0 });
    const grown = memoryOf({ retention: 92, interval_days: 30 });
    expect(fresh.strength).toBeLessThan(grown.strength);
    // それでも「忘れかけ」ではない（覚えたばかりなのに赤くしない）。
    expect(fresh.level.level).toBeGreaterThanOrEqual(2);
  });

  it("安定度が同じなら、定着度が高いほうが強い", () => {
    const a = memoryStrength(80, 100);
    const b = memoryStrength(95, 100);
    expect(b).toBeGreaterThan(a);
  });

  it("定着度が同じなら、長くもつほうが強い", () => {
    const soon = memoryStrength(100, 2);
    const later = memoryStrength(100, 400);
    expect(later).toBeGreaterThan(soon);
  });

  it("安定度を渡さなければ、間隔と ease から出す", () => {
    const given = memoryOf({
      retention: 90,
      interval_days: 30,
      stability_days: stabilityOf(30, 2.5),
    });
    const derived = memoryOf({ retention: 90, interval_days: 30, ease: 2.5 });
    expect(derived.strength).toBe(given.strength);
  });
});

describe("記憶の並べ替え", () => {
  /**
   * オーナー報告 2026-09-15 の画面。**9語すべてが 100%** で、
   * 「覚えた」と「長期記憶」が交互に現れていた。
   */
  it("同じ 100% でも段が混ざらず、下へ行くほど強い", () => {
    const words = [
      w({ headword: "紅茶", interval_days: 40 }),
      w({ headword: "海綿", interval_days: 5 }),
      w({ headword: "床", interval_days: 60 }),
      w({ headword: "手", interval_days: 3 }),
    ];
    const sorted = [...words].sort(compareByMemory);
    expect(sorted.map((x) => x.headword)).toEqual(["手", "海綿", "紅茶", "床"]);
    // **段も % も単調に増える**（オーナー指示 2026-09-16）。
    const levels = sorted.map((x) => memoryOf(x).level.level);
    const strengths = sorted.map((x) => memoryOf(x).strength);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
  });

  /**
   * **並びの約束そのもの。** どんな組み合わせを混ぜても、並べたあとの
   * % と段が一度も下がらないこと。1つでも下がれば、オーナーが見た
   * 「長期記憶なのに % が低い」が戻ってくる。
   */
  it("どう混ぜても、並べたあとの % と段は下がらない", () => {
    const words: MemorySortable[] = [];
    for (const retention of [12, 45, 68, 83, 91, 100]) {
      for (const interval_days of [0, 1, 5, 21, 60, 200]) {
        words.push(w({ headword: `${retention}-${interval_days}`, retention, interval_days }));
      }
    }
    const sorted = [...words].sort(compareByMemory);
    expect(sorted).toHaveLength(words.length);
    let lastStrength = -1;
    let lastLevel = -1;
    for (const x of sorted) {
      const { strength, level } = memoryOf(x);
      expect(strength).toBeGreaterThanOrEqual(lastStrength);
      expect(level.level).toBeGreaterThanOrEqual(lastLevel);
      lastStrength = strength;
      lastLevel = level.level;
    }
  });

  it("弱い語が先に来る", () => {
    const weak = w({ retention: 20, interval_days: 1 });
    const strong = w({ retention: 100, interval_days: 40 });
    expect(compareByMemory(weak, strong)).toBeLessThan(0);
    expect(compareByMemory(strong, weak)).toBeGreaterThan(0);
  });

  it("全部同じなら見出し語で決める（開くたびに順が変わらない）", () => {
    const a = w({ headword: "あ" });
    const b = w({ headword: "い" });
    expect(compareByMemory(a, b)).toBeLessThan(0);
    expect(compareByMemory(a, a)).toBe(0);
  });
});
