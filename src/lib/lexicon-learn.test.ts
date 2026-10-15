/**
 * **辞書に貯める意味は、読む人の言語の欄に**（2026-10-15）。
 *
 * オーナーが英語の表示で試した回（12:44 UTC）の 虎斑貓 のカード「tabby cat」が、共有の辞書の `meaning_ja`
 * （日本語の欄）に入った。日本語で読む人の辞書の引き（`resolveDictionaryFields`）は `meaning_ja` を読むので、
 * 表示言語を日本語に戻した後も 虎斑貓 の辞書の意味が英語のまま残る。いまは日本語だけを `meaning_ja` に、
 * ほかの言語は `meanings[言語]` に入れる。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const upserts: unknown[][] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: async (rows: unknown[]) => {
        upserts.push(rows);
        return { error: null };
      },
    }),
  },
}));
vi.mock("./jev-tasks.server", () => ({ entryJevOpinion: async () => null }));
vi.mock("./ai-provider.server", () => ({ generateStructured: vi.fn(), getAiFor: vi.fn() }));

import { learnLexiconEntries } from "./lexicon.server";
import { resolveDictionaryFields } from "./dictionary-entry";

const tabby = {
  headword: "虎斑貓",
  zhuyin: "ㄏㄨˇ ㄅㄢ ㄇㄠ",
  pinyin: "hǔ bān māo",
  meaning_ja: "tabby cat",
  pos: "N",
};

beforeEach(() => {
  upserts.length = 0;
});

describe("辞書に貯める意味の欄", () => {
  it("英語で読む人の意味は meanings.en に入り、日本語の欄（meaning_ja）は空のまま", async () => {
    await learnLexiconEntries([tabby], "en");
    const [row] = upserts[0] as Array<Record<string, unknown>>;
    expect(row).toMatchObject({
      headword: "虎斑貓",
      meaning_ja: null,
      meanings: { en: "tabby cat" },
    });
    // 日本語で読む人には英語の意味を出さない。英語で読む人には出す。
    const raw = { ...(row as object), reading_primary: null, reading_alt: null, level_step: null };
    expect(resolveDictionaryFields(raw as never, "ja").meaning).toBe("");
    expect(resolveDictionaryFields(raw as never, "en").meaning).toBe("tabby cat");
  });

  it("繁體中文で読む人の意味は meanings['zh-TW']", async () => {
    await learnLexiconEntries([{ ...tabby, meaning_ja: "虎斑紋的貓" }], "zh-TW");
    const [row] = upserts[0] as Array<Record<string, unknown>>;
    expect(row).toMatchObject({ meaning_ja: null, meanings: { "zh-TW": "虎斑紋的貓" } });
  });

  it("日本語（呼ぶ側が言語を渡さない古い道も）は今までどおり meaning_ja", async () => {
    await learnLexiconEntries([{ ...tabby, meaning_ja: "キジトラ" }], "ja");
    await learnLexiconEntries([{ ...tabby, meaning_ja: "キジトラ" }]);
    for (const rows of upserts) {
      const [row] = rows as Array<Record<string, unknown>>;
      expect(row.meaning_ja).toBe("キジトラ");
      expect(row).not.toHaveProperty("meanings");
    }
  });
});
