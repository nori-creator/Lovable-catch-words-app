/**
 * **料金の画面（`/pro`）と特定商取引法に基づく表記（`/legal/commerce`）**
 * （オーナー指示 2026-10-03「Web 版でお金を受け取れるように」）。
 *
 * 本物の部品（`PricingView` / `CommerceDisclosure`）を、見本の値段で描く。値段は Stripe の
 * テスト用に作った仮の値段（`docs/monetization.md` §5-1: 月 ¥980・年 ¥7,800）と同じ形。
 *
 * `?scene=pricing&state=signup|checkout|manage|hidden|unavailable|loading`
 * `?scene=commerce`（`&seller=1` で事業者の情報を入れた形）
 */
import { PricingView, type PricingData } from "@/components/PricingView";
import { CommerceDisclosure } from "@/components/CommerceDisclosure";
import { useUiLang } from "@/lib/i18n";
import { readSellerInfo } from "@/lib/seller-info";
import type { PricingCta } from "@/lib/pricing";

const DATA: PricingData = {
  enabled: true,
  configured: true,
  monthly: { unitAmount: 980, currency: "jpy", interval: "month", intervalCount: 1 },
  yearly: { unitAmount: 7800, currency: "jpy", interval: "year", intervalCount: 1 },
  trialDays: 7,
};

const STATES: PricingCta[] = ["signup", "checkout", "manage", "hidden", "unavailable"];

export function PricingScene() {
  const q = new URLSearchParams(location.search);
  const state = q.get("state") ?? "signup";
  const cta: PricingCta = (STATES as string[]).includes(state) ? (state as PricingCta) : "signup";
  return (
    <article className="mx-auto max-w-2xl px-4 py-6">
      <PricingView
        data={
          state === "loading"
            ? null
            : cta === "unavailable"
              ? { ...DATA, monthly: null, yearly: null }
              : DATA
        }
        cta={cta}
        onCheckout={() => {}}
        onSignup={() => {}}
        onManage={() => {}}
      />
    </article>
  );
}

export function CommerceScene() {
  const lang = useUiLang();
  const q = new URLSearchParams(location.search);
  // 見本の事業者の情報（架空。実在の人・会社ではない）。
  const seller = readSellerInfo(
    q.get("seller") === "1"
      ? {
          VITE_SELLER_NAME: "見本 太郎",
          VITE_SELLER_ADDRESS: "（見本の住所）",
          VITE_SELLER_PHONE: "（見本の電話番号）",
          VITE_SELLER_EMAIL: "support@example.com",
        }
      : { VITE_SELLER_EMAIL: "support@example.com" },
  );
  return (
    <article className="mx-auto max-w-2xl px-4 py-6">
      <CommerceDisclosure
        lang={lang}
        seller={seller}
        monthly={DATA.monthly}
        yearly={DATA.yearly}
        trialDays={DATA.trialDays}
      />
    </article>
  );
}
