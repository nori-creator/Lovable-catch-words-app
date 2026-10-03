import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute } from "@tanstack/react-router";
import { tStatic, useUiLang } from "@/lib/i18n";
import { DataSourcesList } from "@/components/DataSourcesList";
import { LegalShell } from "@/components/legal/LegalShell";
import { TermsDocument } from "@/components/legal/LegalDocuments";
import { EMPTY_LEGAL } from "@/lib/legal-config";
import { getLegalInfo } from "@/lib/legal.functions";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: tStatic("page.terms") },
      {
        name: "description",
        content:
          "CatchWordsの利用規約。アカウント、禁止事項、AIが作る内容、有料プラン（定期購入）と解約、免責などサービス利用に関する条件を定めています。",
      },
      { property: "og:title", content: "利用規約 — CatchWords" },
      {
        property: "og:description",
        content:
          "CatchWordsの利用規約。アカウント、禁止事項、AIが作る内容、有料プラン（定期購入）と解約、免責などサービス利用に関する条件を定めています。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/terms") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/terms") }],
  }),
  // 運営者・管轄・無料体験の有無はサーバの設定から。読めなくても頁は出す。
  loader: async () => {
    try {
      return await getLegalInfo();
    } catch {
      return null;
    }
  },
  component: TermsPage,
});

/**
 * 利用規約。本文は `components/legal/terms-*.tsx`（日本語・英語・繁體中文）。
 * 準拠法は日本法。管轄の裁判所は設定（`LEGAL_JURISDICTION_COURT`）から。
 */
function TermsPage() {
  const lang = useUiLang();
  const data = Route.useLoaderData();
  return (
    <LegalShell
      current="/terms"
      footer={
        // 出典は**ここに置く**(オーナー指示「約款の中など全く目立たない所に、
        // 小さい字で」)。CEFR-J は出典明記が利用の条件なので**消せない**が、
        // 学習者が毎日開く設定の主な流れに置く理由も無い。
        <DataSourcesList />
      }
    >
      <TermsDocument lang={lang} info={data?.legal ?? EMPTY_LEGAL} />
    </LegalShell>
  );
}
