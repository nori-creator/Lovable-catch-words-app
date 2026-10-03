import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { PricingView, type PricingData } from "@/components/PricingView";
import {
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  getPublicPricing,
} from "@/lib/billing.functions";
import { pricingCta } from "@/lib/pricing";
import { billingSurface } from "@/lib/stripe-billing";
import { portalErrorKey } from "@/lib/billing-errors";
import { tStatic, useT } from "@/lib/i18n";
import { siteUrlFor } from "@/lib/site-url";
import { sellerInfo } from "@/lib/seller-info";

/**
 * **料金の画面**（`/pro`、ログインしなくても見られる）。中身は `PricingView`。
 *
 * - 値段は Stripe から読む（`getPublicPricing`。コードに値段を書かない）
 * - ログインしていない人は、押すと先にアカウントを作る（`/auth?next=/pro`。戻ってくる）
 * - 開発者のスイッチ（`subscriptionEnabled`）がオフの間は、開発者にしか購入口を出さない
 * - アプリ（iPhone / Android）の中では購入口を出さない（ストアの決まり。`billingSurface`）
 */
export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: tStatic("page.pricing") },
      {
        name: "description",
        content:
          "CatchWords Pro の料金。撮る・覚える・復習は無料のまま。Pro では解説の作り直しなどが使えます。",
      },
      { property: "og:title", content: "CatchWords Pro — 料金" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: siteUrlFor("/pro") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/pro") }],
  }),
  component: PricingPage,
});

/** 値段を読めなかった時に渡す空の中身（画面は「料金を読み込めませんでした」を出す）。 */
const EMPTY_PRICING: PricingData = {
  enabled: false,
  configured: false,
  monthly: null,
  yearly: null,
  trialDays: 0,
};

function PricingPage() {
  const t = useT();
  const navigate = useNavigate();
  const pricingFn = useServerFn(getPublicPricing);
  const statusFn = useServerFn(getBillingStatus);
  const checkoutFn = useServerFn(createCheckoutSession);
  const portalFn = useServerFn(createPortalSession);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | "monthly" | "yearly" | "manage">(null);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // 匿名の仮の入口（初回の体験）はログインに数えない。
        const u = data.session?.user;
        if (alive) setLoggedIn(Boolean(u && !u.is_anonymous));
      })
      .catch(() => alive && setLoggedIn(false));
    return () => {
      alive = false;
    };
  }, []);

  const { data: pricing, isError: pricingFailed } = useQuery({
    queryKey: ["public-pricing"],
    queryFn: () => pricingFn(),
    staleTime: 5 * 60_000,
  });
  const { data: status, isError: statusFailed } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => statusFn(),
    enabled: loggedIn === true,
    staleTime: 60_000,
  });

  const nativeApp = billingSurface(Capacitor.isNativePlatform()) === "none";
  // 読めなかった時も待たせ続けない（状態が読めなければログイン前と同じ扱い、値段が読めなければ「準備中」）。
  const ready =
    (pricing || pricingFailed) &&
    loggedIn !== null &&
    (loggedIn === false || status || statusFailed);
  const cta = pricingFailed
    ? "unavailable"
    : pricingCta({
        // ログイン後はスイッチか開発者（`getBillingStatus.enabled`）。前はスイッチだけ。
        enabled: status ? status.enabled : Boolean(pricing?.enabled),
        hasPrice: Boolean(pricing?.monthly || pricing?.yearly),
        loggedIn: loggedIn === true,
        paidPro: Boolean(status?.paidPro),
        nativeApp,
      });

  const checkout = async (period: "monthly" | "yearly") => {
    setBusy(period);
    try {
      const { url } = await checkoutFn({ data: { period } });
      window.location.assign(url);
    } catch {
      toast.error(t("pro.failed"));
      setBusy(null);
    }
  };
  const manage = async () => {
    setBusy("manage");
    try {
      const { url } = await portalFn();
      window.location.assign(url);
    } catch (e) {
      toast.error(t(portalErrorKey(e)));
      setBusy(null);
    }
  };

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="inline-block py-3 -my-3 text-body text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </Link>
      <div className="mt-4">
        <PricingView
          data={ready ? (pricing ?? EMPTY_PRICING) : null}
          cta={cta}
          busy={busy}
          onCheckout={(p) => void checkout(p)}
          onSignup={() => void navigate({ to: "/auth", search: { next: "/pro" } })}
          onManage={() => void manage()}
          devNote={Boolean(status?.isAdmin && pricing && !pricing.enabled)}
          sellerMissing={Boolean(status?.isAdmin) && !sellerInfo().canRequest}
        />
      </div>
    </article>
  );
}
