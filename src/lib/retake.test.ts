import { describe, it, expect } from "vitest";
import {
  needsRetake,
  retakeReason,
  retakeMessageKey,
  MIN_REVIEWS,
  MAX_PHOTOS,
  type RetakeInput,
} from "./retake";

/**
 * 「もう一度撮ろう」を出す条件。
 *
 * ここを緩めると、**まだ2回しかやっていない語に「覚えられませんね」と
 * 言う**アプリになる。厳しすぎると、いつまでも出ない。境目を全部書いておく。
 */

function input(over: Partial<RetakeInput> = {}): RetakeInput {
  return { reviewCount: 6, lapses: 0, intervalDays: 20, retention: 90, photoCount: 1, ...over };
}

describe("retakeReason", () => {
  it("よく覚えている語には出さない", () => {
    expect(retakeReason(input())).toBeNull();
  });

  it("何度もつまずいている語は lapsing", () => {
    expect(retakeReason(input({ reviewCount: 5, lapses: 3 }))).toBe("lapsing");
  });

  it("つまずきは少なくても、間隔が伸びず記憶率が低ければ stuck", () => {
    expect(retakeReason(input({ reviewCount: 6, lapses: 1, intervalDays: 1, retention: 30 }))).toBe(
      "stuck",
    );
  });

  it("間隔が伸びていれば、記憶率が低くても出さない(まだ時間が証明していない)", () => {
    expect(
      retakeReason(input({ reviewCount: 6, lapses: 1, intervalDays: 30, retention: 30 })),
    ).toBeNull();
  });

  it("記憶率が高ければ、間隔が短くても出さない(覚えたてはこれ)", () => {
    expect(
      retakeReason(input({ reviewCount: 6, lapses: 1, intervalDays: 1, retention: 95 })),
    ).toBeNull();
  });
});

describe("retakeReason — 早すぎる提案を止める", () => {
  it(`${MIN_REVIEWS}回未満なら、全部間違えていても出さない`, () => {
    for (let n = 0; n < MIN_REVIEWS; n++) {
      expect(
        retakeReason(input({ reviewCount: n, lapses: n, intervalDays: 1, retention: 10 })),
      ).toBeNull();
    }
  });

  it(`ちょうど${MIN_REVIEWS}回で、半分つまずいていれば出る`, () => {
    expect(retakeReason(input({ reviewCount: MIN_REVIEWS, lapses: 2 }))).toBe("lapsing");
  });

  it(`すでに${MAX_PHOTOS}枚撮っている語には勧めない`, () => {
    const bad = { reviewCount: 10, lapses: 8, intervalDays: 1, retention: 10 };
    expect(retakeReason(input({ ...bad, photoCount: MAX_PHOTOS - 1 }))).toBe("lapsing");
    expect(retakeReason(input({ ...bad, photoCount: MAX_PHOTOS }))).toBeNull();
    expect(retakeReason(input({ ...bad, photoCount: MAX_PHOTOS + 5 }))).toBeNull();
  });

  it("枚数が分からなければ1枚として扱う(勧める側に倒す)", () => {
    const { photoCount: _drop, ...noCount } = input({ reviewCount: 8, lapses: 5 });
    expect(retakeReason(noCount)).toBe("lapsing");
  });

  it("回数が数字でなければ出さない", () => {
    expect(retakeReason(input({ reviewCount: Number.NaN, lapses: 9 }))).toBeNull();
  });
});

describe("needsRetake / retakeMessageKey", () => {
  it("needsRetake は理由の有無をそのまま返す", () => {
    expect(needsRetake(input({ reviewCount: 5, lapses: 3 }))).toBe(true);
    expect(needsRetake(input())).toBe(false);
  });

  it("理由ごとに違う文面を指す", () => {
    expect(retakeMessageKey("lapsing")).toBe("retake.lapsing");
    expect(retakeMessageKey("stuck")).toBe("retake.stuck");
    expect(retakeMessageKey("lapsing")).not.toBe(retakeMessageKey("stuck"));
  });
});
