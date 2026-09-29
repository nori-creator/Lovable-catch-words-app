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
  return f;
}

/** 購入口を出せる所。アプリ版は、ストアの課金が入るまで出さない（上の注）。 */
export function billingSurface(isNativeApp: boolean): "stripe" | "none" {
  return isNativeApp ? "none" : "stripe";
}
