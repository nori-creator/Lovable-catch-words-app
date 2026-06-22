import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "利用規約 — Catchwords" },
      { name: "description", content: "Catchwordsの利用規約。アカウント、投稿コンテンツ、禁止事項、知的財産、免責などサービス利用に関する条件を定めています。" },
      { property: "og:title", content: "利用規約 — Catchwords" },
      { property: "og:description", content: "Catchwordsの利用規約。アカウント、投稿コンテンツ、禁止事項、知的財産、免責などサービス利用に関する条件を定めています。" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://word-snap-journey.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://word-snap-journey.lovable.app/terms" }],
  }),
  component: TermsPage,
});


function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← 戻る</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">利用規約</h1>
      <p className="mt-1 text-xs text-muted-foreground">最終更新: 2026年6月22日</p>

      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 適用</h2>
        <p>本規約は、Catchwords（以下「本サービス」）の利用条件を定めるものです。ユーザーは本サービスを利用することで本規約に同意したものとみなされます。</p>

        <h2>2. アカウント</h2>
        <p>ユーザーは正確な情報でアカウントを作成し、認証情報を適切に管理する責任があります。13歳未満の方は本サービスを利用できません。</p>

        <h2>3. 投稿コンテンツ</h2>
        <p>ユーザーが投稿した写真・テキスト等の著作権はユーザーに帰属します。ただし、本サービスの提供・改善のために必要な範囲で、当社はこれを利用できるものとします。</p>

        <h2>4. 禁止事項</h2>
        <ul>
          <li>他者の権利を侵害する投稿（肖像権・著作権など）</li>
          <li>位置情報を悪用したストーカー行為等</li>
          <li>本サービスの運営を妨げる行為</li>
          <li>違法・公序良俗に反するコンテンツの投稿</li>
        </ul>

        <h2>5. 知的財産</h2>
        <p>本サービスのロゴ、デザイン、AI生成カードのフォーマット等の知的財産権は当社に帰属します。</p>

        <h2>6. 免責</h2>
        <p>本サービスはAIによる学習支援を含みますが、生成内容の正確性は保証しません。重要な判断は専門家にご相談ください。</p>

        <h2>7. サービスの変更・停止</h2>
        <p>当社は事前通知なく本サービスの内容を変更・停止できるものとします。</p>

        <h2>8. 準拠法・管轄</h2>
        <p>本規約は日本法に準拠し、紛争は東京地方裁判所を第一審の専属的合意管轄とします。</p>

        <h2>9. お問い合わせ</h2>
        <p>本規約に関するご質問は、アプリ内サポートよりご連絡ください。</p>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        <Link to="/privacy" className="underline">プライバシーポリシー</Link>
      </p>
    </article>
  );
}
