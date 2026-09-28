import { afterEach, describe, expect, it, vi } from "vitest";
import { reminderMessage } from "./review-reminder-schedule";

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
  const p = { at: new Date("2026-09-28T09:00:00"), reason: "srs" as const };
  const quiz = {
    sticker_id: "00000000-0000-4000-8000-000000000001",
    headword: "珍珠奶茶",
    meaning_ja: "タピオカミルクティー",
    image_url: "https://example.test/signed.jpg",
  };

  it("写真のある語は、写真そのものを問う（押すとその語から）", () => {
    const m = reminderMessage(p, 7, quiz);
    expect(m.title).toBe("これ、台湾華語で言える？");
    expect(m.body).toBe("押すと1問だけ出ます");
    expect(m.image).toBe(quiz.image_url);
    expect(m.stickerId).toBe(quiz.sticker_id);
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
});
