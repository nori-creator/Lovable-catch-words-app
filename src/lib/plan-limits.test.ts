import { describe, expect, it } from "vitest";
import {
  FREE_CUTOUTS_PER_DAY,
  cutoutAllowance,
  reportMayRegenerate,
  startOfAppDay,
} from "./plan-limits";

/** オーナー決定 2026-09-28「無料は1日3つまで」「作り直しはプロユーザーのみ」。 */
describe("無料と Pro の境目", () => {
  it("切り抜きは無料で1日3枚。Pro は上限なし", () => {
    expect(FREE_CUTOUTS_PER_DAY).toBe(3);
    expect(cutoutAllowance({ isPro: false, usedToday: 2, rewardedToday: 0 })).toEqual({
      allowed: true,
      remaining: 1,
    });
    expect(cutoutAllowance({ isPro: false, usedToday: 3, rewardedToday: 0 }).allowed).toBe(false);
    expect(cutoutAllowance({ isPro: true, usedToday: 50, rewardedToday: 0 })).toEqual({
      allowed: true,
      remaining: null,
    });
  });

  it("ごほうび広告1回で、その日1枚増える（1日3回まで）", () => {
    expect(cutoutAllowance({ isPro: false, usedToday: 3, rewardedToday: 1 }).remaining).toBe(1);
    expect(cutoutAllowance({ isPro: false, usedToday: 3, rewardedToday: 9 }).remaining).toBe(3);
  });

  it("無料の人の報告は記録だけ（作り直しの裏道にしない）。辞書で照らす所は全員", () => {
    expect(reportMayRegenerate({ isPro: false, item: "example" })).toBe("record_only");
    expect(reportMayRegenerate({ isPro: false, item: "auto" })).toBe("record_only");
    expect(reportMayRegenerate({ isPro: true, item: "example" })).toBe("ai");
    expect(reportMayRegenerate({ isPro: false, item: "pronunciation" })).toBe("dictionary");
    expect(reportMayRegenerate({ isPro: false, item: "pos" })).toBe("dictionary");
  });

  it("1日の区切りは台湾時間の0時（アプリの「今日」と同じ）", () => {
    expect(startOfAppDay(new Date("2026-09-28T15:59:00Z")).toISOString()).toBe(
      "2026-09-27T16:00:00.000Z",
    );
    expect(startOfAppDay(new Date("2026-09-28T16:00:00Z")).toISOString()).toBe(
      "2026-09-28T16:00:00.000Z",
    );
  });
});
