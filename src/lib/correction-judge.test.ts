import { describe, expect, it } from "vitest";
import { ACCEPT_THRESHOLD, shouldApplyCorrection, verdictFromLlm } from "./correction-judge";

describe("報告からの直しを、共有の語に書いてよいか", () => {
  it("**確かめられなかったら書かない**（鍵が無い・落ちた）", () => {
    expect(shouldApplyCorrection({ by: "none", pAfter: 0.99 })).toBe(false);
    expect(shouldApplyCorrection({ by: "jev", pAfter: null })).toBe(false);
  });

  it("**五分五分では書かない**（間違えたとき壊れるのは全員のカード）", () => {
    expect(ACCEPT_THRESHOLD).toBeGreaterThan(0.5);
    expect(shouldApplyCorrection({ by: "jev", pAfter: 0.55 })).toBe(false);
    expect(shouldApplyCorrection({ by: "jev", pAfter: ACCEPT_THRESHOLD })).toBe(true);
    expect(shouldApplyCorrection({ by: "llm", pAfter: 0.9 })).toBe(true);
  });

  it("壊れた確率では書かない", () => {
    expect(shouldApplyCorrection({ by: "jev", pAfter: Number.NaN })).toBe(false);
  });
});

describe("別のAIの答えを確率に直す", () => {
  it("「新しい方」と言ったときだけ、その確信度を使う", () => {
    expect(verdictFromLlm({ verdict: "after", confidence: 0.8 })).toEqual({
      by: "llm",
      pAfter: 0.8,
    });
  });
  it("「元の方」「分からない」は書かない", () => {
    expect(verdictFromLlm({ verdict: "before", confidence: 0.9 })).toEqual({
      by: "llm",
      pAfter: 0,
    });
    expect(verdictFromLlm({ verdict: "unsure", confidence: 0.9 })).toEqual({
      by: "llm",
      pAfter: 0,
    });
  });
  it("形が違えば確かめられなかった扱い", () => {
    expect(verdictFromLlm(null).by).toBe("none");
    expect(verdictFromLlm({ verdict: "after" }).by).toBe("none");
    expect(verdictFromLlm({ verdict: "after", confidence: 3 }).by).toBe("none");
    expect(verdictFromLlm({ verdict: "yes", confidence: 0.9 }).by).toBe("none");
  });
});

import { dictionaryFixPatch } from "./correction-judge";

describe("発音・品詞は、辞書と照らして直す", () => {
  const word = {
    source: "ai",
    reading_zhuyin: "ㄐㄧㄝˊ ㄩㄣˋ",
    pinyin: "jié yùn",
    part_of_speech: "名詞",
  };
  const dict = { source: "moe", reading: "ㄐㄧㄝˊ ㄩㄣˋ", readingAlt: "jiéyùn", pos: "名詞" };

  it("確かめられた辞書と違う所だけを直す", () => {
    expect(dictionaryFixPatch("pronunciation", word, dict)).toEqual({ pinyin: "jiéyùn" });
  });

  it("同じなら直さない（報告として残る）", () => {
    expect(dictionaryFixPatch("pos", word, dict)).toBeNull();
  });

  it("**AIが作った辞書の行では直さない**", () => {
    expect(dictionaryFixPatch("pronunciation", word, { ...dict, source: "ai" })).toBeNull();
    expect(dictionaryFixPatch("pronunciation", word, { ...dict, source: null })).toBeNull();
  });

  it("**確認済みの語は、報告1つでは書き換えない**", () => {
    expect(dictionaryFixPatch("pronunciation", { ...word, source: "verified" }, dict)).toBeNull();
  });

  it("辞書に無ければ直さない", () => {
    expect(dictionaryFixPatch("pronunciation", word, null)).toBeNull();
  });
});
