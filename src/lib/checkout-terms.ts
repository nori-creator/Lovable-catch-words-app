/**
 * **申込みの最終確認の中身**（特定商取引法 12 条の6・消費者庁「通信販売の申込み段階における
 * 表示についてのガイドライン」。2026-10-03）。
 *
 * 支払いの画面（Stripe）へ進むボタンの直前に、次を**その画面の中で**見せる:
 * 1. 分量（役務の内容と数・定期購入であること・1回の期間）
 * 2. 販売価格（税込かどうかは Stripe の Price の設定どおり。推測しない）と、2回目以降の代金
 * 3. 支払の時期・方法（無料期間があれば、終わって初めて請求される日と金額）
 * 4. 役務の提供時期
 * 5. 申込期間（無い）
 * 6. 申込みの撤回・解除（解約の方法・いつから請求が止まるか・自動更新・返金）
 *
 * ここは純粋な計算だけ（画面は `components/ProCheckoutConfirm.tsx`、試験は
 * `checkout-terms.test.ts`）。値段・無料期間は**サーバが実際に使う物**（`getBillingStatus` の
 * `prices` と `trialEligibleDays`）から作り、購入口でも同じ値を確かめ直す（`createCheckoutSession`）。
 */
import { localeOf, type UiLang } from "./i18n";
import { priceLabel } from "./price-label";
import type { PriceInfo } from "./stripe-catalog";

type T = (key: string, vars?: Record<string, string | number>) => string;

export type CheckoutTermRow = { key: string; label: string; value: string };

/** 今日から `days` 日後の日付（表示言語の書式）。 */
export function dateAfterDays(days: number, now: Date, lang: UiLang): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString(localeOf(lang), { year: "numeric", month: "long", day: "numeric" });
}

export function checkoutTerms(input: {
  period: "monthly" | "yearly";
  price: PriceInfo;
  trialDays: number;
  now: Date;
  lang: UiLang;
  t: T;
}): CheckoutTermRow[] {
  const { period, price, trialDays, now, lang, t } = input;
  const amount = priceLabel(price, lang, t);
  const plan = t(period === "yearly" ? "checkout.planYearly" : "checkout.planMonthly");
  const cycle = t(period === "yearly" ? "checkout.cycleYear" : "checkout.cycleMonth");
  const rows: CheckoutTermRow[] = [
    { key: "item", label: t("checkout.item"), value: t("checkout.itemValue", { plan, cycle }) },
    {
      key: "price",
      label: t("checkout.price"),
      value:
        price.taxBehavior === "exclusive"
          ? `${amount} ${t("checkout.priceExclNote")}`
          : t("checkout.priceValue", { price: amount }),
    },
  ];
  if (trialDays > 0) {
    const first = dateAfterDays(trialDays, now, lang);
    rows.push({
      key: "trial",
      label: t("checkout.trial"),
      value: t("checkout.trialValue", { n: trialDays, date: first, price: amount }),
    });
    rows.push({
      key: "payment",
      label: t("checkout.payment"),
      value: t("checkout.paymentTrial", { date: first, cycle }),
    });
  } else {
    rows.push({
      key: "payment",
      label: t("checkout.payment"),
      value: t("checkout.paymentNow", { cycle }),
    });
  }
  rows.push(
    { key: "method", label: t("checkout.method"), value: t("checkout.methodValue") },
    { key: "start", label: t("checkout.start"), value: t("checkout.startValue") },
    { key: "renew", label: t("checkout.renew"), value: t("checkout.renewValue", { cycle }) },
    { key: "period", label: t("checkout.applyPeriod"), value: t("checkout.applyPeriodValue") },
    {
      key: "cancel",
      label: t("checkout.cancel"),
      value: t(trialDays > 0 ? "checkout.cancelValueTrial" : "checkout.cancelValue"),
    },
    { key: "refund", label: t("checkout.refund"), value: t("checkout.refundValue") },
  );
  return rows;
}
