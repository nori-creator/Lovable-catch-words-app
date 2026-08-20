import { describe, it, expect } from "vitest";
import { splitAroundTerm } from "./mark-term";

describe("splitAroundTerm", () => {
  it("真ん中に在る語を切り出す", () => {
    expect(splitAroundTerm("我喜歡珍珠奶茶。", "珍珠奶茶")).toEqual([
      { text: "我喜歡", hit: false },
      { text: "珍珠奶茶", hit: true },
      { text: "。", hit: false },
    ]);
  });

  it("**先頭・末尾でも空の切れ端を作らない**", () => {
    expect(splitAroundTerm("珍珠奶茶很好喝", "珍珠奶茶")).toEqual([
      { text: "珍珠奶茶", hit: true },
      { text: "很好喝", hit: false },
    ]);
    expect(splitAroundTerm("我要珍珠奶茶", "珍珠奶茶")).toEqual([
      { text: "我要", hit: false },
      { text: "珍珠奶茶", hit: true },
    ]);
  });

  it("何度出てきても全部に印を付ける", () => {
    const spans = splitAroundTerm("茶。喝茶。", "茶");
    expect(spans.filter((s) => s.hit)).toHaveLength(2);
    expect(spans.map((s) => s.text).join("")).toBe("茶。喝茶。");
  });

  it("1文字の語でも印を付ける", () => {
    expect(splitAroundTerm("我要水", "水")).toEqual([
      { text: "我要", hit: false },
      { text: "水", hit: true },
    ]);
  });

  it("語が無ければ丸ごと1つ(印は付かない)", () => {
    expect(splitAroundTerm("我喜歡咖啡。", "珍珠奶茶")).toEqual([
      { text: "我喜歡咖啡。", hit: false },
    ]);
  });

  it("**空の語で止まらない**", () => {
    expect(splitAroundTerm("我喜歡咖啡。", "")).toEqual([{ text: "我喜歡咖啡。", hit: false }]);
    expect(splitAroundTerm("我喜歡咖啡。", "   ")).toEqual([{ text: "我喜歡咖啡。", hit: false }]);
    expect(splitAroundTerm("我喜歡咖啡。", null)).toEqual([{ text: "我喜歡咖啡。", hit: false }]);
  });

  it("文が空なら何も返さない(空の印を描かせない)", () => {
    expect(splitAroundTerm("", "茶")).toEqual([]);
    expect(splitAroundTerm(null, "茶")).toEqual([]);
  });

  it("繋ぎ直すと必ず元の文に戻る", () => {
    const cases: Array<[string, string]> = [
      ["我喜歡珍珠奶茶。", "珍珠奶茶"],
      ["茶。喝茶。", "茶"],
      ["沒有這個詞", "水"],
    ];
    for (const [text, term] of cases) {
      expect(
        splitAroundTerm(text, term)
          .map((s) => s.text)
          .join(""),
      ).toBe(text);
    }
  });
});
