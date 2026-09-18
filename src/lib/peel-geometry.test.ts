import { describe, expect, it } from "vitest";
import { peelGeometry } from "./peel-geometry";
const area = (s: string) => {
  const pts = s
    .split(" ")
    .filter(Boolean)
    .map((p) => p.split(",").map(Number));
  return (
    Math.abs(
      pts.reduce((sum, a, i) => {
        const b = pts[(i + 1) % pts.length];
        return sum + a[0] * b[1] - a[1] * b[0];
      }, 0),
    ) / 2
  );
};
describe("peel silhouette in every drag direction", () => {
  for (let i = 0; i < 8; i++)
    it(`covers and reflects direction ${i * 45} degrees`, () => {
      const angle = (i * Math.PI) / 4;
      expect(area(peelGeometry(0, angle).front)).toBeCloseTo(360 * 360);
      expect(area(peelGeometry(1, angle).front)).toBeCloseTo(0);
      for (const p of [0.2, 0.5, 0.8]) {
        const g = peelGeometry(p, angle);
        expect(area(g.front) + area(g.fold)).toBeCloseTo(360 * 360);
        const [a, b, c, d, e, f] = g.matrix.slice(7, -1).split(" ").map(Number);
        const reflect = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
        const [x, y] = reflect(90, 200);
        const back = reflect(x, y);
        expect(back[0]).toBeCloseTo(90);
        expect(back[1]).toBeCloseTo(200);
      }
    });
});
