import { describe, it, expect } from "vitest";
import { betaInterval, betaQuantile, lgamma, regularizedIncompleteBeta } from "./beta-stats";

/**
 * 数値の門。**既知の値と突き合わせる** — 「それらしい数」が出ているだけ
 * では、後で静かに壊れても気づけない。
 */

describe("lgamma", () => {
  it("整数の階乗と合う(Γ(n) = (n−1)!)", () => {
    expect(Math.exp(lgamma(1))).toBeCloseTo(1, 9);
    expect(Math.exp(lgamma(5))).toBeCloseTo(24, 6);
    expect(Math.exp(lgamma(10))).toBeCloseTo(362880, 1);
  });

  it("Γ(1/2) = √π", () => {
    expect(Math.exp(lgamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 9);
  });

  it("0 以下では NaN(黙って 0 を返さない)", () => {
    expect(Number.isNaN(lgamma(0))).toBe(true);
    expect(Number.isNaN(lgamma(-1))).toBe(true);
  });
});

describe("regularizedIncompleteBeta", () => {
  it("**一様分布と合う**(Beta(1,1) は I_x = x)", () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(regularizedIncompleteBeta(x, 1, 1)).toBeCloseTo(x, 9);
    }
  });

  it("Beta(2,1) は I_x = x²、Beta(1,2) は 1−(1−x)²", () => {
    expect(regularizedIncompleteBeta(0.5, 2, 1)).toBeCloseTo(0.25, 9);
    expect(regularizedIncompleteBeta(0.5, 1, 2)).toBeCloseTo(0.75, 9);
  });

  it("対称性: I_x(a,b) = 1 − I_{1−x}(b,a)", () => {
    for (const [x, a, b] of [
      [0.3, 2, 5],
      [0.7, 4, 3],
      [0.05, 0.5, 9],
    ] as const) {
      expect(regularizedIncompleteBeta(x, a, b)).toBeCloseTo(
        1 - regularizedIncompleteBeta(1 - x, b, a),
        9,
      );
    }
  });

  it("端は 0 と 1", () => {
    expect(regularizedIncompleteBeta(0, 3, 4)).toBe(0);
    expect(regularizedIncompleteBeta(1, 3, 4)).toBe(1);
  });

  it("**単調に増える**", () => {
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const v = regularizedIncompleteBeta(Math.min(x, 1), 3, 7);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("壊れた形では NaN", () => {
    expect(Number.isNaN(regularizedIncompleteBeta(0.5, 0, 2))).toBe(true);
    expect(Number.isNaN(regularizedIncompleteBeta(0.5, 2, -1))).toBe(true);
  });
});

describe("betaQuantile", () => {
  it("**分布関数の逆になっている**", () => {
    for (const [a, b] of [
      [1, 1],
      [2, 5],
      [8, 3],
      [0.5, 0.5],
    ] as const) {
      for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const x = betaQuantile(p, a, b);
        expect(regularizedIncompleteBeta(x, a, b)).toBeCloseTo(p, 6);
      }
    }
  });

  it("一様分布の分位点は p そのもの", () => {
    expect(betaQuantile(0.3, 1, 1)).toBeCloseTo(0.3, 8);
  });

  it("中央値は平均の近くにある(対称なら一致)", () => {
    expect(betaQuantile(0.5, 5, 5)).toBeCloseTo(0.5, 8);
  });

  it("端と壊れた形", () => {
    expect(betaQuantile(0, 2, 3)).toBe(0);
    expect(betaQuantile(1, 2, 3)).toBe(1);
    expect(Number.isNaN(betaQuantile(0.5, 0, 3))).toBe(true);
  });
});

describe("betaInterval", () => {
  it("**人が増えるほど区間は狭くなる**(これが「精密」の意味)", () => {
    const wide = betaInterval(2, 2);
    const narrow = betaInterval(200, 200);
    expect(narrow.hi - narrow.lo).toBeLessThan(wide.hi - wide.lo);
  });

  it("区間は平均を挟む", () => {
    const a = 6;
    const b = 14;
    const { lo, hi } = betaInterval(a, b);
    const mean = a / (a + b);
    expect(lo).toBeLessThan(mean);
    expect(hi).toBeGreaterThan(mean);
  });

  it("指定した幅ぶんの確率を含む", () => {
    const { lo, hi } = betaInterval(3, 9, 0.8);
    const inside = regularizedIncompleteBeta(hi, 3, 9) - regularizedIncompleteBeta(lo, 3, 9);
    expect(inside).toBeCloseTo(0.8, 4);
  });

  it("**壊れた形でも画面を壊さない**(0〜1 を返す)", () => {
    expect(betaInterval(0, 5)).toEqual({ lo: 0, hi: 1 });
    expect(betaInterval(Number.NaN, 5)).toEqual({ lo: 0, hi: 1 });
  });

  it("幅の指定が変でも端に寄せる", () => {
    expect(() => betaInterval(3, 3, Number.NaN)).not.toThrow();
    expect(() => betaInterval(3, 3, 5)).not.toThrow();
  });
});
