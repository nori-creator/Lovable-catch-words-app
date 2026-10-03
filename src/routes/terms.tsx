import { CHINESE_EXPLANATION_LANGUAGE } from "@/lib/target-lang";
import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute, Link } from "@tanstack/react-router";
import { tStatic, useUiLang, useT } from "@/lib/i18n";
import { DataSourcesList } from "@/components/DataSourcesList";
import { LegalLinks } from "@/components/LegalLinks";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: tStatic("page.terms") },
      {
        name: "description",
        content:
          "CatchWordsの利用規約。アカウント、投稿コンテンツ、有料プラン（自動更新・解約・返金）、禁止事項、知的財産、免責などサービス利用に関する条件を定めています。",
      },
      { property: "og:title", content: "利用規約 — CatchWords" },
      {
        property: "og:description",
        content:
          "CatchWordsの利用規約。アカウント、投稿コンテンツ、有料プラン（自動更新・解約・返金）、禁止事項、知的財産、免責などサービス利用に関する条件を定めています。",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: siteUrlFor("/terms") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/terms") }],
  }),
  component: TermsPage,
});

/**
 * 利用規約。
 *
 * 法務文書は翻訳キーに刻まず、言語ごとに文書そのものを持つ。条文は単語の
 * 置き換えではなく文章として成り立っていないと意味がなく、細切れにすると
 * 後から条項を直したときに片方だけ古くなる。**条を直すときは3つの言語を必ず一緒に直す。**
 *
 * 準拠法・管轄は日本法のままで正しい(運営が日本のため)。英語版・繁體中文版でも
 * そこは変えず、同じ内容を述べている。正本は日本語版（英語・繁體中文の上に注記）。
 *
 * 2026-10-03: 有料プラン（Pro）の条（自動更新・解約は期間の終わりに効く・返金・
 * 値段の変更）を足し、繁體中文版を足した（オーナー指示「Web 版でお金を受け取れるように」）。
 * 中身は `/legal/commerce`（特定商取引法に基づく表記）と食い違わないようにする。
 */

function TermsJa() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">利用規約</h1>
      <p className="mt-1 text-footnote text-muted-foreground">最終更新: 2026年10月3日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 適用</h2>
        <p>
          本規約は、CatchWords(以下「本サービス」)の利用条件を定めるものです。ユーザーは本サービスを利用することで本規約に同意したものとみなされます。
        </p>

        <h2>2. アカウント</h2>
        <p>
          ユーザーは正確な情報でアカウントを作成し、認証情報を適切に管理する責任があります。13歳未満の方は本サービスを利用できません。
        </p>

        <h2>3. 投稿コンテンツ</h2>
        <p>
          ユーザーが投稿した写真・テキスト等の著作権はユーザーに帰属します。ただし、本サービスの提供・改善のために必要な範囲で、当社はこれを利用できるものとします。
        </p>

        <h2>4. 有料プラン（CatchWords Pro）</h2>
        <ol>
          <li>
            <strong>内容と料金</strong>
            ：有料プランの内容と料金は、料金のページ（/pro）および「特定商取引法に基づく表記」に表示します。表示の金額がお支払いの総額です。撮影・図鑑・基本の解説・復習などの基本の機能は、有料プランに申し込まなくても利用できます。
          </li>
          <li>
            <strong>お支払い</strong>
            ：お支払いは、決済代行サービス Stripe
            を通じて行います。当社がカード番号を受け取ることはありません。
          </li>
          <li>
            <strong>自動更新</strong>
            ：有料プランは1か月または1年ごとの定期購入です。ユーザーが解約しない限り、同じ期間で自動的に更新され、更新日にその時点の料金をお支払いいただきます。
          </li>
          <li>
            <strong>無料体験</strong>
            ：無料体験を設ける場合、その期間と条件は申込みの画面に表示します。体験の期間中に解約すれば料金はかかりません。解約しなければ、体験の終わりに有料プランへ移り、お支払いが始まります。
          </li>
          <li>
            <strong>解約</strong>
            ：ユーザーは、設定の「お支払いの管理・解約」から、いつでも解約できます。解約は、すでにお支払いいただいた期間の終わりに効力が生じ、それまでは有料プランを利用できます。期間が終わると、無料の範囲の利用に戻ります（保存した単語や写真は消えません）。
          </li>
          <li>
            <strong>返金</strong>
            ：お支払いいただいた料金は、期間の途中で解約した場合の日割りを含め、返金しません。ただし、法令により返金が必要な場合、または当社の責めに帰すべき事由により有料プランの機能を利用できなかった場合は、個別に対応します。
          </li>
          <li>
            <strong>料金・内容の変更</strong>
            ：当社は、有料プランの料金または内容を変更することがあります。料金を変更する場合は、変更の前に本サービス内または電子メールでお知らせし、変更後の料金は、お知らせの後に来る次の更新日から適用します。変更に同意しない場合は、次の更新日の前までに解約できます。
          </li>
          <li>
            <strong>お支払いができない場合</strong>
            ：更新日にお支払いが確認できない場合、当社は有料プランの提供を停止し、無料の範囲の利用に戻すことがあります。
          </li>
          <li>
            <strong>アカウントの削除</strong>
            ：アカウントを削除しても、定期購入は自動では解約されません。アカウントを削除する前に、設定の「お支払いの管理・解約」から解約してください。
          </li>
        </ol>

        <h2>5. 禁止事項</h2>
        <ul>
          <li>他者の権利を侵害する投稿(肖像権・著作権など)</li>
          <li>位置情報を悪用したストーカー行為等</li>
          <li>本サービスの運営を妨げる行為</li>
          <li>違法・公序良俗に反するコンテンツの投稿</li>
        </ul>

        <h2>6. 知的財産</h2>
        <p>
          本サービスのロゴ、デザイン、AI生成カードのフォーマット等の知的財産権は当社に帰属します。
        </p>

        <h2>7. 免責</h2>
        <p>
          本サービスはAIによる学習支援を含みますが、生成内容の正確性は保証しません。重要な判断は専門家にご相談ください。
        </p>

        <h2>8. サービスの変更・停止</h2>
        <p>
          当社は本サービスの内容を変更・停止できるものとします。有料プランの利用中の方に影響する重要な変更や、本サービスの終了は、事前にお知らせします。本サービスを終了する場合、お支払い済みの期間のうち使えなくなる分の扱いは、終了のお知らせの中でご案内します。
        </p>

        <h2>9. 準拠法・管轄</h2>
        <p>本規約は日本法に準拠し、紛争は東京地方裁判所を第一審の専属的合意管轄とします。</p>

        <h2>10. お問い合わせ</h2>
        <p>
          本規約に関するご質問は、「特定商取引法に基づく表記」に記載の連絡先までご連絡ください。
        </p>
      </section>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: 3 October 2026</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. Scope</h2>
        <p>
          These terms set out the conditions for using CatchWords (“the Service”). By using the
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

        <h2>4. Paid plan (CatchWords Pro)</h2>
        <ol>
          <li>
            <strong>Features and price</strong>: the features and price of the paid plan are shown
            on the pricing page (/pro) and in the commerce disclosure. The amount shown is the total
            you pay. Core features — catching, the dex, basic explanations and review — are
            available without the paid plan.
          </li>
          <li>
            <strong>Payment</strong>: payments are processed by Stripe. We never receive your card
            number.
          </li>
          <li>
            <strong>Automatic renewal</strong>: the paid plan is a monthly or yearly subscription.
            Unless you cancel, it renews automatically for the same term and you are charged the
            price in effect on each renewal date.
          </li>
          <li>
            <strong>Free trial</strong>: if a free trial is offered, its length and conditions are
            shown when you sign up. If you cancel during the trial you will not be charged;
            otherwise the paid plan and payments start when the trial ends.
          </li>
          <li>
            <strong>Cancellation</strong>: you can cancel at any time from “Manage payments /
            cancel” in Settings. Cancellation takes effect at the end of the period you have already
            paid for, and you can use the paid plan until then. After that you return to the free
            features (your saved words and photos are kept).
          </li>
          <li>
            <strong>Refunds</strong>: payments are not refunded, including pro-rata refunds for
            cancelling mid-period. However, where the law requires a refund, or where you could not
            use the paid features for reasons attributable to us, we will handle it individually.
          </li>
          <li>
            <strong>Changes to price or features</strong>: we may change the price or features of
            the paid plan. Before changing the price we will notify you in the Service or by email,
            and the new price applies from your first renewal date after the notice. If you do not
            agree, you can cancel before the next renewal date.
          </li>
          <li>
            <strong>Failed payments</strong>: if payment cannot be confirmed on a renewal date, we
            may stop providing the paid plan and return your account to the free features.
          </li>
          <li>
            <strong>Deleting your account</strong>: deleting your account does not cancel the
            subscription automatically. Please cancel from “Manage payments / cancel” in Settings
            before deleting your account.
          </li>
        </ol>

        <h2>5. Prohibited conduct</h2>
        <ul>
          <li>
            Posting content that infringes others' rights (portrait rights, copyright and so on)
          </li>
          <li>Misusing location data, including stalking</li>
          <li>Interfering with the operation of the Service</li>
          <li>Posting content that is illegal or contrary to public order and morals</li>
        </ul>

        <h2>6. Intellectual property</h2>
        <p>
          Intellectual property in the Service — including its logo, design and the format of
          AI-generated cards — belongs to us.
        </p>

        <h2>7. Disclaimer</h2>
        <p>
          The Service includes AI-assisted study support. We do not warrant the accuracy of
          generated content. Please consult a qualified professional for decisions that matter.
        </p>

        <h2>8. Changes and suspension</h2>
        <p>
          We may change or suspend the Service. We will give advance notice of significant changes
          that affect paid subscribers and of ending the Service. If we end the Service, the notice
          will explain how any paid period you can no longer use is handled.
        </p>

        <h2>9. Governing law and jurisdiction</h2>
        <p>
          These terms are governed by the laws of Japan. Any dispute shall be subject to the
          exclusive jurisdiction of the Tokyo District Court as the court of first instance.
        </p>

        <h2>10. Contact</h2>
        <p>
          For questions about these terms, please use the contact details in the commerce
          disclosure.
        </p>
      </section>
    </>
  );
}

function TermsZhTw() {
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">使用條款</h1>
      <p className="mt-1 text-footnote text-muted-foreground">最後更新：2026 年 10 月 3 日</p>
      <section className="prose prose-sm mt-6 max-w-none dark:prose-invert">
        <h2>1. 適用範圍</h2>
        <p>
          本條款規定 CatchWords（以下稱「本服務」）的使用條件。使用者使用本服務，即視為同意本條款。
        </p>

        <h2>2. 帳號</h2>
        <p>使用者有責任以正確的資料建立帳號，並妥善保管登入資訊。未滿 13 歲者不得使用本服務。</p>

        <h2>3. 使用者上傳的內容</h2>
        <p>
          使用者上傳的照片、文字等內容，著作權歸使用者所有。但在提供及改善本服務所需的範圍內，我們得使用該內容。
        </p>

        <h2>4. 付費方案（CatchWords Pro）</h2>
        <ol>
          <li>
            <strong>內容與價格</strong>
            ：付費方案的內容與價格，顯示於價格頁面（/pro）及「特定商業交易法標示」。顯示金額即為應付總額。拍照收集、圖鑑、基本解說、複習等基本功能，不申請付費方案也可以使用。
          </li>
          <li>
            <strong>付款</strong>：透過金流服務 Stripe 付款。我們不會取得你的信用卡號碼。
          </li>
          <li>
            <strong>自動續訂</strong>
            ：付費方案為按月或按年的定期訂閱。除非使用者取消，將以相同期間自動續訂，並於續訂日支付當時的價格。
          </li>
          <li>
            <strong>免費試用</strong>
            ：若提供免費試用，其期間與條件會顯示於申請畫面。在試用期間取消就不會收費；未取消時，試用結束後即轉為付費方案並開始收費。
          </li>
          <li>
            <strong>取消</strong>
            ：使用者可隨時從設定的「管理付款與取消訂閱」取消。取消將於已付款期間結束時生效，在此之前仍可使用付費方案。期間結束後，回到免費範圍的使用（已儲存的單字與照片不會消失）。
          </li>
          <li>
            <strong>退款</strong>
            ：已支付的費用不予退款，期間中途取消也不按日退款。但依法須退款，或因可歸責於我們的事由導致無法使用付費功能時，將個別處理。
          </li>
          <li>
            <strong>價格與內容的變更</strong>
            ：我們可能變更付費方案的價格或內容。變更價格時，會事先在本服務內或以電子郵件通知，新價格自通知後的下一次續訂日起適用。若不同意變更，可在下一次續訂日前取消。
          </li>
          <li>
            <strong>無法付款時</strong>
            ：若續訂日無法確認付款，我們可能停止提供付費方案，回到免費範圍的使用。
          </li>
          <li>
            <strong>刪除帳號</strong>
            ：刪除帳號不會自動取消訂閱。刪除帳號前，請先從設定的「管理付款與取消訂閱」取消。
          </li>
        </ol>

        <h2>5. 禁止事項</h2>
        <ul>
          <li>上傳侵害他人權利的內容（肖像權、著作權等）</li>
          <li>濫用位置資訊進行跟蹤騷擾等行為</li>
          <li>妨礙本服務營運的行為</li>
          <li>上傳違法或違反公共秩序善良風俗的內容</li>
        </ul>

        <h2>6. 智慧財產權</h2>
        <p>本服務的標誌、設計、AI 產生卡片的格式等智慧財產權歸我們所有。</p>

        <h2>7. 免責聲明</h2>
        <p>本服務包含 AI 學習輔助，但不保證產生內容的正確性。重要的判斷請諮詢專業人士。</p>

        <h2>8. 服務的變更與停止</h2>
        <p>
          我們得變更或停止本服務。影響付費使用者的重要變更，以及本服務的終止，會事先通知。終止本服務時，已付款但無法使用的期間如何處理，將在終止通知中說明。
        </p>

        <h2>9. 準據法與管轄</h2>
        <p>本條款以日本法律為準據法，如有爭議，以東京地方法院為第一審專屬合意管轄法院。</p>

        <h2>10. 聯絡方式</h2>
        <p>關於本條款的問題，請透過「特定商業交易法標示」所載的聯絡方式與我們聯繫。</p>
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
      {lang !== "ja" && (
        <p className="mt-4 rounded-xl bg-secondary p-3 text-footnote">{t("legal.jaPrevails")}</p>
      )}
      {lang === "ja" ? (
        <TermsJa />
      ) : lang === CHINESE_EXPLANATION_LANGUAGE ? (
        <TermsZhTw />
      ) : (
        <TermsEn />
      )}
      <p className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
        <LegalLinks />
      </p>
      {/* 出典は**ここに置く**(オーナー指示「約款の中など全く目立たない所に、
          小さい字で」)。CEFR-J は出典明記が利用の条件なので**消せない**が、
          学習者が毎日開く設定の主な流れに置く理由も無い。 */}
      <DataSourcesList />
    </article>
  );
}
