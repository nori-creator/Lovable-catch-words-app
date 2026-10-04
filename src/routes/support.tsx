import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute } from "@tanstack/react-router";
import { tStatic, useUiLang } from "@/lib/i18n";
import { LegalShell } from "@/components/legal/LegalShell";
import { SupportDocument } from "@/components/legal/SupportDocument";
import { EMPTY_LEGAL } from "@/lib/legal-config";
import { getLegalInfo } from "@/lib/legal.functions";

/**
 * **お問い合わせ・サポート**（`/support`）。iPhone アプリの設定と App Store Connect の
 * サポート URL が開く。連絡先は設定（`LEGAL_*`）から。読めなくても頁は出す。
 */
export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: tStatic("page.support") },
      {
        name: "description",
        content:
          "CatchWordsのお問い合わせ・サポート。連絡先、単語の誤りの報告、アカウントの削除、有料プランの解約の方法を案内します。",
      },
      { property: "og:title", content: "お問い合わせ・サポート — CatchWords" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/support") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/support") }],
  }),
  loader: async () => {
    try {
      return await getLegalInfo();
    } catch {
      return null;
    }
  },
  component: SupportPage,
});

function SupportPage() {
  const lang = useUiLang();
  const data = Route.useLoaderData();
  return (
    <LegalShell current="/support">
      <SupportDocument lang={lang} info={data?.legal ?? EMPTY_LEGAL} />
    </LegalShell>
  );
}
