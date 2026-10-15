import { describe, expect, it } from "vitest";
import {
  NAME_REGISTERS,
  NAME_REGISTER_LABELS,
  finalizeNameRegisters,
  normalizeNameRegister,
} from "./candidate-register";
import { WordCandidatesSchema } from "./text-search-flow";
import { normalizeDetection } from "./scan-detect-parse";
import { FirstCatchSuggestionsSchema } from "./first-catch-ai-schema";

describe("候補の印は5つ（オーナー指示 2026-10-15）", () => {
  it("名前と札の言葉がオーナーの呼び名", () => {
    expect([...NAME_REGISTERS]).toEqual(["common", "colloquial", "specific", "academic", "proper"]);
    expect(NAME_REGISTER_LABELS.common.ja).toBe("一般的な言い方");
    expect(NAME_REGISTER_LABELS.colloquial.ja).toBe("口語");
    expect(NAME_REGISTER_LABELS.specific.ja).toBe("より詳しい言い方");
    expect(NAME_REGISTER_LABELS.academic.ja).toBe("学術的な言い方");
    expect(NAME_REGISTER_LABELS.proper.ja).toBe("固有名詞");
  });

  it("古い印・言い換えを5つに直す（読めない物は null）", () => {
    expect(normalizeNameRegister("casual")).toBe("colloquial");
    expect(normalizeNameRegister("spoken")).toBe("colloquial");
    expect(normalizeNameRegister("technical")).toBe("academic");
    expect(normalizeNameRegister("Brand")).toBe("proper");
    expect(normalizeNameRegister("both")).toBe("common");
    expect(normalizeNameRegister("specific")).toBe("specific");
    expect(normalizeNameRegister("???")).toBeNull();
    expect(normalizeNameRegister(undefined)).toBeNull();
  });
});

describe("finalizeNameRegisters", () => {
  it("ボクサーパンツ: 印が無くても全部に付き、一般的な言い方が1つ目", () => {
    const out = finalizeNameRegisters([
      { headword: "平口褲", register: "specific" },
      { headword: "四角褲", register: undefined },
      { headword: "內褲", register: "common" },
    ]);
    expect(out.map((c) => [c.headword, c.register])).toEqual([
      ["內褲", "common"],
      ["平口褲", "specific"],
      ["四角褲", "specific"],
    ]);
  });

  it("物ごと（group）に並べ、物の並びは AI の順のまま", () => {
    const out = finalizeNameRegisters([
      { headword: "文旦", register: "specific", group: 0 },
      { headword: "柚子", register: "common", group: 0 },
      { headword: "女王頭", register: "proper", group: 1 },
      { headword: "柚仔", register: "casual", group: 0 },
      { headword: "雕像", register: "common", group: 1 },
    ]);
    expect(out.map((c) => `${c.group}:${c.headword}:${c.register}`)).toEqual([
      "0:柚子:common",
      "0:柚仔:colloquial",
      "0:文旦:specific",
      "1:雕像:common",
      "1:女王頭:proper",
    ]);
  });

  it("一般的な言い方が無い物は、固有名詞でない最初の候補を1つ目の一般的な言い方にする", () => {
    const out = finalizeNameRegisters([
      { headword: "可口可樂", register: "proper" },
      { headword: "碳酸飲料", register: "academic" },
    ]);
    expect(out[0]).toMatchObject({ headword: "碳酸飲料", register: "common" });
    // 全部が固有名詞ならそのまま
    expect(finalizeNameRegisters([{ headword: "7-11", register: "proper" }])[0].register).toBe(
      "proper",
    );
  });
});

describe("どの道の候補にも印が付く", () => {
  it("打った語の候補: 新しい印と文体を両方受ける（古い返事は文体を register に入れていた）", () => {
    const raw = WordCandidatesSchema.parse({
      candidates: [{ headword: "內褲", register: "common", style: "spoken" }],
    });
    expect(raw.candidates[0]).toMatchObject({ register: "common", style: "spoken" });
  });

  it("スキャンとチュートリアルの候補は、無ければ一般的な言い方", () => {
    const scan = normalizeDetection({ items: [{ headword: "雨傘", point: [500, 500] }] });
    expect(scan?.[0].register).toBe("common");
    const tut = FirstCatchSuggestionsSchema.parse({
      suggestions: [
        { headword: "雨傘", category_key: "other" },
        { headword: "傘", category_key: "other", register: "casual" },
      ],
    });
    expect(tut.suggestions.map((s) => s.register)).toEqual(["common", "colloquial"]);
  });
});
