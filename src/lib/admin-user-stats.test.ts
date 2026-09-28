import { describe, expect, it } from "vitest";
import {
  aiCostEstimate,
  dailyCounts,
  median,
  percentileRank,
  retention,
  screenOf,
  sessionMinutes,
  streaks,
} from "./admin-user-stats";

describe("開発者だけ: 利用者ごとの数字", () => {
  it("続けた日: 今日か昨日で終わっていれば続いている", () => {
    expect(streaks(["2026-09-25", "2026-09-26", "2026-09-27"], "2026-09-28")).toEqual({
      current: 3,
      best: 3,
    });
    expect(streaks(["2026-09-20", "2026-09-21", "2026-09-28"], "2026-09-28")).toEqual({
      current: 1,
      best: 2,
    });
    expect(streaks(["2026-09-20"], "2026-09-28").current).toBe(0);
    expect(streaks([], "2026-09-28")).toEqual({ current: 0, best: 0 });
  });

  it("真ん中の値", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([null, undefined])).toBeNull();
  });

  it("画面の区分", () => {
    expect(screenOf("/review")).toBe("review");
    expect(screenOf("/dex/abc")).toBe("dex");
    expect(screenOf("/admin/users")).toBe("other");
  });

  it("滞在: 始まりと終わりを組にし、3時間を超える組は数えない", () => {
    const s = sessionMinutes([
      { kind: "session_start", created_at: "2026-09-28T09:00:00Z" },
      { kind: "session_end", created_at: "2026-09-28T09:06:00Z" },
      { kind: "session_start", created_at: "2026-09-28T12:00:00Z" },
      { kind: "session_end", created_at: "2026-09-28T12:10:00Z" },
      { kind: "session_start", created_at: "2026-09-28T13:00:00Z" },
      { kind: "session_end", created_at: "2026-09-28T18:00:00Z" },
    ]);
    expect(s.sessions).toBe(2);
    expect(s.medianMin).toBe(8);
    expect(s.totalMin).toBe(16);
  });

  it("AI の費用の概算は、単価の分かる種類だけ", () => {
    const c = aiCostEstimate({ card: 10, removebg: 1, app_open: 50 });
    expect(c.byKind.map((x) => x.kind)).toEqual(["card", "removebg"]);
    expect(c.usd).toBeCloseTo(0.06, 3);
  });
});

/** 2026-09-28「グラフや図チャート、ほかのユーザーとの比較、ユーザー全体の情報」。 */
describe("開発者だけ: 全体の数字と比較", () => {
  it("全体の中での位置（同じ値は半分と数える）", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(63);
    expect(percentileRank([5, 5, 5, 5], 5)).toBe(50);
    expect(percentileRank([], 1)).toBeNull();
  });

  it("日ごとの数は古い順・無い日は0", () => {
    expect(dailyCounts(["2026-09-27", "2026-09-27", "2026-09-25"], "2026-09-28", 4)).toEqual([
      { day: "2026-09-25", n: 1 },
      { day: "2026-09-26", n: 0 },
      { day: "2026-09-27", n: 2 },
      { day: "2026-09-28", n: 0 },
    ]);
  });

  it("続けて使っている割合: まだ N 日経っていない人は数えない", () => {
    const users = [
      { signup: "2026-09-01", activeDays: ["2026-09-01", "2026-09-09"] },
      { signup: "2026-09-01", activeDays: ["2026-09-01"] },
      { signup: "2026-09-25", activeDays: ["2026-09-25"] },
    ];
    expect(retention(users, 7, "2026-09-28")).toEqual({ rate: 50, eligible: 2 });
    expect(retention(users, 30, "2026-09-28")).toEqual({ rate: null, eligible: 0 });
  });
});
