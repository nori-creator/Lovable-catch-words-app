import { describe, expect, it } from "vitest";
import {
  canonicalPos,
  isPronunciationAmbiguous,
  normalizeReading,
  speechIdentity,
  ttsObjectPath,
} from "./tts-cache";
import { audioCacheKey } from "./tts-store";

/**
 * 発音の見分け（PRODUCT.md › Pronunciation / TTS「Cache identity must distinguish …
 * canonical reading/pronunciation, POS when relevant」、2026-10-03）: 多音字・同綴り異音語は
 * 読み（と英語では品詞）で置き場所を分ける。読みが分からない時と、読みが要らない語は
 * 今までと同じ置き場所のまま（既に貯めた音・作り置きを使い続ける）。
 */
describe("speechIdentity（読み・品詞で置き場所を分ける）", () => {
  it("多音字の 行 は拼音で分かれる（xíng / háng）", async () => {
    const walk = speechIdentity("zh-TW", "行", { pinyin: "xíng" });
    const row = speechIdentity("zh-TW", "行", { pinyin: "háng" });
    expect(walk).toBe("r=py:xíng");
    expect(row).toBe("r=py:háng");
    const a = await ttsObjectPath("zh-TW", "alloy", "行", walk);
    const b = await ttsObjectPath("zh-TW", "alloy", "行", row);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^zh-TW\/alloy\/[a-f0-9]{64}\.mp3$/);
    // 端末の鍵も分かれる。
    expect(audioCacheKey("zh-TW", "行", "alloy", walk)).not.toBe(
      audioCacheKey("zh-TW", "行", "alloy", row),
    );
  });

  it("銀行 のような語も多音字を含むので読みで分ける。拼音が無ければ注音", () => {
    expect(speechIdentity("zh-TW", "銀行", { pinyin: "yín háng" })).toBe("r=py:yínháng");
    expect(speechIdentity("zh-TW", "銀行", { zhuyin: "ㄧㄣˊ ㄏㄤˊ" })).toBe("r=zy:ㄧㄣˊㄏㄤˊ");
  });

  it("拼音の書き方の揺れ（空白・大文字・NFD）は同じ印になる", () => {
    const a = speechIdentity("zh-TW", "長大", { pinyin: "Zhǎng dà" });
    const b = speechIdentity("zh-TW", "長大", { pinyin: "zhǎngdà".normalize("NFD") });
    expect(a).toBe(b);
  });

  it("華語では品詞を混ぜない（候補の段の仮の品詞で鍵が割れない）", () => {
    expect(speechIdentity("zh-TW", "行", { pinyin: "xíng", pos: "名詞" })).toBe(
      speechIdentity("zh-TW", "行", { pinyin: "xíng", pos: "動詞" }),
    );
  });

  it("英語の同綴り異音語は IPA か品詞で分かれる（read・lead）", () => {
    expect(speechIdentity("en", "read", { ipa: "/riːd/" })).not.toBe(
      speechIdentity("en", "read", { ipa: "/rɛd/" }),
    );
    expect(speechIdentity("en", "lead", { pos: "noun" })).toBe("p=n");
    expect(speechIdentity("en", "Lead", { pos: "Verb" })).toBe("p=v");
  });

  it("読みが分からない・読みの要らない語は空（= 今までと同じ置き場所と端末の鍵）", async () => {
    expect(speechIdentity("zh-TW", "行", null)).toBe("");
    expect(speechIdentity("zh-TW", "行", { pos: "動詞" })).toBe("");
    expect(speechIdentity("zh-TW", "蘋果", { pinyin: "píngguǒ" })).toBe("");
    expect(speechIdentity("en", "apple", { ipa: "ˈæpəl", pos: "noun" })).toBe("");
    expect(speechIdentity("en", "lead", { pos: "感嘆詞" })).toBe("");
    // 印が空なら置き場所も端末の鍵も前と1文字も変わらない。
    expect(await ttsObjectPath("zh-TW", "alloy", "行", "")).toBe(
      await ttsObjectPath("zh-TW", "alloy", "行"),
    );
    expect(audioCacheKey("zh-TW", "傘", "alloy", "")).toBe("zh-TW|alloy|傘");
  });

  it("品詞は書き方の違う名前を同じ印に寄せる", () => {
    expect(canonicalPos("名詞")).toBe("n");
    expect(canonicalPos("Noun")).toBe("n");
    expect(canonicalPos("Vi")).toBe("v");
    expect(canonicalPos("形容詞")).toBe("adj");
    expect(canonicalPos("副詞")).toBe("adv");
    expect(canonicalPos("")).toBe("");
    expect(canonicalPos("??")).toBe("");
    expect(normalizeReading(" /ˈrɛ.kərd/ ")).toBe("ˈrɛkərd");
    expect(isPronunciationAmbiguous("ja", "行")).toBe(false);
  });
});
