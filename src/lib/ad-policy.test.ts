import { describe, expect, it } from "vitest";
import { DEFAULT_AD_CONFIG, decideInterstitial, nativeSlots, normalizeAdConfig } from "./ad-policy";

const on = { ...DEFAULT_AD_CONFIG, enabled: true };
const day = 86400000;
const base = {
  cfg: on,
  isPro: false,
  installedAt: 0,
  now: 10 * day,
  history: { lastShownAt: null, shownToday: 0, batchesSinceLast: 2 },
};

describe("広告を出すかどうか", () => {
  it("既定はオフ（開発者が入れるまで出ない）", () => {
    expect(normalizeAdConfig(null).enabled).toBe(false);
    expect(
      decideInterstitial({ ...base, cfg: DEFAULT_AD_CONFIG, moment: "review_batch_end" }),
    ).toEqual({
      show: false,
      reason: "off",
    });
  });

  it("復習の束を3回終えた区切りで1回", () => {
    expect(decideInterstitial({ ...base, moment: "review_batch_end" })).toEqual({
      show: true,
      format: "interstitial",
    });
    expect(
      decideInterstitial({
        ...base,
        moment: "review_batch_end",
        history: { ...base.history, batchesSinceLast: 1 },
      }),
    ).toEqual({ show: false, reason: "not_yet" });
  });

  it("撮る・スキャン・保存・開いた瞬間・初回の案内には出さない", () => {
    for (const moment of ["capture", "scan", "catch_saved", "app_open", "onboarding"] as const)
      expect(decideInterstitial({ ...base, moment }).show).toBe(false);
  });

  it("Pro・使い始めの3日・前回から10分以内・1日の上限では出さない", () => {
    expect(decideInterstitial({ ...base, moment: "review_batch_end", isPro: true })).toMatchObject({
      reason: "pro",
    });
    expect(decideInterstitial({ ...base, moment: "review_batch_end", now: 2 * day })).toMatchObject(
      { reason: "grace" },
    );
    expect(
      decideInterstitial({
        ...base,
        moment: "review_batch_end",
        history: { lastShownAt: base.now - 5 * 60000, shownToday: 1, batchesSinceLast: 5 },
      }),
    ).toMatchObject({ reason: "too_soon" });
    expect(
      decideInterstitial({
        ...base,
        moment: "review_batch_end",
        history: { lastShownAt: null, shownToday: 3, batchesSinceLast: 5 },
      }),
    ).toMatchObject({ reason: "daily_cap" });
  });

  it("図鑑の一覧: 12枚ごとに1枠、最初の8枚の中と一番下には置かない", () => {
    expect(nativeSlots(40, on, false)).toEqual([11, 23, 35]);
    expect(nativeSlots(8, on, false)).toEqual([]);
    expect(nativeSlots(40, on, true)).toEqual([]);
  });

  it("おかしな数は既定に戻す", () => {
    expect(normalizeAdConfig({ enabled: true, maxPerDay: -1, nativeEvery: 2 })).toMatchObject({
      enabled: true,
      maxPerDay: 3,
      nativeEvery: 12,
    });
  });
});
