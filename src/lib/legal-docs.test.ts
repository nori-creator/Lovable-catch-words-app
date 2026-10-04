import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 法務文書の門（2026-10-03）。**目で読んでも気づきにくい壊れ方**だけを止める:
 * - 3言語のどれかだけ送り先が抜ける（片方だけ古い条文）
 * - 消えた機能（公開投稿）・無い窓口（アプリ内サポート）を約束する
 * - 本番の購入口が、運営者の表記を確かめずに開く
 */
const read = (p: string) => fs.readFileSync(path.join("src", p), "utf8");
const LANGS = ["ja", "en", "zh-tw"] as const;

/** コードが実際に送る先（`privacy-ja.tsx` の注の一覧）。 */
const PROCESSORS = [
  "Lovable",
  "Supabase",
  "Cloudflare",
  "OpenAI",
  "Anthropic",
  "DeepSeek",
  "Moonshot",
  "OpenRouter",
  "TypeSafe",
  "Azure",
  "ElevenLabs",
  "Unsplash",
  "Wikimedia",
  "Higgsfield",
  "Google",
  "Stripe",
  "AdSense",
];

describe("プライバシーポリシー", () => {
  for (const lang of LANGS) {
    const doc = read(`components/legal/privacy-${lang}.tsx`);
    it(`${lang}: 送り先を全部書いている`, () => {
      expect(PROCESSORS.filter((p) => !doc.includes(p))).toEqual([]);
    });
    it(`${lang}: 外した事業者（2026-10-03 オーナー決定）を書かない`, () => {
      expect(doc).not.toMatch(/MiniMax|Tripo/i);
    });
    it(`${lang}: 広告の説明に Google の2つのリンクがある`, () => {
      expect(doc).toContain("https://policies.google.com/technologies/partner-sites");
      expect(doc).toContain("https://adssettings.google.com");
    });
    it(`${lang}: 運営者と連絡先は設定から（直書きしない）`, () => {
      expect(doc).toContain("<OperatorDetails");
      expect(doc).not.toMatch(/mailto:/);
    });
  }

  it("消えた機能・無い窓口を約束しない", () => {
    for (const lang of LANGS) {
      for (const f of [
        `components/legal/privacy-${lang}.tsx`,
        `components/legal/terms-${lang}.tsx`,
      ]) {
        const doc = read(f);
        expect([f, /公開投稿|public posts|公開貼文/i.test(doc)]).toEqual([f, false]);
        expect([f, /アプリ内サポート|in-app support|App 內客服/i.test(doc)]).toEqual([f, false]);
      }
    }
  });
});

describe("利用規約", () => {
  for (const lang of LANGS) {
    const doc = read(`components/legal/terms-${lang}.tsx`);
    it(`${lang}: 解約の場所・特商法の頁・無料体験は設定があるときだけ`, () => {
      expect(doc).toContain('href="/settings"');
      expect(doc).toContain('href="/legal/tokushoho"');
      expect(doc).toContain("info.trialDays > 0 &&");
      expect(doc).toContain("info.jurisdictionCourt");
    });
  }
});

describe("購入口は運営者の表記を確かめる", () => {
  const billing = read("lib/billing.functions.ts");
  it("Checkout の前に checkoutAllowedByLegal を通す", () => {
    const checkout = billing.slice(billing.indexOf("export const createCheckoutSession"));
    const gate = checkout.indexOf("checkoutAllowedByLegal");
    const call = checkout.indexOf("api.stripe.com/v1/checkout/sessions");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(call);
  });
  it("管理画面（Billing Portal）の口がある", () => {
    expect(billing).toContain("export const createBillingPortalSession");
  });
});

describe("iPhone アプリの扱い（2026-10-03。iOS の docs/legal が全文）", () => {
  const SPEECH = { ja: "音声認識", en: "speech recognition", "zh-tw": "語音辨識" } as const;
  for (const lang of LANGS) {
    const doc = read(`components/legal/privacy-${lang}.tsx`);
    it(`${lang}: 声で調べる・AI への送信の同意・広告の識別子・地域ごとの追加事項`, () => {
      expect(doc).toContain(SPEECH[lang]);
      expect(doc).toContain("IDFA");
      expect(doc).toContain("GDPR");
      expect(doc).toContain("CCPA");
      expect(doc).toContain("<h2>14.");
    });
    it(`${lang}: 利用規約に App Store の条項と、連絡先（第13条）がある`, () => {
      const terms = read(`components/legal/terms-${lang}.tsx`);
      expect(terms).toContain("App Store");
      expect(terms).toContain("<h2>13.");
      expect(terms).toContain("<OperatorDetails");
    });
  }
});

describe("サポートの頁（iPhone アプリと App Store Connect のサポート URL）", () => {
  it("連絡先は設定から（直書きしない）。法務のリンクの列にも出る", () => {
    const doc = read("components/legal/SupportDocument.tsx");
    expect(doc).toContain("<OperatorDetails");
    expect(doc).not.toMatch(/mailto:/);
    expect(read("components/legal/LegalShell.tsx")).toContain('href: "/support"');
    expect(read("routes/support.tsx")).toContain('createFileRoute("/support")');
  });
  it("古い /tokushoho は /legal/tokushoho へ送る", () => {
    expect(read("routes/tokushoho.tsx")).toContain('redirect({ to: "/legal/tokushoho"');
  });
});
