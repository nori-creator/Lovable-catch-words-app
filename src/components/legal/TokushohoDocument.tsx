import type { ReactNode } from "react";
import { useT, type UiLang } from "@/lib/i18n";
import type { LegalPublicInfo } from "@/lib/legal-config";
import { priceLabel } from "@/lib/price-label";
import type { PriceInfo } from "@/lib/stripe-catalog";
import { TOKUSHOHO_UPDATED } from "./dates";

/**
 * **特定商取引法に基づく表記**（`/legal/tokushoho`）。
 *
 * ## 3言語で出す（日本語が正式な表記）
 * 表記の義務は日本の法律だが、Pro を買うのは台湾・英語圏の学習者も同じ。読めない
 * 言語だけで販売条件を出すと、表記はあっても伝わらない。だから見出しと固定の文は
 * 3言語で持ち、en / zh-TW では「日本語版が正式」と頭に書く。運営者の名前・住所などの
 * **値は設定（`LEGAL_*`）に入れたまま**出す（訳さない — 勝手に訳すと別の表記になる）。
 *
 * ## 作り話をしない
 * - 運営者の値は設定に在る物だけ。必須が欠けていれば**表を出さず**「準備中」と言う
 *   （その間は本番の購入口も止まっている — `legal-config.ts` の `checkoutAllowedByLegal`）
 * - 値段は Stripe から読んだ物だけ。読めなければ「購入画面に表示」
 * - 固定の文（支払時期・解約・返金など）は、コードの動き（Stripe Checkout の定期購入、
 *   Billing Portal、`STRIPE_TRIAL_DAYS`）と利用規約第6条に合わせてある
 */

const TX = {
  ja: {
    title: "特定商取引法に基づく表記",
    updated: "最終更新: ",
    notReady:
      "この表記は準備中です。運営者の情報がそろうまで、有料プラン（CatchWords Pro）の販売は行っていません。",
    translation: "",
    seller: "販売事業者",
    representative: "代表者または運営責任者",
    address: "所在地",
    phone: "電話番号",
    email: "メールアドレス",
    onRequest: "請求があれば遅滞なく開示します。下記のメールアドレスへご請求ください。",
    price: "販売価格",
    monthly: "月ごと",
    yearly: "年ごと",
    priceOnScreen: "購入画面に表示します。",
    extraFees: "商品代金以外の必要料金",
    extraFeesV: "インターネットの接続に必要な通信料金は、お客様のご負担となります。",
    payment: "支払方法",
    paymentV: "クレジットカードなど、Stripe の決済画面に表示される方法",
    timing: "支払時期",
    timingV:
      "お申し込みの時に初回の料金を請求し、以降はお選びいただいた契約期間（月ごと・年ごと）の更新日に自動で請求します。",
    timingTrial: (n: number) =>
      `${n}日間の無料体験期間がある場合は、体験期間の終了時に初回の料金を請求します。`,
    delivery: "提供時期",
    deliveryV: "決済の完了後、すぐにご利用いただけます。",
    term: "契約期間と自動更新",
    termV:
      "お申し込み時にお選びいただいた期間（月ごと・年ごと）。解約しない限り、同じ期間で自動的に更新されます。",
    cancel: "解約の方法",
    cancelV:
      "設定の「CatchWords Pro」→「サブスクリプションを管理」から、いつでも解約できます。解約すると次の更新日以降は請求されず、支払い済みの期間の終わりまでご利用いただけます。",
    refund: "返品・返金",
    refundV:
      "デジタルサービスの性質上、法令で必要な場合を除き、お支払い後の返金（期間の途中で解約した場合の日割りの返金を含みます）は行いません。",
    env: "動作環境",
    envV: "インターネットに接続した端末の Web ブラウザ（有料プランの購入は Web 版でのみ受け付けています）",
  },
  en: {
    title: "Legal notice (Specified Commercial Transactions Act)",
    updated: "Last updated: ",
    notReady:
      "This notice is being prepared. The paid plan (CatchWords Pro) is not sold until the operator's details are complete.",
    translation:
      "This is a translation of the notice required by Japan's Act on Specified Commercial Transactions. The Japanese version is the official one.",
    seller: "Seller",
    representative: "Representative or person in charge",
    address: "Address",
    phone: "Phone",
    email: "Email",
    onRequest:
      "Disclosed without delay upon request. Please request it at the email address below.",
    price: "Price",
    monthly: "Monthly",
    yearly: "Yearly",
    priceOnScreen: "Shown on the purchase screen.",
    extraFees: "Additional fees",
    extraFeesV: "Internet connection and data charges are your responsibility.",
    payment: "Payment methods",
    paymentV: "Credit card and the other methods shown on the Stripe checkout page",
    timing: "Payment timing",
    timingV:
      "The first payment is charged when you subscribe, then automatically on each renewal date of the period you chose (monthly or yearly).",
    timingTrial: (n: number) =>
      `If a ${n}-day free trial applies, the first payment is charged when the trial ends.`,
    delivery: "Delivery",
    deliveryV: "Available immediately after payment is completed.",
    term: "Contract period and auto-renewal",
    termV:
      "The period you chose when subscribing (monthly or yearly). Renews automatically for the same period unless cancelled.",
    cancel: "How to cancel",
    cancelV:
      "Cancel at any time from “CatchWords Pro” → “Manage subscription” in Settings. You will not be charged from the next renewal date and can use the plan until the end of the period already paid for.",
    refund: "Returns and refunds",
    refundV:
      "Because this is a digital service, payments are not refunded (including pro-rata refunds when you cancel part-way through a period), except where required by law.",
    env: "System requirements",
    envV: "A web browser on an internet-connected device (the paid plan can only be purchased on the web version)",
  },
  "zh-TW": {
    title: "特定商業交易法標示",
    updated: "最後更新：",
    notReady: "本標示準備中。在經營者資料齊備之前，不販售付費方案（CatchWords Pro）。",
    translation: "本頁為日本《特定商業交易法》所要求標示的翻譯，以日文版為正式版本。",
    seller: "販售業者",
    representative: "負責人或營運負責人",
    address: "地址",
    phone: "電話",
    email: "電子郵件",
    onRequest: "如有請求，將立即提供。請寄信至下方電子郵件地址提出請求。",
    price: "販售價格",
    monthly: "每月",
    yearly: "每年",
    priceOnScreen: "顯示於購買畫面。",
    extraFees: "商品價格以外的必要費用",
    extraFeesV: "連線網路所需的通訊費用由你自行負擔。",
    payment: "付款方式",
    paymentV: "信用卡等，以 Stripe 付款頁面顯示的方式為準",
    timing: "付款時間",
    timingV: "申請時收取第一次費用，之後於你所選合約期間（每月或每年）的續訂日自動收費。",
    timingTrial: (n: number) => `若有 ${n} 天的免費試用期，會在試用期結束時收取第一次費用。`,
    delivery: "提供時間",
    deliveryV: "付款完成後即可立即使用。",
    term: "合約期間與自動續訂",
    termV: "申請時所選的期間（每月或每年）。除非取消，會以相同期間自動續訂。",
    cancel: "取消方式",
    cancelV:
      "可隨時在設定的「CatchWords Pro」→「管理訂閱」中取消。取消後，自下一個續訂日起不再收費，你可以使用至已付款期間結束為止。",
    refund: "退貨與退款",
    refundV:
      "由於屬於數位服務，除法令另有規定外，付款後不予退款（包含期間中途取消時按日計算的退款）。",
    env: "使用環境",
    envV: "連上網路的裝置上的網頁瀏覽器（付費方案僅能在網頁版購買）",
  },
} as const;

export type TokushohoPrices = { monthly: PriceInfo | null; yearly: PriceInfo | null };

export function TokushohoDocument({
  info,
  prices,
  lang,
}: {
  info: LegalPublicInfo;
  prices: TokushohoPrices;
  lang: UiLang;
}) {
  const t = useT();
  const x = TX[lang];
  const rows: Array<[string, ReactNode]> = [];
  if (info.ready) {
    rows.push([x.seller, info.sellerName]);
    if (info.representative) rows.push([x.representative, info.representative]);
    rows.push([x.address, info.addressOnRequest ? x.onRequest : info.address]);
    rows.push([x.phone, info.phoneOnRequest ? x.onRequest : info.phone]);
    rows.push([x.email, <a href={`mailto:${info.email}`}>{info.email}</a>]);
    const priceLines: string[] = [];
    if (prices.monthly) priceLines.push(`${x.monthly}: ${priceLabel(prices.monthly, lang, t)}`);
    if (prices.yearly) priceLines.push(`${x.yearly}: ${priceLabel(prices.yearly, lang, t)}`);
    rows.push([
      x.price,
      <>
        {priceLines.length ? (
          priceLines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))
        ) : (
          <span className="block">{x.priceOnScreen}</span>
        )}
        {info.priceNote && <span className="block">{info.priceNote}</span>}
      </>,
    ]);
    rows.push([x.extraFees, x.extraFeesV]);
    rows.push([x.payment, x.paymentV]);
    rows.push([
      x.timing,
      <>
        <span className="block">{x.timingV}</span>
        {info.trialDays > 0 && <span className="block">{x.timingTrial(info.trialDays)}</span>}
      </>,
    ]);
    rows.push([x.delivery, x.deliveryV]);
    rows.push([x.term, x.termV]);
    rows.push([x.cancel, x.cancelV]);
    rows.push([x.refund, x.refundV]);
    rows.push([x.env, x.envV]);
  }
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">{x.title}</h1>
      <p className="mt-1 text-footnote text-muted-foreground">
        {x.updated}
        {TOKUSHOHO_UPDATED[lang]}
      </p>
      {x.translation && (
        <p className="mt-4 rounded-xl bg-secondary p-3 text-footnote">{x.translation}</p>
      )}
      {!info.ready ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-border bg-secondary p-4 text-body"
          data-testid="tokushoho-not-ready"
        >
          {x.notReady}
        </p>
      ) : (
        <dl className="mt-6 divide-y divide-border rounded-2xl border border-border text-footnote">
          {rows.map(([k, v], i) => (
            <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="font-semibold">{k}</dt>
              <dd className="min-w-0 break-words text-foreground/90">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
