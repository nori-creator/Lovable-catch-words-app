import { describe, expect, it } from "vitest";
import {
  billingReturnNotice,
  createTtlCache,
  formatPrice,
  majorAmount,
  parseStripePrice,
  perMonthUnitAmount,
  pickPortalCustomer,
  portalForm,
  pricingCta,
  stripBillingReturn,
  yearlySavingsPercent,
  type PublicPrice,
} from "./pricing";
import { portalErrorKey } from "./billing-errors";

const jpyMonth: PublicPrice = {
  unitAmount: 980,
  currency: "jpy",
  interval: "month",
  intervalCount: 1,
};
const jpyYear: PublicPrice = {
  unitAmount: 7800,
  currency: "jpy",
  interval: "year",
  intervalCount: 1,
};

describe("Stripe の値段を読む", () => {
  it("定期の値段だけを取り出す（番号・金額・通貨・期間）", () => {
    expect(
      parseStripePrice({
        id: "price_1",
        unit_amount: 980,
        currency: "JPY",
        active: true,
        recurring: { interval: "month", interval_count: 1 },
      }),
    ).toEqual({
      id: "price_1",
      unitAmount: 980,
      currency: "jpy",
      interval: "month",
      intervalCount: 1,
    });
  });

  it("止めた値段・1回きりの値段・壊れた形は出さない", () => {
    const ok = { id: "p", unit_amount: 1, currency: "jpy", recurring: { interval: "year" } };
    expect(parseStripePrice({ ...ok, active: false })).toBeNull();
    expect(parseStripePrice({ ...ok, recurring: null })).toBeNull();
    expect(parseStripePrice({ ...ok, recurring: { interval: "week" } })).toBeNull();
    expect(parseStripePrice({ ...ok, unit_amount: null })).toBeNull();
    expect(parseStripePrice({ ...ok, id: "" })).toBeNull();
    expect(parseStripePrice(null)).toBeNull();
    expect(parseStripePrice({ ...ok })?.intervalCount).toBe(1);
  });
});

describe("金額の書き方", () => {
  it("円は小数なし、ドル・台湾ドルは 100 で割る", () => {
    expect(majorAmount(980, "jpy")).toBe(980);
    expect(majorAmount(499, "usd")).toBe(4.99);
    expect(majorAmount(15000, "twd")).toBe(150);
  });

  it("表示言語の形で通貨記号を付ける。端数の無い金額に .00 を付けない", () => {
    expect(formatPrice(980, "jpy", "ja")).toMatch(/980/);
    expect(formatPrice(980, "jpy", "ja")).not.toMatch(/\.00/);
    expect(formatPrice(499, "usd", "en")).toBe("$4.99");
    expect(formatPrice(15000, "twd", "zh-TW")).not.toMatch(/\.00/);
  });

  it("知らない通貨でも落ちない", () => {
    expect(formatPrice(100, "zzz_bad", "ja")).toContain("ZZZ_BAD");
  });
});

describe("年ごとの見せ方（盛らない）", () => {
  it("月あたりは年の値段を12で割って切り捨て", () => {
    expect(perMonthUnitAmount(jpyYear)).toBe(650);
    expect(perMonthUnitAmount(jpyMonth)).toBe(980);
  });

  it("何%安いかは実際の2つの値段から計算する", () => {
    // 980×12 = 11,760 → 7,800 は 33.6% 安い → 切り捨てて 33
    expect(yearlySavingsPercent(jpyMonth, jpyYear)).toBe(33);
  });

  it("通貨が違う・どちらか無い・安くないなら出さない", () => {
    expect(yearlySavingsPercent(jpyMonth, { ...jpyYear, currency: "usd" })).toBeNull();
    expect(yearlySavingsPercent(null, jpyYear)).toBeNull();
    expect(yearlySavingsPercent(jpyMonth, null)).toBeNull();
    expect(yearlySavingsPercent(jpyMonth, { ...jpyYear, unitAmount: 11_760 })).toBeNull();
    expect(yearlySavingsPercent(jpyMonth, { ...jpyYear, unitAmount: 20_000 })).toBeNull();
  });
});

describe("料金の画面の押す所", () => {
  const base = { enabled: true, hasPrice: true, loggedIn: true, paidPro: false, nativeApp: false };

  it("ログインしていなければ、先にアカウントを作る", () => {
    expect(pricingCta({ ...base, loggedIn: false })).toBe("signup");
    expect(pricingCta(base)).toBe("checkout");
  });

  it("スイッチがオフ（開発者でもない）なら購入口を出さない", () => {
    expect(pricingCta({ ...base, enabled: false })).toBe("hidden");
    expect(pricingCta({ ...base, enabled: false, loggedIn: false })).toBe("hidden");
  });

  it("値段が読めなければ「準備中」", () => {
    expect(pricingCta({ ...base, hasPrice: false })).toBe("unavailable");
  });

  it("払っている人には、スイッチがオフでも解約の窓口を出す（解約の場所を隠さない）", () => {
    expect(pricingCta({ ...base, paidPro: true, enabled: false })).toBe("manage");
  });

  it("アプリの中では購入口を出さない（ストアの決まり）", () => {
    expect(pricingCta({ ...base, nativeApp: true })).toBe("hidden");
    expect(pricingCta({ ...base, nativeApp: true, paidPro: true })).toBe("hidden");
  });
});

describe("支払い画面から戻った時の知らせ", () => {
  it("?pro=ok / ?pro=cancel だけを読む", () => {
    expect(billingReturnNotice("?pro=ok")).toBe("ok");
    expect(billingReturnNotice("pro=cancel")).toBe("cancel");
    expect(billingReturnNotice("?pro=hack")).toBeNull();
    expect(billingReturnNotice("")).toBeNull();
  });

  it("読んだら pro だけを消し、ほかは残す", () => {
    expect(stripBillingReturn("?pro=ok")).toBe("");
    expect(stripBillingReturn("?tab=a&pro=ok")).toBe("?tab=a");
  });
});

describe("お支払いの管理の画面", () => {
  it("本人の定期購入だけから、有効な物・新しい物の順でお客さまの番号を選ぶ", () => {
    const subs = [
      { customer: "cus_other", status: "active", created: 9, metadata: { user_id: "u2" } },
      { customer: "cus_old", status: "canceled", created: 5, metadata: { user_id: "u1" } },
      { customer: "cus_live", status: "active", created: 3, metadata: { user_id: "u1" } },
      { customer: "cus_newer_dead", status: "canceled", created: 7, metadata: { user_id: "u1" } },
    ];
    expect(pickPortalCustomer(subs, "u1")).toBe("cus_live");
    expect(pickPortalCustomer(subs.slice(1, 2).concat(subs[3]), "u1")).toBe("cus_newer_dead");
  });

  it("本人の物が無い・形が違えば null（他人の画面を開かない）", () => {
    expect(
      pickPortalCustomer([{ customer: "cus_x", metadata: { user_id: "u2" } }], "u1"),
    ).toBeNull();
    expect(pickPortalCustomer([{ customer: 42, metadata: { user_id: "u1" } }], "u1")).toBeNull();
    expect(pickPortalCustomer(null, "u1")).toBeNull();
    expect(pickPortalCustomer([], "")).toBeNull();
  });

  it("Stripe へ送る中身", () => {
    const f = portalForm({ customer: "cus_1", returnUrl: "https://a.example/settings" });
    expect(f.get("customer")).toBe("cus_1");
    expect(f.get("return_url")).toBe("https://a.example/settings");
  });

  it("開けなかった理由を画面の言葉の鍵にする（生の文は出さない）", () => {
    expect(portalErrorKey(new Error("NO_SUBSCRIPTION"))).toBe("pro.manageNoSub");
    expect(portalErrorKey(new Error("BILLING_NOT_CONFIGURED"))).toBe("pro.notConfigured");
    expect(portalErrorKey(new Error("STRIPE_PORTAL_FAILED 400"))).toBe("pro.manageFailed");
    expect(portalErrorKey(undefined)).toBe("pro.manageFailed");
  });
});

describe("値段の覚え書き", () => {
  it("期限の内は覚え、過ぎたら忘れる", () => {
    let now = 0;
    const c = createTtlCache<number>(1000, () => now);
    c.set("a", 1);
    now = 999;
    expect(c.get("a")).toBe(1);
    now = 1001;
    expect(c.get("a")).toBeUndefined();
    expect(c.get("missing")).toBeUndefined();
  });
});

describe("無料体験（7日・1人1回）", () => {
  it("未設定なら7日、0 で体験なし、変な値は7日、長すぎは30日まで", async () => {
    const { trialDaysFromEnv } = await import("./pricing");
    expect(trialDaysFromEnv(undefined)).toBe(7);
    expect(trialDaysFromEnv("")).toBe(7);
    expect(trialDaysFromEnv("0")).toBe(0);
    expect(trialDaysFromEnv("14")).toBe(14);
    expect(trialDaysFromEnv("abc")).toBe(7);
    expect(trialDaysFromEnv("-3")).toBe(7);
    expect(trialDaysFromEnv("90")).toBe(30);
  });
  it("本人の定期購入が1つでも在れば（解約済みも）体験を付けない。他人の物は数えない", async () => {
    const { hadSubscriptionBefore } = await import("./pricing");
    expect(hadSubscriptionBefore([], "u1")).toBe(false);
    expect(hadSubscriptionBefore(null, "u1")).toBe(false);
    expect(hadSubscriptionBefore([{ status: "canceled", metadata: { user_id: "u1" } }], "u1")).toBe(
      true,
    );
    expect(hadSubscriptionBefore([{ status: "active", metadata: { user_id: "u2" } }], "u1")).toBe(
      false,
    );
  });
});
