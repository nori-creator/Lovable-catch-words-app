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
  it.each(["questions", "home", "dex", "review", "camera", "card"] as const)(
    "never requests signup at %s, even when a card exists",
    (stage) => {
      expect(canRequestAccount({ ...draft, stage })).toBe(false);
    },
  );
  it("requires the captured photo, word and addition, not merely pressing the shutter", () => {
    expect(canRequestAccount(draft)).toBe(true);
    expect(canRequestAccount({ ...draft, photo: null })).toBe(false);
    expect(canRequestAccount({ ...draft, card: null })).toBe(false);
  });
  it("preserves photo, language, preference and card across a new read (OAuth/reload)", async () => {
    await writeFirstCatch(draft);
    expect(await readFirstCatch()).toEqual(draft);
    const sticker = firstCatchSticker((await readFirstCatch())!);
    expect(sticker?.object_url).toBe(draft.photo);
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
      await writeFirstCatch(draft);
      const p = ports();
      p[key].mockRejectedValueOnce(new Error("offline"));
      await expect(transferFirstCatch(draft, userId, p)).rejects.toThrow("offline");
      expect(p.persist).not.toHaveBeenCalled();
      expect(await readFirstCatch()).toEqual(draft);
    },
  );
  it("clears private local data only after all server steps succeed; repeated import is a no-op", async () => {
    const p = ports();
    await transferFirstCatch(draft, userId, p);
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
    await expect(transferFirstCatch(draft, userId, p)).rejects.toThrow();
    await transferFirstCatch(draft, userId, p);
    expect(p.save.mock.calls.map((call) => call[0].id)).toEqual([draft.id, draft.id]);
  });
});
