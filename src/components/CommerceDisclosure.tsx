import { CHINESE_EXPLANATION_LANGUAGE } from "@/lib/target-lang";
import type { ReactNode } from "react";
import type { UiLang } from "@/lib/i18n";
import { formatPrice, type PublicPrice } from "@/lib/pricing";
import type { SellerField, SellerInfo } from "@/lib/seller-info";

/**
 * **特定商取引法に基づく表記**の中身（`/legal/commerce`）。道順は `routes/legal.commerce.tsx`。
 *
 * ## 何を書くか（消費者庁「特定商取引法ガイド」の通信販売の広告の表示事項）
 * 販売価格・価格以外に払うお金・支払の時期と方法・提供の時期・申込みの撤回や解除の決まり・
 * 2回以上続く契約（定期購入）の条件・事業者の氏名（名称）／住所／電話番号・
 * プログラムを使う役務の動作環境。
 *
 * ## 事業者の情報は書き込まない（`seller-info.ts`）
 * 空の欄は「請求があった場合には遅滞なく開示します」と出す（消費者庁の案内どおり、
 * 請求があれば書面か電子メールで遅滞なく渡すと書き、実際に渡せるようにしておけば省ける）。
 * 請求の窓口はメール（`VITE_SELLER_EMAIL`）。
 *
 * 法務の文は言語ごとに文書そのものを持つ（`terms.tsx` の注と同じ）。正本は日本語版。
 */
export type CommerceProps = {
  lang: UiLang;
  seller: SellerInfo;
  monthly: PublicPrice | null;
  yearly: PublicPrice | null;
  trialDays: number;
};

const ON_REQUEST: Record<UiLang, string> = {
  ja: "請求があった場合には遅滞なく開示します",
  en: "Will be disclosed without delay upon request",
  "zh-TW": "如有請求，將立即揭露",
};

const NOT_SET: Record<UiLang, string> = {
  ja: "準備中",
  en: "Being prepared",
  "zh-TW": "準備中",
};

function sellerValue(p: CommerceProps, f: SellerField): string {
  const v = p.seller.values[f];
  if (v) return v;
  if (f === "email") return NOT_SET[p.lang];
  return ON_REQUEST[p.lang];
}

function priceLines(p: CommerceProps): string[] {
  const out: string[] = [];
  const label: Record<UiLang, { m: string; y: string }> = {
    ja: { m: "月ごと", y: "年ごと" },
    en: { m: "Monthly", y: "Yearly" },
    "zh-TW": { m: "按月", y: "按年" },
  };
  if (p.monthly)
    out.push(
      `${label[p.lang].m}: ${formatPrice(p.monthly.unitAmount, p.monthly.currency, p.lang)}`,
    );
  if (p.yearly)
    out.push(`${label[p.lang].y}: ${formatPrice(p.yearly.unitAmount, p.yearly.currency, p.lang)}`);
  return out;
}

function Table({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-footnote font-semibold text-muted-foreground">{k}</dt>
          <dd className="text-body whitespace-pre-line break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CommerceDisclosure(p: CommerceProps) {
  const prices = priceLines(p);
  const showResponsible = Boolean(p.seller.values.responsible);
  if (p.lang === "ja") {
    const rows: Array<[string, ReactNode]> = [
      ["販売業者", sellerValue(p, "name")],
      ...(showResponsible
        ? ([["運営責任者", sellerValue(p, "responsible")]] as Array<[string, ReactNode]>)
        : []),
      ["所在地", sellerValue(p, "address")],
      ["電話番号", sellerValue(p, "phone")],
      ["メールアドレス", sellerValue(p, "email")],
      [
        "販売価格",
        [
          "CatchWords Pro（定期購入）",
          ...(prices.length ? prices : ["料金のページ（/pro）に表示する金額"]),
          "表示の金額がお支払いの総額です（税込）。",
        ].join("\n"),
      ],
      ["商品代金以外の必要料金", "インターネットに接続するための通信料は、お客様のご負担です。"],
      ["お支払い方法", "クレジットカードなど、決済代行サービス Stripe の支払い画面で選べる方法"],
      [
        "お支払いの時期",
        [
          "お申し込みの時に、最初の期間の料金をお支払いいただきます。",
          p.trialDays > 0
            ? `無料体験（${p.trialDays}日間）がある場合は、体験の終わりに最初の料金をお支払いいただきます。`
            : null,
          "その後は、契約期間（1か月または1年）ごとの更新日に、自動でお支払いいただきます。",
        ]
          .filter(Boolean)
          .join("\n"),
      ],
      ["サービスの提供時期", "お支払いの手続きが完了した後、すぐにご利用いただけます。"],
      [
        "契約期間・自動更新",
        "1か月または1年ごとの定期購入です。解約しない限り、同じ期間・その時点の料金で自動で更新されます。料金を変える場合は、変更の前にお知らせし、次の更新から新しい料金になります。",
      ],
      [
        "解約（申込みの撤回・契約の解除）",
        "設定 →「お支払いの管理・解約」から、いつでも解約できます。解約は、すでにお支払いいただいた期間の終わりに効力が生じ、それまでは Pro をご利用いただけます。次の更新日の前日までに解約すれば、次の期間の料金はかかりません。",
      ],
      [
        "返金",
        "サービスの性質上、お支払い後の返金や、期間の途中で解約した場合の日割りの返金は行いません。ただし、法令で返金が必要な場合や、当方の不具合で Pro の機能をご利用いただけなかった場合は、個別に対応します。",
      ],
      [
        "動作環境",
        "インターネットに接続できる環境と、最新版の Safari・Google Chrome・Microsoft Edge・Firefox（iPhone、Android、パソコン）。",
      ],
    ];
    return (
      <>
        <h1 className="mt-4 text-hero font-bold tracking-tight">特定商取引法に基づく表記</h1>
        <p className="mt-1 text-footnote text-muted-foreground">最終更新: 2026年10月3日</p>
        <Table rows={rows} />
        {p.seller.disclosedOnRequest.length > 0 && (
          <p className="mt-4 text-footnote text-muted-foreground">
            「請求があった場合には遅滞なく開示します」としている事項は、上記のメールアドレスへご請求いただければ、遅滞なく電子メールでお知らせします。
          </p>
        )}
      </>
    );
  }
  if (p.lang === CHINESE_EXPLANATION_LANGUAGE) {
    const rows: Array<[string, ReactNode]> = [
      ["銷售業者", sellerValue(p, "name")],
      ...(showResponsible
        ? ([["營運負責人", sellerValue(p, "responsible")]] as Array<[string, ReactNode]>)
        : []),
      ["地址", sellerValue(p, "address")],
      ["電話", sellerValue(p, "phone")],
      ["電子郵件", sellerValue(p, "email")],
      [
        "售價",
        [
          "CatchWords Pro（定期訂閱）",
          ...(prices.length ? prices : ["以價格頁面（/pro）顯示的金額為準"]),
          "顯示金額即為應付總額（含稅）。",
        ].join("\n"),
      ],
      ["其他必要費用", "連接網路所需的通訊費由您自行負擔。"],
      ["付款方式", "信用卡等，可在金流服務 Stripe 的付款頁面選擇的方式"],
      [
        "付款時間",
        [
          "申請時支付第一期費用。",
          p.trialDays > 0
            ? `若有免費試用（${p.trialDays} 天），於試用結束時支付第一期費用。`
            : null,
          "之後於每個合約期間（1 個月或 1 年）的續訂日自動扣款。",
        ]
          .filter(Boolean)
          .join("\n"),
      ],
      ["服務提供時間", "完成付款後即可使用。"],
      [
        "合約期間與自動續訂",
        "以 1 個月或 1 年為單位的定期訂閱。除非取消，將以相同期間、當時的價格自動續訂。若要調整價格，會在調整前通知，並自下一次續訂起適用新價格。",
      ],
      [
        "取消（撤回申請、解除合約）",
        "可隨時從「設定 → 管理付款與取消訂閱」取消。取消將於已付款期間結束時生效，在此之前仍可使用 Pro。只要在下一次續訂日前一天前取消，就不會收取下一期費用。",
      ],
      [
        "退款",
        "基於服務性質，付款後不予退款，期間中途取消也不按日退款。但依法須退款，或因我方的問題導致無法使用 Pro 功能時，將個別處理。",
      ],
      [
        "使用環境",
        "可連接網路的環境，以及最新版的 Safari、Google Chrome、Microsoft Edge、Firefox（iPhone、Android、電腦）。",
      ],
    ];
    return (
      <>
        <h1 className="mt-4 text-hero font-bold tracking-tight">依日本特定商業交易法之標示</h1>
        <p className="mt-1 text-footnote text-muted-foreground">最後更新：2026 年 10 月 3 日</p>
        <p className="mt-4 rounded-xl bg-secondary p-3 text-footnote">
          本頁為日文版的翻譯，內容如有出入，以日文版為準。
        </p>
        <Table rows={rows} />
        {p.seller.disclosedOnRequest.length > 0 && (
          <p className="mt-4 text-footnote text-muted-foreground">
            標示為「如有請求，將立即揭露」的事項，請寄信至上方的電子郵件地址提出請求，我們會立即以電子郵件告知。
          </p>
        )}
      </>
    );
  }
  const rows: Array<[string, ReactNode]> = [
    ["Seller", sellerValue(p, "name")],
    ...(showResponsible
      ? ([["Person in charge", sellerValue(p, "responsible")]] as Array<[string, ReactNode]>)
      : []),
    ["Address", sellerValue(p, "address")],
    ["Phone", sellerValue(p, "phone")],
    ["Email", sellerValue(p, "email")],
    [
      "Price",
      [
        "CatchWords Pro (subscription)",
        ...(prices.length ? prices : ["As shown on the pricing page (/pro)"]),
        "The amount shown is the total you pay (tax included).",
      ].join("\n"),
    ],
    ["Other charges", "Internet connection fees are borne by you."],
    ["Payment method", "Credit card and other methods offered on the Stripe checkout page"],
    [
      "Payment timing",
      [
        "The first period is charged when you subscribe.",
        p.trialDays > 0
          ? `If a free trial (${p.trialDays} days) applies, the first charge is made when the trial ends.`
          : null,
        "After that, you are charged automatically on each renewal date (every month or every year).",
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    ["When the service is provided", "Immediately after payment is completed."],
    [
      "Term and automatic renewal",
      "A monthly or yearly subscription. Unless cancelled, it renews automatically for the same term at the price in effect at that time. If we change the price, we will tell you in advance and the new price applies from the next renewal.",
    ],
    [
      "Cancellation",
      "You can cancel at any time from Settings → “Manage payments / cancel”. Cancellation takes effect at the end of the period you have already paid for, and you can use Pro until then. Cancel before the day before your next renewal date and you will not be charged for the next period.",
    ],
    [
      "Refunds",
      "Because of the nature of the service, we do not refund payments or give pro-rata refunds for cancelling mid-period. Where the law requires a refund, or where a fault on our side prevented you from using Pro features, we will handle it individually.",
    ],
    [
      "System requirements",
      "An internet connection and the latest Safari, Google Chrome, Microsoft Edge or Firefox (iPhone, Android or computer).",
    ],
  ];
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">
        Notation based on the Act on Specified Commercial Transactions
      </h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: 3 October 2026</p>
      <p className="mt-4 rounded-xl bg-secondary p-3 text-footnote">
        This page is a translation of the Japanese version, which prevails in case of any
        discrepancy.
      </p>
      <Table rows={rows} />
      {p.seller.disclosedOnRequest.length > 0 && (
        <p className="mt-4 text-footnote text-muted-foreground">
          Items marked “Will be disclosed without delay upon request” will be sent to you by email
          without delay if you request them at the email address above.
        </p>
      )}
    </>
  );
}
