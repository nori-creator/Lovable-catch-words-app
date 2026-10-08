import { describe, expect, it } from "vitest";
import { findLandingTarget, landingBoxFor, landingTargetSelectors } from "./landing-target";

/** 見えている要素の一覧を、探し方として渡す（DOM を使わずに試す）。 */
function finder(present: Record<string, string>) {
  return (selector: string) => present[selector] ?? null;
}

describe("キャッチの絵の着地先", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("まずその札のマス目（#dex-cell-<id> の約束はそのまま）", () => {
    const sel = landingTargetSelectors({ id, categoryKey: "animal", fallback: true });
    expect(sel[0]).toEqual({ kind: "cell", selector: `[id="dex-cell-${id}"]` });
    const got = findLandingTarget(
      finder({ [`[id="dex-cell-${id}"]`]: "cell", '[data-nav="/dex"]': "tab" }),
      { id, categoryKey: "animal", fallback: true },
    );
    expect(got).toEqual({ el: "cell", kind: "cell" });
  });

  it("マス目が無ければ同じ札の行（リスト表示）", () => {
    const got = findLandingTarget(finder({ [`[data-dex-item="${id}"]`]: "row" }), {
      id,
      fallback: false,
    });
    expect(got?.kind).toBe("item");
  });

  it("待つ間（fallback 偽）は、カテゴリーやタブへ先に降ろさない", () => {
    const present = {
      '[data-dex-cat="animal"] .dex-cat__head': "head",
      '[data-nav="/dex"]': "tab",
    };
    expect(
      findLandingTarget(finder(present), { id, categoryKey: "animal", fallback: false }),
    ).toBeNull();
    expect(
      findLandingTarget(finder(present), { id, categoryKey: "animal", fallback: true }),
    ).toEqual({ el: "head", kind: "category" });
  });

  it("カテゴリーも無ければ図鑑のタブ", () => {
    const got = findLandingTarget(finder({ '[data-nav="/dex"]': "tab" }), {
      id,
      categoryKey: "animal",
      fallback: true,
    });
    expect(got?.kind).toBe("tab");
  });

  it("鍵の引用符は逃がす（壊れた選び方にしない）", () => {
    const sel = landingTargetSelectors({ categoryKey: 'a"b', fallback: true });
    expect(sel.some((s) => s.selector.includes('[data-dex-cat="a\\"b"]'))).toBe(true);
  });

  it("見出し・タブには正方形で降ろす（横長に潰さない）", () => {
    const head = landingBoxFor("category", { left: 16, top: 100, width: 300, height: 24 });
    expect(head.width).toBe(head.height);
    expect(head.left).toBe(16);
    expect(head.top + head.height / 2).toBe(112);
    const cell = { left: 1, top: 2, width: 90, height: 90 };
    expect(landingBoxFor("cell", cell)).toBe(cell);
    const tab = landingBoxFor("tab", { left: 100, top: 700, width: 60, height: 40 });
    expect(tab.left + tab.width / 2).toBe(130);
  });
});
