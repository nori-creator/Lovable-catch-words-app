import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "プライバシーポリシー — Catchwords" },
      { name: "description", content: "Catchwordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。" },
      { property: "og:title", content: "プライバシーポリシー — Catchwords" },
      { property: "og:description", content: "Catchwordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://word-snap-journey.lovable.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://word-snap-journey.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});


function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← 戻る</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-1 text-xs text-muted-foreground">最終更新: 2026年6月22日</p>

      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 取得する情報</h2>
        <ul>
          <li>アカウント情報（メールアドレス、表示名、アバター画像）</li>
          <li>ユーザーが撮影した写真および自撮り画像</li>
          <li>位置情報（撮影時、ユーザーが許可した場合のみ）</li>
          <li>学習履歴・復習スコア・ストリーク等の利用統計</li>
        </ul>

        <h2>2. 利用目的</h2>
        <ul>
          <li>本サービスの提供・運営</li>
          <li>AIによる単語カード・クイズの自動生成</li>
          <li>マップ・図鑑等の機能提供</li>
          <li>不正利用の防止</li>
        </ul>

        <h2>3. 第三者提供</h2>
        <p>法令に基づく場合を除き、ユーザーの同意なく第三者に個人情報を提供しません。</p>

        <h2>4. 外部サービス</h2>
        <ul>
          <li>Supabase（データベース・認証）</li>
          <li>Google Maps（地図表示・位置情報の逆ジオコーディング）</li>
          <li>Google Gemini（AI生成・Lovable AI Gateway経由）</li>
        </ul>

        <h2>5. 位置情報の取り扱い</h2>
        <p>位置情報は撮影位置の記録のみに使用し、公開投稿の場合のみ他ユーザーに表示されます。位置情報の取得はユーザーが任意で許可・拒否できます。</p>

        <h2>6. データの削除</h2>
        <p>アカウント削除を希望される場合は、設定画面からリクエストいただけます。削除後30日以内に関連データを消去します。</p>

        <h2>7. Cookie等</h2>
        <p>セッション維持・ログイン状態の保持のためにブラウザのローカルストレージを利用します。</p>

        <h2>8. お問い合わせ</h2>
        <p>本ポリシーに関するご質問は、アプリ内サポートよりご連絡ください。</p>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        <Link to="/terms" className="underline">利用規約</Link>
      </p>
    </article>
  );
}
