import { localeOf, type UiLang } from "./i18n";
import { compareYearly, formatStripeAmount, type PriceInfo } from "./stripe-catalog";

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Stripe の値段を「¥480／月（税込）」の形に（購入口と特商法の頁で同じ書き方にする）。
 * 税の表記は Stripe の Price の `tax_behavior` が決まっているときだけ付ける（推測しない）。
 */
export function priceLabel(p: PriceInfo, lang: UiLang, t: T): string {
  const price = formatStripeAmount(p.unitAmount, p.currency, localeOf(lang));
  const base =
    p.intervalCount === 1
      ? t(`price.${p.interval}`, { price })
      : t("price.every", { price, n: p.intervalCount, unit: t(`price.unit.${p.interval}`) });
  const tax =
    p.taxBehavior === "inclusive"
      ? t("price.taxIncl")
      : p.taxBehavior === "exclusive"
        ? t("price.taxExcl")
        : "";
  if (!tax) return base;
  // 全角の括弧（日本語・繁體中文）の前に空白を入れない。
  return tax.startsWith("（") ? `${base}${tax}` : `${base} ${tax}`;
}

/** 年ごとの「月あたり約 ¥400 · 月ごとより 16% お得」。比べられなければ null。 */
export function yearlyComparisonLabel(
  monthly: PriceInfo | null,
  yearly: PriceInfo | null,
  lang: UiLang,
  t: T,
): string | null {
  const c = compareYearly(monthly, yearly);
  if (!c || !yearly) return null;
  const per = t("pro.yearlyPerMonth", {
    price: formatStripeAmount(c.perMonth, yearly.currency, localeOf(lang)),
  });
  return c.savePercent > 0 ? `${per} · ${t("pro.yearlySave", { n: c.savePercent })}` : per;
}
