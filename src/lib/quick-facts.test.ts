import { describe, expect, it } from "vitest";
import { usableQuickFacts } from "./extras";

describe("usableQuickFacts", () => {
  it("揃った行はそのまま通す", () => {
    expect(usableQuickFacts([{ label: "使う場面", value: "店で注文するとき" }])).toEqual([
      { label: "使う場面", value: "店で注文するとき" },
    ]);
  });

  it.each([
    [{ label: "使う場面", value: "" }],
    [{ label: "", value: "店で" }],
    [{ label: "  ", value: "  " }],
    [{}],
  ])("片側だけの行は落とす(%o)", (row) => {
    expect(usableQuickFacts([row])).toEqual([]);
  });

  it("前後の空白は落とす", () => {
    expect(usableQuickFacts([{ label: " 丁寧さ ", value: " ふつう " }])).toEqual([
      { label: "丁寧さ", value: "ふつう" },
    ]);
  });

  it("同じ見出しは1行だけ残す(どちらが正か読み手に決めさせない)", () => {
    const got = usableQuickFacts([
      { label: "丁寧さ", value: "ふつう" },
      { label: "丁寧さ", value: "かたい" },
    ]);
    expect(got).toEqual([{ label: "丁寧さ", value: "ふつう" }]);
  });

  it("長すぎる中身は表に入れない(それは地の文の仕事)", () => {
    expect(usableQuickFacts([{ label: "注意", value: "あ".repeat(41) }])).toEqual([]);
    expect(usableQuickFacts([{ label: "注意", value: "あ".repeat(40) }])).toHaveLength(1);
  });

  it("6行までで切る(表が画面を埋めない)", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `見出し${i}`, value: "中身" }));
    expect(usableQuickFacts(many)).toHaveLength(6);
  });

  it.each([null, undefined, []])("中身が無ければ空(%s)", (v) => {
    expect(usableQuickFacts(v)).toEqual([]);
  });
});
