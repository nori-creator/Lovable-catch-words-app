import { describe, it, expect } from "vitest";
import {
  bandOf,
  levelsInBand,
  bandLabelKey,
  TOCFL_BANDS,
  parseTocflStep,
  stepHeight,
  stepColorVar,
  stepLabelKey,
  TOCFL_LEVELS,
  TOCFL_OUT,
} from "./tocfl";

describe("parseTocflStep", () => {
  it("いろいろな書き方から級を取り出す", () => {
    expect(parseTocflStep("TOCFL-2")).toBe(2);
    expect(parseTocflStep("tocfl 5")).toBe(5);
    expect(parseTocflStep("3")).toBe(3);
    expect(parseTocflStep(4)).toBe(4);
    expect(parseTocflStep("Level 1")).toBe(1);
    expect(parseTocflStep("第6級")).toBe(6);
  });

  it("1〜6 の外は級外", () => {
    expect(parseTocflStep("TOCFL-0")).toBe(TOCFL_OUT);
    expect(parseTocflStep("TOCFL-7")).toBe(TOCFL_OUT);
    expect(parseTocflStep("99")).toBe(TOCFL_OUT);
  });

  it("**「級外」と「分からない」を混ぜない**", () => {
    // 数字が1つも無いものは「分からない」。級外ではない。
    expect(parseTocflStep(null)).toBeNull();
    expect(parseTocflStep(undefined)).toBeNull();
    expect(parseTocflStep("")).toBeNull();
    expect(parseTocflStep("級外")).toBeNull();
    expect(parseTocflStep("unknown")).toBeNull();
  });

  it("壊れた数字で落ちない", () => {
    expect(parseTocflStep(Number.NaN)).toBeNull();
    expect(parseTocflStep("TOCFL-")).toBeNull();
  });
});

describe("stepHeight", () => {
  it("級が上がるほど高くなる", () => {
    const hs = TOCFL_LEVELS.map(stepHeight);
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThan(hs[i - 1]);
  });

  it("いちばん低い段も見える高さを持つ(0 にしない)", () => {
    expect(stepHeight(1)).toBeGreaterThan(0.2);
  });

  it("いちばん高い段が 1", () => {
    expect(stepHeight(6)).toBeCloseTo(1, 6);
  });
});

describe("stepColorVar / stepLabelKey", () => {
  it("色は CSS のトークンで返す(素の16進を書かない)", () => {
    // 2026-08-24: トークン名を `--tocfl-*` から `--level-*` に変えた。
    // **体系で色を分けない** — TOCFL の3級と CEFR の B1 はどちらも
    // 「6段の3段目」なので、同じ濃さで出るのが正しい。
    for (const l of TOCFL_LEVELS) expect(stepColorVar(l)).toBe(`var(--level-${l})`);
    expect(stepColorVar(TOCFL_OUT)).toBe("var(--level-out)");
  });

  it("級外だけ別の文面を指す", () => {
    expect(stepLabelKey(3)).toBe("tocfl.level");
    expect(stepLabelKey(TOCFL_OUT)).toBe("tocfl.out");
    expect(stepLabelKey(3)).not.toBe(stepLabelKey(TOCFL_OUT));
  });
});

describe("TOCFL の帯", () => {
  it("2級ずつ3つの帯に分かれる", () => {
    expect(bandOf(1)).toBe("A");
    expect(bandOf(2)).toBe("A");
    expect(bandOf(3)).toBe("B");
    expect(bandOf(4)).toBe("B");
    expect(bandOf(5)).toBe("C");
    expect(bandOf(6)).toBe("C");
  });

  it("**どの級もどれか1つの帯に入る**(抜けも重なりも無い)", () => {
    const all = TOCFL_BANDS.flatMap(levelsInBand);
    expect([...all].sort()).toEqual([...TOCFL_LEVELS]);
    expect(new Set(all).size).toBe(TOCFL_LEVELS.length);
  });

  it("帯ごとに2級ずつ、小さい順", () => {
    expect(levelsInBand("A")).toEqual([1, 2]);
    expect(levelsInBand("B")).toEqual([3, 4]);
    expect(levelsInBand("C")).toEqual([5, 6]);
  });

  it("帯ごとに違う文言を指す", () => {
    const keys = TOCFL_BANDS.map(bandLabelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
