import { describe, expect, it } from "vitest";
import { markSegments, needsRedInk, splitDiary, takeFinishedSentences, toSummary } from "./red-pen";

/** 日記の赤ペン（2026-10-01）。文の切り方を間違えると、書いている途中の文に赤が入る。 */
describe("takeFinishedSentences — 書き終わった文だけを上げる", () => {
  it("中文・和文は「。」を打った時点で1文", () => {
    expect(takeFinishedSentences("今天我去了夜市。我吃")).toEqual({
      done: ["今天我去了夜市。"],
      rest: "我吃",
    });
  });

  it("続けた記号と閉じかっこは同じ文に入れる", () => {
    expect(takeFinishedSentences("好吃！！」我")).toEqual({ done: ["好吃！！」"], rest: "我" });
  });

  it("欧文は次の空白で1文（3.5 や Mr. の途中で切らない）", () => {
    expect(takeFinishedSentences("I paid 3.5 dollars")).toEqual({
      done: [],
      rest: "I paid 3.5 dollars",
    });
    expect(takeFinishedSentences("I went home. It")).toEqual({
      done: ["I went home. "],
      rest: "It",
    });
  });

  it("改行も文の切れ目。つなぎ直すと元の文に戻る", () => {
    const text = "今天下雨\n可是心情很好。明天";
    const { done, rest } = takeFinishedSentences(text);
    expect(done).toEqual(["今天下雨\n", "可是心情很好。"]);
    expect(done.join("") + rest).toBe(text);
  });

  it("書き直しでは書きかけの最後も1文に数える", () => {
    expect(splitDiary("今天我去了夜市。明天還想")).toEqual(["今天我去了夜市。", "明天還想"]);
  });
});

describe("markSegments — 波線を引く所", () => {
  it("学習者の文にある部分だけに引く", () => {
    const segs = markSegments("我吃很多的雞排，很好吃。", [
      { wrong: "吃很多的雞排", right: "吃了很多雞排", why: "" },
      { wrong: "文に無い所", right: "x", why: "" },
    ]);
    expect(segs.map((s) => [s.text, !!s.mark])).toEqual([
      ["我", false],
      ["吃很多的雞排", true],
      ["，很好吃。", false],
    ]);
  });
});

describe("needsRedInk", () => {
  it("直す所が無い文は花丸だけ", () => {
    expect(needsRedInk({ verdict: "good", corrected: "我好。", marks: [], note: "" })).toBe(false);
    expect(needsRedInk({ verdict: "say", corrected: "明天還想再去。", marks: [], note: "" })).toBe(
      true,
    );
  });
});

describe("toSummary — 残したまとめを読む", () => {
  it("模範解答が無い行（赤ペン以前の日記）はまだ無い", () => {
    expect(toSummary({ correction: "x", body_zh: null })).toBeNull();
  });

  it("覚える物は既存の zh/ja/note に種類・読み・例文を足した形から戻す", () => {
    const s = toSummary({
      feedback_ja: "言いたかったこと",
      body_zh: "模範",
      body_ja: "訳",
      correction: "直した",
      native_phrases: [
        {
          zh: "又香又脆",
          ja: "香ばしくてサクサク",
          note: "n",
          kind: "chunk",
          reading: "r",
          example: "e",
        },
        { zh: "古い形", ja: "意味", note: "" },
      ],
    });
    expect(s?.model_answer).toBe("模範");
    expect(s?.learn[0]).toEqual({
      kind: "chunk",
      text: "又香又脆",
      reading: "r",
      meaning: "香ばしくてサクサク",
      note: "n",
      example: "e",
    });
    expect(s?.learn[1].kind).toBe("chunk");
  });
});
