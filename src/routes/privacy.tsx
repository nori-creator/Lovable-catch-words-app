import { CHINESE_EXPLANATION_LANGUAGE } from "@/lib/target-lang";
import { siteUrlFor } from "@/lib/site-url";
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
          "CatchWordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。",
      },
      { property: "og:title", content: "プライバシーポリシー — CatchWords" },
      {
        property: "og:description",
        content:
          "CatchWordsのプライバシーポリシー。取得する情報、利用目的、第三者提供、位置情報・写真の取り扱い、データ削除手続きについて説明します。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/privacy") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/privacy") }],
  }),
  component: PrivacyPage,
});

function PrivacyJa() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-1 text-footnote text-muted-foreground">最終更新: 2026年9月28日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 取得する情報</h2>
        <ul>
          <li>アカウント情報(メールアドレス、表示名、アバター画像)</li>
          <li>ユーザーが撮影した写真および自撮り画像</li>
          <li>位置情報(撮影時、ユーザーが許可した場合のみ)</li>
          <li>学習履歴・復習スコア・ストリーク等の利用統計</li>
          <li>
            アプリの利用状況(開いた日時、使った画面、撮影・スキャン・復習の回数とかかった時間)
          </li>
          <li>
            有料プランのお支払いに関する情報(決済は Stripe
            が行い、カード番号を当社が受け取ることはありません)
          </li>
          <li>広告を表示する場合、広告の配信に必要な端末の情報(広告IDなど)</li>
        </ul>

        <h2>2. 利用目的</h2>
        <ul>
          <li>本サービスの提供・運営</li>
          <li>AIによる単語カード・クイズの自動生成</li>
          <li>マップ・図鑑等の機能提供</li>
          <li>不正利用の防止</li>
          <li>
            運営者が、サービスの改善・不具合の調査・不正利用の防止のために、利用者ごとの利用状況の数値(撮影や復習の回数、利用した日、画面ごとの利用など)を閲覧・分析すること。このとき、メールアドレス、正確な位置(緯度経度)、写真、日記やひとことの本文は閲覧の対象に含めません
          </li>
          <li>
            利用者全体の統計(利用者数・継続して使う人の割合など)の作成。統計は個人を特定できない形で扱います
          </li>
          <li>有料プランの提供と、お支払いの管理</li>
        </ul>

        <h2>3. 第三者提供</h2>
        <p>法令に基づく場合を除き、ユーザーの同意なく第三者に個人情報を提供しません。</p>

        <h2>4. 外部サービス</h2>
        <ul>
          <li>Supabase(データベース・認証)</li>
          <li>Google Maps(地図表示・位置情報の逆ジオコーディング)</li>
          <li>Google Gemini(AI生成・Lovable AI Gateway経由)</li>
          <li>Stripe(有料プランの決済)</li>
          <li>Google AdMob(広告を表示する場合の広告配信)</li>
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

        <h2>9. 本ポリシーの変更</h2>
        <p>
          本ポリシーを変更する場合は、アプリ内でお知らせします。利用目的を追加する重要な変更は、変更後に本サービスを利用する前に改めて同意をいただきます。
        </p>
      </section>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: 28 September 2026</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. Information we collect</h2>
        <ul>
          <li>Account information (email address, display name, avatar image)</li>
          <li>Photos and selfies you take</li>
          <li>Location (recorded at capture time, only if you allow it)</li>
          <li>Usage data such as study history, review scores and streaks</li>
          <li>
            How you use the app (when you open it, which screens you use, and how many captures,
            scans and reviews you do and how long they take)
          </li>
          <li>
            Payment information for paid plans (payments are processed by Stripe; we never receive
            your card number)
          </li>
          <li>
            If ads are shown, device information needed to serve them (such as the advertising ID)
          </li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>To provide and operate the service</li>
          <li>To generate word cards and quizzes with AI</li>
          <li>To provide features such as the map and the dex</li>
          <li>To prevent abuse</li>
          <li>
            For the operator to view and analyse per-user usage figures (such as the number of
            captures and reviews, active days and screen usage) to improve the service, investigate
            bugs and prevent abuse. Your email address, exact location (coordinates), photos and the
            text of your journal entries and notes are not included
          </li>
          <li>
            To produce overall statistics (such as the number of users and how many keep using the
            app), handled in a form that does not identify individuals
          </li>
          <li>To provide paid plans and manage payments</li>
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
          <li>Stripe (payments for paid plans)</li>
          <li>Google AdMob (ad delivery, if ads are shown)</li>
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

        <h2>9. Changes to this policy</h2>
        <p>
          We will announce changes to this policy in the app. For significant changes that add new
          purposes of use, we will ask for your consent again before you continue using the service.
        </p>
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
        className="inline-block py-3 -my-3 text-body text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </Link>
      {lang === CHINESE_EXPLANATION_LANGUAGE && (
        <p className="mt-4 rounded-xl bg-secondary p-3 text-footnote">{t("legal.onlyJaEn")}</p>
      )}
      {/* 繁體中文の正式な訳はまだ無い（法的な文なので機械訳しない）。
          日本語より読める人が多い英語版を出す（オーナー指示 2026-09-27「言語を混ぜない」）。 */}
      {lang === "ja" ? <PrivacyJa /> : <PrivacyEn />}
      <p className="mt-8 text-footnote text-muted-foreground">
        <Link to="/terms" className="inline-block py-3 -my-3 underline">
          {t("auth.terms")}
        </Link>
      </p>
    </article>
  );
}
