import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_ERRORS,
  PRICE_CACHE_MS,
  clearPriceCache,
  compareYearly,
  createPortalSession,
  findStripeCustomerId,
  hadSubscriptionBefore,
  formatStripeAmount,
  priceFromStripe,
  readPlanPrices,
  readPriceCached,
  type PriceInfo,
} from "./stripe-catalog";

/** Stripe の偽物。道（path）ごとに返事を決める。呼ばれた URL と中身を覚える。 */
function fakeStripe(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const path = u.replace("https://api.stripe.com", "");
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key)
      return new Response(JSON.stringify({ error: { message: "no route" } }), { status: 404 });
    const r = routes[key];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const MONTHLY_RAW = {
  id: "price_m",
  active: true,
  unit_amount: 480,
  currency: "jpy",
  recurring: { interval: "month", interval_count: 1 },
  tax_behavior: "inclusive",
};
const YEARLY_RAW = {
  id: "price_y",
  active: true,
  unit_amount: 4800,
  currency: "jpy",
  recurring: { interval: "year", interval_count: 1 },
  tax_behavior: "inclusive",
};

beforeEach(() => clearPriceCache());

describe("priceFromStripe", () => {
  it("定期の Price を画面の形に", () => {
    expect(priceFromStripe(MONTHLY_RAW)).toEqual({
      id: "price_m",
      unitAmount: 480,
      currency: "jpy",
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
  });
  it("止めてある・金額が無い・定期でない物は使わない（嘘の値段を出さない）", () => {
    expect(priceFromStripe({ ...MONTHLY_RAW, active: false })).toBeNull();
    expect(priceFromStripe({ ...MONTHLY_RAW, unit_amount: null })).toBeNull();
    expect(priceFromStripe({ ...MONTHLY_RAW, recurring: null })).toBeNull();
    expect(priceFromStripe(null)).toBeNull();
  });
  it("税の扱いが決まっていなければ unspecified（税込と言わない）", () => {
    expect(priceFromStripe({ ...MONTHLY_RAW, tax_behavior: null })?.taxBehavior).toBe(
      "unspecified",
    );
  });
});

describe("formatStripeAmount", () => {
  it("円は小数の無い通貨（480 は 480 円）", () => {
    expect(formatStripeAmount(480, "jpy", "ja-JP")).toMatch(/480/);
    expect(formatStripeAmount(480, "jpy", "ja-JP")).not.toMatch(/4\.8/);
  });
  it("ドル・台湾ドルは 100 で割る。端数が無ければ .00 を付けない", () => {
    expect(formatStripeAmount(499, "usd", "en-US")).toBe("$4.99");
    expect(formatStripeAmount(15000, "twd", "zh-TW")).toMatch(/150(?![.\d])/);
  });
});

describe("compareYearly", () => {
  const m = priceFromStripe(MONTHLY_RAW) as PriceInfo;
  const y = priceFromStripe(YEARLY_RAW) as PriceInfo;
  it("月あたりと割引（12か月ぶんに対して）", () => {
    expect(compareYearly(m, y)).toEqual({ perMonth: 400, savePercent: 16 });
  });
  it("通貨が違う・周期が違う・片方が無いときは比べない", () => {
    expect(compareYearly(m, { ...y, currency: "usd" })).toBeNull();
    expect(compareYearly(m, { ...y, intervalCount: 2 })).toBeNull();
    expect(compareYearly(null, y)).toBeNull();
  });
  it("年の方が高ければ割引は 0", () => {
    expect(compareYearly(m, { ...y, unitAmount: 9999 })?.savePercent).toBe(0);
  });
});

describe("readPriceCached — Stripe を毎回呼ばない", () => {
  it("読んだ値段を 10 分覚える。鍵を Authorization に付ける", async () => {
    const s = fakeStripe({ "/v1/prices/price_m": { body: MONTHLY_RAW } });
    const a = await readPriceCached("price_m", "sk_test_abcdef123456", s.impl, 1000);
    const b = await readPriceCached(
      "price_m",
      "sk_test_abcdef123456",
      s.impl,
      1000 + PRICE_CACHE_MS - 1,
    );
    expect(a?.unitAmount).toBe(480);
    expect(b).toEqual(a);
    expect(s.calls).toHaveLength(1);
    expect((s.calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk_test_abcdef123456",
    );
    await readPriceCached("price_m", "sk_test_abcdef123456", s.impl, 1000 + PRICE_CACHE_MS + 1);
    expect(s.calls).toHaveLength(2);
  });
  it("読めなければ null（画面は購入ボタンを出さない）", async () => {
    const s = fakeStripe({
      "/v1/prices/": { status: 404, body: { error: { message: "No such price" } } },
    });
    expect(await readPriceCached("price_x", "sk_test_k", s.impl, 0)).toBeNull();
  });
  it("通信そのものが落ちても投げない", async () => {
    const boom = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await readPriceCached("price_x", "sk_test_k", boom, 0)).toBeNull();
  });
});

describe("readPlanPrices", () => {
  it("月・年の両方を読む", async () => {
    const s = fakeStripe({
      "/v1/prices/price_m": { body: MONTHLY_RAW },
      "/v1/prices/price_y": { body: YEARLY_RAW },
    });
    const r = await readPlanPrices(
      {
        STRIPE_SECRET_KEY: "sk_test_k",
        STRIPE_PRICE_MONTHLY: "price_m",
        STRIPE_PRICE_YEARLY: "price_y",
      },
      s.impl,
      0,
    );
    expect([r.monthly?.unitAmount, r.yearly?.unitAmount, r.error]).toEqual([480, 4800, false]);
  });
  it("設定された値段が読めなければ error", async () => {
    const s = fakeStripe({ "/v1/prices/price_m": { body: MONTHLY_RAW } });
    const r = await readPlanPrices(
      {
        STRIPE_SECRET_KEY: "sk_test_k",
        STRIPE_PRICE_MONTHLY: "price_m",
        STRIPE_PRICE_YEARLY: "price_gone",
      },
      s.impl,
      0,
    );
    expect([r.monthly?.id, r.yearly, r.error]).toEqual(["price_m", null, true]);
  });
  it("鍵が無ければ Stripe を呼ばない", async () => {
    const s = fakeStripe({});
    const r = await readPlanPrices({ STRIPE_PRICE_MONTHLY: "price_m" }, s.impl, 0);
    expect(r).toEqual({ monthly: null, yearly: null, error: false });
    expect(s.calls).toHaveLength(0);
  });
});

describe("findStripeCustomerId — 新しい列を足さずに顧客を探す", () => {
  it("定期購入の metadata.user_id で探し、有効な物の顧客を優先する", async () => {
    const s = fakeStripe({
      "/v1/subscriptions/search": {
        body: {
          data: [
            {
              id: "sub_old",
              customer: "cus_old",
              status: "canceled",
              created: 200,
              metadata: { user_id: "u-1" },
            },
            {
              id: "sub_live",
              customer: "cus_live",
              status: "active",
              created: 100,
              metadata: { user_id: "u-1" },
            },
          ],
        },
      },
    });
    expect(
      await findStripeCustomerId({ userId: "u-1", email: "a@b.co" }, "sk_test_k", s.impl),
    ).toBe("cus_live");
    expect(decodeURIComponent(s.calls[0].url)).toContain("metadata['user_id']:'u-1'");
    expect(s.calls).toHaveLength(1);
  });
  it("定期購入が無ければメールで探す — 本人の metadata.user_id の顧客だけ（新しい順）", async () => {
    const s = fakeStripe({
      "/v1/subscriptions/search": { body: { data: [] } },
      "/v1/customers/search": {
        body: {
          data: [
            { id: "cus_a", created: 1, metadata: { user_id: "u-1" } },
            { id: "cus_b", created: 5, metadata: { user_id: "u-1" } },
            { id: "cus_other", created: 9, metadata: { user_id: "u-2" } },
          ],
        },
      },
    });
    expect(
      await findStripeCustomerId({ userId: "u-1", email: "a@b.co" }, "sk_test_k", s.impl),
    ).toBe("cus_b");
    expect(decodeURIComponent(s.calls[1].url)).toContain("email:'a@b.co'");
  });
  it("メールが同じでも、本人の印が無い・違う顧客は選ばない（ほかの人の管理画面を開かない）", async () => {
    const s = fakeStripe({
      "/v1/subscriptions/search": { body: { data: [] } },
      "/v1/customers/search": {
        body: {
          data: [
            { id: "cus_nometa", created: 5 },
            { id: "cus_empty", created: 6, metadata: {} },
            { id: "cus_other", created: 9, metadata: { user_id: "u-2" } },
          ],
        },
      },
    });
    expect(
      await findStripeCustomerId({ userId: "u-1", email: "a@b.co" }, "sk_test_k", s.impl),
    ).toBeNull();
  });
  it("定期購入の検索の結果も、本人の印の物だけ使う", async () => {
    const s = fakeStripe({
      "/v1/subscriptions/search": {
        body: {
          data: [
            {
              id: "sub_x",
              customer: "cus_other",
              status: "active",
              created: 1,
              metadata: { user_id: "u-2" },
            },
          ],
        },
      },
      "/v1/customers/search": { body: { data: [] } },
    });
    expect(
      await findStripeCustomerId({ userId: "u-1", email: "a@b.co" }, "sk_test_k", s.impl),
    ).toBeNull();
  });
  it("引用符を逃がす（検索の文を壊さない）", async () => {
    const s = fakeStripe({ "/v1/subscriptions/search": { body: { data: [] } } });
    await findStripeCustomerId({ userId: "x'y", email: null }, "sk_test_k", s.impl);
    expect(decodeURIComponent(s.calls[0].url)).toContain("'x\\'y'");
  });
  it("検索が失敗してもメールは試す。どちらも無ければ null", async () => {
    const s = fakeStripe({
      "/v1/subscriptions/search": {
        status: 400,
        body: { error: { message: "search unavailable" } },
      },
      "/v1/customers/search": { body: { data: [] } },
    });
    expect(
      await findStripeCustomerId({ userId: "u", email: "a@b.co" }, "sk_test_k", s.impl),
    ).toBeNull();
    expect(s.calls).toHaveLength(2);
  });
});

describe("createPortalSession", () => {
  it("顧客と戻り先を送り、URL を返す", async () => {
    const s = fakeStripe({
      "/v1/billing_portal/sessions": { body: { url: "https://billing.stripe.com/p/session/x" } },
    });
    const r = await createPortalSession(
      { customer: "cus_1", returnUrl: "https://catchwords.app/settings", configuration: "bpc_1" },
      "sk_test_k",
      s.impl,
    );
    expect(r.url).toBe("https://billing.stripe.com/p/session/x");
    const body = new URLSearchParams(String(s.calls[0].init?.body));
    expect([body.get("customer"), body.get("return_url"), body.get("configuration")]).toEqual([
      "cus_1",
      "https://catchwords.app/settings",
      "bpc_1",
    ]);
    expect(s.calls[0].init?.method).toBe("POST");
  });
  it("ポータルが未設定なら、はっきりした印で断る", async () => {
    const s = fakeStripe({
      "/v1/billing_portal/sessions": {
        status: 400,
        body: {
          error: {
            message:
              "No configuration provided and your test mode default configuration has not been created. Provide a configuration or create your default by saving your customer portal settings in test mode at https://dashboard.stripe.com/test/settings/billing/portal.",
          },
        },
      },
    });
    await expect(
      createPortalSession(
        { customer: "cus_1", returnUrl: "https://x/settings" },
        "sk_test_k",
        s.impl,
      ),
    ).rejects.toThrow(BILLING_ERRORS.portalNotConfigured);
  });
  it("ほかの失敗は BILLING_PORTAL_FAILED（Stripe の文をそのまま出さない）", async () => {
    const s = fakeStripe({
      "/v1/billing_portal/sessions": {
        status: 400,
        body: { error: { message: "No such customer: cus_1" } },
      },
    });
    await expect(
      createPortalSession(
        { customer: "cus_1", returnUrl: "https://x/settings" },
        "sk_test_k",
        s.impl,
      ),
    ).rejects.toThrow(BILLING_ERRORS.portalFailed);
  });
});

describe("hadSubscriptionBefore — 無料体験は1人1回", () => {
  it("定期購入が1つでも在れば（解約済みも）true、無ければ false", async () => {
    const had = fakeStripe({
      "/v1/subscriptions/search": {
        body: { data: [{ id: "sub_old", customer: "cus_1", status: "canceled" }] },
      },
    });
    expect(await hadSubscriptionBefore("u-1", "sk_test_k", had.impl)).toBe(true);
    expect(decodeURIComponent(had.calls[0].url)).toContain("metadata['user_id']:'u-1'");
    const none = fakeStripe({ "/v1/subscriptions/search": { body: { data: [] } } });
    expect(await hadSubscriptionBefore("u-1", "sk_test_k", none.impl)).toBe(false);
  });
  it("検索に失敗したら false（初めての人から体験を取り上げない）", async () => {
    const broken = fakeStripe({ "/v1/subscriptions/search": { status: 500, body: {} } });
    expect(await hadSubscriptionBefore("u-1", "sk_test_k", broken.impl)).toBe(false);
  });
});
