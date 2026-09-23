import { describe, expect, it } from "vitest";
import { homeBlankMessage, streakEndingYesterday } from "./home-blank";

describe("白紙の日の一言（オーナー指示 2026-09-23）", () => {
  it("まだ1枚も無い人には「目の前にあるもの何て言う？」", () => {
    expect(homeBlankMessage({ total: 0, streakDays: 0, dayIndex: 3 })).toEqual({
      key: "home.blankWhatIsThat",
    });
  });
  it("昨日まで2日以上続いていれば連続日数", () => {
    expect(homeBlankMessage({ total: 12, streakDays: 3, dayIndex: 0 })).toEqual({
      key: "home.blankStreak",
      n: 3,
    });
  });
  it("次が区切りの枚数なら「N枚目」", () => {
    expect(homeBlankMessage({ total: 19, streakDays: 1, dayIndex: 0 })).toEqual({
      key: "home.blankNth",
      n: 20,
    });
    expect(homeBlankMessage({ total: 4, streakDays: 0, dayIndex: 0 })).toEqual({
      key: "home.blankNth",
      n: 5,
    });
  });
  it("それ以外は日替わり", () => {
    expect(homeBlankMessage({ total: 7, streakDays: 1, dayIndex: 2 }).key).toBe(
      "home.blankLearnOne",
    );
    expect(homeBlankMessage({ total: 7, streakDays: 1, dayIndex: 3 }).key).toBe(
      "home.blankWhatIsThat",
    );
  });
});

describe("昨日から続いている日数", () => {
  const today = new Date(2026, 8, 23, 10);
  it("昨日・一昨日と続けば 2、途切れた所で止まる", () => {
    expect(streakEndingYesterday(new Set(["2026-09-22", "2026-09-21", "2026-09-19"]), today)).toBe(
      2,
    );
  });
  it("昨日が無ければ 0。月をまたいでも数える", () => {
    expect(streakEndingYesterday(new Set(["2026-09-21"]), today)).toBe(0);
    expect(streakEndingYesterday(new Set(["2026-10-01", "2026-09-30"]), new Date(2026, 9, 2))).toBe(
      2,
    );
  });
});
