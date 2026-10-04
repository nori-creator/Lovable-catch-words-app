import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingStatus } from "@/lib/billing.functions";
import { checkoutTerms } from "@/lib/checkout-terms";
import { useT, useUiLang } from "@/lib/i18n";

/**
 * **申込みの最終確認**（特定商取引法 12 条の6。中身の決まりは `lib/checkout-terms.ts`）。
 * 「月ごと / 年ごとで始める」を押すとこれが出て、ここで**有料の定期購入の申込み**であることを
 * はっきり示したボタンを押した時だけ支払いの画面（Stripe）へ進む。
 *
 * 通信はしない（ハーネスでも同じ絵を描くため）。押した時の動きは `SettingsScreen` の
 * `ProPlanCard` が渡す。
 */
export function ProCheckoutConfirm({
  status: s,
  period,
  busy,
  onConfirm,
  onBack,
  now = new Date(),
}: {
  status: BillingStatus;
  period: "monthly" | "yearly";
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
  now?: Date;
}) {
  const t = useT();
  const lang = useUiLang();
  const price = period === "yearly" ? s.prices.yearly : s.prices.monthly;
  if (!price) return null;
  const rows = checkoutTerms({ period, price, trialDays: s.trialEligibleDays, now, lang, t });
  return (
    <section
      className="grid gap-3"
      aria-labelledby="checkout-confirm-title"
      data-testid="pro-checkout-confirm"
    >
      <div>
        <h4 id="checkout-confirm-title" className="text-body font-bold">
          {t("checkout.title")}
        </h4>
        <p className="mt-0.5 text-caption text-muted-foreground">{t("checkout.lead")}</p>
      </div>
      <dl className="grid gap-0 overflow-hidden rounded-xl border border-border">
        {rows.map((r, i) => (
          <div
            key={r.key}
            data-term={r.key}
            className={`grid gap-0.5 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <dt className="text-caption font-semibold text-muted-foreground">{r.label}</dt>
            <dd className="text-footnote leading-relaxed">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-muted-foreground">
        {t("checkout.readTerms")}{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline underline-offset-2"
        >
          {t("auth.terms")}
        </a>
        {" · "}
        <a
          href="/legal/tokushoho"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline underline-offset-2"
        >
          {t("legal.tokushoho")}
        </a>
        {" · "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline underline-offset-2"
        >
          {t("auth.privacy")}
        </a>
      </p>
      <Button
        onClick={onConfirm}
        disabled={busy}
        className="h-auto min-h-14 whitespace-normal py-2"
        data-testid="pro-checkout-submit"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("checkout.submit")}
      </Button>
      <p className="text-caption text-muted-foreground">{t("checkout.nextStep")}</p>
      <Button variant="ghost" onClick={onBack} disabled={busy} className="h-11">
        {t("checkout.back")}
      </Button>
    </section>
  );
}
