import { describe, expect, it } from "vitest";
import { legalHrefFor, legalUiLang, parseLangParam } from "./legal-lang";

/**
 * 法務の頁の表示言語（2026-10-15）。iPhone アプリが Safari で開く規約・プライバシーが、英語で使っている人にも
 * 日本語で出ていた（Safari に app の言語の記憶が無く、既定の「ja」に落ちていた）。
 */
describe("parseLangParam", () => {
  it("3つの表示言語と、その言い換えを読む", () => {
    expect(parseLangParam("ja")).toBe("ja");
    expect(parseLangParam("en")).toBe("en");
    expect(parseLangParam("zh-TW")).toBe("zh-TW");
    expect(parseLangParam("zh-tw")).toBe("zh-TW");
    expect(parseLangParam("zh-Hant")).toBe("zh-TW");
    expect(parseLangParam("en-US")).toBe("en");
    expect(parseLangParam("ja-JP")).toBe("ja");
  });

  it("知らない値・空・文字列でない物は無視する", () => {
    expect(parseLangParam("fr")).toBeNull();
    expect(parseLangParam("")).toBeNull();
    expect(parseLangParam(undefined)).toBeNull();
    expect(parseLangParam(["en"])).toBeNull();
    expect(parseLangParam("<script>")).toBeNull();
  });
});

describe("legalUiLang — ?lang → 選んだ言語 → ブラウザの言語", () => {
  it("?lang が最優先（選んだ言語・ブラウザの言語と違っても）", () => {
    expect(legalUiLang({ param: "en", stored: "ja", languages: ["zh-TW"] })).toBe("en");
    expect(legalUiLang({ param: "zh-Hant", stored: "ja", languages: ["en-US"] })).toBe("zh-TW");
  });

  it("?lang が無い・読めない時は、この端末で選んだ言語", () => {
    expect(legalUiLang({ param: undefined, stored: "en", languages: ["ja"] })).toBe("en");
    expect(legalUiLang({ param: "xx", stored: "zh-TW", languages: ["ja"] })).toBe("zh-TW");
  });

  it("どちらも無ければブラウザの言語（英語の Safari は英語、知らない言語は英語、日本語は日本語）", () => {
    expect(legalUiLang({ languages: ["en-GB", "ja"] })).toBe("en");
    expect(legalUiLang({ languages: ["fr-FR"] })).toBe("en");
    expect(legalUiLang({ languages: ["ja-JP"] })).toBe("ja");
    expect(legalUiLang({ languages: ["zh-Hant-TW"] })).toBe("zh-TW");
  });

  it("**裸の既定「ja」に落ちない**: 何も分からない時は英語", () => {
    expect(legalUiLang({})).toBe("en");
    expect(legalUiLang({ stored: "garbage", languages: [] })).toBe("en");
  });
});

describe("legalHrefFor", () => {
  it("同じ頁に ?lang を付ける（iOS が開く形と同じ）", () => {
    expect(legalHrefFor("/privacy", "en")).toBe("/privacy?lang=en");
    expect(legalHrefFor("/legal/tokushoho", "zh-TW")).toBe("/legal/tokushoho?lang=zh-TW");
  });
});
