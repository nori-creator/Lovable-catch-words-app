import { describe, expect, it } from "vitest";
import {
  EMPTY_LEGAL,
  LEGAL_REQUIRED_ENV,
  checkoutAllowedByLegal,
  readLegalConfig,
  toPublicLegal,
  trialDaysFrom,
} from "./legal-config";

/**
 * 運営者の表記（特商法）。**見本や作り話を出さない** — 値は設定に在る物だけで、
 * 欠けていれば準備中、本番の購入口も止まる。
 */
const FULL = {
  LEGAL_SELLER_NAME: "Seller X",
  LEGAL_ADDRESS: "Somewhere 1-2-3",
  LEGAL_PHONE: "000-0000-0000",
  LEGAL_EMAIL: "owner@example.com",
};

describe("readLegalConfig", () => {
  it("何も無ければ準備中。必須の4つの名前を返す", () => {
    const c = readLegalConfig({});
    expect(c.ready).toBe(false);
    expect(c.missing).toEqual([...LEGAL_REQUIRED_ENV]);
    expect(c.sellerName).toBeNull();
    expect(c.email).toBeNull();
  });

  it("必須がそろえば ready。値はそのまま（空白だけ削る）", () => {
    const c = readLegalConfig({ ...FULL, LEGAL_SELLER_NAME: "  Seller X  " });
    expect(c.ready).toBe(true);
    expect(c.missing).toEqual([]);
    expect(c.sellerName).toBe("Seller X");
    expect(c.address).toBe("Somewhere 1-2-3");
  });

  it("空白だけの値は無いのと同じ", () => {
    const c = readLegalConfig({ ...FULL, LEGAL_PHONE: "   " });
    expect(c.ready).toBe(false);
    expect(c.missing).toEqual(["LEGAL_PHONE"]);
  });

  it("メールの形でない物は使わない（開示の請求を受けられない）", () => {
    const c = readLegalConfig({ ...FULL, LEGAL_EMAIL: "not-an-email" });
    expect(c.ready).toBe(false);
    expect(c.email).toBeNull();
    expect(c.missing).toEqual(["LEGAL_EMAIL"]);
  });

  it("住所・電話は「請求があれば遅滞なく開示」を選べる", () => {
    const c = readLegalConfig({ ...FULL, LEGAL_ADDRESS: "ON_REQUEST", LEGAL_PHONE: "on_request" });
    expect(c.ready).toBe(true);
    expect(c.addressOnRequest).toBe(true);
    expect(c.address).toBeNull();
    expect(c.phoneOnRequest).toBe(true);
    expect(c.phone).toBeNull();
  });

  it("任意の項目（代表者・価格の注記・管轄・無料体験）", () => {
    const c = readLegalConfig({
      ...FULL,
      LEGAL_REPRESENTATIVE: "Rep Y",
      LEGAL_PRICE_NOTE: "Tax included",
      LEGAL_JURISDICTION_COURT: "Court Z",
      STRIPE_TRIAL_DAYS: "7",
    });
    expect([c.representative, c.priceNote, c.jurisdictionCourt, c.trialDays]).toEqual([
      "Rep Y",
      "Tax included",
      "Court Z",
      7,
    ]);
  });

  it("画面に渡す形は、欠けている設定の名前を含まない", () => {
    expect("missing" in toPublicLegal(readLegalConfig({}))).toBe(false);
    expect(EMPTY_LEGAL.ready).toBe(false);
  });
});

describe("trialDaysFrom", () => {
  it("未設定・空は既定の7日（オーナー決定 2026-10-03）", () => {
    for (const v of [undefined, "", "  "]) expect([v, trialDaysFrom(v)]).toEqual([v, 7]);
  });
  it("数でない・負・0・大きすぎる値は 0", () => {
    for (const v of ["abc", "-3", "0", "9999"]) expect([v, trialDaysFrom(v)]).toEqual([v, 0]);
    expect(trialDaysFrom("14")).toBe(14);
    expect(trialDaysFrom("7.9")).toBe(7);
  });
});

describe("checkoutAllowedByLegal — 表記がそろうまで本番では売らない", () => {
  it("そろっていれば誰でも", () => {
    expect(
      checkoutAllowedByLegal({ legalReady: true, isAdmin: false, secretKey: "sk_live_x" }),
    ).toBe(true);
  });
  it("そろっていなければ、本番の鍵では開発者も買えない", () => {
    expect(
      checkoutAllowedByLegal({ legalReady: false, isAdmin: true, secretKey: "sk_live_x" }),
    ).toBe(false);
    expect(
      checkoutAllowedByLegal({ legalReady: false, isAdmin: false, secretKey: "sk_test_x" }),
    ).toBe(false);
  });
  it("テスト用の鍵なら開発者だけ試せる", () => {
    expect(
      checkoutAllowedByLegal({ legalReady: false, isAdmin: true, secretKey: "sk_test_x" }),
    ).toBe(true);
    expect(
      checkoutAllowedByLegal({ legalReady: false, isAdmin: true, secretKey: "rk_test_x" }),
    ).toBe(true);
  });
});
