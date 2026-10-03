import { decideInterstitial, type AdConfig, type AdHistory } from "@/lib/ad-policy";

/**
 * **Web 版の広告（Google AdSense）を出してよいかの決まり**（オーナー指示 2026-10-03
 * 「無料の Web 版に広告を出したい」）。
 *
 * 出す場所・回数の決まりは `ad-policy.ts`（開発者の設定 `app_config.monetization`）。
 * ここは Web で実際に AdSense の枠を描く前の**最後の関所**だけを持つ（試験しやすいように
 * 画面の部品から切り離した。部品は `components/WebAdSlot.tsx`）。
 *
 * ## 出さない時（どれか1つでも当てはまれば出さない）
 * - iPhone・Android のアプリの中（Capacitor の殻。アプリは AdMob の予定。Web の画面を殻の中で
 *   出しているので、同じコードが動く — 実行時に必ず確かめる）。
 * - AdSense の番号（`VITE_ADSENSE_CLIENT` = `ca-pub-…`）か、その場所の枠の番号が未設定。
 * - 開発者のスイッチ「広告を出す」がオフ、またはその場所がオフ。
 * - Pro の人。プランが**読めない**時も出さない（Pro の人に出す方が悪い）。
 * - 使い始めて `graceDays` 日の間（アカウントを作った日から数える）。
 * - 決めた画面の外（撮る・スキャン・保存・案内・ログイン・規約などの画面では描かない）。
 *
 * ## Web では全画面広告もごほうび広告も出さない
 * - AdSense には、アプリが好きな時に出せる全画面広告が無い（あるのは自動広告の
 *   「Vignette」で、出す時は Google が決める）。なので**復習の束の区切りは、終わりの画面の
 *   中の枠**（ページの中の広告）にする。回数の決まり（何束ごと・間隔・1日の上限）は全画面と同じ。
 * - AdSense のごほうび広告は「Offerwall（ページを読むために見る）」だけで、
 *   「見たら切り抜きが1枚増える」のようにアプリが報酬を渡す形には使えない。**Web では出さない**。
 */

export type WebAdPlacement = "dex" | "diary" | "review_end";

export type AdSenseEnv = {
  /** `ca-pub-` で始まる番号。無い・形が違う時は null。 */
  client: string | null;
  slots: Record<WebAdPlacement, string | null>;
};

const CLIENT_RE = /^ca-pub-\d{10,20}$/;
const SLOT_RE = /^\d{6,20}$/;

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/^["']|["']$/g, "") : "";
}

/** 環境変数から AdSense の番号を読む（形が違う値は「無い」と同じに扱う）。 */
export function readAdSenseEnv(env: Record<string, unknown>): AdSenseEnv {
  const client = clean(env.VITE_ADSENSE_CLIENT);
  const slot = (k: string) => {
    const v = clean(env[k]);
    return SLOT_RE.test(v) ? v : null;
  };
  return {
    client: CLIENT_RE.test(client) ? client : null,
    slots: {
      dex: slot("VITE_ADSENSE_SLOT_DEX"),
      diary: slot("VITE_ADSENSE_SLOT_DIARY"),
      review_end: slot("VITE_ADSENSE_SLOT_REVIEW"),
    },
  };
}

/** その場所の広告を描いてよい画面（パス）。ここ以外では描かない。 */
export const WEB_AD_PATHS: Record<WebAdPlacement, string> = {
  dex: "/dex",
  diary: "/home",
  review_end: "/review",
};

export type WebAdBlock =
  | "native"
  | "no_client"
  | "no_slot"
  | "off"
  | "place_off"
  | "plan_unknown"
  | "pro"
  | "grace"
  | "page";

/** 出さない理由（出してよいなら null）。 */
export function webAdBlockReason(p: {
  placement: WebAdPlacement;
  env: AdSenseEnv;
  /** 読めていなければ null（= 出さない）。 */
  cfg: AdConfig | null;
  /** Pro か。読めていなければ null（= 出さない）。 */
  isPro: boolean | null;
  /** アカウントを作った時刻（ms）。読めていなければ null（= 出さない）。 */
  accountCreatedAt: number | null;
  now: number;
  native: boolean;
  pathname: string;
}): WebAdBlock | null {
  if (p.native) return "native";
  if (!p.env.client) return "no_client";
  if (!p.env.slots[p.placement]) return "no_slot";
  if (!p.cfg || !p.cfg.enabled) return "off";
  const placeOn =
    p.placement === "dex"
      ? p.cfg.dexNativeEnabled
      : p.placement === "diary"
        ? p.cfg.diaryNativeEnabled
        : p.cfg.reviewEndEnabled;
  if (!placeOn) return "place_off";
  if (p.isPro === null || p.accountCreatedAt === null) return "plan_unknown";
  if (p.isPro) return "pro";
  if (p.now - p.accountCreatedAt < p.cfg.graceDays * 86_400_000) return "grace";
  if (normalizePath(p.pathname) !== WEB_AD_PATHS[p.placement]) return "page";
  return null;
}

function normalizePath(path: string): string {
  const s = path.split(/[?#]/)[0] || "/";
  return s.length > 1 ? s.replace(/\/+$/, "") : s;
}

/** Web では、ごほうび広告は出さない（AdSense に、アプリが報酬を渡す形が無い）。 */
export function webRewardedAvailable(): false {
  return false;
}

// ---------------------------------------------------------------------------
// 復習の束の区切り: 何束ごと・間隔・1日の上限（全画面と同じ数え方）。端末に覚える。

export type WebAdHistory = AdHistory & {
  /** `shownToday` を数えている日（端末の日付 YYYY-MM-DD）。 */
  day: string;
};

export const EMPTY_WEB_AD_HISTORY: WebAdHistory = {
  lastShownAt: null,
  shownToday: 0,
  batchesSinceLast: 0,
  day: "",
};

function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 保存されている形を揃える（壊れていたら空から）。日が変わっていたら今日の数を 0 に。 */
export function normalizeWebAdHistory(raw: unknown, now: number): WebAdHistory {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const today = localDay(now);
  const day = typeof r.day === "string" ? r.day : "";
  return {
    lastShownAt: typeof r.lastShownAt === "number" ? r.lastShownAt : null,
    shownToday: day === today ? Math.floor(n(r.shownToday)) : 0,
    batchesSinceLast: Math.floor(n(r.batchesSinceLast)),
    day: today,
  };
}

/**
 * 復習の束を1つ終えた時に呼ぶ。今回の終わりの画面に枠を出すかと、次に覚える形を返す。
 * 出す・出さないの判断は全画面と同じ `decideInterstitial`（Pro・最初の数日もここで止まる）。
 */
export function onReviewBatchEnd(p: {
  cfg: AdConfig;
  isPro: boolean;
  accountCreatedAt: number;
  now: number;
  history: WebAdHistory;
}): { show: boolean; next: WebAdHistory } {
  const h = normalizeWebAdHistory(p.history, p.now);
  const d = decideInterstitial({
    moment: "review_batch_end",
    cfg: p.cfg,
    isPro: p.isPro,
    installedAt: p.accountCreatedAt,
    now: p.now,
    history: h,
  });
  if (d.show)
    return {
      show: true,
      next: { ...h, lastShownAt: p.now, shownToday: h.shownToday + 1, batchesSinceLast: 0 },
    };
  return { show: false, next: { ...h, batchesSinceLast: h.batchesSinceLast + 1 } };
}

// ---------------------------------------------------------------------------
// ads.txt（`/ads.txt`）。番号は環境変数から作る（偽の番号はリポジトリに入れない）。

/** Google の決まった書き方の1行。番号が無ければ null（`/ads.txt` は 404 にする）。 */
export function adsTxtBody(client: string | null): string | null {
  if (!client || !CLIENT_RE.test(client)) return null;
  const pub = client.replace(/^ca-/, "");
  return `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`;
}

// ---------------------------------------------------------------------------
// 一覧に枠を挟む: 並び（全体の何番目か）の `slots` の後ろで切る。

/**
 * `items` を、全体の通し番号（`start` から）が `slots` に入る札の後ろで切る。
 * 切れ目ごとに、その後ろに置く枠の番号（`ad`）を付ける。塊の最後の札が `slots` に入っていれば、
 * その塊（カテゴリー）の後ろに置く（一覧全体の一番下は `ad-policy.ts` の `feedSlots` が外している）。
 */
export function splitForAds<T>(
  items: readonly T[],
  start: number,
  slots: ReadonlySet<number>,
): Array<{ items: T[]; ad: number | null }> {
  const out: Array<{ items: T[]; ad: number | null }> = [];
  let cur: T[] = [];
  items.forEach((it, i) => {
    cur.push(it);
    const g = start + i;
    if (slots.has(g)) {
      out.push({ items: cur, ad: g });
      cur = [];
    }
  });
  if (cur.length || out.length === 0) out.push({ items: cur, ad: null });
  return out;
}

const HISTORY_KEY = "web-ad-history-v1";

/** 端末に覚えた回数（読めない時は空。プライベートウィンドウなど）。 */
export function readWebAdHistory(now: number): WebAdHistory {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return normalizeWebAdHistory(raw ? JSON.parse(raw) : null, now);
  } catch {
    return normalizeWebAdHistory(null, now);
  }
}

export function writeWebAdHistory(h: WebAdHistory): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* 覚えられなくても広告の判断には困らない（毎回「まだ」に倒れるだけ） */
  }
}
