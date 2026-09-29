import { describe, expect, it } from "vitest";
import { neutralizeMeasureGe, neutralizeMeasureGePinyin } from "./tw-neutral-tone";
import { pairZhuyin } from "./zhuyin-layout";

describe("R25: 量詞の「個」は輕聲（オーナー指示 2026-09-30）", () => {
  it("数・指示の字の後ろの「個」は ˙ㄍㄜ", () => {
    expect(neutralizeMeasureGe("一個", "ㄧˊ ㄍㄜˋ")).toBe("ㄧˊ ˙ㄍㄜ");
    expect(neutralizeMeasureGe("這個", "ㄓㄜˋ ㄍㄜˋ")).toBe("ㄓㄜˋ ˙ㄍㄜ");
    expect(neutralizeMeasureGe("幾個人", "ㄐㄧˇ ㄍㄜˋ ㄖㄣˊ")).toBe("ㄐㄧˇ ˙ㄍㄜ ㄖㄣˊ");
    expect(neutralizeMeasureGe("2個", "ㄍㄜˋ")).toBe("˙ㄍㄜ");
  });
  it("量詞の欄に出た「個」そのものも ˙ㄍㄜ", () => {
    expect(neutralizeMeasureGe("個", "ㄍㄜˋ", { measureWord: true })).toBe("˙ㄍㄜ");
    expect(neutralizeMeasureGePinyin("個", "gè", { measureWord: true })).toBe("ge");
  });
  it("量詞でない「個」（個人・個性）と、組めない読みは触らない", () => {
    expect(neutralizeMeasureGe("個人", "ㄍㄜˋ ㄖㄣˊ")).toBe("ㄍㄜˋ ㄖㄣˊ");
    expect(neutralizeMeasureGe("個", "ㄍㄜˋ")).toBe("ㄍㄜˋ");
    expect(neutralizeMeasureGe("一個", "ㄧˊㄍㄜˋ")).toBe("ㄧˊㄍㄜˋ");
    expect(neutralizeMeasureGe("各個", "ㄍㄜˋ ㄍㄜˋ")).toBe("ㄍㄜˋ ㄍㄜˋ");
  });
  it("字の右に縦に組む注音も輕聲（印は列の上）", () => {
    const units = pairZhuyin("這個", "ㄓㄜˋ ㄍㄜˋ")!;
    expect(units[1].zhuyin).toEqual({ body: "ㄍㄜ", tone: "", neutral: true });
  });
});
