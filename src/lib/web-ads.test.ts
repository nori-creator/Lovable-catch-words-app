import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_AD_CONFIG, type AdConfig } from "./ad-policy";
import {
  EMPTY_WEB_AD_HISTORY,
  WEB_AD_PATHS,
  adsTxtBody,
  normalizeWebAdHistory,
  onReviewBatchEnd,
  readAdSenseEnv,
  splitForAds,
  webAdBlockReason,
  webRewardedAvailable,
  type WebAdPlacement,
} from "./web-ads";

/** Web 版の広告（AdSense）の関所（オーナー指示 2026-10-03「無料の Web 版に広告を出したい」）。 */
const DAY = 86_400_000;
const ENV = readAdSenseEnv({
  VITE_ADSENSE_CLIENT: "ca-pub-1234567890123456",
  VITE_ADSENSE_SLOT_DEX: "1111111111",
  VITE_ADSENSE_SLOT_DIARY: "2222222222",
  VITE_ADSENSE_SLOT_REVIEW: "3333333333",
});
const ON: AdConfig = { ...DEFAULT_AD_CONFIG, enabled: true };

function base(placement: WebAdPlacement = "dex") {
  return {
    placement,
    env: ENV,
    cfg: ON,
    isPro: false as boolean | null,
    accountCreatedAt: 0 as number | null,
    now: 10 * DAY,
    native: false,
    pathname: WEB_AD_PATHS[placement],
  };
}

describe("環境変数の番号", () => {
  it("形の正しい番号だけを読む（偽・空・形違いは「無い」）", () => {
    expect(ENV.client).toBe("ca-pub-1234567890123456");
    expect(ENV.slots).toEqual({ dex: "1111111111", diary: "2222222222", review_end: "3333333333" });
    const bad = readAdSenseEnv({
      VITE_ADSENSE_CLIENT: "pub-123",
      VITE_ADSENSE_SLOT_DEX: "abc",
      VITE_ADSENSE_SLOT_DIARY: "",
    });
    expect(bad.client).toBeNull();
    expect(bad.slots).toEqual({ dex: null, diary: null, review_end: null });
    expect(readAdSenseEnv({}).client).toBeNull();
  });

  it("引用符や前後の空白は外す", () => {
    expect(readAdSenseEnv({ VITE_ADSENSE_CLIENT: ' "ca-pub-1234567890123456" ' }).client).toBe(
      "ca-pub-1234567890123456",
    );
  });
});

describe("出してよいか（webAdBlockReason）", () => {
  it("全部揃えば出す（3か所とも）", () => {
    for (const p of ["dex", "diary", "review_end"] as const)
      expect(webAdBlockReason(base(p))).toBeNull();
  });

  it("iPhone・Android のアプリの中では出さない（AdMob の予定）", () => {
    expect(webAdBlockReason({ ...base(), native: true })).toBe("native");
  });

  it("AdSense の番号・枠の番号が無ければ出さない", () => {
    expect(webAdBlockReason({ ...base(), env: readAdSenseEnv({}) })).toBe("no_client");
    expect(
      webAdBlockReason({
        ...base("diary"),
        env: readAdSenseEnv({ VITE_ADSENSE_CLIENT: "ca-pub-1234567890123456" }),
      }),
    ).toBe("no_slot");
  });

  it("開発者のスイッチがオフ・設定が読めない時は出さない", () => {
    expect(webAdBlockReason({ ...base(), cfg: DEFAULT_AD_CONFIG })).toBe("off");
    expect(webAdBlockReason({ ...base(), cfg: null })).toBe("off");
  });

  it("場所ごとのオフに従う", () => {
    expect(webAdBlockReason({ ...base("dex"), cfg: { ...ON, dexNativeEnabled: false } })).toBe(
      "place_off",
    );
    expect(webAdBlockReason({ ...base("diary"), cfg: { ...ON, diaryNativeEnabled: false } })).toBe(
      "place_off",
    );
    expect(
      webAdBlockReason({ ...base("review_end"), cfg: { ...ON, reviewEndEnabled: false } }),
    ).toBe("place_off");
  });

  it("Pro の人・プランが読めない人には出さない", () => {
    expect(webAdBlockReason({ ...base(), isPro: true })).toBe("pro");
    expect(webAdBlockReason({ ...base(), isPro: null })).toBe("plan_unknown");
    expect(webAdBlockReason({ ...base(), accountCreatedAt: null })).toBe("plan_unknown");
  });

  it("使い始めて graceDays 日の間は出さない", () => {
    expect(webAdBlockReason({ ...base(), accountCreatedAt: 10 * DAY - 2 * DAY })).toBe("grace");
    expect(webAdBlockReason({ ...base(), accountCreatedAt: 10 * DAY - 3 * DAY })).toBeNull();
  });

  it("決めた画面の外（撮る・スキャン・案内・ログイン・規約・設定・詳細）では出さない", () => {
    for (const path of [
      "/capture",
      "/scan",
      "/onboarding",
      "/welcome",
      "/auth",
      "/terms",
      "/privacy",
      "/settings",
      "/reset-password",
      "/dex/abc",
      "/",
    ])
      expect([path, webAdBlockReason({ ...base(), pathname: path })]).toEqual([path, "page"]);
    expect(webAdBlockReason({ ...base("diary"), pathname: "/dex" })).toBe("page");
    expect(webAdBlockReason({ ...base(), pathname: "/dex/?view=list" })).toBeNull();
  });

  it("Web ではごほうび広告を出さない", () => {
    expect(webRewardedAvailable()).toBe(false);
  });
});

describe("復習の束の区切り（何束ごと・間隔・1日の上限）", () => {
  const now = 10 * DAY + 12 * 3600_000;
  const run = (history = EMPTY_WEB_AD_HISTORY, t = now, cfg = ON) =>
    onReviewBatchEnd({ cfg, isPro: false, accountCreatedAt: 0, now: t, history });

  it("既定は3束ごとに1回", () => {
    const a = run();
    expect(a.show).toBe(false);
    const b = run(a.next);
    expect(b.show).toBe(false);
    const c = run(b.next);
    expect(c.show).toBe(true);
    expect(c.next).toMatchObject({ batchesSinceLast: 0, shownToday: 1, lastShownAt: now });
  });

  it("前回から10分空いていなければ出さない・1日の上限を守る", () => {
    const h = { ...EMPTY_WEB_AD_HISTORY, batchesSinceLast: 5, lastShownAt: now - 60_000 };
    expect(run(normalizeWebAdHistory(h, now)).show).toBe(false);
    const capped = normalizeWebAdHistory(
      { ...h, lastShownAt: now - 3600_000, shownToday: 3, day: "" },
      now,
    );
    // 日付が違う記録は「今日の数」を 0 に戻す。
    expect(capped.shownToday).toBe(0);
    const today = normalizeWebAdHistory(capped, now);
    expect(run({ ...today, shownToday: 3 }).show).toBe(false);
  });

  it("Pro・最初の数日・オフでは出さない", () => {
    const h = { ...EMPTY_WEB_AD_HISTORY, batchesSinceLast: 9 };
    expect(
      onReviewBatchEnd({ cfg: ON, isPro: true, accountCreatedAt: 0, now, history: h }).show,
    ).toBe(false);
    expect(
      onReviewBatchEnd({ cfg: ON, isPro: false, accountCreatedAt: now - DAY, now, history: h })
        .show,
    ).toBe(false);
    expect(run(h, now, DEFAULT_AD_CONFIG).show).toBe(false);
  });

  it("壊れた記録は空から数え直す", () => {
    expect(normalizeWebAdHistory("x", now)).toMatchObject({
      lastShownAt: null,
      shownToday: 0,
      batchesSinceLast: 0,
    });
  });
});

describe("一覧に枠を挟む（splitForAds）", () => {
  it("通し番号が slots に入る札の後ろで切る（カテゴリーをまたいで数える）", () => {
    const slots = new Set([2, 6]);
    expect(splitForAds(["a", "b", "c", "d"], 0, slots)).toEqual([
      { items: ["a", "b", "c"], ad: 2 },
      { items: ["d"], ad: null },
    ]);
    // 2つ目のカテゴリーは 4 番から。最後の札(6)が枠ならカテゴリーの後ろに置く。
    expect(splitForAds(["e", "f", "g"], 4, slots)).toEqual([{ items: ["e", "f", "g"], ad: 6 }]);
  });

  it("枠が無ければ今までどおり1つの塊", () => {
    expect(splitForAds(["a", "b"], 0, new Set())).toEqual([{ items: ["a", "b"], ad: null }]);
    expect(splitForAds([], 0, new Set([0]))).toEqual([{ items: [], ad: null }]);
  });
});

describe("ads.txt", () => {
  it("Google の決まった1行を番号から作る。番号が無い・形違いなら作らない（偽の番号を置かない）", () => {
    expect(adsTxtBody("ca-pub-1234567890123456")).toBe(
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n",
    );
    expect(adsTxtBody(null)).toBeNull();
    expect(adsTxtBody("pub-1")).toBeNull();
  });

  it("リポジトリに ads.txt の固定ファイルや ca-pub の番号を置かない", () => {
    expect(fs.existsSync("public/ads.txt")).toBe(false);
    const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
    expect(env).not.toMatch(/ca-pub-0{16}/);
  });
});

describe("画面のつなぎ（チュートリアル・アプリでは出さない）", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("広告の枠は本物の図鑑・ホーム・復習だけが渡す（チュートリアルの部品は渡さない）", () => {
    for (const f of [
      "src/components/onboarding/FirstCatchFlow.tsx",
      "src/components/onboarding/FirstCatchPractice.tsx",
      "src/components/onboarding/FirstCatchHome.tsx",
    ]) {
      const src = read(f);
      expect([f, /renderAd|diaryAd|WebAd/.test(src)]).toEqual([f, false]);
    }
    expect(read("src/routes/_authenticated/dex.tsx")).toMatch(/useWebAdSlot\("dex"\)/);
    expect(read("src/routes/_authenticated/home.tsx")).toMatch(/useWebAdSlot\("diary"\)/);
    expect(read("src/routes/_authenticated/review.tsx")).toMatch(/useWebAdSlot\("review_end"\)/);
  });

  it("撮る・スキャンの画面は広告の部品を読み込まない", () => {
    for (const f of [
      "src/routes/_authenticated/capture.tsx",
      "src/routes/_authenticated/scan.tsx",
      "src/routes/_authenticated/onboarding.tsx",
      "src/routes/auth.tsx",
      "src/routes/welcome.tsx",
    ])
      expect([f, read(f).includes("WebAdSlot")]).toEqual([f, false]);
  });

  it("枠は「広告」と書き、アプリの殻の中を確かめ、AdSense の部品を遅れて読む", () => {
    const src = read("src/components/WebAdSlot.tsx");
    expect(src).toContain('t("ads.label")');
    expect(src).toContain("isNativeShell()");
    expect(src).toContain("IntersectionObserver");
    expect(src).toContain("pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=");
    // 部品は最初の HTML（__root）に入れない（画面に近づいた時だけ読む）。
    expect(read("src/routes/__root.tsx")).not.toContain("adsbygoogle");
  });
});
