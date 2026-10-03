import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute } from "@tanstack/react-router";
import { tStatic, useUiLang } from "@/lib/i18n";
import { LegalShell } from "@/components/legal/LegalShell";
import { PrivacyDocument } from "@/components/legal/LegalDocuments";
import { EMPTY_LEGAL } from "@/lib/legal-config";
import { getLegalInfo } from "@/lib/legal.functions";

/**
 * プライバシーポリシー。本文は `components/legal/privacy-*.tsx`（日本語・英語・繁體中文）。
 * 運営者の名前と連絡先は設定（`LEGAL_*`、`legal-config.ts`）から読む。
 *
 * 共有用メタ文(og:description)は日本語のまま。あれは表示言語ではなく
 * 「どの市場に向けた紹介文か」の話。
 */

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: tStatic("page.privacy") },
      {
        name: "description",
        content:
          "CatchWordsのプライバシーポリシー。取得する情報、利用目的、外部の事業者、広告、保存期間と削除、利用者の権利について説明します。",
      },
      { property: "og:title", content: "プライバシーポリシー — CatchWords" },
      {
        property: "og:description",
        content:
          "CatchWordsのプライバシーポリシー。取得する情報、利用目的、外部の事業者、広告、保存期間と削除、利用者の権利について説明します。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/privacy") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/privacy") }],
  }),
  // 運営者の表記はサーバの設定から。読めなくても頁は出す（「未設定」として描く）。
  loader: async () => {
    try {
      return await getLegalInfo();
    } catch {
      return null;
    }
  },
  component: PrivacyPage,
});

function PrivacyPage() {
  const lang = useUiLang();
  const data = Route.useLoaderData();
  return (
    <LegalShell current="/privacy">
      <PrivacyDocument lang={lang} info={data?.legal ?? EMPTY_LEGAL} />
    </LegalShell>
  );
}
