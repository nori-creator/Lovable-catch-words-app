import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOT_GENERATED_SECTIONS,
  RETIRED_SECTIONS,
  missingSections,
  sectionNeedsFill,
  sectionsFor,
} from "./card-sections";
import { OPTIONAL_EXTRA_KEYS, stripNotGenerated } from "./card-request";
import { emptyExtras } from "./extras";

const src = (p: string) => fs.readFileSync(path.join(__dirname, p), "utf8");

describe("発音のコツ・覚え方・語源と部首はサーバで作らない（オーナー決定 2026-10-15）", () => {
  const input = { headword: "雨傘", language: "zh-TW", extras: emptyExtras() };

  it("空でも埋めに行かない（自動の作り直しの引き金にしない）", () => {
    expect([...NOT_GENERATED_SECTIONS]).toEqual(["pronunciation_tips", "mnemonic", "etymology"]);
    expect(sectionNeedsFill("pronunciation_tips", input)).toBe(false);
    expect(sectionNeedsFill("mnemonic", input)).toBe(false);
    expect(sectionNeedsFill("etymology", input)).toBe(false);
    expect(
      missingSections(
        ["example", "pronunciation_tips", "mnemonic", "etymology", "usage_chunks"],
        input,
      ),
    ).toEqual(["example", "usage_chunks"]);
  });

  it("Web には出さない（どの言語のカードの節にも並ばない。保存済みの中身は消さない）", () => {
    for (const id of NOT_GENERATED_SECTIONS) expect(RETIRED_SECTIONS).toContain(id);
    for (const lang of ["zh-TW", "en", "ja"]) expect(sectionsFor(lang)).not.toContain("etymology");
    const kept = {
      pronunciation_tips: "昔の発音のコツ",
      mnemonic: "昔の覚え方",
      etymology: "昔の語源",
      etymology_relatives: [{ word: "雨衣", note: "" }],
      radicals: "雨部",
      etymology_diagram: { kind: "compound" },
      usage_context: "x",
    };
    expect(stripNotGenerated(kept)).toEqual({ usage_context: "x" });
    // 語源の節の欄は4つ（全部落とす）。
    expect(OPTIONAL_EXTRA_KEYS.etymology).toEqual([
      "etymology",
      "etymology_relatives",
      "radicals",
      "etymology_diagram",
    ]);
  });

  it("カードの指示に入れない・作り直しは AI を呼ばずに空で返す", () => {
    const ai = src("ai.functions.ts");
    expect(ai).not.toMatch(/- pronunciation_tips:/);
    expect(ai).not.toMatch(/- mnemonic: \$\{mnemonicRule/);
    expect(ai).not.toMatch(/l1Rule\(context\.userId, "pronunciation"\)/);
    // 語源・部首（文・仲間の語・部首・図）は、カードの指示にも JSON の鍵の一覧にも作り直しの指示にも無い。
    expect(ai).not.toMatch(/- etymology:/);
    expect(ai).not.toMatch(/- radicals:/);
    expect(ai).not.toMatch(/etymology_diagram\{kind/);
    expect(ai).not.toMatch(/etymologyDiagramRule\(/);
    expect(ai).not.toMatch(/normalizeEtymologyDiagram\(/);
    // 節の一覧が無い呼び出し（古い iOS）でも頼まない。
    expect(ai).toMatch(
      /const want = \(id: SectionId\) => !isNotGeneratedSection\(id\) && wantsSection\(data\.sections, id\)/,
    );
    // 作り直しの口（regenerateCardSection・runSectionRegen）は同意・回数・AI の前に空で返す。
    expect(
      ai.match(
        /if \(isNotGeneratedSection\(data\.section\)\) \{\s*return \{ ok: true, section: data\.section, filled: false \};/g,
      )?.length,
    ).toBe(2);
    const first = src("first-catch-ai.server.ts");
    expect(first).not.toMatch(/pronunciation_tips/);
    expect(first).not.toMatch(/etymology/);
  });
});
