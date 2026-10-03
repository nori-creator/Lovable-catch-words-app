import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SAMPLE_PHOTO, offersSample, sampleFirstCatch } from "./first-catch-sample";
import { FirstCatchSchema, hasAddedCatch, type FirstCatch } from "./first-catch";
import { fitsReaderMeaning } from "./first-catch-meaning";
import { UI_LANGS } from "./i18n";
import { TARGET_LANGUAGES } from "./target-lang";

const base: FirstCatch = {
  version: 1,
  id: "00000000-0000-4000-8000-000000000010",
  uiLanguage: "zh-TW",
  targetLanguage: "en",
  dailyMinutes: 10,
  stage: "camera",
  photo: `data:image/jpeg;base64,${"A".repeat(200)}`,
  card: null,
  capturedAt: null,
};

describe("continue with a sample when photo analysis is unavailable", () => {
  it("builds a deterministic sample draft (no AI) that is never imported as the user's catch", () => {
    const draft = sampleFirstCatch(base, new Date("2026-10-03T00:00:00.000Z"));
    expect(FirstCatchSchema.parse(draft)).toBeTruthy();
    expect(draft).toMatchObject({
      sample: true,
      photo: SAMPLE_PHOTO,
      stage: "card",
      capturedAt: "2026-10-03T00:00:00.000Z",
    });
    expect(draft.card?.headword_zh).toBe("coffee");
    expect(draft.lesson?.senses.length).toBeGreaterThan(0);
    expect(hasAddedCatch({ ...draft, stage: "added" })).toBe(true);
  });

  const pairs = UI_LANGS.flatMap((ui) =>
    TARGET_LANGUAGES.filter((t) => t !== ui).map((t) => [ui, t] as const),
  );
  it.each(pairs)("sample meaning is in the display language (%s UI × %s target)", (ui, target) => {
    const draft = sampleFirstCatch({ ...base, uiLanguage: ui, targetLanguage: target });
    expect(fitsReaderMeaning(draft.card!.meaning_ja, ui)).toBe(true);
    expect(draft.card!.headword_zh).toBe({ "zh-TW": "咖啡", en: "coffee", ja: "コーヒー" }[target]);
  });

  it("offers the sample for every failure except device storage", () => {
    expect(offersSample("FIRST_CATCH_GUEST_UNAVAILABLE")).toBe(true);
    expect(offersSample("FIRST_CATCH_NETWORK")).toBe(true);
    expect(offersSample("FIRST_CATCH_ANALYSIS_TIMEOUT")).toBe(true);
    expect(offersSample("FIRST_CATCH_STORAGE")).toBe(false);
    expect(offersSample(null)).toBe(false);
  });

  it("the analysis error card offers the sample button (no dead end)", () => {
    const flow = readFileSync(
      resolve(__dirname, "../components/onboarding/FirstCatchFlow.tsx"),
      "utf8",
    );
    const errors = flow.slice(
      flow.indexOf("const errors = error && ("),
      flow.indexOf("const inlineError"),
    );
    expect(errors).toContain('t("first.useSample")');
    expect(errors).toContain("continueWithSample");
  });
});
