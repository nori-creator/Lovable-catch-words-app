import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_CHOICE_RULES_JA,
  coerceCategoryKey,
  normalizeCategory,
  shareCategoryWithinGroups,
} from "./category";
import { dexCategoryForKey } from "./dex-catalog";

/**
 * 2026-10-15 オーナー報告: 花束が「その他」に入った（植物のはず）。本番の控えでは、写真の候補の分類が写真ごとに
 * まとめて "other" になっていた（花束の写真の 波斯菊・花瓶・木桌・木櫃、定規の写真の 尺・直尺・塑膠尺 …）。
 */
describe("花・花束は植物・花へ。写真ごとの「その他」を減らす", () => {
  it("花・花束・花の種類は flower（図鑑の 17 植物・花。plant と同じ棚）", () => {
    for (const h of [
      "花",
      "花束",
      "捧花",
      "波斯菊",
      "玫瑰",
      "滿天星",
      "向日葵",
      "菊花",
      "康乃馨",
      "繡球花",
    ]) {
      expect([h, normalizeCategory(h, "other")]).toEqual([h, "flower"]);
    }
    for (const h of ["盆栽", "仙人掌", "多肉", "樹"]) {
      expect([h, normalizeCategory(h, "other")]).toEqual([h, "plant"]);
    }
    expect(dexCategoryForKey("flower")).toBe(17);
    expect(dexCategoryForKey("plant")).toBe(17);
  });

  it("「〜花」でも花ではない物は花にしない（花瓶・拉花・豆花・爆米花・花椰菜）", () => {
    expect(normalizeCategory("花瓶", "other")).toBe("decoration");
    expect(normalizeCategory("花盆", "other")).toBe("decoration");
    expect(normalizeCategory("拉花", "flower")).toBe("drink");
    expect(normalizeCategory("豆花", "other")).toBe("dessert");
    expect(normalizeCategory("爆米花", "other")).toBe("dessert");
    expect(normalizeCategory("花椰菜", "other")).toBe("vegetable");
  });

  it("ケーキ・お菓子は dessert、料理は food（味・種類の名前でも）", () => {
    for (const h of ["蛋糕", "草莓蛋糕", "鮮奶油蛋糕", "起司蛋糕", "瑪德蓮蛋糕"]) {
      expect([h, normalizeCategory(h, "other")]).toEqual([h, "dessert"]);
    }
    expect(normalizeCategory("草莓", "other")).toBe("fruit");
    expect(normalizeCategory("滷肉飯", "other")).toBe("food");
  });

  it("本番で「その他」だった写真の候補", () => {
    const cases: Array<[string, string]> = [
      ["木桌", "furniture"],
      ["木櫃", "furniture"],
      ["四季豆", "vegetable"],
      ["青蔥", "vegetable"],
      ["充電線", "tech"],
      ["鏡頭", "tech"],
      ["水龍頭", "home"],
      ["地板", "home"],
      ["尺", "stationery"],
      ["直尺", "stationery"],
      ["塑膠尺", "stationery"],
      ["手帕", "accessory"],
      ["塑膠袋", "medicine"],
      ["指甲", "body"],
      ["拇指", "body"],
      ["腿毛", "body"],
      ["黏毛器", "tool"],
      ["船", "vehicle"],
      ["煙囪", "home"],
    ];
    for (const [h, key] of cases) expect([h, normalizeCategory(h, "other")]).toEqual([h, key]);
  });

  it("AI の答えた分類を鍵1つに読む（並び・番号・カテゴリーの名前・複数形）", () => {
    expect(coerceCategoryKey("home / furniture / decoration")).toBe("home");
    expect(coerceCategoryKey("plant|flower")).toBe("plant");
    expect(coerceCategoryKey('"flower", "plant"')).toBe("flower");
    expect(coerceCategoryKey("Flowers")).toBe("flower");
    expect(coerceCategoryKey("17")).toBe("plant");
    expect(coerceCategoryKey("6.")).toBe("home");
    expect(coerceCategoryKey("植物・花")).toBe("plant");
    expect(coerceCategoryKey("家電")).toBe("appliance");
    // 知らない物・部分一致は other（「服」で「服務」を服にしない）。
    expect(coerceCategoryKey("服務")).toBe("other");
    expect(coerceCategoryKey("electronics")).toBe("other");
    expect(coerceCategoryKey(undefined)).toBe("other");
    expect(coerceCategoryKey(17)).toBe("other");
  });

  it("同じ物の別の呼び方から分類を借りる", () => {
    expect(
      shareCategoryWithinGroups([
        { headword: "某種花", category_key: "other", group: 0 },
        { headword: "花", category_key: "flower", group: 0 },
        { headword: "某物", category_key: "other", group: 1 },
        { headword: "打った語", category_key: "other" },
      ]).map((c) => c.category_key),
    ).toEqual(["flower", "flower", "other", "other"]);
  });

  it("指示文: 花・花束は 17、鍵は1つだけ書く。カードのカテゴリのヒントに other を渡さない", () => {
    expect(CATEGORY_CHOICE_RULES_JA).toMatch(/花・花束・鉢植え・草木は種類の名前でも 17/);
    expect(CATEGORY_CHOICE_RULES_JA).toMatch(/鍵を1つだけ/);
    const ai = fs.readFileSync(path.join(__dirname, "ai.functions.ts"), "utf8");
    expect(ai).toMatch(/data\.hintCategory && data\.hintCategory !== "other"/);
    // 写真・カード・チュートリアル・分け直しの4つの形が、同じ読み直しを通る。
    for (const f of [
      "ai.functions.ts",
      "card-schema.ts",
      "first-catch-ai-schema.ts",
      "category-backfill.ts",
    ]) {
      const text = fs.readFileSync(path.join(__dirname, f), "utf8");
      expect([f, /\.transform\(\(v\) => coerceCategoryKey\(v\)\)/.test(text)]).toEqual([f, true]);
      expect([f, /category_key: z\.enum\(CATEGORY_KEYS\)/.test(text)]).toEqual([f, false]);
    }
  });
});
