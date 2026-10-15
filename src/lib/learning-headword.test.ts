import { describe, expect, it } from "vitest";
import { isTargetHeadword, pickLearningHeadword } from "./target-language";
import { detectQueryLang } from "./text-query-lang";
import { hasJapaneseOnlyKanji } from "./kanji-forms";

describe("見出し語は学習言語の語だけ（オーナー指示 2026-10-15）", () => {
  it("台湾華語: かな・ローマ字・日本の新字体だけの字は通さない", () => {
    expect(isTargetHeadword("ボクサーパンツ", "zh-TW")).toBe(false);
    expect(isTargetHeadword("boxer briefs", "zh-TW")).toBe(false);
    expect(isTargetHeadword("図鑑", "zh-TW")).toBe(false);
    expect(isTargetHeadword("駅", "zh-TW")).toBe(false);
    expect(isTargetHeadword("圖鑑", "zh-TW")).toBe(true);
    expect(isTargetHeadword("四角褲", "zh-TW")).toBe(true);
  });

  it("台湾でも標準の字（並・餅・岳）と、漢字にくっついた大文字（T恤）は通す", () => {
    expect(isTargetHeadword("月餅", "zh-TW")).toBe(true);
    expect(isTargetHeadword("並排", "zh-TW")).toBe(true);
    expect(isTargetHeadword("岳父", "zh-TW")).toBe(true);
    expect(isTargetHeadword("T恤", "zh-TW")).toBe(true);
    expect(hasJapaneseOnlyKanji("並")).toBe(false);
    expect(hasJapaneseOnlyKanji("猫")).toBe(true);
  });

  it("AI が訳せなかった回は母語を見出しにしない（直せる物は直す）", () => {
    expect(pickLearningHeadword(["ボクサーパンツ", "ボクサーパンツ"], "zh-TW")).toBeNull();
    expect(pickLearningHeadword(["四角褲 (boxer)", "ボクサーパンツ"], "zh-TW")).toBe("四角褲");
    expect(pickLearningHeadword(["", "內褲"], "zh-TW")).toBe("內褲");
    expect(pickLearningHeadword(["ボクサーパンツ", "boxer briefs"], "en")).toBe("boxer briefs");
  });

  it("打った語が何語かの判定は今までどおり（日本の字があれば母語）", () => {
    expect(detectQueryLang("図鑑", "zh-TW")).toBe("native");
    expect(detectQueryLang("圖鑑", "zh-TW")).toBe("target");
  });
});
