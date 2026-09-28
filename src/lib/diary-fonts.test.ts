import { describe, expect, it } from "vitest";
import { DIARY_FONTS, diaryFont, wrapDiaryLines } from "./diary-fonts";

/** 2026-09-28「日記はユーザーがタイプしたものが、本物の手書きのような字体…選べて、表示される」。 */
describe("日記の字体", () => {
  it("手書き3つ＋楷書＋端末の字の5つ。知らない名前は既定（手書き）", () => {
    expect(DIARY_FONTS.map((f) => f.id)).toEqual(["hand", "pencil", "casual", "brush", "plain"]);
    expect(diaryFont("nope").id).toBe("hand");
    expect(diaryFont(null).id).toBe("hand");
    expect(diaryFont("brush").family).toMatch(/LXGW WenKai TC/);
  });

  // 1字 = 幅10 として測る。
  const m = (s: string) => [...s].length * 10;

  it("和文は字で折る・改行と空行は守る", () => {
    expect(wrapDiaryLines("今日は夜市に行った", 50, m)).toEqual(["今日は夜市", "に行った"]);
    expect(wrapDiaryLines("一行目\n\n三行目", 100, m)).toEqual(["一行目", "", "三行目"]);
  });

  it("句読点を行頭に置かない（前の行にぶら下げる）", () => {
    expect(wrapDiaryLines("あいうえお。かき", 50, m)).toEqual(["あいうえお。", "かき"]);
  });

  it("欧文は語の途中で折らない。行より長い1語だけは字で折る", () => {
    expect(wrapDiaryLines("hello world", 70, m)).toEqual(["hello", "world"]);
    expect(wrapDiaryLines("abcdefghij", 40, m)).toEqual(["abcd", "efgh", "ij"]);
  });
});
