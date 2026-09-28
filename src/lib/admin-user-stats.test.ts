import { describe, expect, it } from "vitest";
import { aiCostEstimate, median, screenOf, sessionMinutes, streaks } from "./admin-user-stats";

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
