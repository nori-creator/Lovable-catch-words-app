import { describe, expect, it } from "vitest";
import { clipRect, constrainCorner, curlGeometry } from "./page-curl";

const W = 300;
const H = 400;
const apply = (m: number[], p: { x: number; y: number }) => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

describe("page-curl — 角を引いて折る形", () => {
  it("折り返した角は、引いた指の所に来る", () => {
    const C0 = { x: W, y: 0 };
    const P = { x: 180, y: 60 };
    const g = curlGeometry(C0, P, W, H)!;
    const q = apply(g.matrix, C0);
    expect(q.x).toBeCloseTo(P.x, 6);
    expect(q.y).toBeCloseTo(P.y, 6);
  });

  it("平らな部分と折れた部分で紙の面積が合う", () => {
    const g = curlGeometry({ x: W, y: H }, { x: 120, y: 300 }, W, H)!;
    const area = (pts: { x: number; y: number }[]) =>
      Math.abs(
        pts.reduce((s, p, i) => {
          const q = pts[(i + 1) % pts.length];
          return s + p.x * q.y - q.x * p.y;
        }, 0),
      ) / 2;
    expect(area(g.flat) + area(g.lifted)).toBeCloseTo(W * H, 3);
  });

  it("背から紙が外れない（角は背の角から W より遠くへ行かない）", () => {
    const q = constrainCorner({ x: -900, y: -200 }, { x: W, y: 0 }, W, H);
    expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(W + 1e-6);
  });

  it("めくり切ると折り目は背（x=0）になる", () => {
    const g = curlGeometry({ x: W, y: 0 }, { x: -W, y: 0 }, W, H)!;
    expect(g.mid.x).toBeCloseTo(0, 6);
    // 平らに残る部分は面積 0（背の線だけ）。
    const flat = clipRect(W, H, g.n, g.mid);
    expect(flat.every((p) => Math.abs(p.x) < 1e-6)).toBe(true);
  });
});
