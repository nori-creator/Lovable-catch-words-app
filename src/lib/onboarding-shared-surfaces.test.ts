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
  /**
   * **画面まるごと本物を使う**（オーナー指示 2026-09-29「チュートリアル勝手にアプリを
   * 再現するのではなく、アプリそのものを使って」「アプリ本体をアップデートしたら
   * 自動的に変化するように」）。部品だけ借りて並べ直すと、本物の画面に足した物
   * （ホームの本棚など）がチュートリアルに届かない。
   */
  it("the tour renders whole production screens, not re-assembled parts", () => {
    const home = components("components/onboarding/FirstCatchHome.tsx");
    expect(components("routes/_authenticated/home.tsx")).toContain("HomeSurface");
    expect(home).toContain("HomeSurface");
    for (const part of ["DayCollage", "DiaryDate", "HomeShelf", "PastDays", "DexAlbumGrid"])
      expect(home).not.toContain(part);
    const flow = components("components/onboarding/FirstCatchFlow.tsx");
    expect(components("routes/_authenticated/capture.tsx")).toContain("CaptureAnalyzingPanel");
    expect(flow).toContain("CaptureAnalyzingPanel");
    expect(flow).not.toContain("ScanEffect");
    expect(source("components/onboarding/FirstCatchFlow.tsx")).toMatch(/view=\{JUST_CAUGHT_VIEW\}/);
    // 案内の印は本物の部品の上に在る。チュートリアルが包み直すと並び方が変わる。
    expect(source("routes/_authenticated/review.tsx")).toMatch(/data-tour="review-question"/);
    expect(source("components/onboarding/FirstCatchPractice.tsx")).not.toMatch(
      /<div data-tour="review-question"/,
    );
  });
  it("first-run screens take the app's colour tokens, never their own", () => {
    const css = source("components/onboarding/first-catch.css");
    // 紙吹雪（飾りの多色）だけは固定色。それ以外に色を直書きすると、アプリの配色を
    // 変えても質問やログインの画面だけ取り残される。
    const outside = css.replace(/\.first-confetti[^{]*\{[^}]*\}/g, "");
    expect(outside).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(outside).not.toMatch(/:\s*(white|black)\s*;/);
    // アプリの色の名前を、ここで別の色に定義し直さない。
    expect(css).not.toMatch(
      /^\s*--(card|foreground|border|muted-foreground|primary|primary-ink|background):/m,
    );
  });
});
