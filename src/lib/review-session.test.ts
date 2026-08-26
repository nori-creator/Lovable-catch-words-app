import { describe, it, expect } from "vitest";
import { batchKey, readMark, writeMark, EMPTY_MARK } from "./review-session";

/**
 * オーナー報告 2026-08-26:
 * > 「一度問題を表示したら別のページに移っても、問題はそのままにして。」
 *
 * ここが守るのは1つ: **同じ束なら続きから、違う束なら最初から。**
 */

class Mem {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const cards = (...ids: string[]) => ids.map((review_id) => ({ review_id }));

describe("batchKey", () => {
  it("**空の束は目印を持たない**（次に本物が来たとき誤って続けない）", () => {
    expect(batchKey([], null)).toBeNull();
    expect(batchKey(null, null)).toBeNull();
    expect(batchKey(undefined, null)).toBeNull();
  });

  it("同じ並びなら同じ目印", () => {
    expect(batchKey(cards("a", "b", "c"), null)).toBe(batchKey(cards("a", "b", "c"), null));
  });

  it("**枚数が違えば別の束**（採点して読み直した後）", () => {
    expect(batchKey(cards("a", "b", "c"), null)).not.toBe(batchKey(cards("a", "b"), null));
  });

  it("**先頭が違えば別の束**", () => {
    expect(batchKey(cards("a", "b"), null)).not.toBe(batchKey(cards("z", "b"), null));
  });

  it("**名指しの1枚は別の束**（場所の知らせから来たとき）", () => {
    expect(batchKey(cards("a", "b"), null)).not.toBe(batchKey(cards("a", "b"), "st1"));
  });
});

describe("readMark / writeMark", () => {
  it("**同じ束なら続きから出す**（報告の本体）", () => {
    const s = new Mem();
    const b = batchKey(cards("a", "b", "c"), null)!;
    writeMark(b, { idx: 2, answered: 2, correct: 1 }, s);
    expect(readMark(b, s)).toEqual({ idx: 2, answered: 2, correct: 1 });
  });

  it("**別の束なら最初から**（別の束の3枚目から始めない）", () => {
    const s = new Mem();
    writeMark(batchKey(cards("a", "b", "c"), null), { idx: 2, answered: 2, correct: 1 }, s);
    expect(readMark(batchKey(cards("z", "y"), null), s)).toEqual(EMPTY_MARK);
  });

  it("目印が無ければ最初から", () => {
    const s = new Mem();
    expect(readMark(null, s)).toEqual(EMPTY_MARK);
  });

  it("`null` を書くと憶えた続きを捨てる（「もう一度」）", () => {
    const s = new Mem();
    const b = batchKey(cards("a", "b"), null)!;
    writeMark(b, { idx: 1, answered: 1, correct: 1 }, s);
    writeMark(null, EMPTY_MARK, s);
    expect(readMark(b, s)).toEqual(EMPTY_MARK);
  });

  it("壊れた値・変な値でも落ちない（最初から出す）", () => {
    const s = new Mem();
    s.setItem("review-session-v1", "{{{");
    expect(readMark("x", s)).toEqual(EMPTY_MARK);
    s.setItem("review-session-v1", JSON.stringify({ batch: "x", idx: -3, answered: "z" }));
    expect(readMark("x", s)).toEqual(EMPTY_MARK);
  });
});
