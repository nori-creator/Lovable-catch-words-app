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
