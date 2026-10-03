/**
 * **Stripe の値段を読む・定期購入の管理画面（Billing Portal）を開く**。
 *
 * 通信は引数の `fetch` で行う（テストでは偽物を渡す）。秘密鍵はサーバだけが持つ。
 * 呼ぶ所は `billing.functions.ts`（購入口）と `legal.functions.ts`（特商法の頁）。
 *
 * ## 値段は Stripe から読む（コードに書かない）
 * 値段を決めるのはオーナー。`STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` の
 * Price を `GET /v1/prices/:id` で読み、**その金額と通貨だけ**を出す。
 * 毎回 Stripe に聞かないよう、サーバの中で 10 分覚える（失敗は 1 分）。
 *
 * ## 管理画面の相手（Customer）を探す — 新しい列を足さない
 * 1. 定期購入の検索 `metadata['user_id']:'<id>'`（購入時に `subscription_data.metadata`
 *    へ書いている。知らせの受け口の読み直しと同じ印）
 * 2. 見つからなければ、顧客の検索 `email:'<メール>'`（購入時に `customer_email` を渡す）
 * 有効な定期購入の顧客を優先し、無ければ新しい順。
 */

export type StripeFetch = typeof fetch;

export type PriceInfo = {
  id: string;
  /** 最小単位の整数（JPY なら円、USD ならセント）。 */
  unitAmount: number;
  /** 小文字の ISO 4217（Stripe の形）。 */
  currency: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  /** `inclusive`（税込）/ `exclusive`（税別）/ `unspecified`。 */
  taxBehavior: "inclusive" | "exclusive" | "unspecified";
};

/** 失敗の印。画面は `errors.ts` の表でその言語の文に直す。 */
export const BILLING_ERRORS = {
  disabled: "BILLING_DISABLED",
  notConfigured: "BILLING_NOT_CONFIGURED",
  legalNotReady: "BILLING_LEGAL_NOT_READY",
  noCustomer: "BILLING_NO_CUSTOMER",
  portalNotConfigured: "BILLING_PORTAL_NOT_CONFIGURED",
  portalFailed: "BILLING_PORTAL_FAILED",
} as const;

const API = "https://api.stripe.com";

/**
 * 小数の無い通貨（Stripe の一覧）。金額はそのまま。ほかは 100 で割る。
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export function minorUnitsToMajor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}

/** 表示言語の書式で値段を書く（`¥480` / `NT$150.00` / `$4.99`）。 */
export function formatStripeAmount(amount: number, currency: string, locale: string): string {
  const major = minorUnitsToMajor(amount, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      // 端数の無い値段に「.00」を付けない（NT$150 / ¥480）。端数があれば出す。
      minimumFractionDigits: Number.isInteger(major) ? 0 : undefined,
    }).format(major);
  } catch {
    return `${major} ${currency.toUpperCase()}`;
  }
}

/** Stripe の Price を、画面に出せる形に。使えない物（定期でない・金額が無い・止めてある）は null。 */
export function priceFromStripe(raw: unknown): PriceInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as {
    id?: unknown;
    active?: unknown;
    unit_amount?: unknown;
    currency?: unknown;
    recurring?: { interval?: unknown; interval_count?: unknown } | null;
    tax_behavior?: unknown;
  };
  if (typeof p.id !== "string" || p.active === false) return null;
  if (typeof p.unit_amount !== "number" || !Number.isFinite(p.unit_amount)) return null;
  if (typeof p.currency !== "string" || !p.currency) return null;
  const interval = p.recurring?.interval;
  if (interval !== "day" && interval !== "week" && interval !== "month" && interval !== "year")
    return null;
  const count = Number(p.recurring?.interval_count ?? 1);
  const tax =
    p.tax_behavior === "inclusive" || p.tax_behavior === "exclusive"
      ? p.tax_behavior
      : "unspecified";
  return {
    id: p.id,
    unitAmount: p.unit_amount,
    currency: p.currency.toLowerCase(),
    interval,
    intervalCount: Number.isFinite(count) && count > 0 ? count : 1,
    taxBehavior: tax,
  };
}

type CacheEntry = { at: number; value: PriceInfo | null; ok: boolean };
const priceCache = new Map<string, CacheEntry>();
export const PRICE_CACHE_MS = 10 * 60_000;
export const PRICE_ERROR_CACHE_MS = 60_000;

/** テストのため（覚えた値段を忘れる）。 */
export function clearPriceCache(): void {
  priceCache.clear();
}

/**
 * Price を1つ読む（覚えていればそれを返す）。読めなければ null（画面は購入ボタンを出さない）。
 * 鍵ごとに覚える（テスト用の鍵と本番の鍵で値段を取り違えない）。
 */
export async function readPriceCached(
  priceId: string,
  secretKey: string,
  fetchImpl: StripeFetch = fetch,
  now: number = Date.now(),
): Promise<PriceInfo | null> {
  const cacheKey = `${secretKey.slice(0, 8)}:${secretKey.slice(-6)}:${priceId}`;
  const hit = priceCache.get(cacheKey);
  if (hit && now - hit.at < (hit.ok ? PRICE_CACHE_MS : PRICE_ERROR_CACHE_MS)) return hit.value;
  let value: PriceInfo | null = null;
  let ok = false;
  try {
    const res = await fetchImpl(`${API}/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (res.ok) {
      value = priceFromStripe(await res.json());
      ok = value != null;
    }
  } catch {
    value = null;
  }
  priceCache.set(cacheKey, { at: now, value, ok });
  return value;
}

/** 月ごと・年ごとの値段（設定されていない方は null）。 */
export async function readPlanPrices(
  env: Record<string, string | undefined>,
  fetchImpl: StripeFetch = fetch,
  now: number = Date.now(),
): Promise<{ monthly: PriceInfo | null; yearly: PriceInfo | null; error: boolean }> {
  const key = env.STRIPE_SECRET_KEY;
  const m = env.STRIPE_PRICE_MONTHLY;
  const y = env.STRIPE_PRICE_YEARLY;
  if (!key) return { monthly: null, yearly: null, error: false };
  const [monthly, yearly] = await Promise.all([
    m ? readPriceCached(m, key, fetchImpl, now) : Promise.resolve(null),
    y ? readPriceCached(y, key, fetchImpl, now) : Promise.resolve(null),
  ]);
  const error = Boolean((m && !monthly) || (y && !yearly));
  return { monthly, yearly, error };
}

/**
 * 年ごとを月ごとと比べる。同じ通貨で「1か月」と「1年」のときだけ（比べられない物は null）。
 * `savePercent` は 12 か月ぶんの月額に対して何 % 安いか（切り捨て。安くなければ 0）。
 */
export function compareYearly(
  monthly: PriceInfo | null,
  yearly: PriceInfo | null,
): { perMonth: number; savePercent: number } | null {
  if (!monthly || !yearly) return null;
  if (monthly.currency !== yearly.currency) return null;
  if (monthly.interval !== "month" || monthly.intervalCount !== 1) return null;
  if (yearly.interval !== "year" || yearly.intervalCount !== 1) return null;
  const twelve = monthly.unitAmount * 12;
  const perMonth = Math.round(yearly.unitAmount / 12);
  const savePercent =
    twelve > 0 && yearly.unitAmount < twelve
      ? Math.floor(((twelve - yearly.unitAmount) / twelve) * 100)
      : 0;
  return { perMonth, savePercent };
}

type StripeList = { data?: Array<Record<string, unknown>> } | null;

const quote = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function stripeGetJson(
  path: string,
  secretKey: string,
  fetchImpl: StripeFetch,
): Promise<StripeList> {
  const res = await fetchImpl(`${API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`stripe ${res.status}`);
  return (await res.json()) as StripeList;
}

const ACTIVE = new Set(["active", "trialing", "past_due", "unpaid"]);

function pickCustomer(rows: Array<Record<string, unknown>>, from: "sub" | "customer") {
  const list = rows
    .map((r) => ({
      customer: from === "sub" ? r.customer : r.id,
      active: from === "sub" ? ACTIVE.has(String(r.status ?? "")) : false,
      created: Number(r.created ?? 0),
    }))
    .filter((r): r is { customer: string; active: boolean; created: number } => {
      return typeof r.customer === "string" && r.customer.length > 0;
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.created - a.created);
  return list[0]?.customer ?? null;
}

/**
 * **無料体験は1人1回だけ**（2026-10-03）。その人の定期購入が Stripe に1つでも在れば
 * （解約済み・体験だけで終わった物も含む）true。検索できない時は false（初めての人から
 * 体験を取り上げない。Stripe の検索の失敗はまれ）。
 */
export async function hadSubscriptionBefore(
  userId: string,
  secretKey: string,
  fetchImpl: StripeFetch = fetch,
): Promise<boolean> {
  try {
    const q = encodeURIComponent(`metadata['user_id']:'${quote(userId)}'`);
    const subs = await stripeGetJson(
      `/v1/subscriptions/search?query=${q}&limit=1`,
      secretKey,
      fetchImpl,
    );
    return (subs?.data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * その人の Stripe の顧客 ID を探す。見つからなければ null。
 * 定期購入の検索が失敗しても、メールの検索は試す（どちらも駄目なら null）。
 */
export async function findStripeCustomerId(
  p: { userId: string; email: string | null },
  secretKey: string,
  fetchImpl: StripeFetch = fetch,
): Promise<string | null> {
  try {
    const q = encodeURIComponent(`metadata['user_id']:'${quote(p.userId)}'`);
    const subs = await stripeGetJson(
      `/v1/subscriptions/search?query=${q}&limit=100`,
      secretKey,
      fetchImpl,
    );
    const viaSub = pickCustomer(subs?.data ?? [], "sub");
    if (viaSub) return viaSub;
  } catch {
    // 検索が使えない（地域・権限）。メールで探す。
  }
  if (p.email) {
    try {
      const q = encodeURIComponent(`email:'${quote(p.email)}'`);
      const found = await stripeGetJson(
        `/v1/customers/search?query=${q}&limit=10`,
        secretKey,
        fetchImpl,
      );
      return pickCustomer(found?.data ?? [], "customer");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 管理画面（Billing Portal）の入口を作る。成功なら URL。
 * Stripe の管理画面で「カスタマーポータル」を一度も保存していないと、Stripe は
 * 「configuration」の文で断る → `BILLING_PORTAL_NOT_CONFIGURED`。
 */
export async function createPortalSession(
  p: { customer: string; returnUrl: string; configuration?: string | null },
  secretKey: string,
  fetchImpl: StripeFetch = fetch,
): Promise<{ url: string }> {
  const form = new URLSearchParams();
  form.set("customer", p.customer);
  form.set("return_url", p.returnUrl);
  if (p.configuration) form.set("configuration", p.configuration);
  let res: Response;
  try {
    res = await fetchImpl(`${API}/v1/billing_portal/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch {
    throw new Error(BILLING_ERRORS.portalFailed);
  }
  const json = (await res.json().catch(() => null)) as {
    url?: unknown;
    error?: { message?: unknown };
  } | null;
  if (res.ok && typeof json?.url === "string") return { url: json.url };
  const message = typeof json?.error?.message === "string" ? json.error.message : "";
  if (/configuration|customer portal|settings\/billing\/portal/i.test(message))
    throw new Error(BILLING_ERRORS.portalNotConfigured);
  throw new Error(BILLING_ERRORS.portalFailed);
}
