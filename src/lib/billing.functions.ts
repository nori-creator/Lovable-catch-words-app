import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { siteUrlFor } from "@/lib/site-url";
import { checkoutForm } from "@/lib/stripe-billing";
import { checkoutAllowedByLegal, readLegalConfig } from "@/lib/legal-config";
import {
  BILLING_ERRORS,
  createPortalSession,
  findStripeCustomerId,
  hadSubscriptionBefore,
  readPlanPrices,
  type PriceInfo,
} from "@/lib/stripe-catalog";

/**
 * **Pro の購入口（Stripe）**。計算は `stripe-billing.ts`、知らせの受け口は
 * `routes/api.stripe-webhook.ts`。
 *
 * 使う秘密の値（Lovable の Secrets に入れる。**画面やチャットに貼らない**）:
 * - `STRIPE_SECRET_KEY` … Stripe の秘密鍵（テスト中は `sk_test_…`）
 * - `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` … 値段の番号（`price_…`）
 * - `STRIPE_WEBHOOK_SECRET` … 知らせの署名の鍵（`whsec_…`）
 * - `STRIPE_PORTAL_CONFIGURATION` …（任意）管理画面の設定 ID（`bpc_…`）。無ければ既定の設定
 * - `LEGAL_*` … 運営者の表記（`legal-config.ts`）。そろうまで本番の購入口は開かない
 *
 * **開発者のスイッチ（`subscriptionEnabled`）がオフの間は、開発者にしか購入口を
 * 出さない**（オーナー指示「開発者の私だけ広告やサブスクの ON/OFF を切り替えられるように」）。
 */
async function subscriptionSwitch(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any)
      .from("app_config")
      .select("value")
      .eq("key", "monetization")
      .maybeSingle();
    return (
      (data as { value?: { ads?: { subscriptionEnabled?: unknown } } } | null)?.value?.ads
        ?.subscriptionEnabled === true
    );
  } catch {
    return false;
  }
}

/** その人の `profiles.plan` が本当に pro か（開発者の「Pro 扱い」とは別。払っている人）。 */
async function hasPaidPlan(userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    return (data as { plan?: string } | null)?.plan === "pro";
  } catch {
    return false;
  }
}

export type BillingStatus = {
  /** 購入口を出してよいか（スイッチ、または開発者）。 */
  enabled: boolean;
  /** Stripe の鍵と値段が入っているか（無ければ押しても買えない）。 */
  configured: boolean;
  /** Pro の機能が使えるか（開発者は Pro 扱い）。 */
  isPro: boolean;
  /** 実際に払っている（`profiles.plan = pro`）。スイッチがオフでも解約の口は出す。 */
  paidPro: boolean;
  isAdmin: boolean;
  /** Stripe から読んだ値段（読めない・設定が無い方は null）。 */
  prices: { monthly: PriceInfo | null; yearly: PriceInfo | null };
  /** 設定されている値段のどれかを読めなかった。 */
  priceError: boolean;
  /** 運営者の表記（特商法）がそろっているか。 */
  legalReady: boolean;
  /** 購入ボタンを押してよいか（表記がそろう、またはテスト用の鍵で開発者）。 */
  checkoutAllowed: boolean;
  /** 無料体験の日数（0 は無し）。 */
  trialDays: number;
  /** 開発者にだけ返す: 足りない設定の名前。 */
  adminIssues: string[];
};

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingStatus> => {
    const { isProUser } = await import("./ai-provider.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const env = process.env;
    const configured = Boolean(
      env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_MONTHLY || env.STRIPE_PRICE_YEARLY),
    );
    const enabled = (await subscriptionSwitch()) || Boolean(isAdmin);
    const paidPro = await hasPaidPlan(context.userId);
    const legal = readLegalConfig(env);
    // 値段は購入口を出すときだけ読む（出さない人のために Stripe を呼ばない）。
    const prices =
      configured && (enabled || paidPro)
        ? await readPlanPrices(env)
        : { monthly: null, yearly: null, error: false };
    const adminIssues: string[] = [];
    if (isAdmin) {
      if (!env.STRIPE_SECRET_KEY) adminIssues.push("STRIPE_SECRET_KEY");
      if (!env.STRIPE_PRICE_MONTHLY && !env.STRIPE_PRICE_YEARLY)
        adminIssues.push("STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY");
      if (prices.error) adminIssues.push("STRIPE_PRICE_* (Stripe price not readable)");
      adminIssues.push(...legal.missing);
    }
    return {
      enabled,
      configured,
      isPro: await isProUser(context.userId),
      paidPro,
      isAdmin: Boolean(isAdmin),
      prices: { monthly: prices.monthly, yearly: prices.yearly },
      priceError: prices.error,
      legalReady: legal.ready,
      checkoutAllowed: checkoutAllowedByLegal({
        legalReady: legal.ready,
        isAdmin: Boolean(isAdmin),
        secretKey: env.STRIPE_SECRET_KEY,
      }),
      trialDays: legal.trialDays,
      adminIssues,
    };
  });

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ period: z.enum(["monthly", "yearly"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const key = process.env.STRIPE_SECRET_KEY;
    const price =
      data.period === "yearly" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
    if (!key || !price) throw new Error(BILLING_ERRORS.notConfigured);
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!(await subscriptionSwitch()) && !isAdmin) throw new Error(BILLING_ERRORS.disabled);
    // 運営者の表記（特商法）がそろうまで、本番の支払いは受けない（嘘・空の表記で売らない）。
    const legal = readLegalConfig(process.env);
    if (
      !checkoutAllowedByLegal({
        legalReady: legal.ready,
        isAdmin: Boolean(isAdmin),
        secretKey: key,
      })
    )
      throw new Error(BILLING_ERRORS.legalNotReady);
    const { data: u } = await context.supabase.auth.getUser();
    // 無料体験は1人1回だけ（前に定期購入が在る人には付けない）。
    const trialDays =
      legal.trialDays > 0 && (await hadSubscriptionBefore(context.userId, key))
        ? 0
        : legal.trialDays;
    const form = checkoutForm({
      priceId: price,
      userId: context.userId,
      email: u.user?.email ?? null,
      successUrl: siteUrlFor("/settings?pro=ok"),
      cancelUrl: siteUrlFor("/settings?pro=cancel"),
      trialDays,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const json = (await res.json().catch(() => null)) as { url?: string; error?: unknown } | null;
    if (!res.ok || !json?.url) throw new Error(`STRIPE_CHECKOUT_FAILED ${res.status}`);
    return { url: json.url };
  });

/**
 * **定期購入の管理（解約・支払い方法・領収書）— Stripe の Billing Portal**。
 *
 * 顧客 ID は新しい列に持たない。定期購入の `metadata.user_id`、無ければメールで探す
 * （`stripe-catalog.ts`）。スイッチがオフでも、**実際に払っている人は解約できる**
 * （解約の口を閉じて請求だけ続く、を作らない）。
 */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error(BILLING_ERRORS.notConfigured);
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const allowed =
      (await subscriptionSwitch()) || Boolean(isAdmin) || (await hasPaidPlan(context.userId));
    if (!allowed) throw new Error(BILLING_ERRORS.disabled);
    const { data: u } = await context.supabase.auth.getUser();
    const customer = await findStripeCustomerId(
      { userId: context.userId, email: u.user?.email ?? null },
      key,
    );
    if (!customer) throw new Error(BILLING_ERRORS.noCustomer);
    return createPortalSession(
      {
        customer,
        returnUrl: siteUrlFor("/settings"),
        configuration: process.env.STRIPE_PORTAL_CONFIGURATION || null,
      },
      key,
    );
  });
