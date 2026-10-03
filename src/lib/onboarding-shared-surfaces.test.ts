import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { RING_GAP, TOUR_TIMING } from "@/components/onboarding/Spotlight";

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
    expect(components("components/screens/DexScreen.tsx")).toContain("DexSurface");
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
      "components/screens/ReviewScreen.tsx",
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
    expect(components("components/screens/HomeScreen.tsx")).toContain("HomeSurface");
    expect(home).toContain("HomeSurface");
    for (const part of ["DayCollage", "DiaryDate", "HomeShelf", "PastDays", "DexAlbumGrid"])
      expect(home).not.toContain(part);
    const flow = components("components/onboarding/FirstCatchFlow.tsx");
    expect(components("components/screens/CaptureScreen.tsx")).toContain("CaptureAnalyzingPanel");
    expect(flow).toContain("CaptureAnalyzingPanel");
    expect(flow).not.toContain("ScanEffect");
    expect(source("components/onboarding/FirstCatchFlow.tsx")).toMatch(/view=\{JUST_CAUGHT_VIEW\}/);
    // 案内の印は本物の部品の上に在る。チュートリアルが包み直すと並び方が変わる。
    expect(source("components/screens/ReviewScreen.tsx")).toMatch(/data-tour="review-question"/);
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

/**
 * 案内の枠とコマ割り（オーナー指示 2026-10-02「青の囲う枠をもう少し正確にして、時間を
 * コマ割りをしっかりして」）。数字は QA.md と CSS と同じでなければならない。
 */
describe("tutorial guide frame and beats", () => {
  const spot = source("components/onboarding/Spotlight.tsx");
  const css = source("components/onboarding/first-catch.css");
  const qa = readFileSync(new URL("../../QA.md", import.meta.url), "utf8");
  it("the beat durations in code, CSS and QA.md agree", () => {
    expect(TOUR_TIMING.screenHold).toBe(1000);
    expect(TOUR_TIMING.ringIn).toBe(700);
    expect(TOUR_TIMING.ringMove).toBe(480);
    expect(TOUR_TIMING.reducedHold).toBe(400);
    expect(qa).toMatch(/at least 1\.0 s/);
    expect(qa).toMatch(/over 700ms/);
    expect(qa).toMatch(/over 480ms/);
    expect(qa).toMatch(/0\.4 s/);
    expect(css).toMatch(/\.tour-ring--expand \{\s*animation: tour-focus-expand 700ms/);
    expect(css).toMatch(/\.tour-ring--move \{\s*transition:\s*top 480ms/);
    // 広がりは対象の真ん中から（画面の真ん中から飛んで来ない）。
    expect(css).toMatch(/top: calc\(var\(--ring-cy\) - 12px\)/);
  });
  it("the frame hugs the target with one even gap and concentric corners", () => {
    expect(RING_GAP).toBe(4);
    expect(spot).toMatch(/borderRadius: ringRadius\(box\.radii\)/);
    // 角ごとに足す（上だけ丸い答え合わせの面も、そのままの形で囲う）。
    expect(spot).toMatch(/radii\.map\(\(r\) => `\$\{r \+ RING_GAP\}px`\)/);
    expect(spot).toMatch(/cs\.borderBottomRightRadius/);
    // 札は iPhone の時計・切り欠きの下に置く。
    expect(spot).toMatch(/padding-top:env\(safe-area-inset-top\)/);
    expect(qa).toMatch(/4px outside on every side/);
  });
  it("text never shows before its frame: the phase belongs to one target", () => {
    expect(spot).toMatch(/stage\.for === target \? stage\.phase : "wait"/);
  });
  it("one frame per guide, around the control itself, and every coach shows its chapter", () => {
    expect(spot).not.toMatch(/tour-tap/);
    expect(css).not.toMatch(/\.tour-tap\b/);
    for (const path of [
      "components/onboarding/FirstCatchFlow.tsx",
      "components/onboarding/FirstCatchPractice.tsx",
    ]) {
      const code = source(path);
      const guides = code.match(/<Spotlight\b[\s\S]*?\/>/g) ?? [];
      expect(guides.length).toBeGreaterThan(0);
      for (const guide of guides) expect(guide).toMatch(/\bstep=/);
    }
    expect(source("components/onboarding/FirstCatchPractice.tsx")).not.toMatch(
      /target='\[data-tour="dex"\]'/,
    );
  });
  it("the real-app driver reads the gesture the guide asks for", () => {
    expect(spot).toMatch(/data-tour-gesture=/);
    const driver = readFileSync(new URL("../../e2e/real-app/run.mjs", import.meta.url), "utf8");
    expect(driver).toMatch(/getAttribute\("data-tour-gesture"\)/);
    expect(driver).toMatch(/ring\.gesture === "swipe"/);
    expect(driver).toMatch(/ring\.gesture === "peel"/);
  });
});

/** 2026-10-03 のオーナー指示（拼音・本棚・答え合わせの面・例文とチャンク・始まりと終わりの動き）。 */
describe("tutorial owner revisions 2026-10-03", () => {
  it("Home in the tutorial shows only the album (no 3D shelf flashing first)", () => {
    expect(source("components/screens/HomeScreen.tsx")).toMatch(
      /\{ready && shelf \? \(\s*<HomeShelf/,
    );
    expect(source("components/onboarding/FirstCatchHome.tsx")).toMatch(/shelf=\{false\}/);
  });
  it("the answer sheet is framed whole and its Next button pulses inside", () => {
    const practice = source("components/onboarding/FirstCatchPractice.tsx");
    expect(practice).toMatch(/'\[data-tour="review-answer"\] > div'/);
    expect(practice).toMatch(/primary=\{answerOpen && introduced \? '\[data-tour="review-next"\]'/);
    expect(source("components/onboarding/first-catch.css")).toMatch(/\.tour-primary \{/);
    const driver = readFileSync(new URL("../../e2e/real-app/run.mjs", import.meta.url), "utf8");
    expect(driver).toMatch(/getAttribute\("data-tour-primary"\)/);
  });
  it("the tutorial stores pinyin for Taiwan Mandarin only when nothing is stored", () => {
    const services = source("lib/first-catch-services.ts");
    expect(services).toMatch(/seedFirstCatchReading\(draft\);/);
    expect(services).toMatch(/seedReadingPrefNow\(ZH_TW_PROFILE, "pinyin"\)/);
    // 全員の既定は注音のまま（チュートリアルを通らない今までの人は変わらない）。
    expect(source("lib/target-profile.ts")).not.toMatch(/defaultReading: "pinyin"/);
    // 最初の描画の前に書く（子の読みが1コマ目から拼音）。
    expect(source("components/onboarding/FirstCatchFlow.tsx")).toMatch(
      /if \(initialDraft\) seedFirstCatchReading\(initialDraft\);/,
    );
  });
  it("the word-detail coach is one row at the bottom edge so the example and chunks show", () => {
    expect(source("components/onboarding/FirstCatchFlow.tsx")).toMatch(/alignTop\s+compact/);
    expect(source("components/onboarding/first-catch.css")).toMatch(/\.tour-coach--compact \{/);
  });
  it("a local (pre-signup) word never waits for the shared explanation, so chunks show", () => {
    expect(source("components/StickerSheet.tsx")).toMatch(
      /explanationPending=\{!local && explanation === undefined\}/,
    );
  });
  it("the start and end screens animate with transform/opacity and settle on the final frame", () => {
    const css = source("components/onboarding/first-catch.css");
    for (const name of ["first-rise-in", "first-pop-in", "first-confetti-burst", "first-badge-pop"])
      expect(css).toMatch(new RegExp(`@keyframes ${name} \\{\\s*from \\{`));
    expect(css).toMatch(/html\[data-motion="reduce"\] \.first-standalone \*/);
    const flow = source("components/onboarding/FirstCatchFlow.tsx");
    expect(flow).toMatch(/className="first-standalone first-ready first-complete"/);
    expect(flow).toMatch(/className="first-complete-badge"/);
  });
});
