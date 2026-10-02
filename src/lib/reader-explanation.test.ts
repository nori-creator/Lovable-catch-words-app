import { describe, expect, it } from "vitest";
import { readerExplanationSaveInput, wordExplanationQuery } from "./reader-explanation";
import { explanationKey } from "./word-explanation";

/**
 * 単語の詳細と復習が**同じ形で**その人向けの解説を引き・保存する所（2026-10-02）。
 */
describe("readerExplanationSaveInput", () => {
  const card = {
    extras: { usage_context: "at school", explain_lang: "en" } as Record<string, unknown>,
    meaning_ja: "notebook",
    reading_zhuyin: "ㄅㄧˇ ㄐㄧˋ ㄅㄣˇ",
    pinyin: "bǐjìběn",
    example_sentence: "我買了一本筆記本。",
    example_translation: "I bought a notebook.",
  };

  it("**その人の言語で作った意味を `reader_meaning` で送る**（前は共有の日本語の意味が写っていた）", () => {
    const input = readerExplanationSaveInput({
      wordId: "w1",
      shared: {
        meaning_ja: "ノート",
        reading_zhuyin: "ㄅㄧˇ",
        pinyin: "bǐ",
        example_sentence: "例",
      },
      card,
      shownExtras: null,
    });
    expect(input.word_id).toBe("w1");
    expect(input.reader_meaning).toBe("notebook");
    // 共有の列は欠けていないので触らない（他の人のカードも同じ行を見ている）。
    expect(input.patch).toBeUndefined();
  });

  it("共有の列が欠けているときだけ `patch` を送る", () => {
    const input = readerExplanationSaveInput({
      wordId: "w1",
      shared: { meaning_ja: "", reading_zhuyin: null, pinyin: null, example_sentence: null },
      card,
      shownExtras: null,
    });
    expect(input.patch?.meaning_ja).toBe("notebook");
    expect(input.patch?.example_translation).toBe("I bought a notebook.");
  });

  it("いま見えている項目は残し、空だった項目だけ埋める", () => {
    const input = readerExplanationSaveInput({
      wordId: "w1",
      shared: { meaning_ja: "ノート", reading_zhuyin: "x", example_sentence: "y" },
      card,
      shownExtras: { usage_context: "shown already" },
    });
    expect((input.extras as Record<string, unknown>).usage_context).toBe("shown already");
    expect((input.extras as Record<string, unknown>).explain_lang).toBe("en");
  });
});

describe("wordExplanationQuery — 単語の詳細と復習で同じ鍵", () => {
  it("鍵は語・解説の言語・母語（どちらで引いても、もう一方は読み直さない）", () => {
    const q = wordExplanationQuery(
      async () => ({ picked: null, unavailable: false }),
      "w1",
      explanationKey("zh-TW", "zh-TW"),
      undefined,
    );
    expect(q.queryKey).toEqual(["word-explanation", "w1", "zh-TW", "zh-TW"]);
    expect(q.initialData).toBeUndefined();
  });
});
