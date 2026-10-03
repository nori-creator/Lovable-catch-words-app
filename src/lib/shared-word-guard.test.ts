/**
 * 共有の語を、画面の送った中身で書き換えさせない（監査 2026-10-03）。
 * 判定（`shared-word-guard.ts`）と、それを使う保存の道（`applyWordExtrasUpdate`・
 * `upsertWord`）を、偽の DB で動かして確かめる。
 */
import { describe, expect, it, vi } from "vitest";

const adminMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminMock.current;
  },
}));

import {
  BoundedExtrasSchema,
  EXTRAS_LIMITS,
  WordInputSchema,
  fillEmptySharedColumns,
  fillEmptySharedExtras,
  isExplanationLangCode,
  jsonBoundsProblem,
} from "./shared-word-guard";
import {
  applyWordExtrasUpdate,
  upsertWord,
  type UpdateWordExtrasData,
  type WordUpsertInput,
} from "./stickers.functions";

describe("fillEmptySharedColumns（共有の列は空の所だけ埋める）", () => {
  const full = {
    meaning_ja: "自転車",
    reading_zhuyin: "ㄐㄧㄠˇ ㄊㄚˋ ㄔㄜ",
    pinyin: "jiǎotàchē",
    part_of_speech: "名詞",
    level: "TOCFL-2",
    example_sentence: "我騎腳踏車上學。",
    example_translation: "自転車で通学する。",
  };

  it("埋まっている列は、何を送っても書き換えない", () => {
    expect(
      fillEmptySharedColumns(
        full,
        { meaning_ja: "悪意のある意味", example_sentence: "書き換え", level: "TOCFL-7" },
        { verified: false },
      ),
    ).toEqual({});
  });

  it("空の列だけ、送られた値で埋める（空白だけの列も空とみなす）", () => {
    expect(
      fillEmptySharedColumns(
        { ...full, example_sentence: null, example_translation: "  " },
        {
          meaning_ja: "別の意味",
          example_sentence: "我每天騎腳踏車。",
          example_translation: "毎日自転車に乗る。",
        },
        { verified: false },
      ),
    ).toEqual({ example_sentence: "我每天騎腳踏車。", example_translation: "毎日自転車に乗る。" });
  });

  it("人が確かめた語は、空の列でも書かない", () => {
    expect(
      fillEmptySharedColumns({}, { meaning_ja: "意味", pinyin: "x" }, { verified: true }),
    ).toEqual({});
  });

  it("空の値・知らない鍵は書かない", () => {
    expect(
      fillEmptySharedColumns(
        {},
        { meaning_ja: "", pinyin: "  ", source: "verified", created_by: "me" },
        { verified: false },
      ),
    ).toEqual({});
  });
});

describe("fillEmptySharedExtras（共有の解説も空の項目だけ）", () => {
  const ja = {
    explain_lang: "ja",
    usage_context: "通学のとき",
    mnemonic: "",
    speaking_scaffold_x: { keep: true },
  };

  it("空の解説には、送られた物を丸ごと入れる（知らない鍵は残す）", () => {
    const out = fillEmptySharedExtras(
      { speaking_scaffold_x: 1 },
      {
        explain_lang: "en",
        usage_context: "commuting",
      },
    );
    expect(out).toEqual({ speaking_scaffold_x: 1, explain_lang: "en", usage_context: "commuting" });
  });

  it("中身のある解説の項目は上書きしない。同じ言語の空の項目だけ足す", () => {
    const out = fillEmptySharedExtras(ja, {
      explain_lang: "ja",
      usage_context: "書き換え",
      mnemonic: "足で踏む車",
    });
    expect(out).toEqual({ ...ja, mnemonic: "足で踏む車" });
  });

  it("言語の違う解説は混ぜない", () => {
    expect(fillEmptySharedExtras(ja, { explain_lang: "en", mnemonic: "pedal car" })).toBeNull();
  });

  it("足す物が無ければ null（書きに行かない）", () => {
    expect(fillEmptySharedExtras(ja, { explain_lang: "ja", usage_context: "別" })).toBeNull();
    expect(fillEmptySharedExtras(ja, { explain_lang: "ja" })).toBeNull();
  });
});

describe("大きさの上限", () => {
  it("普通のカードは通す", () => {
    const card = {
      usage_context: "通学のとき",
      examples_extra: Array.from({ length: 3 }, () => ({
        zh: "我騎腳踏車。",
        ja: "自転車に乗る。",
        chunks: [{ text: "騎", pos: "V", alts: [{ text: "坐", ja: "座る" }] }],
      })),
    };
    expect(jsonBoundsProblem(card)).toBeNull();
    expect(BoundedExtrasSchema.parse(card).usage_context).toBe("通学のとき");
  });

  it("長すぎる文字列・多すぎる配列・多すぎる鍵・深すぎる入れ子・大きすぎる全体を断る", () => {
    const long = "あ".repeat(EXTRAS_LIMITS.maxStringChars + 1);
    expect(() => BoundedExtrasSchema.parse({ trivia: long })).toThrow();
    expect(() =>
      BoundedExtrasSchema.parse({ synonyms: Array(EXTRAS_LIMITS.maxArrayItems + 1).fill("x") }),
    ).toThrow();
    const many = Object.fromEntries(
      Array.from({ length: EXTRAS_LIMITS.maxObjectKeys + 1 }, (_, i) => [`k${i}`, 1]),
    );
    expect(() => BoundedExtrasSchema.parse(many)).toThrow();
    let deep: unknown = "x";
    for (let i = 0; i < EXTRAS_LIMITS.maxDepth + 2; i++) deep = { d: deep };
    expect(jsonBoundsProblem(deep)).toMatch(/deep/);
    const big = {
      synonyms: Array(EXTRAS_LIMITS.maxArrayItems).fill("x".repeat(EXTRAS_LIMITS.maxStringChars)),
    };
    expect(jsonBoundsProblem(big)).toMatch(/too large/);
  });

  it("語の入力の文字列にも上限がある（見出し・意味・例文・品詞・級・分類）", () => {
    const ok = { headword: "腳踏車", meaning_ja: "自転車", category_key: "vehicle" };
    expect(WordInputSchema.parse(ok).part_of_speech).toBe("名詞");
    for (const [k, n] of [
      ["headword", 101],
      ["meaning_ja", 1001],
      ["example_sentence", 2001],
      ["part_of_speech", 101],
      ["level", 61],
      ["category_key", 65],
    ] as const) {
      expect(() => WordInputSchema.parse({ ...ok, [k]: "x".repeat(n) })).toThrow();
    }
  });

  it("解説の行の鍵は言語の符号だけ", () => {
    for (const v of ["", "ja", "en", "zh-TW", "ko"]) expect(isExplanationLangCode(v)).toBe(true);
    for (const v of ["日本語", "ja; drop table", "x".repeat(20), 3])
      expect(isExplanationLangCode(v)).toBe(false);
  });
});

// --- 保存の道を偽の DB で動かす ------------------------------------------------

type Row = Record<string, unknown>;

/** `words` の1行と、書いた物を覚える偽の DB。 */
function fakeDb(opts: { owns: boolean; word: Row | null }) {
  const updates: Row[] = [];
  const inserts: Row[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "in"]) c[m] = () => c;
    c.maybeSingle = async () => result;
    c.single = async () => result;
    return c;
  };
  const user = {
    from: (t: string) => {
      if (t !== "stickers") throw new Error(`unexpected ${t}`);
      return chain({ data: opts.owns ? { id: "s1" } : null, error: null });
    },
  };
  const admin = {
    from: (t: string) => {
      if (t !== "words") throw new Error(`unexpected ${t}`);
      return {
        ...chain({ data: opts.word, error: null }),
        update: (row: Row) => {
          updates.push(row);
          return { eq: async () => ({ error: null }) };
        },
        insert: (row: Row) => {
          inserts.push(row);
          return chain({ data: { id: "new" }, error: null });
        },
      };
    },
  };
  return { user, admin, updates, inserts };
}

const sharedWord = {
  id: "w1",
  source: "ai",
  meaning_ja: "自転車",
  reading_zhuyin: "ㄐㄧㄠˇ ㄊㄚˋ ㄔㄜ",
  pinyin: "jiǎotàchē",
  part_of_speech: "名詞",
  level: "TOCFL-2",
  example_sentence: "",
  example_translation: null,
  extras: { explain_lang: "ja", usage_context: "通学のとき" },
};

const req = (over: Partial<UpdateWordExtrasData> = {}): UpdateWordExtrasData =>
  ({
    word_id: "00000000-0000-0000-0000-000000000001",
    extras: BoundedExtrasSchema.parse({
      explain_lang: "en",
      explain_l1: "en",
      usage_context: "commuting",
      mnemonic: "pedal car",
    }),
    ...over,
  }) as UpdateWordExtrasData;

describe("applyWordExtrasUpdate（updateWordExtras の中身）", () => {
  it("札を持っていない人は何も書けない", async () => {
    const db = fakeDb({ owns: false, word: sharedWord });
    const save = vi.fn();
    await expect(
      applyWordExtrasUpdate(
        { supabase: db.user, admin: db.admin, saveExplanation: save },
        "u",
        req(),
      ),
    ).rejects.toThrow("権限がありません");
    expect(db.updates).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("埋まっている共有の意味は変えず、空の例文だけ埋める。解説の全体は読む人の行へ", async () => {
    const db = fakeDb({ owns: true, word: sharedWord });
    const save = vi.fn(async () => ({ saved: true }));
    await applyWordExtrasUpdate(
      { supabase: db.user, admin: db.admin, saveExplanation: save },
      "u",
      req({
        patch: { meaning_ja: "bicycle", example_sentence: "我騎腳踏車。", level: "TOCFL-9" },
        reader_meaning: "bicycle",
      }),
    );
    // 共有の行: 意味・級はそのまま、例文だけ。英語の解説は日本語の共有の解説に混ぜない。
    expect(db.updates).toEqual([{ example_sentence: "我騎腳踏車。" }]);
    // 読む人の行: 英語の解説の全体と、英語の意味。
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        explain_lang: "en",
        l1: "en",
        meaning: "bicycle",
        extras: expect.objectContaining({ usage_context: "commuting", mnemonic: "pedal car" }),
      }),
    );
  });

  it("人が確かめた語は、共有の列を空でも書かない（解説の行は置く）", async () => {
    const db = fakeDb({
      owns: true,
      word: { ...sharedWord, source: "verified", extras: { explain_lang: "en" } },
    });
    const save = vi.fn(async () => ({ saved: true }));
    await applyWordExtrasUpdate(
      { supabase: db.user, admin: db.admin, saveExplanation: save },
      "u",
      req({ patch: { example_sentence: "我騎腳踏車。" } }),
    );
    // extras は空だったので入る（AI の付け足しとして画面が印を付ける物）。列は触らない。
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).not.toHaveProperty("example_sentence");
    expect(db.updates[0]).toHaveProperty("extras");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("言語の符号でない鍵の解説は、何も書く前に断る", async () => {
    const db = fakeDb({ owns: true, word: sharedWord });
    const save = vi.fn();
    const bad = req();
    (bad.extras as Record<string, unknown>).explain_lang = "<script>";
    await expect(
      applyWordExtrasUpdate(
        { supabase: db.user, admin: db.admin, saveExplanation: save },
        "u",
        bad,
      ),
    ).rejects.toThrow();
    expect(db.updates).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("upsertWord（既に在る語に、キャッチの解説を足す）", () => {
  const word = (extras: Record<string, unknown>): WordUpsertInput =>
    ({
      headword: "腳踏車",
      meaning_ja: "悪意のある意味",
      category_key: "vehicle",
      extras: BoundedExtrasSchema.parse(extras),
    }) as WordUpsertInput;

  /** 既に在る語を返す、呼んだ人の権限の偽の DB。 */
  const userDb = {
    from: () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.maybeSingle = async () => ({ data: { id: "w1" } });
      return c;
    },
  };

  it("埋まっている共有の解説の項目は上書きせず、空の項目だけ足す", async () => {
    const db = fakeDb({
      owns: true,
      word: { extras: { explain_lang: "zh-TW", usage_context: "上學" } },
    });
    adminMock.current = db.admin;
    const id = await upsertWord(
      userDb,
      "u",
      word({ explain_lang: "zh-TW", usage_context: "書き換え", mnemonic: "腳踩的車" }),
      "zh-TW",
    );
    expect(id).toBe("w1");
    expect(db.updates).toHaveLength(1);
    const extras = db.updates[0].extras as Record<string, unknown>;
    expect(extras.usage_context).toBe("上學");
    expect(extras.mnemonic).toBe("腳踩的車");
    // 共有の意味などの列には触らない。
    expect(Object.keys(db.updates[0])).toEqual(["extras"]);
  });

  it("足す物が無ければ書きに行かない", async () => {
    const db = fakeDb({
      owns: true,
      word: { extras: { explain_lang: "zh-TW", usage_context: "上學" } },
    });
    adminMock.current = db.admin;
    await upsertWord(userDb, "u", word({ explain_lang: "ja", mnemonic: "x" }), "zh-TW");
    expect(db.updates).toEqual([]);
  });
});
