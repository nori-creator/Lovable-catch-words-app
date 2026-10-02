import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@/lib/i18n";
import type { MemoryWord } from "@/lib/reviews.functions";
import { MEMORY_DESIGN_COPY } from "./copy";
import {
  bucketOf,
  calendarDaysFrom,
  dueCountsByDay,
  groupByDue,
  lastForecast,
  levelCounts,
  nextReviewOf,
  seriesAt,
} from "./model";

/** 2026-10-02 09:00 台湾。 */
const NOW = Date.parse("2026-10-02T09:00:00+08:00");
const DAY = 86_400_000;

function word(over: Partial<MemoryWord> & { headword: string }): MemoryWord {
  return {
    sticker_id: over.headword,
    retention: 90,
    interval_days: 3,
    repetitions: 3,
    due_at: null,
    days_until_forgot: null,
    fresh: false,
    long_term: false,
    anchor_at: null,
    stability_days: 10,
    ease: 2.5,
    ...over,
  };
}

describe("台湾時間の暦の日で数える", () => {
  it("同じ日の夜は 0、翌朝は 1", () => {
    expect(calendarDaysFrom(NOW, Date.parse("2026-10-02T23:30:00+08:00"))).toBe(0);
    expect(calendarDaysFrom(NOW, Date.parse("2026-10-03T00:10:00+08:00"))).toBe(1);
  });
  it("**UTC ではまだ前の日**でも、台湾で翌日なら翌日（日付の境目を取り違えない）", () => {
    // 2026-10-02T16:30Z = 台湾 10/3 0:30。
    expect(calendarDaysFrom(NOW, Date.parse("2026-10-02T16:30:00Z"))).toBe(1);
  });
  it("過ぎた日はマイナス", () => {
    expect(calendarDaysFrom(NOW, NOW - 2 * DAY)).toBe(-2);
  });
});

describe("次の復習の日", () => {
  it("予定（due_at）があればそれ — 目安ではない", () => {
    const next = nextReviewOf(
      word({ headword: "手掌", due_at: new Date(NOW + 3 * DAY).toISOString() }),
      NOW,
    );
    expect(next).toEqual({ days: 3, estimated: false });
  });
  it("予定が無い語は、曲線が 90% に下がる日を**目安**として返す", () => {
    // 安定度 S 日の語は、起点から S·ln(1/0.9) 日で 90%。S = 20 なら約 2.1 日。
    const next = nextReviewOf(
      word({ headword: "拿鐵", anchor_at: new Date(NOW).toISOString(), stability_days: 20 }),
      NOW,
    );
    expect(next).toEqual({ days: 2, estimated: true });
  });
  it("予定も起点も無ければ null（でっち上げない）", () => {
    expect(nextReviewOf(word({ headword: "滷味" }), NOW)).toBeNull();
  });
});

describe("時期の箱", () => {
  it("過ぎた語は今日、明日は明日、2〜7日後、それ以降", () => {
    expect([-3, 0, 1, 2, 7, 8].map(bucketOf)).toEqual([
      "today",
      "today",
      "tomorrow",
      "week",
      "week",
      "later",
    ]);
  });

  const at = (d: number) => new Date(NOW + d * DAY).toISOString();
  const words = [
    word({ headword: "焗烤", due_at: at(5), retention: 93 }),
    word({ headword: "手掌", due_at: at(-2), retention: 72 }),
    word({ headword: "保溫瓶", due_at: at(0.1), retention: 88 }),
    word({ headword: "拿鐵", due_at: at(-1), retention: 70 }),
    word({ headword: "蘋果核", due_at: at(1), retention: 91 }),
    word({ headword: "滷味", due_at: at(30), retention: 99 }),
    word({ headword: "無日付" }),
  ];

  it("**どの語も1回だけ**箱に入る（上の数と一覧の数が食い違わない）", () => {
    const groups = groupByDue(words, NOW);
    expect(groups.map((g) => g.bucket)).toEqual(["today", "tomorrow", "week", "later"]);
    expect(groups.reduce((n, g) => n + g.words.length, 0)).toBe(words.length);
  });

  it("今日の箱は、過ぎた日数ではなく**思い出せる確率の低い順**（どれも今日やる）", () => {
    const today = groupByDue(words, NOW)[0].words.map((r) => r.word.headword);
    expect(today).toEqual(["拿鐵", "手掌", "保溫瓶"]);
  });

  it("予定の無い語は「それ以降」の末尾", () => {
    const later = groupByDue(words, NOW)[3].words.map((r) => r.word.headword);
    expect(later).toEqual(["滷味", "無日付"]);
  });

  it("日ごとの数: 過ぎた語は今日に入り、範囲の外は数えない", () => {
    const perDay = dueCountsByDay(words, NOW, 7);
    expect(perDay).toEqual([3, 1, 0, 0, 0, 1, 0]);
  });
});

describe("段ごとの数", () => {
  it("6段すべてを並び順のまま返す（0 の段も残す — 描く側が決める）", () => {
    const counts = levelCounts([
      word({ headword: "a", retention: 72 }),
      word({ headword: "b", retention: 90 }),
      word({ headword: "c", retention: 97 }),
      word({ headword: "d", retention: 98 }),
    ]);
    expect(counts.map((c) => c.count)).toEqual([0, 0, 0, 1, 1, 2]);
  });
});

describe("全体の線", () => {
  const series = [
    { day_offset: -1, avg_retention: 95 },
    { day_offset: 0, avg_retention: 94 },
    { day_offset: 7, avg_retention: 89 },
    { day_offset: 14, avg_retention: 85 },
    { day_offset: 15, avg_retention: null },
  ];
  it("今日の値", () => {
    expect(seriesAt(series, 0)).toBe(94);
    expect(seriesAt(series, 3)).toBeNull();
  });
  it("予測の最後の点は、**値のある**いちばん先の日", () => {
    expect(lastForecast(series)).toEqual({ day: 14, value: 85 });
  });
  it("未来が無ければ null（予測を作らない）", () => {
    expect(lastForecast(series.filter((p) => p.day_offset <= 0))).toBeNull();
  });
});

describe("案の文言", () => {
  it("**3言語がそろい、変数が一致する**（選んだ案を `DICT` へ写すだけで済む）", () => {
    const bad: string[] = [];
    const vars = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(",");
    // ひらがな・カタカナ（`i18n.test.ts` と同じ門: zh-TW と en に日本語が混ざらない）。
    const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
    for (const [k, v] of Object.entries(MEMORY_DESIGN_COPY)) {
      for (const l of UI_LANGS) {
        if (!v[l]?.trim()) bad.push(`${k}.${l} が空`);
        else if (vars(v[l]) !== vars(v.ja)) bad.push(`${k}.${l} の変数が違う`);
        if (l !== "ja" && kana.test(v[l])) bad.push(`${k}.${l} に仮名`);
      }
    }
    expect(bad).toEqual([]);
  });
});
