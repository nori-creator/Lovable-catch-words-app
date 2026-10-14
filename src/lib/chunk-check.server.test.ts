import { describe, expect, it } from "vitest";
import { checkUsageChunks, chunkCheckPrompt, keepHeadwordChunks } from "./chunk-check.server";

const base = {
  headword: "紙箱",
  languageName: "台湾華語",
  readerName: "日本語",
  levelGoal: "TOCFL-2",
  posRule: "",
  grammarRule: "",
};
const bad = {
  parts: [
    { text: "紙箱", pos: "N" },
    { text: "裝", pos: "V" },
    { text: "東西", pos: "N" },
  ],
  ja: "段ボール箱に物を詰める",
};
const good = {
  parts: [
    { text: "用", pos: "Prep" },
    { text: "紙箱", pos: "N" },
    { text: "裝", pos: "V" },
    { text: "東西", pos: "N", slot: true },
  ],
  ja: "段ボール箱に物を詰める",
};

describe("checkUsageChunks（チャンクの点検）", () => {
  it("点検の返事を使い、学ぶ語の無い型・学ぶ語を入れ替えにした型は外す", async () => {
    const out = await checkUsageChunks({ ...base, chunks: [bad] }, async () => ({
      usage_chunks: [
        good,
        {
          parts: [
            { text: "很", pos: "Adv" },
            { text: "大", pos: "Vs" },
          ],
          ja: "大きい",
        },
        { parts: [{ text: "紙箱", pos: "N", slot: true }], ja: "x" },
      ],
    }));
    expect(out).toEqual([good]);
  });

  it("失敗・形の崩れた返事では作った物をそのまま返す", async () => {
    expect(
      await checkUsageChunks({ ...base, chunks: [bad] }, async () => {
        throw new Error("402");
      }),
    ).toEqual([bad]);
    expect(await checkUsageChunks({ ...base, chunks: [bad] }, async () => ({ nope: 1 }))).toEqual([
      bad,
    ]);
  });

  it("指示に語順・パーツ・文・量詞・訳の点検と、点検する型が入る", () => {
    const p = chunkCheckPrompt({ ...base, chunks: [bad] });
    for (const k of ["語順", "熱水馬克杯", "主語", "量詞", "新しいチャンクは足さない", "紙箱"])
      expect(p).toContain(k);
  });

  it("keepHeadwordChunks", () => {
    expect(keepHeadwordChunks("紙箱", [good, bad])).toHaveLength(2);
    expect(keepHeadwordChunks("紙箱", [{ parts: [], ja: "" }])).toHaveLength(0);
  });
});
