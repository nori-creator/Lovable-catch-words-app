import { describe, expect, it } from "vitest";
import { meaningRule, distinctionRule, NO_PADDING } from "./meaning-rule";

describe("meaningRule — 1対1なら訳語だけ", () => {
  it("「1対1なら1語だけ」と言い切る", () => {
    const r = meaningRule("英語", "繁體中文");
    expect(r).toContain("1対1で対応する語");
    expect(r).toContain("その語だけ");
  });

  it("説明してよい2つの場合を明示する", () => {
    const r = meaningRule("英語", "日本語");
    expect(r).toContain("意味が分かれてしまう");
    expect(r).toContain("対応する語が無い");
  });

  it("解説の言語名を必ず書き込む", () => {
    expect(meaningRule("英語", "繁體中文")).toContain("繁體中文");
    expect(meaningRule("台湾華語", "日本語")).toContain("日本語");
  });
});

describe("distinctionRule — 区別が要るときだけ", () => {
  it("学習言語の名前と例を差し込む", () => {
    const r = distinctionRule("英語", "shrimp / prawn");
    expect(r).toContain("英語");
    expect(r).toContain("shrimp / prawn");
  });

  it("迷いようがない語は空文字にさせる", () => {
    expect(distinctionRule("英語", "x")).toContain("空文字");
  });
});

describe("言い換え禁止は**両方**に入る", () => {
  it("同じ一節を共有している(片方だけ古くならない)", () => {
    // 同じ原則を2箇所の散文に書くと、必ず片方だけ古くなる。
    expect(meaningRule("英語", "日本語")).toContain(NO_PADDING);
    expect(distinctionRule("英語", "x")).toContain(NO_PADDING);
  });

  it("「迷ったら書かない」が抜けていない", () => {
    // ここが抜けると、AI は全部の行を埋めにいく。
    expect(NO_PADDING).toContain("迷ったら書かない");
    expect(NO_PADDING).toContain("無いより悪い");
  });
});

import { shortMeaning } from "./meaning-rule";

describe("shortMeaning（意味は語の長さに）", () => {
  it("説明文で返った意味を最初の区切りまでに縮める（湯咖哩）", () => {
    expect(
      shortMeaning(
        "Soup curry, a Japanese-style curry dish served in a thin, broth-like sauce often containing large pieces of vegetables",
      ),
    ).toBe("Soup curry");
    expect(shortMeaning("スープカレー。北海道発祥の、さらさらしたスープ状のカレー料理")).toBe(
      "スープカレー",
    );
  });
  it("短い意味・区切りの無い意味は触らない", () => {
    expect(shortMeaning("タピオカミルクティー")).toBe("タピオカミルクティー");
    expect(shortMeaning("umbrella")).toBe("umbrella");
    expect(shortMeaning("")).toBe("");
  });
});
