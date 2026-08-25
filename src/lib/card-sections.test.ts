import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REGEN_SECTIONS,
  SECTION_IDS,
  isRegenSection,
  sectionHasContent,
  sectionsFor,
  missingSections,
  type SectionContentInput,
  type SectionId,
} from "./card-sections";
import { normalizeExtras } from "./extras";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "./target-lang";

/**
 * ここで見ているのは「2箇所に書かれた同じ物が食い違わないこと」。
 * 食い違っても**型でもビルドでも落ちない**種類の穴なので、
 * 一致そのものを試験にする。
 */
describe("節の一覧", () => {
  it("重複が無い", () => {
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
    expect(new Set(REGEN_SECTIONS).size).toBe(REGEN_SECTIONS.length);
  });

  it("作り直せる節は、必ず節の一覧に在る", () => {
    for (const id of REGEN_SECTIONS) {
      expect(SECTION_IDS).toContain(id);
    }
  });

  it("外部リンク系は作り直せない(生成物ではない)", () => {
    expect(isRegenSection("web_images")).toBe(false);
    expect(isRegenSection("real_usage")).toBe(false);
  });

  it("解説の節は作り直せる(押せるのに弾かれる状態にしない)", () => {
    expect(isRegenSection("usage_chunks")).toBe(true);
  });

  // 「ひと目でわかる」の表は 2026-08-20 にオーナー指示で丸ごと外した。
  // 節が消えたのに生成の指示だけ残ると、**誰も見ない物を毎回作って払う**。
  it("外した節は一覧に残っていない", () => {
    expect(SECTION_IDS).not.toContain("quick_facts" as SectionId);
  });
});

describe("sectionsFor — 言語ごとの並び", () => {
  /**
   * ## 画面の並びを**文字列として読む**のをやめた
   * 前の版はここで `WordCard.tsx` を正規表現で読んで `{ id: "…" }` を
   * 数えていた。並びが手書きの写しだったからそれで足りたが、
   * 写しをやめて `sectionsFor()` から畳むようにしたので、正規表現は
   * **0件を拾って静かに通る**(実際、書き換えた直後にこの試験は
   * 「0件が0件と一致する」で緑になりかけた)。
   *
   * 見るべき不変は「どの節も、少なくとも1つの言語のカードには出る」こと。
   * どこにも出ない節は**画面に一度も出ない死んだ節**で、エラーも出ない。
   */
  const everywhere = new Set(TARGET_LANGUAGES.flatMap((l) => [...sectionsFor(l)]));

  it("**一覧の節は、必ずどこかの言語のカードに出る**(死んだ節を作らない)", () => {
    for (const id of SECTION_IDS) expect([...everywhere], id).toContain(id);
  });

  it("**どの言語の並びも、一覧の中の物だけ**(知らない節を描かない)", () => {
    for (const l of TARGET_LANGUAGES) {
      for (const id of sectionsFor(l)) expect(SECTION_IDS, `${l}: ${id}`).toContain(id);
    }
  });

  it("並びに重複が無い(同じ節が2回出ない)", () => {
    for (const l of TARGET_LANGUAGES) {
      const list = sectionsFor(l);
      expect(new Set(list).size, l).toBe(list.length);
    }
  });

  it("知らない言語は既定の並びに落とす(空のカードを描かない)", () => {
    expect(sectionsFor(null)).toEqual(sectionsFor(DEFAULT_TARGET_LANGUAGE));
    expect(sectionsFor("kl-GL")).toEqual(sectionsFor(DEFAULT_TARGET_LANGUAGE));
  });

  it("**言語ごとに中身が違う**(全部同じなら分ける意味が無い)", () => {
    const zh = sectionsFor(DEFAULT_TARGET_LANGUAGE);
    // 量詞は台湾華語だけ。英語に量詞は無い。
    expect(zh).toContain("measure_words");
    expect(sectionsFor("en")).not.toContain("measure_words");
    // 冠詞は英語だけ。台湾華語に冠詞は無い。
    expect(sectionsFor("en")).toContain("countability");
    expect(zh).not.toContain("countability");
  });
});

describe("英語のカードの節", () => {
  it("**活用は作り直せない**(辞書の事実で、AI に作らせる物ではない)", () => {
    // AI に作らせると "child" の複数形が "childs" になり得る。
    // ECDICT の exchange 欄から取り込みのときに入る。
    expect(isRegenSection("forms")).toBe(false);
  });

  it("残り4つは作り直せる(押せるのに弾かれる状態にしない)", () => {
    for (const id of ["countability", "stress", "phrasal_verbs", "culture_note"] as const) {
      expect(isRegenSection(id), id).toBe(true);
    }
  });

  it("**活用が空の語では節を出さない**(見出しだけの空の節を作らない)", () => {
    // 不変化名詞など、活用が1つも無い語。`forms` の箱は在るが中身は空。
    const none = input({ headword: "sheep", extras: ex({ forms: {} }) });
    expect(sectionHasContent("forms", none)).toBe(false);
    // `lemma` は原形で、活用そのものではない。これだけでは節にしない。
    const lemmaOnly = input({ headword: "sheep", extras: ex({ forms: { lemma: "sheep" } }) });
    expect(sectionHasContent("forms", lemmaOnly)).toBe(false);
    const has = input({ headword: "go", extras: ex({ forms: { past: "went" } }) });
    expect(sectionHasContent("forms", has)).toBe(true);
  });

  it("強勢は音節に切れているときだけ(note だけでは節にしない)", () => {
    const noteOnly = input({ extras: ex({ stress: { syllables: [], note: "最初を強く" } }) });
    expect(sectionHasContent("stress", noteOnly)).toBe(false);
    const cut = input({ extras: ex({ stress: { syllables: ["pho", "to"], primary: 0 } }) });
    expect(sectionHasContent("stress", cut)).toBe(true);
  });
});

describe("見出しの文言", () => {
  const dict = fs.readFileSync("src/lib/i18n.tsx", "utf8");

  // 未定義の鍵は t() が**鍵の名前をそのまま返す**ので、
  // 画面に "card.usage_chunks" と出る。赤くもならない。
  it.each([...SECTION_IDS])("card.%s の文言が定義されている", (id) => {
    expect(dict).toContain(`"card.${id}"`);
  });
});

/**
 * 節に中身があるかの判定。**画面と server が同じ答えを出すこと**が
 * この関数の存在理由。ここがずれると、server は「まだ空だ」と考えて
 * 作り直し、画面は「埋まっている」と考える — 止まらない生成になる。
 */

function input(over: Partial<SectionContentInput> = {}): SectionContentInput {
  return { headword: "雨傘", meaning_ja: null, example_sentence: null, extras: null, ...over };
}

const ex = (o: Record<string, unknown>) => normalizeExtras(o);

describe("sectionHasContent — 空のカード", () => {
  it("作り直せる節は全部『中身なし』", () => {
    for (const id of REGEN_SECTIONS) {
      expect(sectionHasContent(id, input()), id).toBe(false);
    }
  });

  it("外を見に行くだけの節は、いつでも描ける", () => {
    expect(sectionHasContent("web_images", input())).toBe(true);
    expect(sectionHasContent("real_usage", input())).toBe(true);
  });

  it("『出会う見込み』は数えた答えが届いているときだけ", () => {
    expect(sectionHasContent("encounter", input())).toBe(false);
    expect(sectionHasContent("encounter", input({ hasEncounter: true }))).toBe(true);
  });
});

describe("sectionHasContent — 埋まった節", () => {
  it("意味と例文は本体の列を見る", () => {
    expect(sectionHasContent("meaning", input({ meaning_ja: "傘" }))).toBe(true);
    expect(sectionHasContent("example", input({ example_sentence: "我帶了雨傘。" }))).toBe(true);
  });

  it("頻度・使う場面は、メーターだけでも中身あり", () => {
    expect(sectionHasContent("usage_context", input({ extras: ex({ frequency_level: 4 }) }))).toBe(
      true,
    );
    expect(sectionHasContent("usage_context", input({ extras: ex({ register_scale: 0 }) }))).toBe(
      true,
    );
  });

  it("**量詞と丸ごと重なるだけの型は中身に数えない**(見出しだけの節が出る)", () => {
    const echo = ex({
      usage_chunks: [{ parts: [{ text: "一把", pos: "M" }], ja: "1本" }],
      measure_words: [{ word: "一把" }],
    });
    expect(sectionHasContent("usage_chunks", input({ extras: echo }))).toBe(false);

    const real = ex({
      usage_chunks: [
        {
          parts: [
            { text: "帶", pos: "V" },
            { text: "雨傘", pos: "N" },
          ],
          ja: "傘を持つ",
        },
      ],
      measure_words: [{ word: "一把" }],
    });
    expect(sectionHasContent("usage_chunks", input({ extras: real }))).toBe(true);
  });

  it("古い形の項目でも中身ありと数える", () => {
    expect(sectionHasContent("related_words", input({ extras: ex({ synonyms: ["傘"] }) }))).toBe(
      true,
    );
    expect(
      sectionHasContent("pronunciation_tips", input({ extras: ex({ study_tips: "三声" }) })),
    ).toBe(true);
    expect(sectionHasContent("taiwan_note", input({ extras: ex({ trivia: "台湾では" }) }))).toBe(
      true,
    );
  });

  it("壊れた extras で落ちない", () => {
    for (const id of SECTION_IDS) {
      expect(() =>
        sectionHasContent(id, input({ extras: normalizeExtras("こわれた") })),
      ).not.toThrow();
    }
  });
});

describe("missingSections", () => {
  it("**画面に並ぶ順のまま**返す(並べ替えない)", () => {
    const order: SectionId[] = ["taiwan_note", "meaning", "example"];
    expect(missingSections(order, input())).toEqual(["taiwan_note", "meaning", "example"]);
  });

  it("作り直せない節は入らない", () => {
    const got = missingSections([...SECTION_IDS], input());
    expect(got).not.toContain("web_images");
    expect(got).not.toContain("real_usage");
    expect(got).not.toContain("encounter");
    expect(got.every(isRegenSection)).toBe(true);
  });

  it("埋まった節は落ちる", () => {
    const got = missingSections([...SECTION_IDS], input({ meaning_ja: "傘" }));
    expect(got).not.toContain("meaning");
  });

  it("全部埋まっていれば空", () => {
    const full = input({
      meaning_ja: "傘",
      example_sentence: "我帶了雨傘。",
      extras: ex({
        usage_context: "雨の日に",
        examples_extra: [{ zh: "a", ja: "b" }],
        usage_chunks: [
          {
            parts: [
              { text: "帶", pos: "V" },
              { text: "雨傘", pos: "N" },
            ],
            ja: "傘を持つ",
          },
        ],
        measure_words: [{ word: "一把" }],
        related_words: [{ word: "傘", kind: "syn", note: "" }],
        pronunciation_tips: "三声",
        etymology: "雨+傘",
        mnemonic: "雨の傘",
        taiwan_note: "台湾では",
        // 英語のカードの節も埋める。**片方の言語だけ埋めて緑にしない** —
        // それでは「作り終わったのに作り直し続ける」を捕まえられない。
        countability: { kind: "countable", article: "an", note: "" },
        stress: { syllables: ["um", "brel", "la"], primary: 1 },
        phrasal_verbs: [{ phrase: "put up", meaning: "さす", example: "" }],
        culture_note: "英では brolly",
      }),
    });
    expect(missingSections([...SECTION_IDS], full)).toEqual([]);
  });
});
