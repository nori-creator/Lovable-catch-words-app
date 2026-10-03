import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **最初に読む JS を太らせない約束**（2026-10-03 監査「最初の画面の前に約 514KB gz」）。
 *
 * TanStack の分割は route の `component` しか後回しにしない。route のファイルが `Route`
 * 以外（画面の部品・関数・定数）を出していると、分割が効かず、その画面の中身が全部
 * 最初の塊（entry）に入る — ホーム・図鑑・撮影・復習・設定…がそうなっていた。
 * 画面の中身は `components/screens/*` に置き、route のファイルは `Route` だけを出す。
 */
const ROOT = path.resolve(__dirname, "..");
const routeFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });

describe("route のファイルは `Route` だけを出す", () => {
  const files = routeFiles(path.join(ROOT, "routes"));
  it("route のファイルがある", () => {
    expect(files.length).toBeGreaterThan(20);
  });
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    it(rel, () => {
      const src = fs.readFileSync(file, "utf8");
      const exported = [...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(\w+)\s+(\w+)/gm)]
        .map((m) => `${m[1]} ${m[2]}`)
        .filter(
          (e) => e !== "const Route" && !e.startsWith("type ") && !e.startsWith("interface "),
        );
      const reexports = /^export\s*\{/m.test(src) || /^export\s*\*/m.test(src);
      expect({ file: rel, exported, reexports }).toEqual({
        file: rel,
        exported: [],
        reexports: false,
      });
    });
  }
});

describe("ウェルカム画面が最初に読む物に zod を入れない", () => {
  it("`first-catch-images.ts`（/welcome の head が読む）は zod を読む所を通らない", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/first-catch-images.ts"), "utf8");
    expect(src).not.toMatch(/from "@\/lib\/learning-preferences"/);
    const opts = fs.readFileSync(path.join(ROOT, "lib/learning-preference-options.ts"), "utf8");
    expect(opts).not.toMatch(/^import /m);
  });

  it("チュートリアルの2画面目から先の重い部品は後から読む（`first-catch-lazy.tsx`）", () => {
    const flow = fs.readFileSync(
      path.join(ROOT, "components/onboarding/FirstCatchFlow.tsx"),
      "utf8",
    );
    for (const heavy of [
      "@/components/screens/CaptureScreen",
      "@/components/screens/DexScreen",
      "@/components/StickerSheet",
      "@/components/CatchLanding",
      "./FirstCatchHome",
      "./FirstCatchPractice",
      "./TutorialSettings",
    ])
      expect(flow).not.toContain(`from "${heavy}"`);
    // 最初の画面の部品（ウェルカム・質問）も、ホームや設定の画面を読まない。
    const pages = fs.readFileSync(
      path.join(ROOT, "components/onboarding/FirstCatchPages.tsx"),
      "utf8",
    );
    expect(pages).not.toContain('from "./FirstCatchHome"');
  });
});
