import { describe, expect, it } from "vitest";
import { readableError } from "./errors";

const t = (k: string) => `[${k}]`;

describe("readableError（画面の言語で出す。オーナー指示 2026-09-23 の3回目）", () => {
  it("技術的な英語の文は出さない（どの言語でも）", () => {
    expect(readableError(new Error("fetch failed"), "FB", "ja", t)).toBe("FB");
    expect(readableError(new Error("PGRST116"), "FB", "en", t)).toBe("FB");
  });
  it("日本語で使っている人には、こちらが書いた日本語の文をそのまま", () => {
    expect(readableError(new Error("単語が見つかりません"), "FB", "ja", t)).toBe(
      "単語が見つかりません",
    );
  });
  it("英語・台湾華語の人には、知っている文はその言語の文に置き換える", () => {
    expect(readableError(new Error("1日の利用上限(300回)に達しました。"), "FB", "en", t)).toBe(
      "[err.dailyCap]",
    );
    expect(readableError(new Error("この単語を編集する権限がありません"), "FB", "zh-TW", t)).toBe(
      "[err.forbidden]",
    );
    expect(readableError(new Error("単語が見つかりません"), "FB", "en", t)).toBe("[err.notFound]");
  });
  it("知らない日本語の文は、その言語の汎用の文（日本語を混ぜない）", () => {
    expect(readableError(new Error("謎のエラーです"), "FB", "en", t)).toBe("FB");
  });
});
