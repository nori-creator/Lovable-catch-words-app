/**
 * ホームの「〇か月前のこの言葉、まだ言える？」（PRODUCT「Home」・ROADMAP Phase 8-6）。
 */
import { describe, expect, it } from "vitest";
import {
  dayDiff,
  dismissResurface,
  parseResurfaceState,
  pickResurface,
  resurfaceAgeLabel,
  RESURFACE_MIN_WORDS,
  type ResurfaceItem,
} from "./resurface";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-03T03:00:00Z");
const TODAY = "2026-10-03";
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/** 新しい札 `n` 枚 + 指定した古い札。 */
function deck(old: Array<Partial<ResurfaceItem> & { id: string; days: number }>, n = 30) {
  const items: ResurfaceItem[] = Array.from({ length: n }, (_, i) => ({
    id: `new-${i}`,
    caughtAt: ago(i % 20),
    hasPhoto: true,
  }));
  for (const o of old)
    items.push({ id: o.id, caughtAt: ago(o.days), hasPhoto: o.hasPhoto ?? true });
  return items;
}

describe("出す条件", () => {
  it("語が 30 未満なら出さない", () => {
    const items = deck([{ id: "old", days: 91 }], RESURFACE_MIN_WORDS - 2);
    const r = pickResurface({
      items,
      recall: new Map([["old", 90]]),
      nowMs: NOW,
      today: TODAY,
      state: {},
    });
    expect(r.pick).toBeNull();
  });

  it("60 日以上前・写真あり・記憶 60% 以上の札だけ", () => {
    const items = deck([
      { id: "young", days: 59 },
      { id: "weak", days: 120 },
      { id: "nophoto", days: 120, hasPhoto: false },
      { id: "good", days: 91 },
    ]);
    const recall = new Map([
      ["young", 95],
      ["weak", 40],
      ["nophoto", 95],
      ["good", 80],
    ]);
    const r = pickResurface({ items, recall, nowMs: NOW, today: TODAY, state: {} });
    expect(r.pick?.id).toBe("good");
    expect(r.pick).toMatchObject({ unit: "months", n: 3 });
    expect(r.next).toMatchObject({ day: TODAY, id: "good", dismissed: false });
  });

  it("記憶の数が無い札（まだ復習していない）は出さない", () => {
    const items = deck([{ id: "old", days: 200 }]);
    const r = pickResurface({ items, recall: new Map(), nowMs: NOW, today: TODAY, state: {} });
    expect(r.pick).toBeNull();
  });
});

describe("1日に1枚・ときどき", () => {
  const items = deck([
    { id: "a", days: 91 },
    { id: "b", days: 150 },
  ]);
  const recall = new Map([
    ["a", 80],
    ["b", 80],
  ]);

  it("同じ日のうちは同じ1枚（開き直しても入れ替わらない）", () => {
    const first = pickResurface({ items, recall, nowMs: NOW, today: TODAY, state: {} });
    const again = pickResurface({
      items,
      recall,
      nowMs: NOW + 3600_000,
      today: TODAY,
      state: first.next,
    });
    expect(again.pick?.id).toBe(first.pick?.id);
    expect(again.next).toBe(first.next);
  });

  it("今日閉じたら今日はもう出さない", () => {
    const first = pickResurface({ items, recall, nowMs: NOW, today: TODAY, state: {} });
    const closed = dismissResurface(first.next, TODAY);
    expect(
      pickResurface({ items, recall, nowMs: NOW, today: TODAY, state: closed }).pick,
    ).toBeNull();
  });

  it("出した次の日は休み、2日後からまた出せる。最近出した札は避ける", () => {
    const first = pickResurface({ items, recall, nowMs: NOW, today: TODAY, state: {} });
    const nextDay = pickResurface({
      items,
      recall,
      nowMs: NOW + DAY,
      today: "2026-10-04",
      state: first.next,
    });
    expect(nextDay.pick).toBeNull();
    const later = pickResurface({
      items,
      recall,
      nowMs: NOW + 2 * DAY,
      today: "2026-10-05",
      state: first.next,
    });
    expect(later.pick).not.toBeNull();
    expect(later.pick?.id).not.toBe(first.pick?.id);
  });

  it("ちょうど〇か月前の札を先に選ぶ", () => {
    const anniversary = deck([
      { id: "x-odd", days: 75 },
      { id: "y-three-months", days: 91 },
      { id: "z-odd", days: 107 },
    ]);
    const rec = new Map([
      ["x-odd", 90],
      ["y-three-months", 90],
      ["z-odd", 90],
    ]);
    const r = pickResurface({
      items: anniversary,
      recall: rec,
      nowMs: NOW,
      today: TODAY,
      state: {},
    });
    expect(r.pick?.id).toBe("y-three-months");
  });
});

describe("言い方と記録", () => {
  it("60〜364 日は「〇か月前」、それより前は「〇年前」", () => {
    expect(resurfaceAgeLabel(60)).toEqual({ unit: "months", n: 2 });
    expect(resurfaceAgeLabel(91)).toEqual({ unit: "months", n: 3 });
    expect(resurfaceAgeLabel(92)).toEqual({ unit: "months", n: 3 });
    expect(resurfaceAgeLabel(364)).toEqual({ unit: "months", n: 11 });
    expect(resurfaceAgeLabel(400)).toEqual({ unit: "years", n: 1 });
  });

  it("壊れた記録は空として読む", () => {
    expect(parseResurfaceState("{broken")).toEqual({});
    expect(parseResurfaceState(null)).toEqual({});
    expect(parseResurfaceState(JSON.stringify({ day: TODAY, id: "a", recent: ["a", 3] }))).toEqual({
      day: TODAY,
      id: "a",
      dismissed: false,
      recent: ["a"],
    });
  });

  it("日の差", () => {
    expect(dayDiff("2026-09-30", "2026-10-03")).toBe(3);
  });
});
