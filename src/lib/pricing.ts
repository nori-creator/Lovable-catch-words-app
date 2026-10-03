/**
 * **料金の画面（`/pro`）と解約の窓口の計算**（オーナー指示 2026-10-03「Web 版でお金を
 * 受け取れるようにして」）。ここは**計算だけ**（通信は `billing.functions.ts`）。
 *
 * ## 値段は書き込まない
 * 値段は Stripe に登録した値段（`price_…`）を**その場で Stripe から読む**
 * （`GET /v1/prices/{id}`）。画面やコードに「¥980」と書くと、Stripe で値段を変えた日に
 * 画面と実際の請求が食い違う（特定商取引法の「販売価格」の表示が嘘になる）。
 *
 * ## ダークパターンを使わない（`docs/monetization.md` §2-1「やらないこと」）
 * - 「年ごとは何%お得」は、**同じ通貨の月ごとと年ごとの実際の値段から計算した数**だけ出す
 *   （計算できない時は出さない。盛った数を書かない）。
 * - 残り時間で煽らない・解約の場所を隠さない（設定に「解約・お支払いの管理」を常に出す）。
 */
import type { UiLang } from "./i18n";

/** Stripe の値段1つ（画面に出すのに要る分だけ）。 */
export type PriceInfo = {
  id: string;
  /** 最小単位（円なら円、ドルならセント）。Stripe の `unit_amount` そのもの。 */
  unitAmount: number;
  /** 小文字の通貨（`jpy` / `twd` / `usd` …）。 */
  currency: string;
  interval: "month" | "year";
  intervalCount: number;
};

/** 画面へ返す値段（値段の番号 `price_…` を除いた物）。 */
export type PublicPrice = Omit<PriceInfo, "id">;

/**
 * 小数の無い通貨（Stripe の一覧「zero-decimal currencies」）。`unit_amount` がそのまま金額。
 * それ以外は 100 で割る（TWD も Stripe では2桁の小数の扱い）。
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

/** Stripe の `GET /v1/prices/{id}` の返事から、画面に要る分を取り出す。形が違えば null。 */
export function parseStripePrice(json: unknown): PriceInfo | null {
  if (!json || typeof json !== "object") return null;
  const p = json as {
    id?: unknown;
    unit_amount?: unknown;
    currency?: unknown;
    active?: unknown;
    type?: unknown;
    recurring?: { interval?: unknown; interval_count?: unknown } | null;
  };
  if (typeof p.id !== "string" || !p.id) return null;
  // 止めた値段（active=false）は売らない — 画面に出すと、押しても買えない値段になる。
  if (p.active === false) return null;
  if (typeof p.unit_amount !== "number" || !Number.isFinite(p.unit_amount) || p.unit_amount < 0)
    return null;
  if (typeof p.currency !== "string" || !p.currency) return null;
  const interval = p.recurring?.interval;
  if (interval !== "month" && interval !== "year") return null;
  const count = Number(p.recurring?.interval_count ?? 1);
  return {
    id: p.id,
    unitAmount: p.unit_amount,
    currency: p.currency.toLowerCase(),
    interval,
    intervalCount: Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1,
  };
}

/** 最小単位 → 金額（`1980` セント → `19.8`、`980` 円 → `980`）。 */
export function majorAmount(unitAmount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? unitAmount : unitAmount / 100;
}

const LOCALE: Record<UiLang, string> = {
  ja: "ja-JP",
  en: "en-US",
  "zh-TW": "zh-TW",
};

/** 画面に出す金額の文字（`¥980` / `NT$150` / `$4.99`）。 */
export function formatPrice(unitAmount: number, currency: string, lang: UiLang): string {
  const amount = majorAmount(unitAmount, currency);
  try {
    return new Intl.NumberFormat(LOCALE[lang], {
      style: "currency",
      currency: currency.toUpperCase(),
      // 端数の無い金額に「.00」を付けない（¥980 / NT$150）。端数があれば2桁まで。
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

/** 1か月あたりの値段（最小単位。年ごとを月で割った物）。 */
export function perMonthUnitAmount(p: PublicPrice): number {
  const months = (p.interval === "year" ? 12 : 1) * p.intervalCount;
  // 小数の無い通貨は切り捨てて整数に（「月あたり ¥650」）。小数のある通貨も最小単位で切り捨て。
  return Math.floor(p.unitAmount / months);
}

/**
 * 年ごとが月ごとより**何%安いか**。実際の2つの値段から計算する。
 * 通貨が違う・どちらか無い・安くない時は null（その時は「お得」と書かない）。
 */
export function yearlySavingsPercent(
  monthly: PublicPrice | null,
  yearly: PublicPrice | null,
): number | null {
  if (!monthly || !yearly) return null;
  if (monthly.currency !== yearly.currency) return null;
  const monthsInMonthly = (monthly.interval === "year" ? 12 : 1) * monthly.intervalCount;
  const monthsInYearly = (yearly.interval === "year" ? 12 : 1) * yearly.intervalCount;
  const fullYear = (monthly.unitAmount / monthsInMonthly) * monthsInYearly;
  if (fullYear <= 0) return null;
  const pct = Math.floor(((fullYear - yearly.unitAmount) / fullYear) * 100);
  return pct >= 1 ? pct : null;
}

/** 料金の画面の押す所。どの状態で何を出すかを1か所で決める。 */
export type PricingCta =
  /** Stripe の鍵・値段がまだ（押しても買えない）。「準備中」と出す。 */
  | "unavailable"
  /** 開発者のスイッチがオフで、開発者でもない。購入口を出さない（中身の説明だけ）。 */
  | "hidden"
  /** ログインしていない。先にアカウントを作る（作った後この画面に戻る）。 */
  | "signup"
  /** Stripe の支払い画面へ。 */
  | "checkout"
  /** もう Pro（お金を払っている）。「お支払いの管理・解約」へ。 */
  | "manage";

export function pricingCta(p: {
  /** 購入口を出してよいか（スイッチ）。ログイン前はスイッチだけ、ログイン後は開発者も。 */
  enabled: boolean;
  /** Stripe の値段が1つ以上読めたか。 */
  hasPrice: boolean;
  loggedIn: boolean;
  /** Stripe で払っている Pro か（開発者の「Pro 扱い」は含めない）。 */
  paidPro: boolean;
  /** アプリ（iPhone / Android）の中か。ストアの決まりで購入口は出さない（`billingSurface`）。 */
  nativeApp: boolean;
}): PricingCta {
  if (p.paidPro) return p.nativeApp ? "hidden" : "manage";
  if (p.nativeApp || !p.enabled) return "hidden";
  if (!p.hasPrice) return "unavailable";
  return p.loggedIn ? "checkout" : "signup";
}

/**
 * Stripe の支払い画面から戻った時の知らせ（`?pro=ok` / `?pro=cancel`）。
 * 知らない値は null（何も出さない）。
 */
export function billingReturnNotice(search: string): "ok" | "cancel" | null {
  const v = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("pro");
  return v === "ok" || v === "cancel" ? v : null;
}

/** 知らせを読んだ後の住所（`pro` だけを消す。ほかの検索文字列は残す）。 */
export function stripBillingReturn(search: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  q.delete("pro");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Stripe の定期購入1つ（お客さまの番号を探すのに要る分だけ）。 */
type SubLike = {
  customer?: unknown;
  status?: unknown;
  created?: unknown;
  metadata?: Record<string, unknown> | null;
};

/**
 * その人の定期購入の一覧から、**お支払いの管理の画面を開く Stripe のお客さまの番号**を選ぶ。
 *
 * お客さまの番号はデータベースに保存していない（変える所を増やさない）。Checkout は
 * `subscription_data.metadata.user_id` を付けて作るので、Stripe の定期購入を
 * `metadata['user_id']` で検索すれば、その人のお客さまの番号が分かる。
 * - 本人の物（`metadata.user_id` が一致）だけを見る（取り違えて他人の画面を開かない）
 * - 有効（active / trialing / past_due …）な物を優先し、無ければ一番新しい物
 */
export function pickPortalCustomer(subs: unknown, userId: string): string | null {
  if (!Array.isArray(subs) || !userId) return null;
  const mine = (subs as SubLike[]).filter(
    (s) =>
      s &&
      typeof s === "object" &&
      s.metadata?.user_id === userId &&
      typeof s.customer === "string" &&
      s.customer.startsWith("cus_"),
  );
  if (mine.length === 0) return null;
  const live = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
  const created = (s: SubLike) => (typeof s.created === "number" ? s.created : 0);
  const sorted = [...mine].sort((a, b) => {
    const la = live.has(String(a.status)) ? 1 : 0;
    const lb = live.has(String(b.status)) ? 1 : 0;
    return lb - la || created(b) - created(a);
  });
  return sorted[0].customer as string;
}

/** お支払いの管理の画面（Billing Portal）を作る時に Stripe へ送る中身。 */
export function portalForm(p: { customer: string; returnUrl: string }): URLSearchParams {
  const f = new URLSearchParams();
  f.set("customer", p.customer);
  f.set("return_url", p.returnUrl);
  return f;
}

/**
 * 期限つきの覚え書き（サーバの中だけ）。Stripe の値段は変わる事がほぼ無いので、
 * 開くたびに Stripe に聞かない。値段を変えた時も `ttlMs` の内に新しい値段になる。
 */
export function createTtlCache<V>(ttlMs: number, now: () => number = Date.now) {
  const store = new Map<string, { at: number; value: V }>();
  return {
    get(key: string): V | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V) {
      store.set(key, { at: now(), value });
    },
  };
}
