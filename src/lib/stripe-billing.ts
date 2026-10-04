/**
 * **サブスク（Pro）の支払い — Stripe**（オーナー指示 2026-09-28「サブスクも開始して。
 * stripe つないで」）。ここは**計算だけ**（通信・データベースは `billing.functions.ts`
 * と `routes/api.stripe-webhook.ts`）。テストしやすいように分けてある。
 *
 * ## 流れ
 * 1. 設定の「Pro にする」→ サーバが Stripe の支払い画面（Checkout）を作り、そこへ移る。
 *    誰の支払いかは `client_reference_id` と `subscription_data.metadata.user_id` に書く。
 * 2. 払い終わると、Stripe がこのアプリのサーバ（`/api/stripe-webhook`）へ知らせる。
 *    知らせが本物かは**署名**で確かめる（`verifyStripeSignature`）。
 * 3. 知らせの中身（定期購入の状態）から Pro か無料かを決め、`profiles.plan` に書く。
 *    解約・支払い失敗で状態が変われば、同じ道で無料に戻る。
 *
 * ## iPhone / Android のアプリの中では（大事）
 * アプリの中で機能を解放する課金は、原則それぞれのストアの課金を使う決まりがある。
 * 日本では 2025年12月18日から「スマホ新法」で外部の支払いも使えるようになったが、
 * **Apple の課金と並べて出すことが条件**（Apple の発表）。なので、Stripe の購入口は
 * **Web 版でだけ**出す（`billingSurface`）。アプリ版は、ストアの課金を入れてから開く。
 */
import { UI_LANGS, type UiLang } from "./i18n";

export type Plan = "pro" | "free";

/** 定期購入の状態 → Pro か。試用中・支払い済みだけが Pro（支払いの遅れ等は無料に戻す）。 */
export function planFromSubscriptionStatus(status: string | null | undefined): Plan {
  return status === "active" || status === "trialing" ? "pro" : "free";
}

/** Stripe の知らせ（イベント）から、誰を・どちらにするかを取り出す。関係ない知らせは null。 */
export function planChangeFromEvent(
  event: unknown,
): { userId: string; plan: Plan; customer: string | null } | null {
  if (!event || typeof event !== "object") return null;
  const e = event as { type?: string; data?: { object?: Record<string, unknown> } };
  const o = e.data?.object ?? {};
  const meta = (o.metadata ?? {}) as Record<string, unknown>;
  const customer = typeof o.customer === "string" ? o.customer : null;
  if (e.type === "checkout.session.completed") {
    const userId = typeof o.client_reference_id === "string" ? o.client_reference_id : meta.user_id;
    if (typeof userId !== "string" || !userId) return null;
    // 払い終えた（`payment_status` が paid）か、試用で 0 円のときだけ Pro にする。
    const paid = o.payment_status === "paid" || o.payment_status === "no_payment_required";
    return paid ? { userId, plan: "pro", customer } : null;
  }
  if (
    e.type === "customer.subscription.created" ||
    e.type === "customer.subscription.updated" ||
    e.type === "customer.subscription.deleted"
  ) {
    const userId = meta.user_id;
    if (typeof userId !== "string" || !userId) return null;
    const plan =
      e.type === "customer.subscription.deleted"
        ? "free"
        : planFromSubscriptionStatus(typeof o.status === "string" ? o.status : null);
    return { userId, plan, customer };
  }
  return null;
}

/** Stripe の API を GET で読む（`/v1/...`）。失敗は投げる（知らせの受け口が 500 を返し、Stripe が送り直す）。 */
export type StripeGet = (path: string) => Promise<unknown>;

type StripeSubscription = {
  id?: unknown;
  status?: unknown;
  customer?: unknown;
  metadata?: Record<string, unknown> | null;
};

const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * **知らせの順番を信じない**（監査 2026-10-03）。Stripe は知らせを順番どおりに届ける
 * 約束をしていない — 「解約」の後に古い「更新（active）」が届くと、解約した人が Pro に
 * 戻っていた。知らせは「誰の・どの定期購入か」を知るためだけに使い、**状態はその場で
 * Stripe から読み直す**（`GET /v1/subscriptions/:id`）。
 *
 * - その定期購入が active / trialing なら Pro
 * - そうでなければ、同じ人の**ほかの**定期購入（`metadata.user_id` で検索）に
 *   active / trialing が在れば Pro（2つ買って片方を解約した人を無料に落とさない）。
 *   検索が使えないときはその定期購入の状態で決める。
 * - 定期購入の `metadata.user_id` が知らせの人と違えば何もしない（取り違えを書かない）
 *
 * 関係ない知らせ・人の分からない知らせは null。
 */
export async function resolvePlanChange(
  event: unknown,
  stripeGet: StripeGet,
): Promise<{ userId: string; plan: Plan; customer: string | null } | null> {
  if (!event || typeof event !== "object") return null;
  const e = event as { type?: string; data?: { object?: Record<string, unknown> } };
  const o = e.data?.object ?? {};
  const meta = (o.metadata ?? {}) as Record<string, unknown>;
  let userId: string | null;
  let subId: string | null;
  if (e.type === "checkout.session.completed") {
    userId = strOrNull(o.client_reference_id) ?? strOrNull(meta.user_id);
    const sub = o.subscription;
    subId =
      strOrNull(sub) ??
      (sub && typeof sub === "object" ? strOrNull((sub as { id?: unknown }).id) : null);
  } else if (
    e.type === "customer.subscription.created" ||
    e.type === "customer.subscription.updated" ||
    e.type === "customer.subscription.deleted"
  ) {
    userId = strOrNull(meta.user_id);
    subId = strOrNull(o.id);
  } else {
    return null;
  }
  if (!userId || !subId) return null;

  const sub = (await stripeGet(
    `/v1/subscriptions/${encodeURIComponent(subId)}`,
  )) as StripeSubscription | null;
  if (!sub || typeof sub !== "object") throw new Error("stripe: subscription not readable");
  const owner = strOrNull(sub.metadata?.user_id);
  if (owner && owner !== userId) return null;
  const customer = strOrNull(sub.customer);
  const status = strOrNull(sub.status);
  if (planFromSubscriptionStatus(status) === "pro") return { userId, plan: "pro", customer };

  // この定期購入は有効でない。同じ人のほかの定期購入を確かめる。
  try {
    const q = encodeURIComponent(`metadata['user_id']:'${userId.replace(/'/g, "")}'`);
    const found = (await stripeGet(`/v1/subscriptions/search?query=${q}&limit=100`)) as {
      data?: StripeSubscription[];
    } | null;
    const other = (found?.data ?? []).some(
      (s) =>
        strOrNull(s.id) !== subId &&
        strOrNull(s.metadata?.user_id) === userId &&
        planFromSubscriptionStatus(strOrNull(s.status)) === "pro",
    );
    if (other) return { userId, plan: "pro", customer };
  } catch {
    // 検索が使えない。読み直したこの定期購入の状態で決める。
  }
  return { userId, plan: "free", customer };
}

/** Stripe の秘密鍵で GET する（`resolvePlanChange` に渡す形）。 */
export function stripeGetWith(secretKey: string, fetchImpl: typeof fetch = fetch): StripeGet {
  return async (path) => {
    const res = await fetchImpl(`https://api.stripe.com${path}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) throw new Error(`stripe ${res.status}`);
    return res.json();
  };
}

/**
 * 知らせが本当に Stripe から来たかを確かめる（Stripe の公式の方式）。
 *
 * ヘッダー `Stripe-Signature: t=<時刻>,v1=<署名>` の署名は、`<時刻>.<届いた本文>` を
 * 秘密の鍵（`STRIPE_WEBHOOK_SECRET`）で HMAC-SHA256 した値。同じ値を計算して比べる。
 * 古すぎる（`toleranceSec` 秒より前の）知らせは、盗んで送り直された物として断る。
 * Web Crypto で計算するので、Node でも Cloudflare の上でも動く。
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || sigs.length === 0) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Checkout を作る時に Stripe へ送る中身（`application/x-www-form-urlencoded`）。
 * Stripe の API は入れ子を `a[b][c]=` の形で受け取る。
 */
export function checkoutForm(p: {
  priceId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  email?: string | null;
  trialDays?: number;
  /** 支払いの画面（Stripe Checkout）の言語と、申込みボタンの上に出す注意書きの言語。 */
  lang?: string | null;
  /** 更新の周期（注意書きに使う）。 */
  interval?: "day" | "week" | "month" | "year";
}): URLSearchParams {
  const f = new URLSearchParams();
  f.set("mode", "subscription");
  f.set("line_items[0][price]", p.priceId);
  f.set("line_items[0][quantity]", "1");
  f.set("success_url", p.successUrl);
  f.set("cancel_url", p.cancelUrl);
  f.set("client_reference_id", p.userId);
  f.set("subscription_data[metadata][user_id]", p.userId);
  f.set("metadata[user_id]", p.userId);
  f.set("allow_promotion_codes", "true");
  if (p.email) f.set("customer_email", p.email);
  if (p.trialDays && p.trialDays > 0)
    f.set("subscription_data[trial_period_days]", String(Math.floor(p.trialDays)));
  // 支払いの画面でも、申込みボタンのすぐ上に「定期購入・自動更新・解約の方法」を出す
  // （特商法 12 条の6。こちらの最終確認の画面で全部を見せた上で、念のため）。
  const lang = checkoutLang(p.lang);
  f.set("locale", STRIPE_LOCALE[lang]);
  f.set(
    "custom_text[submit][message]",
    submitMessage(lang, p.interval ?? "month", p.trialDays ?? 0),
  );
  return f;
}

type CheckoutLang = UiLang;
type Interval = "day" | "week" | "month" | "year";

/** 支払いの画面の言語（Stripe の `locale`）。表示言語の鍵と同じ綴り。 */
const STRIPE_LOCALE: Record<CheckoutLang, string> = {
  ja: "ja",
  en: "en",
  "zh-TW": "zh-TW",
};

function checkoutLang(lang: string | null | undefined): CheckoutLang {
  return (UI_LANGS as readonly string[]).includes(lang ?? "") ? (lang as CheckoutLang) : "ja";
}

/**
 * 支払いの画面の申込みボタンの上の注意書き（Stripe の `custom_text.submit`、1200 字まで）。
 * サーバで組み立てるので、ここに3言語で持つ。
 */
const SUBMIT_MESSAGES: Record<CheckoutLang, (unit: string, trialDays: number) => string> = {
  ja: (unit, trialDays) =>
    `有料の定期購入です。${trialDays > 0 ? `${trialDays}日間の無料期間の後、` : ""}解約しない限り${unit}自動で料金がかかります。` +
    "解約は CatchWords の「設定 › CatchWords Pro › サブスクリプションを管理」からいつでもできます。法令で必要な場合を除き返金はありません。",
  en: (unit, trialDays) =>
    `This is a paid subscription. ${trialDays > 0 ? `After the ${trialDays}-day free trial, you` : "You"} will be charged automatically ${unit} until you cancel. ` +
    "Cancel any time in CatchWords: Settings › CatchWords Pro › Manage subscription. Payments are not refunded except where required by law.",
  "zh-TW": (unit, trialDays) =>
    `這是付費的定期訂閱。${trialDays > 0 ? `${trialDays} 天免費期結束後，` : ""}除非取消，將${unit}自動收費。` +
    "可隨時在 CatchWords 的「設定 › CatchWords Pro › 管理訂閱」取消。除法令另有規定外，已支付的費用不予退還。",
};
const SUBMIT_UNITS: Record<CheckoutLang, Record<Interval, string>> = {
  ja: { day: "毎日", week: "毎週", month: "毎月", year: "毎年" },
  en: { day: "every day", week: "every week", month: "every month", year: "every year" },
  "zh-TW": { day: "每天", week: "每週", month: "每月", year: "每年" },
};

export function submitMessage(lang: CheckoutLang, interval: Interval, trialDays: number): string {
  return SUBMIT_MESSAGES[lang](SUBMIT_UNITS[lang][interval], trialDays);
}

/** 購入口を出せる所。アプリ版は、ストアの課金が入るまで出さない（上の注）。 */
export function billingSurface(isNativeApp: boolean): "stripe" | "none" {
  return isNativeApp ? "none" : "stripe";
}
