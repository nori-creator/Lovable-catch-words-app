import { afterEach, describe, expect, it, vi } from "vitest";

const scheduled = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    cancel: async () => undefined,
    schedule: async ({ notifications }: { notifications: Array<Record<string, unknown>> }) => {
      scheduled.list = notifications;
    },
  },
}));

import { applyReminderSchedule, reminderMessage } from "./review-reminder-schedule";

/**
 * 通知は**写真つきの1問**（オーナー指示 2026-09-28「通知は写真付きで1問だけの
 * タイプにする」）。
 */
describe("復習の通知の文面", () => {
  afterEach(() => vi.unstubAllGlobals());
  const asEnglish = () => {
    const store = new Map([["ui-lang-v1", "en"]]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
  };
  const p = { at: new Date("2026-09-28T09:00:00+08:00"), reason: "srs" as const };
  const quiz = {
    sticker_id: "00000000-0000-4000-8000-000000000001",
    headword: "珍珠奶茶",
    meaning_ja: "タピオカミルクティー",
    image_url: "https://example.test/signed.jpg",
  };

  it("撮った語は「〇〇前に撮ったこの単語、覚えてる？」（押すとその語から復習が始まる）", () => {
    // オーナー指示 2026-10-07「〇〇前に撮ったのこの単語覚えてる？に通知の名前を変えて」。
    const m = reminderMessage(p, 7, { ...quiz, caught_at: "2026-06-20T12:00:00+08:00" });
    expect(m.title).toBe("3か月前に撮ったこの単語、覚えてる？");
    expect(m.body).toBe("押すと、この単語から復習が始まります");
    expect(m.body).not.toMatch(/1問だけ/);
    expect(m.image).toBe(quiz.image_url);
    expect(m.stickerId).toBe(quiz.sticker_id);
  });

  it("「〇〇前」は**鳴る時刻**から数える（今日・日・週・年も言える）", () => {
    const at = (iso: string) => reminderMessage(p, 1, { ...quiz, caught_at: iso }).title;
    expect(at("2026-09-28T07:00:00+08:00")).toBe("今日撮ったこの単語、覚えてる？");
    expect(at("2026-09-25T09:00:00+08:00")).toBe("3日前に撮ったこの単語、覚えてる？");
    expect(at("2026-09-14T09:00:00+08:00")).toBe("2週間前に撮ったこの単語、覚えてる？");
    expect(at("2024-09-01T09:00:00+08:00")).toBe("2年前に撮ったこの単語、覚えてる？");
    // 予約した時ではなく鳴る時: 同じ語でも翌日に鳴る通知は1日ぶん古く言う。
    const later = { ...p, at: new Date("2026-09-29T09:00:00+08:00") };
    expect(
      reminderMessage(later, 1, { ...quiz, caught_at: "2026-09-26T09:00:00+08:00" }).title,
    ).toBe("3日前に撮ったこの単語、覚えてる？");
  });

  it("英語・繁體中文も同じ形", () => {
    asEnglish();
    const m = reminderMessage(p, 7, { ...quiz, caught_at: "2026-06-20T12:00:00+08:00" });
    expect(m.title).toBe("A word you caught 3 months ago — remember it?");
    expect(m.body).toBe("Tap to start your review with this word");
  });

  it("撮った時刻が分からない（文字から作った語・古いサーバ）時は、写真そのものを問う", () => {
    const m = reminderMessage(p, 7, quiz);
    expect(m.title).toBe("これ、台湾華語で言える？");
    expect(m.stickerId).toBe(quiz.sticker_id);
    expect(reminderMessage(p, 7, { ...quiz, caught_at: null }).title).toBe(
      "これ、台湾華語で言える？",
    );
  });

  it("写真の無い語は、意味で問う", () => {
    const m = reminderMessage(p, 7, { ...quiz, image_url: null });
    expect(m.title).toBe("「タピオカミルクティー」、台湾華語で言える？");
    expect(m.image).toBeUndefined();
    expect(m.stickerId).toBe(quiz.sticker_id);
  });

  it("意味が表示言語と合わず写真も無いときは、語数の文に戻る（別の言語を混ぜない）", () => {
    asEnglish();
    const m = reminderMessage(p, 7, { ...quiz, image_url: null });
    expect(m.title).toBe("Time to review");
    expect(m.stickerId).toBeUndefined();
  });

  it("1問の語が無いときは、前と同じ語数の文", () => {
    expect(reminderMessage(p, 0, null).body).toBe("撮った単語を見直しましょう");
  });

  it("時が来た語があっても、残りの数を文に出さない（宿題に見せない）", () => {
    for (const reason of ["srs", "habit"] as const) {
      const body = reminderMessage({ ...p, reason }, 73, null).body;
      expect(body).not.toMatch(/73|語あります|\{n\}/);
      expect(body).toMatch(/1分/);
    }
    asEnglish();
    for (const reason of ["srs", "habit"] as const) {
      const body = reminderMessage({ ...p, reason }, 73, null).body;
      expect(body).not.toMatch(/73|\{n\}/);
      expect(body).toMatch(/minute/);
    }
  });
});

/**
 * 名指しの束は1つだけ（その語から1回復習すれば捨てる）。だから**その語を名指しするのは
 * いちばん早い通知だけ**で、残りはいつもの文で `/review` へ（Codex 指摘 2026-10-07）。
 */
describe("通知が何件もある日", () => {
  it("その語を付けるのは1件目だけ。2件目からはいつもの文と `/review`", async () => {
    const quiz = {
      sticker_id: "00000000-0000-4000-8000-000000000001",
      headword: "珍珠奶茶",
      meaning_ja: "タピオカミルクティー",
      image_url: "https://example.test/signed.jpg",
      caught_at: "2026-06-20T12:00:00+08:00",
    };
    const plan = [
      { at: new Date("2026-09-28T09:00:00+08:00"), reason: "srs" as const },
      { at: new Date("2026-09-28T19:00:00+08:00"), reason: "habit" as const },
      { at: new Date("2026-09-29T09:00:00+08:00"), reason: "srs" as const },
    ];
    await applyReminderSchedule(plan, [new Date("2026-09-27T00:00:00Z")], quiz);
    expect(scheduled.list).toHaveLength(3);
    expect(scheduled.list[0].extra).toEqual({ sticker_id: quiz.sticker_id });
    expect(scheduled.list[0].title).toBe("3か月前に撮ったこの単語、覚えてる？");
    for (const n of scheduled.list.slice(1)) {
      expect(n.extra).toEqual({ route: "/review" });
      expect(n.title).toBe("復習の時間です");
    }
  });
});
