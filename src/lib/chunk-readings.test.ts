import { describe, expect, it } from "vitest";
import {
  chunkReadingsComplete,
  withChunkReadings,
  withChunkReadingsInExtras,
  withPartReadings,
} from "./chunk-readings.server";
import type { UsageChunk } from "./extras";

/**
 * チャンクの札ごとの読み（2026-10-15 オーナー「チャンクに拼音と注音を」）。AI が書いた読みを字ごとに検め、
 * 無い・外れている時は辞書の読み（台湾の読み）にする。
 */
describe("withPartReadings", () => {
  it("読みの無い漢字の札に、拼音と注音（音節ごとに空白、軽声は前に ˙）を付ける", () => {
    const p = withPartReadings({ text: "刷子", pos: "N" }, "zh-TW");
    expect(p.pinyin).toBe("shuā zi");
    expect(p.zhuyin).toBe("ㄕㄨㄚ ˙ㄗ");
    const u = withPartReadings({ text: "用", pos: "Prep" }, "zh-TW");
    expect(u.pinyin).toBe("yòng");
    expect(u.zhuyin).toBe("ㄩㄥˋ");
  });

  it("AI の読みが合っていればそのまま、音節の数が合わなければ辞書の読みに直す", () => {
    expect(
      withPartReadings({ text: "刷", pos: "V", pinyin: "shuā", zhuyin: "ㄕㄨㄚ" }, "zh-TW").pinyin,
    ).toBe("shuā");
    expect(
      withPartReadings({ text: "鞋子", pos: "N", pinyin: "xié", zhuyin: "" }, "zh-TW").pinyin,
    ).toMatch(/^xié z/);
  });

  it("台湾の読み（垃圾 lè sè）", () => {
    expect(withPartReadings({ text: "垃圾", pos: "N" }, "zh-TW").pinyin).toBe("lè sè");
  });

  it("入れ替えの候補にも付ける。漢字でない札・ほかの言語は触らない", () => {
    const p = withPartReadings(
      { text: "鞋子", pos: "N", slot: true, alts: [{ text: "地板", ja: "floor" }] },
      "zh-TW",
    );
    expect(p.alts?.[0].pinyin).toBe("dì bǎn");
    expect(withPartReadings({ text: "T", pos: "N" }, "zh-TW")).toEqual({ text: "T", pos: "N" });
    expect(withPartReadings({ text: "socks", pos: "n" }, "en")).toEqual({
      text: "socks",
      pos: "n",
    });
  });
});

describe("型・extras", () => {
  it("型の漢字の札が全部読みを持つ（札の数と読みの数が合う）", () => {
    const [c] = withChunkReadings<UsageChunk>(
      [
        {
          parts: [
            { text: "用", pos: "Prep" },
            { text: "刷子", pos: "N" },
            { text: "刷", pos: "V" },
            { text: "鞋子", pos: "N" },
          ],
          ja: "",
        },
      ],
      "zh-TW",
    );
    expect(chunkReadingsComplete(c, "zh-TW")).toBe(true);
    expect(c.parts.map((p) => p.pinyin?.split(" ").length)).toEqual([1, 2, 1, 2]);
    expect(c.parts.slice(0, 3).map((p) => p.pinyin)).toEqual(["yòng", "shuā zi", "shuā"]);
  });

  it("古いカード（読み無し）も読む所で付く。無い欄は足さない", () => {
    const ex = withChunkReadingsInExtras(
      {
        usage_chunks: [
          {
            parts: [
              { text: "敷", pos: "V" },
              { text: "面膜", pos: "N" },
            ],
            ja: "",
          },
        ],
      } as never,
      "zh-TW",
    ) as { usage_chunks: Array<{ parts: Array<{ zhuyin?: string }> }> };
    expect(ex.usage_chunks[0].parts.every((p) => !!p.zhuyin)).toBe(true);
    expect(ex).not.toHaveProperty("example_chunks");
  });
});
