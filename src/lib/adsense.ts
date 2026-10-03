import type { AdConfig, AdHistory } from "@/lib/ad-policy";

/**
 * **Web 版の広告（Google AdSense）の決まり**（オーナー指示 2026-10-03「アプリ内の広告が動く
 * 機能するようにしたい。」）。ここは**画面を持たない決まりだけ**（テスト済み）。
 * 読み込む部品は `hooks/use-web-ads.ts`、枠は `components/ads/AdCard.tsx`。
 *
 * ## Web で使う形・使わない形（Google の公式ヘルプで確かめたこと）
 * - 使う: 一覧の中・終わりの画面の中の**ディスプレイ広告**（`<ins class="adsbygoogle">`）。
 * - 使わない: 全画面（インタースティシャル）・ごほうび（リワード）。Web でそれを出す
 *   Ad Placement API（`adBreak`）は **HTML5 ゲーム専用**で、ゲームでないサイトでは使えない
 *   （developers.google.com/ad-placement）。だから `rewardedEnabled` / `afterCatchEnabled` は
 *   アプリ版（AdMob、後日）のために残し、Web では描かない（`webPlacements`）。
 *   復習の区切りは全画面ではなく、**終わりの画面の下に置く札**にする。
 * - アプリの殻（Capacitor）の中では読み込まない。アプリ版は AdMob を別に入れる。
 */

/** AdSense の読み込み口。`client` を付けると、その運営者の広告として扱われる。 */
export function adsenseScriptSrc(publisherId: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
}

/** Google の認証機関 ID（`ads.txt` の4つ目の欄。Google 共通の決まった値）。 */
export const GOOGLE_CERT_AUTHORITY_ID = "f08c47fec0942fa0";

/**
 * `/ads.txt` の中身。運営者 ID が無ければ `null`（= 404 を返す）。
 * `ads.txt` の書き方は `ca-` を付けない `pub-…`。
 * **広告のオン・オフとは関係なく出す** — 審査はオンにする前に受けるため。
 */
export function adsTxtBody(cfg: Pick<AdConfig, "adsensePublisherId">): string | null {
  const id = cfg.adsensePublisherId;
  if (!id) return null;
  return `google.com, ${id.replace(/^ca-/, "")}, DIRECT, ${GOOGLE_CERT_AUTHORITY_ID}\n`;
}

/**
 * **広告の部品を読み込んでよい画面**。枠を置いているのはこの3つだけなので、
 * それ以外（撮る・スキャン・初回の案内・ログイン・ようこそ・設定など）では読み込まない。
 * 先に「出さない画面」を数えるより、出してよい所を名指しする方が、画面が増えた時に
 * 黙って広告が広がらない。
 */
const AD_ROUTES = ["/home", "/dex", "/review"] as const;

export function adRouteAllowed(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  // 図鑑の札の詳細（/dex/…）は撮った直後に開く所なので含めない。
  return (AD_ROUTES as readonly string[]).includes(p);
}

/** アプリを開いてからこの間は読み込まない（開いた瞬間には出さない・起動を遅くしない）。 */
export const APP_OPEN_QUIET_MS = 4000;

export type AdLoadContext = {
  cfg: AdConfig;
  /** ログインしているか（匿名の仮の利用者は含めない）。 */
  signedIn: boolean;
  /** Pro か。**分からない間は `null`**（分かるまで出さない）。 */
  isPro: boolean | null;
  /** 使い始めた時刻（ms）。分からなければ `null`（出さない）。 */
  installedAt: number | null;
  /** 初回の案内（チュートリアル）を終えたか。 */
  onboarded: boolean;
  now: number;
  /** 今の画面の住所。 */
  pathname: string;
  /** アプリの殻（Capacitor）の中か。 */
  isNative: boolean;
  /** このページを開いてからの時間（ms）。 */
  sinceOpenMs: number;
};

export type AdLoadReason =
  | "off"
  | "no_publisher"
  | "native"
  | "signed_out"
  | "unknown"
  | "pro"
  | "grace"
  | "first_run"
  | "screen"
  | "app_open";

/** **広告の部品（AdSense）を読み込むか**。理由も返す（開発者の確認とテスト用）。 */
export function shouldLoadAds(
  c: AdLoadContext,
): { load: true } | { load: false; reason: AdLoadReason } {
  if (!c.cfg.enabled) return { load: false, reason: "off" };
  if (!c.cfg.adsensePublisherId) return { load: false, reason: "no_publisher" };
  if (c.isNative) return { load: false, reason: "native" };
  if (!c.signedIn) return { load: false, reason: "signed_out" };
  if (c.isPro === null || c.installedAt === null) return { load: false, reason: "unknown" };
  if (c.isPro) return { load: false, reason: "pro" };
  if (c.now - c.installedAt < c.cfg.graceDays * 86400000) return { load: false, reason: "grace" };
  if (!c.onboarded) return { load: false, reason: "first_run" };
  if (!adRouteAllowed(c.pathname)) return { load: false, reason: "screen" };
  if (c.sinceOpenMs < APP_OPEN_QUIET_MS) return { load: false, reason: "app_open" };
  return { load: true };
}

/**
 * Web で描く場所。全画面・ごほうびは Web では出さない（上の注）。
 * 枠の番号が空の場所も出さない（空の枠は何も埋まらず、隙間だけが残る）。
 */
export function webPlacements(cfg: AdConfig): {
  dex: boolean;
  diary: boolean;
  reviewEnd: boolean;
} {
  return {
    dex: cfg.dexNativeEnabled && Boolean(cfg.slotDexInFeed),
    diary: cfg.diaryNativeEnabled && Boolean(cfg.slotDiaryInFeed),
    reviewEnd: cfg.reviewEndEnabled && Boolean(cfg.slotReviewEnd),
  };
}

/**
 * 図鑑はカテゴリーごとの組に分かれ、3列の格子で並ぶ。`nativeSlots` が決めた
 * **通しの番号**（何枚目の後か）を、組ごとの番号に直し、**行の終わりまで送る**
 * （行の途中に横いっぱいの広告を挟むと、行の残りが空いて格子が崩れる）。
 * 組の最後の札を越える時は組の最後（= 組と組の間）に置く。送った先が一覧の一番下なら置かない。
 */
export function groupAdSlots(groupSizes: number[], slots: number[], cols = 1): number[][] {
  const out = groupSizes.map(() => [] as number[]);
  const total = groupSizes.reduce((a, b) => a + b, 0);
  let start = 0;
  groupSizes.forEach((size, g) => {
    for (const s of slots) {
      if (s < start || s >= start + size) continue;
      const local = s - start;
      const rowEnd = Math.min(size - 1, Math.floor(local / cols) * cols + cols - 1);
      if (start + rowEnd >= total - 1) continue;
      if (!out[g].includes(rowEnd)) out[g].push(rowEnd);
    }
    start += size;
  });
  return out;
}

/** 端末に覚える「復習の区切りの広告」の記録（`AdHistory` + 日付）。 */
export type StoredAdHistory = AdHistory & { day: string };

export const EMPTY_AD_HISTORY: StoredAdHistory = {
  day: "",
  lastShownAt: null,
  shownToday: 0,
  batchesSinceLast: 0,
};

/** 日が替わったら「今日の数」を0に戻す。 */
export function rollAdHistory(h: StoredAdHistory, today: string): StoredAdHistory {
  return h.day === today ? h : { ...h, day: today, shownToday: 0 };
}

/** 区切りを1回通った後の記録。出したら数え直し、出さなければ束を1つ足す。 */
export function afterReviewEnd(h: StoredAdHistory, shown: boolean, now: number): StoredAdHistory {
  return shown
    ? { ...h, lastShownAt: now, shownToday: h.shownToday + 1, batchesSinceLast: 0 }
    : { ...h, batchesSinceLast: h.batchesSinceLast + 1 };
}
