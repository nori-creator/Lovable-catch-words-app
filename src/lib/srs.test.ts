import { describe, it, expect } from "vitest";
import { nextSrs, retentionNow, stabilityOf, modeFor, MIN_EASE, type SrsState } from "./srs";

/**
 * 復習の間隔の計算。
 *
 * ## なぜここから始めたか
 * このアプリで**間違えても誰も気づかない**計算がここ。画面が壊れれば
 * 見て分かるが、間隔の計算が狂っても「なんとなく復習が多い/来ない」に
 * しかならない。気づいたときには、その人の学習が何ヶ月ぶん歪んでいる。
 */

const fresh: SrsState = { ease: 2.5, interval_days: 0, repetitions: 0 };

describe("nextSrs", () => {
  it("正解を重ねると 1日 → 3日 → ease倍 と伸びる", () => {
    const a = nextSrs(fresh, 5);
    expect(a).toMatchObject({ repetitions: 1, interval_days: 1 });

    const b = nextSrs(a, 5);
    expect(b).toMatchObject({ repetitions: 2, interval_days: 3 });

    const c = nextSrs(b, 5);
    expect(c.repetitions).toBe(3);
    // 3日 × そのときの ease(満点で少し上がっている)を四捨五入
    expect(c.interval_days).toBe(Math.round(3 * b.ease));
    expect(c.interval_days).toBeGreaterThan(3);
  });

  it("思い出せなかったら明日また出す(連続回数は捨てる)", () => {
    let s = nextSrs(fresh, 5);
    s = nextSrs(s, 5);
    s = nextSrs(s, 5);
    expect(s.interval_days).toBeGreaterThan(3);

    const lapsed = nextSrs(s, 1);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.interval_days).toBe(1);
  });

  it("失敗しても ease は削らない", () => {
    // 削ると、一度つまずいた語が二度と間隔を伸ばせなくなる。
    const s = nextSrs(fresh, 0);
    expect(s.ease).toBe(fresh.ease);
  });

  it("ぎりぎりの正解(3)でも間隔は進み、ease は下がる", () => {
    const a = nextSrs(fresh, 3);
    expect(a.repetitions).toBe(1);
    expect(a.ease).toBeLessThan(fresh.ease);
  });

  it("ease は 1.3 を下回らない", () => {
    // ここが効かないと間隔が縮み続け、同じ語が毎日出て復習が終わらなくなる。
    let s: SrsState = { ease: 1.35, interval_days: 10, repetitions: 5 };
    for (let i = 0; i < 50; i++) s = nextSrs(s, 3);
    expect(s.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it("渡された状態を書き換えない", () => {
    const before = { ...fresh };
    nextSrs(fresh, 5);
    expect(fresh).toEqual(before);
  });
});

describe("retentionNow", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 0, 10);

  it("起点が分からないときは100%", () => {
    expect(retentionNow(3, 2.5, null, now)).toBe(100);
  });

  it("まだ時間が経っていなければ100%", () => {
    expect(retentionNow(3, 2.5, now, now)).toBe(100);
    // 端末の時計がずれて未来を指しても100%を超えない
    expect(retentionNow(3, 2.5, now + DAY, now)).toBe(100);
  });

  it("時間が経つほど下がり、0を下回らない", () => {
    const d1 = retentionNow(3, 2.5, now - DAY, now);
    const d7 = retentionNow(3, 2.5, now - 7 * DAY, now);
    expect(d1).toBeGreaterThan(d7);
    expect(retentionNow(3, 2.5, now - 3650 * DAY, now)).toBeGreaterThanOrEqual(0);
  });

  it("キャッチ直後の語が数時間で「忘れかけ」に落ちない", () => {
    // 未復習カードは interval_days=0。下限を持ち上げていないと、安定度が
    // 0.5日になって半日で50%を割る — 表示と実感が食い違う不具合だった。
    const halfDay = retentionNow(0, 2.5, now - DAY / 2, now);
    expect(halfDay).toBeGreaterThan(80);
  });
});

describe("stabilityOf", () => {
  it("未復習(interval 0)でも 1日 × ease ぶんは持つ", () => {
    expect(stabilityOf(0, 2.5)).toBe(2.5);
  });
  it("ease が 1 未満でも安定度を縮めない", () => {
    expect(stabilityOf(10, 0.2)).toBe(10);
  });
});

describe("modeFor", () => {
  it("回を重ねるほど難しい形式へ上がる", () => {
    expect(modeFor(0)).toBe("recognition");
    expect(modeFor(1)).toBe("recognition");
    expect(modeFor(2)).toBe("listening");
    expect(modeFor(3)).toBe("listening");
    expect(modeFor(4)).toBe("reverse");
    expect(modeFor(5)).toBe("reverse");
    expect(modeFor(6)).toBe("production");
    expect(modeFor(999)).toBe("production");
  });
});

/**
 * **原典の SM-2 と一致していなければならない所**（点検 2026-09-15）。
 *
 * 間隔の計算は狂っても画面には出ない。「なんとなく復習が多い/来ない」に
 * しかならず、気づいたときにはその人の学習が何ヶ月ぶんか歪んでいる。
 * だから**出典と一致する所は、一致したまま動かないように留めておく**。
 */
describe("SM-2 の原典との一致（動かしてはいけない所）", () => {
  it("EF の更新式が原典どおり", () => {
    // EF' = EF + (0.1 − (5−q)(0.08 + (5−q)0.02))
    const ef = (prev: number, q: number) => prev + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    for (const q of [3, 4, 5]) {
      const got = nextSrs({ ease: 2.5, interval_days: 10, repetitions: 5 }, q).ease;
      expect([q, Number(got.toFixed(10))]).toEqual([q, Number(ef(2.5, q).toFixed(10))]);
    }
    // 満点は +0.10、4 は ±0、3 は −0.14（原典の値）。
    expect(Number(ef(2.5, 5).toFixed(2))).toBe(2.6);
    expect(Number(ef(2.5, 4).toFixed(2))).toBe(2.5);
    expect(Number(ef(2.5, 3).toFixed(2))).toBe(2.36);
  });

  it("EF の下限は 1.3", () => {
    expect(MIN_EASE).toBe(1.3);
  });

  it("失敗したら 連続回数0・間隔1日・EF は据え置き", () => {
    const before = { ease: 2.1, interval_days: 40, repetitions: 7 };
    for (const q of [0, 1, 2]) {
      const after = nextSrs(before, q);
      expect([q, after.repetitions, after.interval_days, after.ease]).toEqual([q, 0, 1, 2.1]);
    }
  });

  it("3回目以降は 前の間隔 × ease（四捨五入）", () => {
    const s = { ease: 2.5, interval_days: 6, repetitions: 2 };
    expect(nextSrs(s, 4).interval_days).toBe(Math.round(6 * 2.5));
  });

  /**
   * **2回目だけ原典と違う（原典 6日、ここは 3日）。**
   * 意図して短くしたもの。うっかり戻したり、うっかり別の数に変えたりを
   * 見つけるために留めておく。変えるなら、ここも一緒に変えること。
   */
  it("2回目の間隔は 3日（原典の 6日を意図して短くしている）", () => {
    const a = nextSrs({ ease: 2.5, interval_days: 0, repetitions: 0 }, 5);
    const b = nextSrs(a, 5);
    expect(b.interval_days).toBe(3);
  });

  /**
   * **出題日の定着度は ease だけで決まる（間隔によらない）。**
   *
   * `S = 間隔 × ease` と置いている以上、`R(出題日) = exp(−1/ease)` になる。
   * ease 2.5 なら 67%。狙いを 90% に変えるなら `stabilityOf` を直すしかない
   * ので、いまの値をここに留めておく（変えたらここが落ちる）。
   */
  it("いまの式では、出題日の定着度が 67% になる（狙いの 90% ではない）", () => {
    for (const interval of [1, 3, 7, 30, 90]) {
      const s = stabilityOf(interval, 2.5);
      const r = 100 * Math.exp(-interval / s);
      expect([interval, Math.round(r)]).toEqual([interval, 67]);
    }
  });
});
