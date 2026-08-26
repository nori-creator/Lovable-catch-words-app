import { createFileRoute, Link } from "@tanstack/react-router";
import { tStatic, useUiLang, useT } from "@/lib/i18n";
import { DataSourcesList } from "@/components/DataSourcesList";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: tStatic("page.terms") },
      {
        name: "description",
        content:
          "Catchwordsの利用規約。アカウント、投稿コンテンツ、禁止事項、知的財産、免責などサービス利用に関する条件を定めています。",
      },
      { property: "og:title", content: "利用規約 — Catchwords" },
      {
        property: "og:description",
        content:
          "Catchwordsの利用規約。アカウント、投稿コンテンツ、禁止事項、知的財産、免責などサービス利用に関する条件を定めています。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://word-snap-journey.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://word-snap-journey.lovable.app/terms" }],
  }),
  component: TermsPage,
});

/**
 * 利用規約。
 *
 * 法務文書は翻訳キーに刻まず、言語ごとに文書そのものを持つ。条文は単語の
 * 置き換えではなく文章として成り立っていないと意味がなく、細切れにすると
 * 後から条項を直したときに片方だけ古くなる。
 *
 * 準拠法・管轄は日本法のままで正しい(運営が日本のため)。英語版でも
 * そこは変えず、英語で同じ内容を述べている。
 */

function TermsJa() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">利用規約</h1>
      <p className="mt-1 text-footnote text-muted-foreground">最終更新: 2026年6月22日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 適用</h2>
        <p>
          本規約は、Catchwords(以下「本サービス」)の利用条件を定めるものです。ユーザーは本サービスを利用することで本規約に同意したものとみなされます。
        </p>

        <h2>2. アカウント</h2>
        <p>
          ユーザーは正確な情報でアカウントを作成し、認証情報を適切に管理する責任があります。13歳未満の方は本サービスを利用できません。
        </p>

        <h2>3. 投稿コンテンツ</h2>
        <p>
          ユーザーが投稿した写真・テキスト等の著作権はユーザーに帰属します。ただし、本サービスの提供・改善のために必要な範囲で、当社はこれを利用できるものとします。
        </p>

        <h2>4. 禁止事項</h2>
        <ul>
          <li>他者の権利を侵害する投稿(肖像権・著作権など)</li>
          <li>位置情報を悪用したストーカー行為等</li>
          <li>本サービスの運営を妨げる行為</li>
          <li>違法・公序良俗に反するコンテンツの投稿</li>
        </ul>

        <h2>5. 知的財産</h2>
        <p>
          本サービスのロゴ、デザイン、AI生成カードのフォーマット等の知的財産権は当社に帰属します。
        </p>

        <h2>6. 免責</h2>
        <p>
          本サービスはAIによる学習支援を含みますが、生成内容の正確性は保証しません。重要な判断は専門家にご相談ください。
        </p>

        <h2>7. サービスの変更・停止</h2>
        <p>当社は事前通知なく本サービスの内容を変更・停止できるものとします。</p>

        <h2>8. 準拠法・管轄</h2>
        <p>本規約は日本法に準拠し、紛争は東京地方裁判所を第一審の専属的合意管轄とします。</p>

        <h2>9. お問い合わせ</h2>
        <p>本規約に関するご質問は、アプリ内サポートよりご連絡ください。</p>
      </section>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: 22 June 2026</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. Scope</h2>
        <p>
          These terms set out the conditions for using Catchwords (“the Service”). By using the
          Service you are deemed to have agreed to these terms.
        </p>

        <h2>2. Accounts</h2>
        <p>
          You are responsible for creating your account with accurate information and for keeping
          your credentials secure. The Service is not available to anyone under 13 years of age.
        </p>

        <h2>3. Content you post</h2>
        <p>
          You retain copyright in the photos, text and other content you post. You grant us the
          right to use that content to the extent necessary to provide and improve the Service.
        </p>

        <h2>4. Prohibited conduct</h2>
        <ul>
          <li>
            Posting content that infringes others' rights (portrait rights, copyright and so on)
          </li>
          <li>Misusing location data, including stalking</li>
          <li>Interfering with the operation of the Service</li>
          <li>Posting content that is illegal or contrary to public order and morals</li>
        </ul>

        <h2>5. Intellectual property</h2>
        <p>
          Intellectual property in the Service — including its logo, design and the format of
          AI-generated cards — belongs to us.
        </p>

        <h2>6. Disclaimer</h2>
        <p>
          The Service includes AI-assisted study support. We do not warrant the accuracy of
          generated content. Please consult a qualified professional for decisions that matter.
        </p>

        <h2>7. Changes and suspension</h2>
        <p>We may change or suspend the Service without prior notice.</p>

        <h2>8. Governing law and jurisdiction</h2>
        <p>
          These terms are governed by the laws of Japan. Any dispute shall be subject to the
          exclusive jurisdiction of the Tokyo District Court as the court of first instance.
        </p>

        <h2>9. Contact</h2>
        <p>For questions about these terms, please contact us through in-app support.</p>
      </section>
    </>
  );
}

function TermsPage() {
  const t = useT();
  const lang = useUiLang();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="inline-block py-3 -my-3 text-body text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </Link>
      {lang === "en" ? <TermsEn /> : <TermsJa />}
      <p className="mt-8 text-footnote text-muted-foreground">
        <Link to="/privacy" className="inline-block py-3 -my-3 underline">
          {t("auth.privacy")}
        </Link>
      </p>
      {/* 出典は**ここに置く**(オーナー指示「約款の中など全く目立たない所に、
          小さい字で」)。CEFR-J は出典明記が利用の条件なので**消せない**が、
          学習者が毎日開く設定の主な流れに置く理由も無い。 */}
      <DataSourcesList />
    </article>
  );
}
