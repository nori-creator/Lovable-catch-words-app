import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { CardSchema } from "./card-schema";
import {
  canRequestAccount,
  firstCatchSticker,
  readFirstCatch,
  writeFirstCatch,
  type FirstCatch,
} from "./first-catch";
import { transferFirstCatch } from "./first-catch-transfer";
import { createFirstCatchServices } from "./first-catch-ai-client";
import { personalizationRule } from "./learning-preferences";

const draft: FirstCatch = {
  version: 1,
  id: "266cbbcd-52ab-4f4a-b96f-2dcd3b71ba10",
  uiLanguage: "zh-TW",
  targetLanguage: "en",
  dailyMinutes: 5,
  stage: "added",
  photo: "data:image/jpeg;base64,YQ==",
  capturedAt: "2026-09-22T10:15:00.000Z",
  card: CardSchema.parse({
    headword_zh: "coffee",
    meaning_ja: "咖啡",
    category_key: "drink",
    level: "",
  }),
};
const userId = "8bb9ef3e-4af5-47e0-aef0-fa228b361290";
describe("first Catch before signup", () => {
  it.each([
    "intro",
    "questions",
    "notifications",
    "ready",
    "home",
    "dex",
    "review",
    "camera",
    "card",
    "added",
    "explore",
  ] as const)("never requests signup at %s, even when a card exists", (stage) => {
    expect(canRequestAccount({ ...draft, stage })).toBe(false);
  });
  it("requires the captured photo, word and addition, not merely pressing the shutter", () => {
    expect(canRequestAccount({ ...draft, stage: "complete" })).toBe(false);
    expect(canRequestAccount({ ...draft, stage: "complete", reviewCompleted: true })).toBe(true);
    expect(canRequestAccount({ ...draft, stage: "account", reviewCompleted: false })).toBe(false);
    expect(canRequestAccount({ ...draft, photo: null })).toBe(false);
    expect(canRequestAccount({ ...draft, card: null })).toBe(false);
  });
  it("preserves photo, language, goal, interests and card across a new read (OAuth/reload)", async () => {
    const ready: FirstCatch = {
      ...draft,
      stage: "explore",
      goals: ["travel"],
      interests: ["food"],
      questionIndex: 4,
      reminders: { morning: true, evening: false },
    };
    await writeFirstCatch(ready);
    expect(await readFirstCatch()).toEqual(ready);
    const sticker = firstCatchSticker((await readFirstCatch())!);
    expect(sticker?.object_url).toBe(ready.photo);
    expect(sticker?.word.language).toBe("en");
    expect(sticker?.word.meaning_ja).toBe("咖啡");
  });
  it("rejects failed durable writes instead of announcing a Catch", async () => {
    const blocked = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("quota");
    });
    await expect(writeFirstCatch(draft)).rejects.toThrow("quota");
    blocked.mockRestore();
    expect((await readFirstCatch())?.photo).toBe(draft.photo);
  });
});
describe("signup transfer", () => {
  const ready = { ...draft, stage: "complete" as const, reviewCompleted: true };
  const ports = () => ({
    upload: vi.fn(async () => `${userId}/first.jpg`),
    save: vi.fn(async (_draft: FirstCatch, _path: string | null) => ({ id: draft.id })),
    preferences: vi.fn(async () => {}),
    persist: vi.fn(writeFirstCatch),
  });
  it("does not upload or save a not-yet-added word", async () => {
    const p = ports();
    await expect(transferFirstCatch({ ...draft, stage: "card" }, userId, p)).rejects.toThrow();
    expect(p.upload).not.toHaveBeenCalled();
  });
  it.each(["upload", "save", "preferences"] as const)(
    "retains the local photo and card if %s fails",
    async (key) => {
      await writeFirstCatch(ready);
      const p = ports();
      p[key].mockRejectedValueOnce(new Error("offline"));
      await expect(transferFirstCatch(ready, userId, p)).rejects.toThrow("offline");
      expect(p.persist).not.toHaveBeenCalled();
      expect(await readFirstCatch()).toEqual(ready);
    },
  );
  it("clears private local data only after all server steps succeed; repeated import is a no-op", async () => {
    const p = ports();
    await transferFirstCatch(ready, userId, p);
    const done = (await readFirstCatch())!;
    expect(done).toMatchObject({
      stage: "done",
      importedUserId: userId,
      photo: null,
      card: null,
      dailyMinutes: 5,
    });
    await transferFirstCatch(done, userId, p);
    expect(p.save).toHaveBeenCalledTimes(1);
  });
  it("uses the same catch ID after a lost response so the server can deduplicate", async () => {
    const p = ports();
    p.save.mockRejectedValueOnce(new Error("response lost"));
    await expect(transferFirstCatch(ready, userId, p)).rejects.toThrow();
    await transferFirstCatch(ready, userId, p);
    expect(p.save.mock.calls.map((call) => call[0].id)).toEqual([draft.id, draft.id]);
  });
});
describe("photographed candidates and learning context", () => {
  const ready: FirstCatch = { ...draft, stage: "camera", goals: ["travel"], interests: ["food"] };
  it("passes the actual photographed image and selected languages to analysis, without supplying canned candidates", async () => {
    const request = vi.fn(async () => ({
      suggestions: [{ headword: "咖啡", meaning_ja: "coffee", category_key: "drink" }],
    }));
    const services = createFirstCatchServices(request, async () => {});
    const photo = "data:image/jpeg;base64," + "a".repeat(150);
    const result = await services.suggest(photo, {
      ...ready,
      uiLanguage: "en",
      targetLanguage: "zh-TW",
    });
    expect(result.suggestions[0].headword).toBe("咖啡");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "suggest",
        photo,
        uiLanguage: "en",
        targetLanguage: "zh-TW",
        preferences: { dailyMinutes: 5, goals: ["travel"], interests: ["food"] },
      }),
    );
  });
  it("rejects empty AI suggestions and never invents a fixed word", async () => {
    const services = createFirstCatchServices(
      async () => ({ suggestions: [] }),
      async () => {},
    );
    await expect(services.suggest("any-photo", ready)).rejects.toThrow();
  });
  it("keeps photographed meaning and varied goals separate from shared word data", () => {
    const prompt = personalizationRule({
      dailyMinutes: 10,
      goals: ["travel", "work"],
      interests: ["food"],
    });
    expect(prompt).toContain("travel");
    expect(prompt).toContain("workplace");
    expect(prompt).toContain("food");
    expect(prompt).toContain("Do not force an unrelated interest");
  });
});
