import type { ReactNode } from "react";
import type { UiLang } from "@/lib/i18n";
import type { LegalPublicInfo } from "@/lib/legal-config";

/**
 * 法務文書の中で使う「運営者」と「連絡先」。
 *
 * **設定（`LEGAL_*`）に在る値だけを出す。** 無いときは、本当のことだけを言う —
 * 「連絡先は準備中」「単語の誤りは各単語の『この語の誤りを報告』から送れる」
 * 「アカウントの削除は設定から自分でできる」（どれもアプリに在る）。
 * 存在しないサポート窓口（アプリ内サポート等）を書かない。
 */

const L = {
  ja: {
    operator: "運営者",
    representative: "代表者",
    address: "所在地",
    phone: "電話番号",
    email: "メールアドレス",
    onRequest: "請求があれば遅滞なく開示します（下のメールアドレスへご請求ください）",
    noContact:
      "運営者の連絡先は現在準備中です。単語の内容の誤りは、各単語の「この語の誤りを報告」から送ることができます。アカウントと関連データの削除は、設定の「アカウントを削除」からいつでもご自身で行えます。",
    defaultName: "CatchWords の運営者",
  },
  en: {
    operator: "Operator",
    representative: "Representative",
    address: "Address",
    phone: "Phone",
    email: "Email",
    onRequest:
      "Disclosed without delay upon request (please request it at the email address below)",
    noContact:
      "The operator's contact details are being prepared. Errors in a word entry can be reported with “Report an error in this entry” on that word. You can delete your account and its data yourself at any time from “Delete account” in Settings.",
    defaultName: "the operator of CatchWords",
  },
  "zh-TW": {
    operator: "經營者",
    representative: "負責人",
    address: "地址",
    phone: "電話",
    email: "電子郵件",
    onRequest: "如有請求，將立即提供（請寄信至下方電子郵件地址提出請求）",
    noContact:
      "經營者的聯絡方式目前準備中。單字內容的錯誤，可在各單字的「回報這個字的錯誤」中送出。帳號與相關資料可隨時在設定的「刪除帳號」中自行刪除。",
    defaultName: "CatchWords 的經營者",
  },
} as const;

/** 本文の中で運営者を呼ぶ名前（設定が無ければ「CatchWords の運営者」）。 */
export function operatorName(info: LegalPublicInfo, lang: UiLang): string {
  return info.sellerName ?? L[lang].defaultName;
}

/** 運営者の表（設定に在る項目だけ）と、連絡先が無いときの案内。 */
export function OperatorDetails({ info, lang }: { info: LegalPublicInfo; lang: UiLang }) {
  const l = L[lang];
  const rows: Array<[string, ReactNode]> = [];
  if (info.sellerName) rows.push([l.operator, info.sellerName]);
  if (info.representative) rows.push([l.representative, info.representative]);
  if (info.addressOnRequest) rows.push([l.address, l.onRequest]);
  else if (info.address) rows.push([l.address, info.address]);
  if (info.phoneOnRequest) rows.push([l.phone, l.onRequest]);
  else if (info.phone) rows.push([l.phone, info.phone]);
  if (info.email)
    rows.push([
      l.email,
      <a key="mail" href={`mailto:${info.email}`}>
        {info.email}
      </a>,
    ]);
  return (
    <>
      {rows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-footnote">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!info.email && <p>{l.noContact}</p>}
    </>
  );
}
