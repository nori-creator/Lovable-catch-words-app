import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOT_GENERATED_SECTIONS,
  RETIRED_SECTIONS,
  missingSections,
  sectionNeedsFill,
} from "./card-sections";
import { stripNotGenerated } from "./card-request";
import { emptyExtras } from "./extras";

const src = (p: string) => fs.readFileSync(path.join(__dirname, p), "utf8");

describe("発音のコツ・覚え方はサーバで作らない（オーナー決定 2026-10-15）", () => {
  const input = { headword: "雨傘", language: "zh-TW", extras: emptyExtras() };

  it("空でも埋めに行かない（自動の作り直しの引き金にしない）", () => {
    expect([...NOT_GENERATED_SECTIONS]).toEqual(["pronunciation_tips", "mnemonic"]);
    expect(sectionNeedsFill("pronunciation_tips", input)).toBe(false);
    expect(sectionNeedsFill("mnemonic", input)).toBe(false);
    expect(
      missingSections(["example", "pronunciation_tips", "mnemonic", "usage_chunks"], input),
    ).toEqual(["example", "usage_chunks"]);
  });

  it("Web には出さない（保存済みの中身は消さない）", () => {
    for (const id of NOT_GENERATED_SECTIONS) expect(RETIRED_SECTIONS).toContain(id);
    const kept = {
      pronunciation_tips: "昔の発音のコツ",
      mnemonic: "昔の覚え方",
      usage_context: "x",
    };
    expect(stripNotGenerated(kept)).toEqual({ usage_context: "x" });
  });

  it("カードの指示に入れない・作り直しは AI を呼ばずに空で返す", () => {
    const ai = src("ai.functions.ts");
    expect(ai).not.toMatch(/- pronunciation_tips:/);
    expect(ai).not.toMatch(/- mnemonic: \$\{mnemonicRule/);
    expect(ai).not.toMatch(/l1Rule\(context\.userId, "pronunciation"\)/);
    expect(ai).toMatch(
      /if \(isNotGeneratedSection\(data\.section\)\) \{\s*return \{ ok: true, section: data\.section, filled: false \};/,
    );
    expect(src("first-catch-ai.server.ts")).not.toMatch(/pronunciation_tips/);
  });
});
