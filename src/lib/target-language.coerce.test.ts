import { describe, it, expect } from "vitest";
import { coerceTargetHeadword } from "./target-language";

/**
 * 生成が付け足した注釈で、正しい見出し語ごと捨てていた件
 * （オーナー報告 2026-09-22「カメラの検索で日本語での検索ができない」）。
 */
describe("見出し語は捨てる前に一度だけ直す", () => {
  it("そのまま通る物は触らない", () => {
    expect(coerceTargetHeadword("烤肉", "zh-TW")).toBe("烤肉");
    expect(coerceTargetHeadword("珍珠奶茶", "zh-TW")).toBe("珍珠奶茶");
  });

  it("**後ろに付いたラテン文字の注釈を落とす**", () => {
    // ここが本題。前は丸ごと捨てられて「単語が見つかりませんでした」になっていた。
    expect(coerceTargetHeadword("烤肉 (BBQ)", "zh-TW")).toBe("烤肉");
    expect(coerceTargetHeadword("滷肉飯 lǔ ròu fàn", "zh-TW")).toBe("滷肉飯");
  });

  it("全角の括弧書きは元から通る（`headwordCore` が落とすため）", () => {
    expect(coerceTargetHeadword("燒肉（日式）", "zh-TW")).toBe("燒肉（日式）");
  });

  it("**かなだけの物は直せない**（母語がそのまま見出しになるのを止める）", () => {
    expect(coerceTargetHeadword("やきにく", "zh-TW")).toBeNull();
    expect(coerceTargetHeadword("シャーペン", "zh-TW")).toBeNull();
  });

  it("空・空白だけは null", () => {
    expect(coerceTargetHeadword("", "zh-TW")).toBeNull();
    expect(coerceTargetHeadword("   ", "zh-TW")).toBeNull();
  });

  it("英語を学ぶ人には英語の規則で効く", () => {
    expect(coerceTargetHeadword("umbrella", "en")).toBe("umbrella");
    expect(coerceTargetHeadword("umbrella（傘）", "en")).toBe("umbrella");
    expect(coerceTargetHeadword("傘", "en")).toBeNull();
  });
});
