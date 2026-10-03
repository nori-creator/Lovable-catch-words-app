import { createServerFn } from "@tanstack/react-start";
import { readLegalConfig, toPublicLegal, type LegalPublicInfo } from "@/lib/legal-config";
import { readPlanPrices, type PriceInfo } from "@/lib/stripe-catalog";

export type LegalPageData = {
  legal: LegalPublicInfo;
  /** 特商法の頁に出す値段（Stripe から読んだ物。読めなければ null）。 */
  prices: { monthly: PriceInfo | null; yearly: PriceInfo | null };
};

/**
 * **運営者の表記と値段**（プライバシーポリシー・利用規約・特商法の頁）。
 *
 * ログインしていない人も読む頁なので、認証は付けない。返すのは**公開してよい物だけ**
 * — 欠けている環境変数の名前・鍵は返さない（`toPublicLegal`）。
 * 投げない。読めないときは「未設定」として描く（嘘の値を出すより、準備中と出す）。
 */
export const getLegalInfo = createServerFn({ method: "GET" }).handler(
  async (): Promise<LegalPageData> => {
    const legal = toPublicLegal(readLegalConfig(process.env));
    let prices: LegalPageData["prices"] = { monthly: null, yearly: null };
    try {
      const p = await readPlanPrices(process.env);
      prices = { monthly: p.monthly, yearly: p.yearly };
    } catch {
      // 値段が読めなくても頁は出す（値段の欄は「購入画面に表示」になる）。
    }
    return { legal, prices };
  },
);
