import { createFileRoute, Link } from "@tanstack/react-router";
import { tStatic, useUiLang, useT } from "@/lib/i18n";

/**
 * プライバシーポリシー。
 *
 * 法務文書は翻訳キーに刻むのではなく、言語ごとに文書そのものを持つ。
 * 条文は単語の置き換えではなく文章として成り立っていないと意味がなく、
 * `t()` で細切れにすると、後から条項を直したときに片方だけ古くなる。
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
          "Catchwordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。",
      },
      { property: "og:title", content: "プライバシーポリシー — Catchwords" },
      {
        property: "og:description",
        content:
          "Catchwordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://word-snap-journey.lovable.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://word-snap-journey.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyJa() {
  return (
    <>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-1 text-xs text-muted-foreground">最終更新: 2026年6月22日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 取得する情報</h2>
        <ul>
          <li>アカウント情報(メールアドレス、表示名、アバター画像)</li>
          <li>ユーザーが撮影した写真および自撮り画像</li>
          <li>位置情報(撮影時、ユーザーが許可した場合のみ)</li>
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
          <li>Supabase(データベース・認証)</li>
          <li>Google Maps(地図表示・位置情報の逆ジオコーディング)</li>
          <li>Google Gemini(AI生成・Lovable AI Gateway経由)</li>
        </ul>

        <h2>5. 位置情報の取り扱い</h2>
        <p>
          位置情報は撮影位置の記録のみに使用し、公開投稿の場合のみ他ユーザーに表示されます。位置情報の取得はユーザーが任意で許可・拒否できます。
        </p>

        <h2>6. データの削除</h2>
        <p>
          設定画面の「アカウントを削除」から、いつでもアカウントと関連データ(単語カード・写真・学習記録・日記など)を即時に削除できます。削除は取り消せません。システムのバックアップに残った複製も30日以内に完全に消去されます。
        </p>

        <h2>7. Cookie等</h2>
        <p>セッション維持・ログイン状態の保持のためにブラウザのローカルストレージを利用します。</p>

        <h2>8. お問い合わせ</h2>
        <p>本ポリシーに関するご質問は、アプリ内サポートよりご連絡ください。</p>
      </section>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-xs text-muted-foreground">Last updated: 22 June 2026</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. Information we collect</h2>
        <ul>
          <li>Account information (email address, display name, avatar image)</li>
          <li>Photos and selfies you take</li>
          <li>Location (recorded at capture time, only if you allow it)</li>
          <li>Usage data such as study history, review scores and streaks</li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>To provide and operate the service</li>
          <li>To generate word cards and quizzes with AI</li>
          <li>To provide features such as the map and the dex</li>
          <li>To prevent abuse</li>
        </ul>

        <h2>3. Sharing with third parties</h2>
        <p>
          We do not provide your personal information to third parties without your consent, except
          where required by law.
        </p>

        <h2>4. External services</h2>
        <ul>
          <li>Supabase (database and authentication)</li>
          <li>Google Maps (map display and reverse geocoding of locations)</li>
          <li>Google Gemini (AI generation, via the Lovable AI Gateway)</li>
        </ul>

        <h2>5. How location is handled</h2>
        <p>
          Location is used only to record where a photo was taken, and is shown to other users only
          on public posts. You can allow or refuse location access at any time.
        </p>

        <h2>6. Deleting your data</h2>
        <p>
          You can delete your account and all related data (word cards, photos, study records,
          journal entries and so on) at any time from “Delete account” in Settings. Deletion cannot
          be undone. Copies remaining in system backups are fully erased within 30 days.
        </p>

        <h2>7. Cookies and local storage</h2>
        <p>We use your browser's local storage to keep your session and signed-in state.</p>

        <h2>8. Contact</h2>
        <p>For questions about this policy, please contact us through in-app support.</p>
      </section>
    </>
  );
}

function PrivacyPage() {
  const t = useT();
  const lang = useUiLang();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="inline-block py-3 -my-3 text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </Link>
      {lang === "en" ? <PrivacyEn /> : <PrivacyJa />}
      <p className="mt-8 text-xs text-muted-foreground">
        <Link to="/terms" className="inline-block py-3 -my-3 underline">
          {t("auth.terms")}
        </Link>
      </p>
    </article>
  );
}
