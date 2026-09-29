import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 手書きの字体は、**差し替えずに初めから正しい字体で出す**（オーナー報告
 * 2026-09-27「ホームの白紙のアルバムの文字の字体が、ページを開くと変わる」）。
 */
describe("手書きの字体が目の前で入れ替わらない", () => {
  it("Zen Kurenaido の切り分けは全部 font-display: block", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const faces = [
      ...css.matchAll(/@font-face \{\n {2}font-family: "Zen Kurenaido";[^}]*?\}/g),
    ].map((m) => m[0]);
    expect(faces.length).toBeGreaterThan(100);
    for (const f of faces) expect(f).toMatch(/font-display: block;/);
  });
});
