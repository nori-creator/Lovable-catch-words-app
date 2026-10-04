import type { UiLang } from "@/lib/i18n";
import type { LegalPublicInfo } from "@/lib/legal-config";
import { OperatorDetails } from "./operator";

/**
 * **お問い合わせ・サポート**（`/support`）。iPhone アプリの「設定 › お問い合わせ・サポート」と
 * App Store Connect のサポート URL が開く頁（審査ガイドライン 1.5「連絡手段を置く」）。
 *
 * 連絡先は設定（`LEGAL_EMAIL` など、`legal-config.ts`）だけから出す — `OperatorDetails` が、
 * 未設定なら「準備中」と本当のことを言う。ここに書く手順は、どれもアプリと Web 版に実際に在る物。
 */
const TX = {
  ja: {
    title: "お問い合わせ・サポート",
    intro:
      "CatchWords（iPhone アプリと Web 版）のサポートの頁です。ご質問・不具合のご報告・個人情報に関するご請求は、下の連絡先へお送りください。",
    contact: "連絡先",
    faq: "よくあるご用件",
    items: [
      ["単語の内容の誤り", "各単語の「この語の誤りを報告」から送れます。"],
      [
        "アカウントの削除",
        "iPhone アプリ・Web 版の設定の「アカウントを削除」から、いつでもご自身で削除できます。写真・単語・日記・プロフィール写真なども消えます。削除は取り消せません。",
      ],
      [
        "有料プランの解約",
        "Web 版で購入した場合は、設定の「CatchWords Pro」→「サブスクリプションを管理」から。iPhone のアプリ内課金で購入した場合は、iPhone の「設定」→ 自分の名前 →「サブスクリプション」から。アカウントを削除しても解約にはなりません。",
      ],
      [
        "AI へのデータ送信の同意",
        "iPhone アプリの設定の「プライバシー」→「AIへのデータ送信の同意」で、内容の確認・同意・取り消しができます。",
      ],
      [
        "個人情報の開示・訂正・削除などの請求",
        "プライバシーポリシー第8条をご覧のうえ、上の連絡先へお送りください。",
      ],
    ],
  },
  en: {
    title: "Contact & Support",
    intro:
      "This is the support page for CatchWords (the iPhone app and the web version). Send questions, bug reports and requests about your personal information to the contact below.",
    contact: "Contact",
    faq: "Common requests",
    items: [
      ["An error in a word", "Use “Report an error in this entry” on that word."],
      [
        "Deleting your account",
        "Delete it yourself at any time from “Delete account” in Settings, in the iPhone app or on the web. Your photos, words, diary and profile photo are erased too. This cannot be undone.",
      ],
      [
        "Cancelling the paid plan",
        "If you bought it on the web: “CatchWords Pro” → “Manage subscription” in Settings. If you bought it with an in-app purchase on iPhone: the iPhone Settings app → your name → Subscriptions. Deleting your account does not cancel it.",
      ],
      [
        "Consent to sending data to AI",
        "In the iPhone app, Settings → Privacy → “Consent to send data to AI” lets you review, give or withdraw consent.",
      ],
      [
        "Requests about your personal information",
        "See section 8 of the Privacy Policy, then write to the contact above.",
      ],
    ],
  },
  "zh-TW": {
    title: "聯絡與支援",
    intro:
      "這是 CatchWords（iPhone App 與網頁版）的支援頁面。問題、錯誤回報與個人資料相關的請求，請寄至下方的聯絡方式。",
    contact: "聯絡方式",
    faq: "常見事項",
    items: [
      ["單字內容的錯誤", "可在各單字的「回報這個字的錯誤」中送出。"],
      [
        "刪除帳號",
        "可隨時在 iPhone App 或網頁版設定的「刪除帳號」中自行刪除。照片、單字、日記與個人照片也會一併清除。刪除後無法復原。",
      ],
      [
        "取消付費方案",
        "在網頁版購買時：設定的「CatchWords Pro」→「管理訂閱」。透過 iPhone App 內購買時：iPhone 的「設定」→ 你的名字 →「訂閱項目」。刪除帳號不會取消訂閱。",
      ],
      [
        "同意將資料傳送給 AI",
        "在 iPhone App 設定的「隱私」→「同意將資料傳送給 AI」中，可以確認內容、同意或撤回。",
      ],
      ["個人資料的揭露、更正、刪除等請求", "請參閱隱私權政策第 8 條，並寄至上方的聯絡方式。"],
    ],
  },
} as const;

export function SupportDocument({ info, lang }: { info: LegalPublicInfo; lang: UiLang }) {
  const x = TX[lang];
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">{x.title}</h1>
      <section className="legal-doc mt-6">
        <p>{x.intro}</p>
        <h2>{x.contact}</h2>
        <OperatorDetails info={info} lang={lang} />
        <h2>{x.faq}</h2>
        <dl>
          {x.items.map(([q, a]) => (
            <div key={q} className="mt-3">
              <dt className="font-semibold">{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
