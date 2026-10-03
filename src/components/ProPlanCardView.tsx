import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/legal/LegalShell";
import type { BillingStatus } from "@/lib/billing.functions";
import { useT, useUiLang } from "@/lib/i18n";
import { priceLabel, yearlyComparisonLabel } from "@/lib/price-label";

export type ProPlanBusy = null | "monthly" | "yearly" | "manage";

/**
 * **Pro の購入口の中身**（設定の「CatchWords Pro」の欄）。通信はしない — 状態と
 * 押したときの動きは `settings.tsx` の `ProPlanCard` が渡す（ハーネスでも同じ絵を描くため）。
 *
 * 出す物（特定商取引法の「最終確認」の考え方に合わせて、ボタンの**すぐそば**に置く）:
 * - Stripe から読んだ値段と通貨、年ごとの月あたりと割引
 * - 自動更新・解約の方法・返金の扱い・無料体験（設定があるときだけ）
 * - 利用規約・特商法の表記・プライバシーポリシーへのリンク
 *
 * 値段が読めない、または運営者の表記（特商法）がそろっていないときは買えない。
 * 開発者には、足りない設定の名前を出す。
 */
export function ProPlanCardView({
  status: s,
  busy,
  onBuy,
  onManage,
}: {
  status: BillingStatus;
  busy: ProPlanBusy;
  onBuy: (period: "monthly" | "yearly") => void;
  onManage: () => void;
}) {
  const t = useT();
  const lang = useUiLang();
  const { monthly, yearly } = s.prices;
  const hasPrice = Boolean(monthly || yearly);

  const adminNote = s.isAdmin && s.adminIssues.length > 0 && (
    <p className="mt-2 text-caption text-muted-foreground" data-testid="pro-admin-issues">
      {t("pro.adminMissing", { list: s.adminIssues.join(", ") })}
    </p>
  );

  if (s.isPro) {
    return (
      <div className="grid gap-3">
        <p className="text-body font-semibold">{t("pro.active")}</p>
        {s.configured && (
          <>
            <Button
              variant="outline"
              className="h-12"
              onClick={onManage}
              disabled={busy !== null}
              data-testid="pro-manage"
            >
              {busy === "manage" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pro.manage")}
            </Button>
            <p className="text-caption text-muted-foreground">{t("pro.manageHint")}</p>
          </>
        )}
        <LegalLinks className="text-caption text-muted-foreground" />
        {s.isAdmin && <p className="text-caption text-muted-foreground">{t("pro.devOnly")}</p>}
      </div>
    );
  }

  if (!s.configured) {
    return (
      <div>
        <p className="text-footnote text-muted-foreground">{t("pro.notConfigured")}</p>
        {adminNote}
      </div>
    );
  }

  if (!s.checkoutAllowed) {
    return (
      <div>
        <p className="text-footnote text-muted-foreground">
          {s.isAdmin ? t("pro.legalNotReadyAdmin") : t("pro.preparing")}
        </p>
        {adminNote}
      </div>
    );
  }

  if (!hasPrice || s.priceError) {
    return (
      <div>
        <p className="text-footnote text-muted-foreground">{t("pro.priceUnavailable")}</p>
        {adminNote}
      </div>
    );
  }

  const yearlyNote = yearlyComparisonLabel(monthly, yearly, lang, t);
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {monthly && (
          <Button
            onClick={() => onBuy("monthly")}
            disabled={busy !== null}
            className="h-auto min-h-14 flex-col gap-0.5 py-2"
            data-testid="pro-buy-monthly"
          >
            {busy === "monthly" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>{t("pro.monthly")}</span>
                <span className="text-footnote font-normal opacity-90">
                  {priceLabel(monthly, lang, t)}
                </span>
              </>
            )}
          </Button>
        )}
        {yearly && (
          <Button
            variant="outline"
            onClick={() => onBuy("yearly")}
            disabled={busy !== null}
            className="h-auto min-h-14 flex-col gap-0.5 py-2"
            data-testid="pro-buy-yearly"
          >
            {busy === "yearly" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>{t("pro.yearly")}</span>
                <span className="text-footnote font-normal">{priceLabel(yearly, lang, t)}</span>
                {yearlyNote && (
                  <span className="whitespace-normal text-caption font-normal text-muted-foreground">
                    {yearlyNote}
                  </span>
                )}
              </>
            )}
          </Button>
        )}
      </div>
      <div className="grid gap-1 text-caption text-muted-foreground" data-testid="pro-disclosure">
        {s.trialDays > 0 && <p>{t("pro.trial", { n: s.trialDays })}</p>}
        <p>{t("pro.autoRenew")}</p>
        <p>{t("pro.cancelAnytime")}</p>
        <p>{t("pro.noRefund")}</p>
        <p>{t("pro.agree")}</p>
      </div>
      <LegalLinks className="text-caption text-muted-foreground" />
      {!s.legalReady && s.isAdmin && (
        <p className="text-caption text-destructive">{t("pro.testModeOnly")}</p>
      )}
      {adminNote}
      {s.isAdmin && <p className="text-caption text-muted-foreground">{t("pro.devOnly")}</p>}
    </div>
  );
}
