import { Check, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/LegalLinks";
import { useT, useUiLang } from "@/lib/i18n";
import {
  formatPrice,
  perMonthUnitAmount,
  yearlySavingsPercent,
  type PricingCta,
  type PublicPrice,
} from "@/lib/pricing";

/**
 * **料金の画面の中身**（`/pro`。オーナー指示 2026-10-03「Web 版でお金を受け取れるように」）。
 *
 * 道順（ログイン・支払い画面へ移る）は `routes/pro.tsx` が持ち、ここは描くだけ
 * （画面の確認用ページ `?scene=pricing` からも本物のまま描ける）。
 *
 * ## 書いてよいことだけを書く
 * 無料と Pro の違いは**コードが実際に分けている物だけ**（2026-10-03 に確かめた）:
 * - 解説の項目の作り直し … Pro だけ（`runSectionRegen` が拒む）
 * - 誤りの報告 … 無料は記録だけ（開発者が確かめてから直す）、Pro はその場で AI が直す
 *   （`reportMayRegenerate`）
 * - 解説を作る AI … Pro は上位のモデル（`modelRichPremium`）
 * 3D・切り抜き・広告なし等は、Web 版でまだ誰にも動いていないので**書かない**。
 *
 * ## ダークパターンを使わない（`docs/monetization.md` §2-1）
 * 煽るカウントダウン・「いちばん人気」の作り話・閉じにくい案内は置かない。
 * 「何%お得」は実際の2つの値段から計算できた時だけ（`yearlySavingsPercent`）。
 * 自動更新・解約・返金の決まりを、押す所のすぐ下に書く。
 */
export type PricingData = {
  enabled: boolean;
  configured: boolean;
  monthly: PublicPrice | null;
  yearly: PublicPrice | null;
  trialDays: number;
};

type Row = { label: string; free: string | boolean; pro: string | boolean };

export function PricingView({
  data,
  cta,
  busy = null,
  onCheckout,
  onSignup,
  onManage,
  devNote = false,
  sellerMissing = false,
}: {
  /** 読み込み中は null。 */
  data: PricingData | null;
  cta: PricingCta;
  busy?: null | "monthly" | "yearly" | "manage";
  onCheckout?: (period: "monthly" | "yearly") => void;
  onSignup?: () => void;
  onManage?: () => void;
  /** 開発者にだけ「スイッチはまだオフ」と出す。 */
  devNote?: boolean;
  /** 開発者にだけ「特定商取引法の表記の連絡先（メール）が未設定」と出す。 */
  sellerMissing?: boolean;
}) {
  const t = useT();
  const lang = useUiLang();
  const rows: Row[] = [
    { label: t("pricing.rowCatch"), free: true, pro: true },
    { label: t("pricing.rowBasics"), free: true, pro: true },
    { label: t("pricing.rowReview"), free: true, pro: true },
    { label: t("pricing.rowReport"), free: t("pricing.reportFree"), pro: t("pricing.reportPro") },
    { label: t("pricing.rowRegen"), free: false, pro: true },
    { label: t("pricing.rowModel"), free: t("pricing.modelFree"), pro: t("pricing.modelPro") },
  ];
  const savings = yearlySavingsPercent(data?.monthly ?? null, data?.yearly ?? null);
  const showPrices = cta !== "hidden" && cta !== "manage";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-hero font-bold tracking-tight">{t("pricing.title")}</h1>
        <p className="text-body text-muted-foreground">{t("pricing.lead")}</p>
      </header>

      {/* 比べる表。無料で止まらない物を先に書く（学ぶ輪は無料のまま）。 */}
      <section aria-labelledby="pricing-compare" className="space-y-2">
        <h2 id="pricing-compare" className="text-title font-semibold">
          {t("pricing.compare")}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-footnote">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="p-3 font-medium">
                  <span className="sr-only">{t("pricing.feature")}</span>
                </th>
                <th scope="col" className="w-[28%] p-3 text-center font-semibold">
                  {t("pricing.free")}
                </th>
                <th scope="col" className="w-[28%] p-3 text-center font-semibold text-primary">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-0">
                  <th scope="row" className="p-3 font-normal">
                    {r.label}
                  </th>
                  <Cell v={r.free} yes={t("pricing.included")} no={t("pricing.notIncluded")} />
                  <Cell v={r.pro} yes={t("pricing.included")} no={t("pricing.notIncluded")} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-muted-foreground">{t("pricing.modelNote")}</p>
      </section>

      <section aria-labelledby="pricing-price" className="space-y-3">
        <h2 id="pricing-price" className="text-title font-semibold">
          {t("pricing.price")}
        </h2>
        {!data ? (
          <p className="flex items-center gap-2 text-footnote text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("common.loading")}
          </p>
        ) : cta === "manage" ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-body font-semibold">{t("pro.active")}</p>
            <Button onClick={onManage} disabled={busy !== null} className="h-12 w-full">
              {busy === "manage" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pro.manage")}
            </Button>
          </div>
        ) : cta === "hidden" ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-footnote text-muted-foreground">
            {t("pricing.notOpenYet")}
          </p>
        ) : cta === "unavailable" ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-footnote text-muted-foreground">
            {t("pricing.unavailable")}
          </p>
        ) : null}

        {data && showPrices && cta !== "unavailable" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.monthly && (
              <PriceCard
                title={t("pricing.monthly")}
                price={formatPrice(data.monthly.unitAmount, data.monthly.currency, lang)}
                per={t("pricing.perMonth")}
                sub={null}
                button={cta === "signup" ? t("pricing.signupFirst") : t("pro.monthly")}
                busy={busy === "monthly"}
                disabled={busy !== null}
                onClick={() => (cta === "signup" ? onSignup?.() : onCheckout?.("monthly"))}
              />
            )}
            {data.yearly && (
              <PriceCard
                title={t("pricing.yearly")}
                price={formatPrice(data.yearly.unitAmount, data.yearly.currency, lang)}
                per={t("pricing.perYear")}
                sub={[
                  t("pricing.perMonthEquiv", {
                    price: formatPrice(perMonthUnitAmount(data.yearly), data.yearly.currency, lang),
                  }),
                  savings ? t("pricing.savings", { pct: savings }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                button={cta === "signup" ? t("pricing.signupFirst") : t("pro.yearly")}
                busy={busy === "yearly"}
                disabled={busy !== null}
                outline
                onClick={() => (cta === "signup" ? onSignup?.() : onCheckout?.("yearly"))}
              />
            )}
          </div>
        )}

        {data && showPrices && cta !== "unavailable" && (
          <ul className="list-disc space-y-1 pl-5 text-footnote text-muted-foreground">
            {data.trialDays > 0 && <li>{t("pricing.trial", { n: data.trialDays })}</li>}
            <li>{t("pricing.taxIncluded")}</li>
            <li>{t("pricing.autoRenew")}</li>
            <li>{t("pricing.cancelAnytime")}</li>
            <li>{t("pricing.refund")}</li>
          </ul>
        )}
        {devNote && <p className="text-caption text-muted-foreground">{t("pro.devOnly")}</p>}
        {sellerMissing && (
          <p className="rounded-xl bg-secondary p-3 text-caption">{t("pricing.sellerMissing")}</p>
        )}
      </section>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
        <LegalLinks />
      </footer>
    </div>
  );
}

function Cell({ v, yes, no }: { v: string | boolean; yes: string; no: string }) {
  if (typeof v === "string") return <td className="p-3 text-center">{v}</td>;
  return (
    <td className="p-3 text-center">
      {v ? (
        <Check className="mx-auto h-4 w-4 text-primary" aria-label={yes} />
      ) : (
        <Minus className="mx-auto h-4 w-4 text-muted-foreground" aria-label={no} />
      )}
    </td>
  );
}

function PriceCard({
  title,
  price,
  per,
  sub,
  button,
  busy,
  disabled,
  outline = false,
  onClick,
}: {
  title: string;
  price: string;
  per: string;
  sub: string | null;
  button: string;
  busy: boolean;
  disabled: boolean;
  outline?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="text-footnote font-semibold text-muted-foreground">{title}</p>
        <p className="mt-1 text-title font-bold tabular-nums">
          {price}
          <span className="ml-1 text-footnote font-normal text-muted-foreground">{per}</span>
        </p>
        {sub && <p className="mt-1 text-caption text-muted-foreground">{sub}</p>}
      </div>
      <Button
        onClick={onClick}
        disabled={disabled}
        variant={outline ? "outline" : "default"}
        className="mt-auto h-12"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : button}
      </Button>
    </div>
  );
}
