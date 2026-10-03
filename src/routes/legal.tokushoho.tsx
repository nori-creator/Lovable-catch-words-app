import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute } from "@tanstack/react-router";
import { tStatic, useUiLang } from "@/lib/i18n";
import { LegalShell } from "@/components/legal/LegalShell";
import { TokushohoDocument } from "@/components/legal/TokushohoDocument";
import { EMPTY_LEGAL } from "@/lib/legal-config";
import { getLegalInfo } from "@/lib/legal.functions";

/**
 * **特定商取引法に基づく表記**（`/legal/tokushoho`）。中身は `TokushohoDocument`。
 * 運営者の値は設定（`LEGAL_*`）だけ。欠けていれば「準備中」と出し、購入口も止まる。
 */
export const Route = createFileRoute("/legal/tokushoho")({
  head: () => ({
    meta: [
      { title: tStatic("page.tokushoho") },
      {
        name: "description",
        content:
          "CatchWordsの特定商取引法に基づく表記。販売事業者、販売価格、支払方法と時期、提供時期、解約と返金について記載しています。",
      },
      { property: "og:title", content: "特定商取引法に基づく表記 — CatchWords" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/legal/tokushoho") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/legal/tokushoho") }],
  }),
  loader: async () => {
    try {
      return await getLegalInfo();
    } catch {
      return null;
    }
  },
  component: TokushohoPage,
});

function TokushohoPage() {
  const lang = useUiLang();
  const data = Route.useLoaderData();
  return (
    <LegalShell current="/legal/tokushoho">
      <TokushohoDocument
        lang={lang}
        info={data?.legal ?? EMPTY_LEGAL}
        prices={data?.prices ?? { monthly: null, yearly: null }}
      />
    </LegalShell>
  );
}
