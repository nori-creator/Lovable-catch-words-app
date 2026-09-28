import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { siteUrlFor } from "@/lib/site-url";
import { checkoutForm } from "@/lib/stripe-billing";

/**
 * **Pro の購入口（Stripe）**。計算は `stripe-billing.ts`、知らせの受け口は
 * `routes/api.stripe-webhook.ts`。
 *
 * 使う秘密の値（Lovable の Secrets に入れる。**画面やチャットに貼らない**）:
 * - `STRIPE_SECRET_KEY` … Stripe の秘密鍵（テスト中は `sk_test_…`）
 * - `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` … 値段の番号（`price_…`）
 * - `STRIPE_WEBHOOK_SECRET` … 知らせの署名の鍵（`whsec_…`）
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

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isProUser } = await import("./ai-provider.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const configured = Boolean(
      process.env.STRIPE_SECRET_KEY &&
      (process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_YEARLY),
    );
    const enabled = (await subscriptionSwitch()) || Boolean(isAdmin);
    return {
      /** 購入口を出してよいか（スイッチ、または開発者）。 */
      enabled,
      /** Stripe の鍵と値段が入っているか（無ければ押しても買えない）。 */
      configured,
      isPro: await isProUser(context.userId),
      isAdmin: Boolean(isAdmin),
      prices: {
        monthly: Boolean(process.env.STRIPE_PRICE_MONTHLY),
        yearly: Boolean(process.env.STRIPE_PRICE_YEARLY),
      },
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
    if (!key || !price) throw new Error("BILLING_NOT_CONFIGURED");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!(await subscriptionSwitch()) && !isAdmin) throw new Error("BILLING_DISABLED");
    const { data: u } = await context.supabase.auth.getUser();
    const trial = Number(process.env.STRIPE_TRIAL_DAYS ?? 0);
    const form = checkoutForm({
      priceId: price,
      userId: context.userId,
      email: u.user?.email ?? null,
      successUrl: siteUrlFor("/settings?pro=ok"),
      cancelUrl: siteUrlFor("/settings?pro=cancel"),
      trialDays: Number.isFinite(trial) ? trial : 0,
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
