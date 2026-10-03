import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSellerInfo } from "./seller-info";

describe("特定商取引法の表記の事業者の情報", () => {
  it("設定が全部あれば、そのまま出し、省く欄は無い", () => {
    const s = readSellerInfo({
      VITE_SELLER_NAME: " 山田 太郎 ",
      VITE_SELLER_ADDRESS: "東京都…",
      VITE_SELLER_PHONE: "03-0000-0000",
      VITE_SELLER_EMAIL: "support@example.com",
    });
    expect(s.values.name).toBe("山田 太郎");
    expect(s.canRequest).toBe(true);
    expect(s.disclosedOnRequest).toEqual([]);
  });

  it("空の氏名・住所・電話は「請求があれば開示」の欄になる", () => {
    const s = readSellerInfo({ VITE_SELLER_EMAIL: "support@example.com", VITE_SELLER_PHONE: " " });
    expect(s.disclosedOnRequest).toEqual(["name", "address", "phone"]);
    expect(s.canRequest).toBe(true);
    // 法人の責任者の欄は、空なら出さない（「請求があれば開示」に入れない）。
    expect(s.disclosedOnRequest).not.toContain("responsible");
  });

  it("メールが無い・形が違えば、請求の窓口が無い（開発者に知らせる）", () => {
    expect(readSellerInfo({}).canRequest).toBe(false);
    expect(readSellerInfo({ VITE_SELLER_EMAIL: "not-an-email" }).canRequest).toBe(false);
    expect(readSellerInfo({ VITE_SELLER_EMAIL: "not-an-email" }).values.email).toBeNull();
  });

  it("オーナーの個人情報をコードに書き込んでいない（設定から読むだけ）", () => {
    const root = path.resolve(__dirname, "..");
    const src = ["lib/seller-info.ts", "components/CommerceDisclosure.tsx"]
      .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
      .join("\n");
    // 電話番号・メールアドレスの形の文字が無い（例のドメイン以外）。
    expect(src).not.toMatch(/\b0\d{1,3}-\d{2,4}-\d{3,4}\b/);
    expect(src.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).toEqual([]);
  });
});
