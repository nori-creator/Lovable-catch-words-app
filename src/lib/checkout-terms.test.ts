import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkoutTerms } from "./checkout-terms";
import { DICT } from "./i18n";
import { checkoutForm, submitMessage } from "./stripe-billing";
import type { PriceInfo } from "./stripe-catalog";

/** 辞書の日本語で引く（`{n}` などは埋める）。 */
const t = (key: string, vars: Record<string, string | number> = {}) =>
  (DICT[key]?.ja ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

const MONTHLY: PriceInfo = {
  id: "price_m",
  unitAmount: 480,
  currency: "jpy",
  interval: "month",
  intervalCount: 1,
  taxBehavior: "inclusive",
};
const NOW = new Date("2026-10-03T03:00:00Z");

describe("申込みの最終確認（特商法 12 条の6）", () => {
  it("ガイドラインの6つ（分量・価格・支払の時期と方法・提供時期・申込期間・撤回と解除）を全部出す", () => {
    const rows = checkoutTerms({
      period: "monthly",
      price: MONTHLY,
      trialDays: 0,
      now: NOW,
      lang: "ja",
      t,
    });
    expect(rows.map((r) => r.key)).toEqual([
      "item",
      "price",
      "payment",
      "method",
      "start",
      "renew",
      "period",
      "cancel",
      "refund",
    ]);
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(v.item).toContain("定期購入");
    expect(v.price).toMatch(/[¥￥]480／月（税込）/);
    expect(v.payment).toContain("お申込みの時");
    expect(v.renew).toContain("自動で更新");
    expect(v.cancel).toContain("サブスクリプションを管理");
    expect(rows.every((r) => !/\{\w+\}/.test(r.value))).toBe(true);
  });

  it("無料期間があれば、初めて請求される日と金額を出す", () => {
    const rows = checkoutTerms({
      period: "monthly",
      price: MONTHLY,
      trialDays: 7,
      now: NOW,
      lang: "ja",
      t,
    });
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(v.trial).toContain("7日間は無料");
    expect(v.trial).toContain("2026年10月10日");
    expect(v.trial).toMatch(/[¥￥]480/);
    expect(v.payment).toContain("2026年10月10日");
    expect(v.cancel).toContain("無料期間中に解約");
  });

  it("税別の値段は、合計が次の画面に出ることを添える（税込と偽らない）", () => {
    const rows = checkoutTerms({
      period: "monthly",
      price: { ...MONTHLY, taxBehavior: "exclusive" },
      trialDays: 0,
      now: NOW,
      lang: "ja",
      t,
    });
    expect(rows.find((r) => r.key === "price")!.value).toContain("税別");
  });

  it("3言語とも文がある", () => {
    for (const key of Object.keys(DICT).filter((k) => k.startsWith("checkout.")))
      for (const lang of ["ja", "en", "zh-TW"] as const)
        expect([key, lang, Boolean(DICT[key][lang])]).toEqual([key, lang, true]);
    expect(DICT["checkout.submit"].ja).toBe("規約に同意して購入する（定期購入）");
  });
});

describe("支払いの画面（Stripe Checkout）", () => {
  it("言語を合わせ、申込みボタンの上に定期購入・解約の方法を出す", () => {
    const f = checkoutForm({
      priceId: "p",
      userId: "u",
      successUrl: "https://x/ok",
      cancelUrl: "https://x/no",
      trialDays: 7,
      lang: "zh-TW",
      interval: "year",
    });
    expect(f.get("locale")).toBe("zh-TW");
    expect(f.get("custom_text[submit][message]")).toContain("7 天免費期");
    expect(submitMessage("ja", "month", 0)).toContain("毎月自動で料金");
    for (const lang of ["ja", "en", "zh-TW"] as const)
      expect(submitMessage(lang, "month", 30).length).toBeLessThanOrEqual(1200);
  });
});

describe("購入口は確認を通った物だけ受ける", () => {
  const billing = fs.readFileSync(path.join(__dirname, "billing.functions.ts"), "utf8");
  const checkout = billing.slice(billing.indexOf("export const createCheckoutSession"));
  it("確認の印と、見せた値段・無料期間を確かめてから Stripe を呼ぶ", () => {
    expect(checkout).toMatch(/confirmed: z\.literal\(true\)/);
    const check = checkout.indexOf("BILLING_ERRORS.termsChanged");
    const call = checkout.indexOf("api.stripe.com/v1/checkout/sessions");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(call);
  });
  it("設定の画面は確認の画面を挟む（購入ボタンから直に Stripe へ行かない）", () => {
    const settings = fs.readFileSync(
      path.join(__dirname, "../components/screens/SettingsScreen.tsx"),
      "utf8",
    );
    expect(settings).toMatch(/onBuy=\{\(p\) => setConfirming\(p\)\}/);
    expect(settings).toMatch(/<ProCheckoutConfirm/);
  });
});
