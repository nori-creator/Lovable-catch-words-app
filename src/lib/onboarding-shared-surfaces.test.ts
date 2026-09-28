import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function components(path: string) {
  const ast = ts.createSourceFile(
    path,
    source(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const names = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      names.add(node.tagName.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return names;
}

describe("first-catch rendering boundary", () => {
  it("routes and the tour render the same frame and navigation", () => {
    for (const path of ["components/AppShell.tsx", "components/onboarding/FirstCatchHome.tsx"]) {
      expect(components(path)).toContain("AppShellFrame");
      expect(components(path)).toContain("AppNavigation");
    }
    expect(components("components/onboarding/FirstCatchHome.tsx")).not.toContain("TabBar");
  });
  it("collection view dispatch belongs only to the app surface", () => {
    expect(components("routes/_authenticated/dex.tsx")).toContain("DexSurface");
    const tour = components("components/onboarding/FirstCatchPractice.tsx");
    expect(tour).toContain("DexSurface");
    for (const clone of ["DexCoverFlow", "DexAlbumGrid", "DexDayMap", "DexList", "DexHeader"])
      expect(tour).not.toContain(clone);
  });
  it("capture, detail and review cannot be replaced by tour-only card markup", () => {
    const flow = components("components/onboarding/FirstCatchFlow.tsx");
    for (const shared of [
      "CaptureObjectPanel",
      "CaptureCardPanel",
      "PickWordPanel",
      "StickerSheet",
      "CatchLandingOverlay",
    ])
      expect(flow).toContain(shared);
    expect(flow).not.toContain("WordCard");
    expect(flow).not.toContain("PeelSticker");
    for (const path of [
      "routes/_authenticated/review.tsx",
      "components/onboarding/FirstCatchPractice.tsx",
    ])
      expect(components(path)).toContain("ReviewQuestion");
  });
  it("guide CSS cannot resize or restyle app surface internals", () => {
    const css = source("components/onboarding/first-catch.css");
    expect(css).not.toMatch(/\.first-[\w-]+[^{}]*\.(?:dex-cf__\w+|collage|quiz-photo)[^{}]*\{/);
    expect(css).not.toMatch(/\[data-tour=[^\]]+\][^{]*\{[^}]*max-height/);
  });
});
