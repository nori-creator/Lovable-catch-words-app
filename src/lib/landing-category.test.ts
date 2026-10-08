import { describe, expect, it } from "vitest";
import { landingCategoryKey } from "./landing-category";
import { dexCategoryKey, dexItemFor } from "./dex-catalog";

describe("着地の受け口のカテゴリー（図鑑の節の鍵に揃える）", () => {
  it("語の分類の鍵（54）は、20のカテゴリーの代表の鍵へ直す", () => {
    // 野菜は果物と同じ3番。節の鍵は代表の `fruit`。
    expect(
      landingCategoryKey({ headword: "不在表裡的字", categoryKey: "vegetable", lang: "zh-TW" }),
    ).toBe("fruit");
    expect(
      landingCategoryKey({ headword: "不在表裡的字", categoryKey: "furniture", lang: "zh-TW" }),
    ).toBe("home");
  });

  it("表に在る見出し語は、図鑑と同じくその物のカテゴリー", () => {
    const item = dexItemFor("貓", "zh-TW")!;
    expect(landingCategoryKey({ headword: "貓", categoryKey: "food", lang: "zh-TW" })).toBe(
      dexCategoryKey(item.category),
    );
  });

  it("その人だけの新しい棚の鍵はそのまま（節の鍵そのもの）", () => {
    expect(
      landingCategoryKey({
        headword: "不在表裡的字",
        categoryKey: "vegetable",
        newShelfKey: "u_spice",
        lang: "zh-TW",
      }),
    ).toBe("u_spice");
  });

  it("既定の鍵の棚の提案は使わず、語の分類で決める（保存側が捨てる）", () => {
    expect(
      landingCategoryKey({
        headword: "不在表裡的字",
        categoryKey: "vegetable",
        newShelfKey: "drink",
        lang: "zh-TW",
      }),
    ).toBe("fruit");
  });

  it("手掛かりが何も無ければ null", () => {
    expect(landingCategoryKey({ headword: "", categoryKey: null, lang: "zh-TW" })).toBeNull();
  });
});

describe("キャッチの画面のつなぎ", () => {
  it("着地の受け口には図鑑の節の鍵を渡す", async () => {
    const { readFileSync } = await import("node:fs");
    const cap = readFileSync(
      new URL("../components/screens/CaptureScreen.tsx", import.meta.url),
      "utf8",
    );
    expect(cap).toMatch(/getDestinationCategory: \(\) =>\s*landingCategoryKey\(/);
    expect(cap).not.toMatch(
      /getDestinationCategory: \(\) => card\.new_shelf\?\.key \?\? card\.category_key/,
    );
  });
});
