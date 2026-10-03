/**
 * **特定商取引法に基づく表記の「事業者の情報」**（`/legal/commerce`）。
 *
 * ## 書き込まない
 * 販売する人の氏名・住所・電話番号・メールは**オーナー本人の情報**なので、コードにも
 * 文書にも書かない。公開する画面（Vite の `VITE_*`）の設定から読む:
 *
 * | 設定の名前 | 中身 |
 * |---|---|
 * | `VITE_SELLER_NAME` | 販売業者の氏名（個人）または名称（法人） |
 * | `VITE_SELLER_RESPONSIBLE` | 運営の責任者（法人のとき。個人なら空でよい） |
 * | `VITE_SELLER_ADDRESS` | 住所 |
 * | `VITE_SELLER_PHONE` | 電話番号 |
 * | `VITE_SELLER_EMAIL` | 問い合わせのメール（**開示の請求の窓口にもなる。必ず入れる**） |
 *
 * ## 空のときの書き方（消費者庁「通信販売広告について」「通信販売広告Q&A」）
 * 消費者から請求があった時に、省いた事項を書いた書面または電子メールを**遅滞なく**
 * 渡すと広告に書き、実際に遅滞なく渡せるようにしておけば、事業者の氏名（名称）・
 * 住所・電話番号（法人の代表者・責任者も）は表示を省ける。個人事業者も同じ
 * （「遅滞なく」は、申し込むか決める前に十分な余裕をもって渡すこと）。
 * なので空の欄は「請求があった場合には遅滞なく開示します」と出す。
 *
 * **ただし、請求を受ける窓口（メール）は省けない** — 窓口が無いと「請求があれば渡す」が
 * 成り立たない。メールが空のときは `canRequest: false` を返し、開発者に分かるように出す
 * （`docs/monetization.md` §5-1 の TODO）。
 */

export type SellerField = "name" | "responsible" | "address" | "phone" | "email";

export type SellerInfo = {
  values: Record<SellerField, string | null>;
  /** 請求の窓口（メール）があるか。無いと「請求があれば開示」と書けない。 */
  canRequest: boolean;
  /** 省いている欄（「請求があった場合には遅滞なく開示します」と出す欄）。 */
  disclosedOnRequest: SellerField[];
};

type Env = Record<string, string | boolean | undefined>;

const KEYS: Record<SellerField, string> = {
  name: "VITE_SELLER_NAME",
  responsible: "VITE_SELLER_RESPONSIBLE",
  address: "VITE_SELLER_ADDRESS",
  phone: "VITE_SELLER_PHONE",
  email: "VITE_SELLER_EMAIL",
};

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
};

/** 設定から事業者の情報を読む。`env` はふつう `import.meta.env`。 */
export function readSellerInfo(env: Env): SellerInfo {
  const values = Object.fromEntries(
    (Object.keys(KEYS) as SellerField[]).map((k) => [k, clean(env[KEYS[k]])]),
  ) as Record<SellerField, string | null>;
  const email =
    values.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? values.email : null;
  values.email = email;
  // 責任者は法人のときだけの欄。空なら「請求があれば開示」の並びに入れず、行ごと出さない。
  const disclosedOnRequest = (["name", "address", "phone"] as SellerField[]).filter(
    (k) => !values[k],
  );
  return { values, canRequest: Boolean(email), disclosedOnRequest };
}

/** 画面（ブラウザ）での事業者の情報。Vite がビルドの時に `VITE_*` を埋め込む。 */
export function sellerInfo(): SellerInfo {
  let env: Env = {};
  try {
    env = (import.meta as unknown as { env?: Env }).env ?? {};
  } catch {
    env = {};
  }
  return readSellerInfo(env);
}
