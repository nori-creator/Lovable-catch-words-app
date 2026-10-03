import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { siteUrlFor } from "@/lib/site-url";
import { checkoutForm } from "@/lib/stripe-billing";
import {
  createTtlCache,
  hadSubscriptionBefore,
  parseStripePrice,
  pickPortalCustomer,
  portalForm,
  trialDaysFromEnv,
  type PriceInfo,
  type PublicPrice,
} from "@/lib/pricing";

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

/** `profiles.plan` が `pro` か（Stripe の知らせで書かれる。開発者の扱いは足さない）。 */
async function paidProUser(userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    return (data as { plan?: string } | null)?.plan === "pro";
  } catch {
    return false;
  }
}

/**
 * Stripe の値段の覚え書き（10分）。管理画面で値段を変えても10分以内に画面に出る。
 * 読めなかった時は覚えない（次に開いた時にまた聞く）。
 */
const priceCache = createTtlCache<PriceInfo>(10 * 60_000);

async function readStripePrice(key: string, priceId: string): Promise<PriceInfo | null> {
  const hit = priceCache.get(priceId);
  if (hit) return hit;
  try {
    const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error("[billing] could not read the Stripe price", { status: res.status });
      return null;
    }
    const price = parseStripePrice(await res.json());
    if (price) priceCache.set(priceId, price);
    return price;
  } catch (e) {
    console.error("[billing] could not read the Stripe price", {
      message: (e as Error)?.message,
    });
    return null;
  }
}

/**
 * **料金の画面（`/pro`）の中身**。ログインしていない人も見られる（値段を知ってから
 * 登録できるように）。値段は Stripe から読む — **コードに値段を書かない**。
 *
 * - `enabled` … 開発者のスイッチ（ログイン前は開発者か分からないので、スイッチだけ）
 * - `configured` … Stripe の鍵と値段の番号が入っているか
 * - `monthly` / `yearly` … Stripe から読めた値段（読めない・未設定は null）
 *
 * 秘密鍵・値段の番号そのものは返さない（返すのは金額・通貨・期間だけ）。
 */
export const getPublicPricing = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  const monthlyId = process.env.STRIPE_PRICE_MONTHLY;
  const yearlyId = process.env.STRIPE_PRICE_YEARLY;
  const configured = Boolean(key && (monthlyId || yearlyId));
  const enabled = await subscriptionSwitch();
  const trial = trialDaysFromEnv(process.env.STRIPE_TRIAL_DAYS);
  const [monthly, yearly] =
    key && configured
      ? await Promise.all([
          monthlyId ? readStripePrice(key, monthlyId) : Promise.resolve(null),
          yearlyId ? readStripePrice(key, yearlyId) : Promise.resolve(null),
        ])
      : [null, null];
  return {
    enabled,
    configured,
    monthly: publicPrice(monthly),
    yearly: publicPrice(yearly),
    trialDays: trial,
  };
});

/** 画面へ返す値段（値段の番号 `price_…` は返さない）。 */
function publicPrice(p: PriceInfo | null): PublicPrice | null {
  return p
    ? {
        unitAmount: p.unitAmount,
        currency: p.currency,
        interval: p.interval,
        intervalCount: p.intervalCount,
      }
    : null;
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
      /** Stripe で払っている Pro か（開発者の「Pro 扱い」を含めない）。解約の窓口はこちらで出す。 */
      paidPro: await paidProUser(context.userId),
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
    // 無料体験は1人1回だけ（前に定期購入が在れば付けない）。検索できない時は体験を付ける
    // （Stripe の検索が止まった時に、初めての人から体験を取り上げない）。
    let trial = trialDaysFromEnv(process.env.STRIPE_TRIAL_DAYS);
    if (trial > 0) {
      const subs = await searchUserSubscriptions(key, context.userId);
      if (subs.ok && hadSubscriptionBefore(subs.data, context.userId)) trial = 0;
    }
    const form = checkoutForm({
      priceId: price,
      userId: context.userId,
      email: u.user?.email ?? null,
      successUrl: siteUrlFor("/settings?pro=ok"),
      cancelUrl: siteUrlFor("/settings?pro=cancel"),
      trialDays: trial,
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
 * **お支払いの管理・解約の画面（Stripe Billing Portal）を開く**（2026-10-03）。
 *
 * 解約・カードの変更・領収書は Stripe が用意する画面でやる（こちらで作り直さない）。
 * 解約しても、**払った期間の終わりまでは Pro のまま**（Stripe の管理画面 → 設定 →
 * Billing → カスタマーポータル で「請求期間の終了時にキャンセル」を選んでおく。
 * 手順は `docs/monetization.md` §5-1）。期間が終わると Stripe が
 * `customer.subscription.deleted` を送り、知らせの受け口が無料に戻す。
 *
 * Stripe のお客さまの番号はデータベースに保存していない。Checkout が定期購入に付けた
 * `metadata.user_id` で Stripe を検索して見つける（`pickPortalCustomer`）。
 * そのため**データベースの変更は要らない**。
 *
 * 失敗の印（画面が言葉に直す）:
 * - `BILLING_NOT_CONFIGURED` … Stripe の鍵が無い
 * - `NO_SUBSCRIPTION` … この人の定期購入が Stripe に見つからない（買った直後は Stripe の
 *   検索に出るまで1分ほどかかることがある）
 * - `STRIPE_PORTAL_FAILED` … Stripe が画面を作れなかった（カスタマーポータルの設定がまだ等）
 */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("BILLING_NOT_CONFIGURED");
    const auth = { Authorization: `Bearer ${key}` };
    const found = await searchUserSubscriptions(key, context.userId);
    if (!found.ok) throw new Error(`STRIPE_PORTAL_FAILED ${found.status}`);
    const customer = pickPortalCustomer(found.data, context.userId);
    if (!customer) throw new Error("NO_SUBSCRIPTION");
    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: portalForm({ customer, returnUrl: siteUrlFor("/settings") }).toString(),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => null)) as { url?: string } | null;
    if (!res.ok || !json?.url) {
      console.error("[billing] could not open the billing portal", { status: res.status });
      throw new Error(`STRIPE_PORTAL_FAILED ${res.status}`);
    }
    return { url: json.url };
  });

/**
 * その人の Stripe の定期購入を探す（Checkout が付けた `metadata.user_id` で検索）。
 * 買った直後は検索に出るまで1分ほどかかることがある（Stripe の検索の仕様）。
 */
async function searchUserSubscriptions(
  key: string,
  userId: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number }> {
  // 検索の式に入れる値。利用者の番号（UUID）に引用符は無いが、念のため落とす。
  const q = encodeURIComponent(`metadata['user_id']:'${userId.replace(/'/g, "")}'`);
  try {
    const found = await fetch(
      `https://api.stripe.com/v1/subscriptions/search?query=${q}&limit=20`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000) },
    );
    const list = (await found.json().catch(() => null)) as { data?: unknown } | null;
    if (!found.ok) {
      console.error("[billing] could not search subscriptions", { status: found.status });
      return { ok: false, status: found.status };
    }
    return { ok: true, data: list?.data };
  } catch {
    console.error("[billing] could not search subscriptions", { status: 0 });
    return { ok: false, status: 0 };
  }
}
