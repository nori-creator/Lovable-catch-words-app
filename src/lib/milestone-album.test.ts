import { describe, expect, it } from "vitest";
import {
  dayNumber,
  isMilestone,
  milestoneToday,
  nextMilestone,
  pickHighlights,
} from "./milestone-album";

const d = (s: string) => new Date(s);

describe("節目の日の記念アルバム", () => {
  it("使い始めた日が1日目", () => {
    expect(dayNumber(d("2026-09-01T23:00:00"), d("2026-09-01T08:00:00"))).toBe(1);
    expect(dayNumber(d("2026-09-01T23:00:00"), d("2026-09-07T00:10:00"))).toBe(7);
  });

  it("7・30・100・200・365日目、その後は1年ごと", () => {
    expect([7, 30, 100, 200, 365, 730].every(isMilestone)).toBe(true);
    expect([1, 8, 31, 366, 400].some(isMilestone)).toBe(false);
    expect(milestoneToday(d("2026-09-01T10:00:00"), d("2026-09-30T20:00:00"))).toBe(30);
    expect(milestoneToday(d("2026-09-01T10:00:00"), d("2026-09-29T20:00:00"))).toBeNull();
  });

  it("次の節目の日", () => {
    const next = nextMilestone(d("2026-09-01T10:00:00"), d("2026-09-10T10:00:00"))!;
    expect(next.n).toBe(30);
    expect(next.date.getMonth()).toBe(8);
    expect(next.date.getDate()).toBe(30);
  });

  it("写真のある札だけ、日をまたいで散らし、最初と最後の日を含む", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      created_at: `2026-09-${String(1 + i).padStart(2, "0")}T10:00:00Z`,
      caption: i % 5 === 0 ? "一言" : null,
      hasPhoto: i !== 3,
    }));
    const picked = pickHighlights(items, 8);
    expect(picked).toHaveLength(8);
    expect(picked[0].id).toBe("s0");
    expect(picked[picked.length - 1].id).toBe("s29");
    expect(picked.some((p) => p.id === "s3")).toBe(false);
    expect(new Set(picked.map((p) => p.created_at.slice(0, 10))).size).toBe(8);
  });

  it("同じ日なら一言のある札を選ぶ", () => {
    const items = [
      { id: "a", created_at: "2026-09-01T09:00:00Z", caption: null, hasPhoto: true },
      { id: "b", created_at: "2026-09-01T08:00:00Z", caption: "初めての夜市", hasPhoto: true },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `x${i}`,
        created_at: `2026-09-1${i}T10:00:00Z`,
        caption: null,
        hasPhoto: true,
      })),
    ];
    expect(pickHighlights(items, 3)[0].id).toBe("b");
  });
});
