import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CommerceDisclosure } from "@/components/CommerceDisclosure";
import { LegalLinks } from "@/components/LegalLinks";
import { getPublicPricing } from "@/lib/billing.functions";
import { tStatic, useT, useUiLang } from "@/lib/i18n";
import { sellerInfo } from "@/lib/seller-info";
import { siteUrlFor } from "@/lib/site-url";

/**
 * **特定商取引法に基づく表記**（`/legal/commerce`、ログインしなくても見られる）。
 * 中身は `CommerceDisclosure`。値段は料金の画面と同じく Stripe から読む。
 */
export const Route = createFileRoute("/legal/commerce")({
  head: () => ({
    meta: [
      { title: tStatic("page.commerce") },
      {
        name: "description",
        content:
          "CatchWords の特定商取引法に基づく表記。販売価格、支払の時期と方法、自動更新、解約、返金について。",
      },
      { property: "og:title", content: "特定商取引法に基づく表記 — CatchWords" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/legal/commerce") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/legal/commerce") }],
  }),
  component: CommercePage,
});

function CommercePage() {
  const t = useT();
  const lang = useUiLang();
  const pricingFn = useServerFn(getPublicPricing);
  const { data } = useQuery({
    queryKey: ["public-pricing"],
    queryFn: () => pricingFn(),
    staleTime: 5 * 60_000,
  });
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="inline-block py-3 -my-3 text-body text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </Link>
      <CommerceDisclosure
        lang={lang}
        seller={sellerInfo()}
        monthly={data?.monthly ?? null}
        yearly={data?.yearly ?? null}
        trialDays={data?.trialDays ?? 0}
      />
      <p className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
        <Link to="/pro" className="inline-block py-3 -my-3 underline">
          {t("pricing.link")}
        </Link>
        <LegalLinks />
      </p>
    </article>
  );
}
