import { describe, expect, it } from "vitest";
import {
  cleanTimes,
  habitTime,
  MIN_BATCH,
  nextOccurrence,
  normalizeReminderPrefs,
  outsideQuietHours,
  planReminders,
  srsBestTime,
} from "./review-reminder";

const at = (s: string) => new Date(s);
const hm = (d: Date | null) =>
  d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null;

describe("復習の通知の時刻", () => {
  it("チュートリアルの朝・夜を「自分で決めた時刻」に読み替える", () => {
    expect(normalizeReminderPrefs({ morning: true, evening: true })).toMatchObject({
      mode: "custom",
      times: ["09:00", "21:00"],
    });
    expect(normalizeReminderPrefs({ morning: false, evening: false }).mode).toBe("off");
    expect(normalizeReminderPrefs(null).mode).toBe("off");
  });

  it("時刻は正しい形だけ・重ねず・3つまで", () => {
    expect(cleanTimes(["21:00", "09:00", "09:00", "25:00", "x", "12:30", "18:00"])).toEqual([
      "09:00",
      "12:30",
      "18:00",
    ]);
  });

  it("22:00〜8:00 は鳴らさず、次の朝 8:00 に回す", () => {
    expect(hm(outsideQuietHours(at("2026-09-28T23:10:00")))).toBe("08:00");
    expect(outsideQuietHours(at("2026-09-28T23:10:00")).getDate()).toBe(29);
    expect(hm(outsideQuietHours(at("2026-09-28T06:00:00")))).toBe("08:00");
    expect(outsideQuietHours(at("2026-09-28T06:00:00")).getDate()).toBe(28);
    expect(hm(outsideQuietHours(at("2026-09-28T12:00:00")))).toBe("12:00");
  });

  it("過ぎた時刻は明日、まだなら今日", () => {
    const now = at("2026-09-28T10:00:00");
    expect(nextOccurrence("09:00", now).getDate()).toBe(29);
    expect(nextOccurrence("21:00", now).getDate()).toBe(28);
  });

  it("SRS: 復習が MIN_BATCH 語そろう時刻に鳴らす", () => {
    const now = at("2026-09-28T09:00:00");
    const dues = [11, 12, 13, 14, 15, 16, 17].map((h) => at(`2026-09-28T${h}:00:00`));
    expect(hm(srsBestTime(dues, now))).toBe(`${10 + MIN_BATCH}:00`);
  });

  it("SRS: もうたまっているなら、すぐではなく30分後", () => {
    const now = at("2026-09-28T09:00:00");
    const dues = Array.from({ length: 8 }, () => at("2026-09-27T09:00:00"));
    expect(hm(srsBestTime(dues, now))).toBe("09:30");
  });

  it("SRS: 24時間で1語も来ないなら鳴らさない", () => {
    const now = at("2026-09-28T09:00:00");
    expect(srsBestTime([at("2026-10-05T09:00:00")], now)).toBeNull();
  });

  it("昨日いちばん早く開いた時刻に鳴らす", () => {
    const now = at("2026-09-28T07:00:00");
    const opens = [at("2026-09-27T12:40:00"), at("2026-09-27T08:15:00"), at("2026-09-26T07:00:00")];
    expect(hm(habitTime(opens, now))).toBe("08:15");
    expect(habitTime([at("2026-09-25T08:00:00")], now)).toBeNull();
  });

  it("おまかせ: 2つが90分以内なら1回にまとめる", () => {
    const now = at("2026-09-28T07:00:00");
    const dues = Array.from({ length: 6 }, () => at("2026-09-28T12:00:00"));
    const plan = planReminders(
      { mode: "ai", times: [], ai: { srs: true, habit: true } },
      { dueTimes: dues, opens: [at("2026-09-27T12:30:00")] },
      now,
    );
    expect(plan.map((p) => p.reason)).toEqual(["srs"]);
  });

  it("おまかせ: 手がかりが何も無い日は鳴らさない", () => {
    const plan = planReminders(
      { mode: "ai", times: [], ai: { srs: true, habit: true } },
      { dueTimes: [], opens: [] },
      at("2026-09-28T07:00:00"),
    );
    expect(plan).toEqual([]);
  });

  it("自分で決めた時刻は早い順に並ぶ", () => {
    const plan = planReminders(
      { mode: "custom", times: ["21:00", "08:30"], ai: { srs: true, habit: true } },
      { dueTimes: [], opens: [] },
      at("2026-09-28T10:00:00"),
    );
    expect(plan.map((p) => hm(p.at))).toEqual(["21:00", "08:30"]);
  });
});
