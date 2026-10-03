/**
 * **運営者の情報（特定商取引法に基づく表記・プライバシーポリシー・利用規約）**。
 *
 * ここは**計算だけ**（環境変数を読む所はサーバの `legal.functions.ts` /
 * `billing.functions.ts`）。値は**オーナーが Lovable の Secrets に入れた物だけ**を出す。
 * コードの中に名前・住所・電話などの見本を書かない — 見本が本番に出ると、
 * 嘘の表記を公開したことになる。
 *
 * ## 環境変数
 * | 名前 | 必須 | 中身 |
 * |---|---|---|
 * | `LEGAL_SELLER_NAME` | ✓ | 販売事業者の名前（個人なら氏名、法人なら名称） |
 * | `LEGAL_REPRESENTATIVE` | | 代表者または通信販売の業務の責任者の氏名（法人は入れる） |
 * | `LEGAL_ADDRESS` | ✓ | 住所。`ON_REQUEST` なら「請求があれば遅滞なく開示します」 |
 * | `LEGAL_PHONE` | ✓ | 電話番号。`ON_REQUEST` なら同上 |
 * | `LEGAL_EMAIL` | ✓ | 連絡先のメール（開示の請求もここで受ける） |
 * | `LEGAL_PRICE_NOTE` | | 価格の注記（例: 表示価格は税込です） |
 * | `LEGAL_JURISDICTION_COURT` | | 第一審の専属的合意管轄の裁判所（例: ○○地方裁判所） |
 *
 * 住所と電話を省く書き方（`ON_REQUEST`）は、特定商取引法 第11条ただし書き —
 * 「請求があった場合に遅滞なく提供する」と表示し、実際に遅滞なく出せる場合に限る。
 * その請求を受ける先として**メールは必ず要る**。
 *
 * 必須が欠けている間は `ready: false`。特商法の頁は「準備中」と出し、Stripe の
 * 購入口も止める（`billing.functions.ts`）。
 */

export const LEGAL_ENV = {
  sellerName: "LEGAL_SELLER_NAME",
  representative: "LEGAL_REPRESENTATIVE",
  address: "LEGAL_ADDRESS",
  phone: "LEGAL_PHONE",
  email: "LEGAL_EMAIL",
  priceNote: "LEGAL_PRICE_NOTE",
  jurisdictionCourt: "LEGAL_JURISDICTION_COURT",
} as const;

/** 必須の環境変数（欠けると準備中）。 */
export const LEGAL_REQUIRED_ENV = [
  LEGAL_ENV.sellerName,
  LEGAL_ENV.address,
  LEGAL_ENV.phone,
  LEGAL_ENV.email,
] as const;

/** 「請求があれば遅滞なく開示」を選ぶ値。 */
const ON_REQUEST = new Set(["on_request", "on-request", "onrequest", "請求があれば遅滞なく開示"]);

export type LegalInfo = {
  /** 必須がそろっているか。 */
  ready: boolean;
  /** 欠けている（または形が正しくない）必須の環境変数の名前。開発者向け。 */
  missing: string[];
  sellerName: string | null;
  representative: string | null;
  /** 住所。`addressOnRequest` のときは null。 */
  address: string | null;
  addressOnRequest: boolean;
  phone: string | null;
  phoneOnRequest: boolean;
  email: string | null;
  priceNote: string | null;
  jurisdictionCourt: string | null;
  /** 無料体験の日数（`STRIPE_TRIAL_DAYS`）。0 は無し。 */
  trialDays: number;
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `STRIPE_TRIAL_DAYS` を日数に（数でない・負・大きすぎる値は 0）。 */
export function trialDaysFrom(raw: string | undefined): number {
  const n = Number((raw ?? "").trim() || 0);
  if (!Number.isFinite(n) || n <= 0 || n > 730) return 0;
  return Math.floor(n);
}

export function readLegalConfig(env: Env): LegalInfo {
  const sellerName = clean(env[LEGAL_ENV.sellerName]);
  const rawAddress = clean(env[LEGAL_ENV.address]);
  const rawPhone = clean(env[LEGAL_ENV.phone]);
  const rawEmail = clean(env[LEGAL_ENV.email]);
  const addressOnRequest = rawAddress != null && ON_REQUEST.has(rawAddress.toLowerCase());
  const phoneOnRequest = rawPhone != null && ON_REQUEST.has(rawPhone.toLowerCase());
  const email = rawEmail && EMAIL.test(rawEmail) ? rawEmail : null;

  const missing: string[] = [];
  if (!sellerName) missing.push(LEGAL_ENV.sellerName);
  if (!rawAddress) missing.push(LEGAL_ENV.address);
  if (!rawPhone) missing.push(LEGAL_ENV.phone);
  if (!email) missing.push(LEGAL_ENV.email);

  return {
    ready: missing.length === 0,
    missing,
    sellerName,
    representative: clean(env[LEGAL_ENV.representative]),
    address: addressOnRequest ? null : rawAddress,
    addressOnRequest,
    phone: phoneOnRequest ? null : rawPhone,
    phoneOnRequest,
    email,
    priceNote: clean(env[LEGAL_ENV.priceNote]),
    jurisdictionCourt: clean(env[LEGAL_ENV.jurisdictionCourt]),
    trialDays: trialDaysFrom(env.STRIPE_TRIAL_DAYS),
  };
}

/**
 * 画面に渡す形。**欠けている環境変数の名前は外す**（誰でも開ける頁なので、
 * 設定の内情は開発者の画面だけに出す）。
 */
export type LegalPublicInfo = Omit<LegalInfo, "missing">;

export function toPublicLegal(info: LegalInfo): LegalPublicInfo {
  const { missing: _missing, ...rest } = info;
  return rest;
}

/** 何も設定されていない状態（読み込みに失敗したときも、これとして扱う）。 */
export const EMPTY_LEGAL: LegalPublicInfo = toPublicLegal(readLegalConfig({}));

/**
 * 購入口を開けてよいか。運営者の表記がそろうまで、本番では開けない。
 * **テスト用の鍵（`sk_test_` / `rk_test_`）のときだけ、開発者は試せる**
 * （実際のお金は動かない）。
 */
export function checkoutAllowedByLegal(p: {
  legalReady: boolean;
  isAdmin: boolean;
  secretKey: string | undefined;
}): boolean {
  if (p.legalReady) return true;
  const testKey = /^(sk|rk)_test_/.test(p.secretKey ?? "");
  return p.isAdmin && testKey;
}
