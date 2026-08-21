import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REGEN_SECTIONS,
  SECTION_IDS,
  isRegenSection,
  sectionHasContent,
  missingSections,
  type SectionContentInput,
  type SectionId,
} from "./card-sections";
import { normalizeExtras } from "./extras";

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

describe("画面の既定の並び", () => {
  const src = fs.readFileSync("src/components/WordCard.tsx", "utf8");
  const ordered = [...src.matchAll(/\{ id: "([\w_]+)" \}/g)].map((m) => m[1] as SectionId);

  it("並びに出てくる節は、全部一覧に在る", () => {
    expect(ordered.length).toBeGreaterThan(0);
    for (const id of ordered) expect(SECTION_IDS).toContain(id);
  });

  // 節を足したのに並びへ入れ忘れると、**その節は画面に一度も出ない**。
  // エラーは出ないので、目でも気づけない。
  it("一覧の節は、全部並びに入っている", () => {
    for (const id of SECTION_IDS) expect(ordered).toContain(id);
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
      }),
    });
    expect(missingSections([...SECTION_IDS], full)).toEqual([]);
  });
});
