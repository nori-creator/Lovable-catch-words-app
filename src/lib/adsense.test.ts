import { describe, expect, it } from "vitest";
import { DEFAULT_AD_CONFIG, decideInterstitial, nativeSlots } from "./ad-policy";
import {
  APP_OPEN_QUIET_MS,
  EMPTY_AD_HISTORY,
  adRouteAllowed,
  adsTxtBody,
  adsenseScriptSrc,
  afterReviewEnd,
  groupAdSlots,
  rollAdHistory,
  shouldLoadAds,
  webPlacements,
  type AdLoadContext,
} from "./adsense";

/** Web 版の広告（オーナー指示 2026-10-03「アプリ内の広告が動く 機能するようにしたい。」）。 */
const PUB = "ca-pub-1234567890123456";
const day = 86400000;
const cfg = {
  ...DEFAULT_AD_CONFIG,
  enabled: true,
  adsensePublisherId: PUB,
  slotDexInFeed: "1111111111",
  slotDiaryInFeed: "2222222222",
  slotReviewEnd: "3333333333",
};
const ok: AdLoadContext = {
  cfg,
  signedIn: true,
  isPro: false,
  installedAt: 0,
  onboarded: true,
  now: 10 * day,
  pathname: "/dex",
  isNative: false,
  sinceOpenMs: 60_000,
};

describe("/ads.txt の中身", () => {
  it("運営者 ID から Google の1行を作る（ca- は付けない）", () => {
    expect(adsTxtBody(cfg)).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });
  it("ID が無ければ出さない（404）", () => {
    expect(adsTxtBody(DEFAULT_AD_CONFIG)).toBeNull();
  });
  it("広告がオフでも出す（審査はオンにする前に受ける）", () => {
    expect(adsTxtBody({ ...cfg, enabled: false } as typeof cfg)).not.toBeNull();
  });
  it("読み込み口は運営者 ID 付き", () => {
    expect(adsenseScriptSrc(PUB)).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456",
    );
  });
});

describe("広告の部品を読み込むか（shouldLoadAds）", () => {
  it("条件がそろえば読み込む", () => {
    expect(shouldLoadAds(ok)).toEqual({ load: true });
  });

  it("既定（オフ）・ID 無しでは読み込まない", () => {
    expect(shouldLoadAds({ ...ok, cfg: DEFAULT_AD_CONFIG })).toEqual({
      load: false,
      reason: "off",
    });
    expect(shouldLoadAds({ ...ok, cfg: { ...cfg, adsensePublisherId: "" } })).toEqual({
      load: false,
      reason: "no_publisher",
    });
  });

  it("アプリの殻・未ログイン・Pro・分からない間・使い始め・初回の案内では読み込まない", () => {
    const reason = (c: Partial<AdLoadContext>) => {
      const r = shouldLoadAds({ ...ok, ...c });
      return r.load ? "load" : r.reason;
    };
    expect(reason({ isNative: true })).toBe("native");
    expect(reason({ signedIn: false })).toBe("signed_out");
    expect(reason({ isPro: true })).toBe("pro");
    expect(reason({ isPro: null })).toBe("unknown");
    expect(reason({ installedAt: null })).toBe("unknown");
    expect(reason({ now: 2 * day })).toBe("grace");
    expect(reason({ onboarded: false })).toBe("first_run");
    expect(reason({ sinceOpenMs: APP_OPEN_QUIET_MS - 1 })).toBe("app_open");
  });

  it("出してよい画面は ホーム・図鑑・復習 だけ", () => {
    for (const p of ["/home", "/dex", "/review", "/dex/"])
      expect([p, shouldLoadAds({ ...ok, pathname: p }).load]).toEqual([p, true]);
    for (const p of [
      "/",
      "/capture",
      "/scan",
      "/onboarding",
      "/auth",
      "/welcome",
      "/reset-password",
      "/native-auth",
      "/settings",
      "/dex/abc",
      "/admin/users",
    ]) {
      expect([p, adRouteAllowed(p)]).toEqual([p, false]);
      expect(shouldLoadAds({ ...ok, pathname: p })).toEqual({ load: false, reason: "screen" });
    }
  });
});

describe("Web で描く場所", () => {
  it("番号が入っていて、場所がオンの所だけ", () => {
    expect(webPlacements(cfg)).toEqual({ dex: true, diary: true, reviewEnd: true });
    expect(webPlacements({ ...cfg, slotDiaryInFeed: "" })).toMatchObject({ diary: false });
    expect(webPlacements({ ...cfg, dexNativeEnabled: false })).toMatchObject({ dex: false });
  });
  it("ごほうび・捕まえた後の全画面は Web の場所に無い（オンでも描かない）", () => {
    const p = webPlacements({ ...cfg, rewardedEnabled: true, afterCatchEnabled: true });
    expect(Object.keys(p).sort()).toEqual(["dex", "diary", "reviewEnd"]);
  });
});

describe("図鑑の広告の位置（組ごと・行の終わり）", () => {
  it("1つの組・縦の一覧では nativeSlots と同じ位置", () => {
    expect(groupAdSlots([40], nativeSlots(40, cfg, false), 1)).toEqual([[11, 23, 35]]);
  });

  it("3列の格子では行の終わりへ送る", () => {
    // 12枚ごと → 11 は 3列の行の終わり（11）。nativeEvery を 10 にすると 9 → 11 へ。
    const c = { ...cfg, nativeEvery: 10, nativeFirst: 0 };
    expect(nativeSlots(40, c, false)).toEqual([9, 19, 29]);
    expect(groupAdSlots([40], nativeSlots(40, c, false), 3)).toEqual([[11, 20, 29]]);
  });

  it("組に分かれていたら組の中の番号に直す。組の最後を越えたら組の終わり", () => {
    // 組: 10枚・20枚・10枚 → 通しの 11, 23, 35 は 2つ目の1, 13 と 3つ目の5。
    expect(groupAdSlots([10, 20, 10], [11, 23, 35], 1)).toEqual([[], [1, 13], [5]]);
    // 3列: 2つ目の1 → 2、13 → 14、3つ目の5 → 5。
    expect(groupAdSlots([10, 20, 10], [11, 23, 35], 3)).toEqual([[], [2, 14], [5]]);
    // 組が4枚で、送った先（5）が組の外へ出る時は組の最後（3）。
    expect(groupAdSlots([4, 10], [3], 3)).toEqual([[3], []]);
  });

  it("送った先が一覧の一番下なら置かない", () => {
    expect(groupAdSlots([14], [12], 3)).toEqual([[]]);
  });
});

describe("復習の区切りの広告の数え方", () => {
  it("3回ごとに1回。出したら数え直す", () => {
    let h = rollAdHistory(EMPTY_AD_HISTORY, "2026-10-3");
    const shown: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const now = 10 * day + i * 20 * 60000;
      const d = decideInterstitial({
        moment: "review_batch_end",
        cfg,
        isPro: false,
        installedAt: 0,
        now,
        history: h,
      });
      shown.push(d.show);
      h = afterReviewEnd(h, d.show, now);
    }
    expect(shown).toEqual([false, false, true, false, false, true]);
    expect(h.shownToday).toBe(2);
  });

  it("日が替わると今日の数は0に戻る（束の数は残す）", () => {
    const h = { ...EMPTY_AD_HISTORY, day: "2026-10-3", shownToday: 3, batchesSinceLast: 2 };
    expect(rollAdHistory(h, "2026-10-4")).toMatchObject({ shownToday: 0, batchesSinceLast: 2 });
    expect(rollAdHistory(h, "2026-10-3")).toBe(h);
  });
});
