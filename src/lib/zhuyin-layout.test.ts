import { describe, expect, it } from "vitest";
import { pairZhuyin, splitSyllable } from "./zhuyin-layout";

describe("splitSyllable", () => {
  it("声調の印を記号から分ける", () => {
    expect(splitSyllable("ㄋㄞˇ")).toEqual({ body: "ㄋㄞ", tone: "ˇ", neutral: false });
    expect(splitSyllable("ㄓㄣ")).toEqual({ body: "ㄓㄣ", tone: "", neutral: false });
  });

  it("軽声は前後どちらに付いていても拾う", () => {
    expect(splitSyllable("ㄗ˙")).toEqual({ body: "ㄗ", tone: "", neutral: true });
    expect(splitSyllable("˙ㄗ")).toEqual({ body: "ㄗ", tone: "", neutral: true });
  });
});

describe("pairZhuyin", () => {
  it("1字に1音節ずつ当てる", () => {
    const got = pairZhuyin("珍珠奶茶", "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ");
    expect(got?.map((u) => u.char)).toEqual(["珍", "珠", "奶", "茶"]);
    expect(got?.[2].zhuyin).toEqual({ body: "ㄋㄞ", tone: "ˇ", neutral: false });
  });

  it("字でない物（数字・英字）には当てない", () => {
    const got = pairZhuyin("T恤", "ㄒㄩˋ");
    expect(got?.[0]).toEqual({ char: "T", zhuyin: null });
    expect(got?.[1].zhuyin?.body).toBe("ㄒㄩ");
  });

  it("**数が合わなければ組まない**（ずれた読みを字に当てない）", () => {
    expect(pairZhuyin("珍珠奶茶", "ㄓㄣ ㄓㄨ ㄋㄞˇ")).toBeNull();
    expect(pairZhuyin("柚子", "")).toBeNull();
    expect(pairZhuyin("", "ㄧㄡˋ")).toBeNull();
  });

  it("ピンインが来たら組まない", () => {
    expect(pairZhuyin("柚子", "yòu zi")).toBeNull();
  });

  it("英語の語は組まない", () => {
    expect(pairZhuyin("ceiling", "ㄙㄧ")).toBeNull();
  });
});
