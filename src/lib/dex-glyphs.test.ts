import { describe, expect, it } from "vitest";
import { DEX_CATEGORIES, DEX_ITEMS } from "./dex-catalog";
import { DEX_GLYPHS, DEX_GLYPH_SHARED } from "./dex-glyphs";
import { DEX_SIL_SHAPES } from "./dex-silhouettes.generated";

/**
 * **図鑑の影の絵**（オーナー指示 2026-10-08「図鑑の影のクオリティーが低い」）。
 * 前は 鳥・鴿子・麻雀 が同じ鳥の絵だった。項目ごとに絵があり、同じカテゴリーの中で
 * 重ならないことを確かめる。
 */
describe("影の絵の表", () => {
  it("379 の項目すべてに絵がある", () => {
    expect(DEX_ITEMS).toHaveLength(379);
    const missing = DEX_ITEMS.filter((it) => !DEX_GLYPHS[it.id]).map((it) => it.id);
    expect(missing).toEqual([]);
  });

  it("表の id は図鑑に在る物だけ（消した項目の行が残っていない）", () => {
    const ids = new Set(DEX_ITEMS.map((it) => it.id));
    expect(Object.keys(DEX_GLYPHS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("どの絵も形が作ってある（`scripts/dex-silhouettes/build.ts` を回し忘れていない）", () => {
    const noShape = [...new Set(Object.values(DEX_GLYPHS))].filter((r) => !DEX_SIL_SHAPES[r]);
    expect(noShape).toEqual([]);
  });

  it("使っていない形を持ち込まない（荷物を増やさない）", () => {
    const used = new Set(Object.values(DEX_GLYPHS));
    expect(Object.keys(DEX_SIL_SHAPES).filter((r) => !used.has(r as never))).toEqual([]);
  });

  it("形は正方形の viewBox と、空でない d", () => {
    for (const [ref, [vb, d]] of Object.entries(DEX_SIL_SHAPES)) {
      const [, , w, h] = vb.split(" ").map(Number);
      expect(w, ref).toBeGreaterThan(0);
      expect(w, ref).toBe(h);
      expect(d.length, ref).toBeGreaterThan(10);
      expect(d[0], ref).toMatch(/[Mm]/);
    }
  });

  it("同じカテゴリーの中では別の絵（わざと同じ物は DEX_GLYPH_SHARED に理由つき）", () => {
    const allowed = new Set(DEX_GLYPH_SHARED.map(([a, b]) => [a, b].sort().join("+")));
    const dupes: string[] = [];
    for (const c of DEX_CATEGORIES) {
      const byRef = new Map<string, string[]>();
      for (const it of c.items) {
        const ref = DEX_GLYPHS[it.id];
        byRef.set(ref, [...(byRef.get(ref) ?? []), it.id]);
      }
      for (const [ref, ids] of byRef) {
        if (ids.length < 2) continue;
        const key = [...ids].sort().join("+");
        if (!allowed.has(key)) dupes.push(`${c.no}: ${ids.join(", ")} → ${ref}`);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("DEX_GLYPH_SHARED の組は、本当に同じカテゴリーの同じ絵", () => {
    for (const [a, b] of DEX_GLYPH_SHARED) {
      const ia = DEX_ITEMS.find((it) => it.id === a)!;
      const ib = DEX_ITEMS.find((it) => it.id === b)!;
      expect(ia.category).toBe(ib.category);
      expect(DEX_GLYPHS[a]).toBe(DEX_GLYPHS[b]);
    }
  });

  it("鳥・鴿子・麻雀は別の絵（オーナーの画面で同じだった）", () => {
    const refs = ["bird", "pigeon", "sparrow"].map((id) => DEX_GLYPHS[id]);
    expect(new Set(refs).size).toBe(3);
  });
});
