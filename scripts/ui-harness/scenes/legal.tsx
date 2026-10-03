/**
 * **法務の頁と Pro の購入口**（2026-10-03 課金の準備）。本物の部品を描く。
 *
 * - `?scene=legal-privacy` / `legal-terms` / `legal-tokushoho` … 頁そのもの。
 *   `&legal=ready`（運営者の設定あり・見本の値）/ `&legal=missing`（未設定 = 今の本番）。
 *   言語は `&lang=ja|en|zh-TW`。
 * - `?scene=pro-plan` … 設定の「CatchWords Pro」欄。状態を縦に並べる。`&state=` で1つだけ。
 *
 * 見本の値（運営者の名前・値段）は**この確認用ページだけ**の物。本番は設定と Stripe から読む。
 */
import { LegalShell } from "@/components/legal/LegalShell";
import { PrivacyDocument, TermsDocument } from "@/components/legal/LegalDocuments";
import { TokushohoDocument } from "@/components/legal/TokushohoDocument";
import { ProPlanCardView } from "@/components/ProPlanCardView";
import { SettingsCard } from "@/components/screens/SettingsScreen";
import type { BillingStatus } from "@/lib/billing.functions";
import { getUiLang, tStatic as t } from "@/lib/i18n";
import { EMPTY_LEGAL, type LegalPublicInfo } from "@/lib/legal-config";
import type { PriceInfo } from "@/lib/stripe-catalog";

const SAMPLE_LEGAL: LegalPublicInfo = {
  ready: true,
  sellerName: "見本 運営者（Sample Operator）",
  representative: null,
  address: null,
  addressOnRequest: true,
  phone: null,
  phoneOnRequest: true,
  email: "contact@example.com",
  priceNote: null,
  jurisdictionCourt: null,
  trialDays: 0,
};

const MONTHLY: PriceInfo = {
  id: "price_sample_m",
  unitAmount: 480,
  currency: "jpy",
  interval: "month",
  intervalCount: 1,
  taxBehavior: "inclusive",
};
const YEARLY: PriceInfo = { ...MONTHLY, id: "price_sample_y", unitAmount: 4800, interval: "year" };

function legalFrom(q: URLSearchParams): LegalPublicInfo {
  return q.get("legal") === "missing" ? EMPTY_LEGAL : SAMPLE_LEGAL;
}

function SampleNote({ q }: { q: URLSearchParams }) {
  const missing = q.get("legal") === "missing";
  return (
    <p
      data-harness-note=""
      style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, color: "#5b6472" }}
    >
      {missing
        ? "確認用: 運営者の設定（LEGAL_*）が無い状態 = 今の本番"
        : "確認用: 運営者・値段は見本（本番は設定と Stripe から読む）"}
    </p>
  );
}

export function LegalPrivacyScene({ q }: { q: URLSearchParams }) {
  return (
    <LegalShell current="/privacy">
      <SampleNote q={q} />
      <PrivacyDocument lang={getUiLang()} info={legalFrom(q)} />
    </LegalShell>
  );
}

export function LegalTermsScene({ q }: { q: URLSearchParams }) {
  return (
    <LegalShell current="/terms">
      <SampleNote q={q} />
      <TermsDocument lang={getUiLang()} info={legalFrom(q)} />
    </LegalShell>
  );
}

export function LegalTokushohoScene({ q }: { q: URLSearchParams }) {
  return (
    <LegalShell current="/legal/tokushoho">
      <SampleNote q={q} />
      <TokushohoDocument
        lang={getUiLang()}
        info={legalFrom(q)}
        prices={{ monthly: MONTHLY, yearly: YEARLY }}
      />
    </LegalShell>
  );
}

const BASE: BillingStatus = {
  enabled: true,
  configured: true,
  isPro: false,
  paidPro: false,
  isAdmin: false,
  prices: { monthly: MONTHLY, yearly: YEARLY },
  priceError: false,
  legalReady: true,
  checkoutAllowed: true,
  trialDays: 0,
  adminIssues: [],
};

const PRO_STATES: Array<{ id: string; label: string; status: BillingStatus }> = [
  { id: "buy", label: "買う前（値段・自動更新・リンク）", status: BASE },
  {
    id: "trial",
    label: "無料体験あり（STRIPE_TRIAL_DAYS=7 のとき）",
    status: { ...BASE, trialDays: 7 },
  },
  { id: "pro", label: "Pro の人（管理ボタン）", status: { ...BASE, isPro: true, paidPro: true } },
  {
    id: "legal-missing",
    label: "特商法の表記が未設定（利用者に見える形）",
    status: { ...BASE, legalReady: false, checkoutAllowed: false },
  },
  {
    id: "legal-missing-admin",
    label: "特商法の表記が未設定（開発者に見える形）",
    status: {
      ...BASE,
      isAdmin: true,
      legalReady: false,
      checkoutAllowed: false,
      adminIssues: ["LEGAL_SELLER_NAME", "LEGAL_ADDRESS", "LEGAL_PHONE", "LEGAL_EMAIL"],
    },
  },
  {
    id: "price-error",
    label: "値段を Stripe から読めない",
    status: { ...BASE, priceError: true, prices: { monthly: null, yearly: null } },
  },
];

export function ProPlanScene({ q }: { q: URLSearchParams }) {
  const only = q.get("state");
  const list = only ? PRO_STATES.filter((s) => s.id === only) : PRO_STATES;
  return (
    <div style={{ display: "grid", gap: 20, padding: "12px 0 96px" }}>
      {list.map((c) => (
        <section key={c.id} data-pro-state={c.id}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#5b6472" }}>
            {c.label}
          </p>
          <SettingsCard title={t("pro.title")}>
            <ProPlanCardView status={c.status} busy={null} onBuy={() => {}} onManage={() => {}} />
          </SettingsCard>
        </section>
      ))}
    </div>
  );
}
