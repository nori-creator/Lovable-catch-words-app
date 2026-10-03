import { describe, expect, it } from "vitest";
import {
  DEFAULT_AD_CONFIG,
  decideInterstitial,
  diarySlots,
  nativeSlots,
  normalizeAdConfig,
  normalizePublisherId,
  normalizeSlotId,
  rewardedAvailable,
} from "./ad-policy";

/** 場所ごとのオン・オフ（オーナー指示 2026-09-28「あとからどこに広告つけるか変更できるように」）。 */
describe("広告の場所は後から変えられる", () => {
  const on2 = { ...DEFAULT_AD_CONFIG, enabled: true };
  const b = {
    cfg: on2,
    isPro: false,
    installedAt: 0,
    now: 10 * 86400000,
    history: { lastShownAt: null, shownToday: 0, batchesSinceLast: 2 },
  };

  it("既定: 復習の区切り・図鑑・日記・ごほうびはオン、捕まえた後はオフ、サブスクはオフ", () => {
    expect(normalizeAdConfig({ enabled: true })).toMatchObject({
      reviewEndEnabled: true,
      dexNativeEnabled: true,
      diaryNativeEnabled: true,
      rewardedEnabled: true,
      afterCatchEnabled: false,
      subscriptionEnabled: false,
    });
    expect(decideInterstitial({ ...b, moment: "catch_done" })).toMatchObject({
      reason: "never_here",
    });
  });

  it("捕まえた後をオンにすると、決めた回数ごとに1回", () => {
    const cfg = { ...on2, afterCatchEnabled: true, catchesPerInterstitial: 5 };
    const h = { ...b.history, catchesSinceLast: 4 };
    expect(decideInterstitial({ ...b, cfg, moment: "catch_done", history: h }).show).toBe(true);
    expect(
      decideInterstitial({
        ...b,
        cfg,
        moment: "catch_done",
        history: { ...h, catchesSinceLast: 2 },
      }),
    ).toMatchObject({ reason: "not_yet" });
  });

  it("復習の区切りを切ると、そこには出ない", () => {
    expect(
      decideInterstitial({
        ...b,
        cfg: { ...on2, reviewEndEnabled: false },
        moment: "review_batch_end",
      }),
    ).toMatchObject({ reason: "never_here" });
  });

  it("日記は5日ごと・最初の2日と一番下には置かない", () => {
    expect(diarySlots(12, on2, false)).toEqual([4, 9]);
    expect(diarySlots(2, on2, false)).toEqual([]);
    expect(diarySlots(12, { ...on2, diaryNativeEnabled: false }, false)).toEqual([]);
    expect(diarySlots(12, on2, true)).toEqual([]);
  });

  it("図鑑の札の形を切ると一覧に出ない。ごほうびは Pro には出さない", () => {
    expect(nativeSlots(40, { ...on2, dexNativeEnabled: false }, false)).toEqual([]);
    expect(rewardedAvailable(on2, false)).toBe(true);
    expect(rewardedAvailable(on2, true)).toBe(false);
  });
});

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

/** Web 版の広告（AdSense）の番号（2026-10-03「アプリ内の広告が動く 機能するようにしたい。」）。 */
describe("AdSense の番号の確かめ", () => {
  it("既定は空（= まだ用意していない）で、広告もオフ", () => {
    expect(normalizeAdConfig(null)).toMatchObject({
      enabled: false,
      adsensePublisherId: "",
      slotDexInFeed: "",
      slotDiaryInFeed: "",
      slotReviewEnd: "",
    });
  });

  it("運営者 ID は ca-pub- と数字だけ。pub-… で貼っても直す。前後の空白は削る", () => {
    expect(normalizePublisherId("ca-pub-1234567890123456")).toBe("ca-pub-1234567890123456");
    expect(normalizePublisherId("  pub-1234567890123456 ")).toBe("ca-pub-1234567890123456");
    expect(normalizePublisherId("ca-pub-12ab")).toBe("");
    expect(normalizePublisherId("ca-app-pub-1234567890123456")).toBe("");
    expect(normalizePublisherId('ca-pub-1234567890"><script>')).toBe("");
    expect(normalizePublisherId(1234)).toBe("");
  });

  it("広告ユニット ID は数字だけ（数でも文字でも）。違えば空", () => {
    expect(normalizeSlotId("1234567890")).toBe("1234567890");
    expect(normalizeSlotId(1234567890)).toBe("1234567890");
    expect(normalizeSlotId(" 1234567890 ")).toBe("1234567890");
    expect(normalizeSlotId("12345-67890")).toBe("");
    expect(normalizeSlotId("ca-pub-1")).toBe("");
    expect(normalizeSlotId(null)).toBe("");
  });

  it("保存した形を読み直すと、形の違う番号は空になる（他の値は残る）", () => {
    expect(
      normalizeAdConfig({
        enabled: true,
        adsensePublisherId: "pub-1234567890123456",
        slotDexInFeed: "111111111",
        slotDiaryInFeed: "abc",
        slotReviewEnd: 2222222222,
      }),
    ).toMatchObject({
      enabled: true,
      adsensePublisherId: "ca-pub-1234567890123456",
      slotDexInFeed: "111111111",
      slotDiaryInFeed: "",
      slotReviewEnd: "2222222222",
    });
  });
});
