import { describe, it, expect } from "vitest";
import { resolveWordLanguage } from "./word-language";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";

/**
 * オーナー報告 2026-08-26「英単語なのに TOCFL のレベルが表示される」。
 *
 * `lamp` に TOCFL 1級・量詞・台灣筆記が並んでいた絵が届いている。
 * 原因は `words.language` に `zh-TW` が入って保存されていたこと。
 *
 * ここで守るのは2つ:
 *  - **明らかに違う語は正す**(lamp は台湾華語ではない)
 *  - **迷ったら動かさない**(直すつもりで壊さない)
 */

describe("resolveWordLanguage", () => {
  it("**英語の語が台湾華語として保存されていたら正す**", () => {
    expect(resolveWordLanguage("zh-TW", "lamp")).toBe("en");
    expect(resolveWordLanguage("zh-TW", "bicycle")).toBe("en");
    expect(resolveWordLanguage("zh-TW", "night market")).toBe("en");
  });

  it("**中国語の語が英語として保存されていたら正す**", () => {
    expect(resolveWordLanguage("en", "腳踏車")).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(resolveWordLanguage("en", "手")).toBe(DEFAULT_TARGET_LANGUAGE);
  });

  it("合っている行は**触らない**", () => {
    expect(resolveWordLanguage("zh-TW", "腳踏車")).toBe("zh-TW");
    expect(resolveWordLanguage("en", "lamp")).toBe("en");
  });

  it("**決め手が無い語は動かさない**(直すつもりで壊さない)", () => {
    // 数字・記号だけ、空白だけ — どの言語の規則も決め手にならない。
    for (const odd of ["", "   ", "123", "!!!", "…"]) {
      expect(resolveWordLanguage("zh-TW", odd), odd).toBe("zh-TW");
      expect(resolveWordLanguage("en", odd), odd).toBe("en");
    }
  });

  it("知らない言語は既定に均してから見る", () => {
    expect(resolveWordLanguage(null, "lamp")).toBe("en");
    expect(resolveWordLanguage("de", "腳踏車")).toBe(DEFAULT_TARGET_LANGUAGE);
  });

  it("前後の空白で判定が変わらない", () => {
    expect(resolveWordLanguage("zh-TW", "  lamp  ")).toBe("en");
  });
});
