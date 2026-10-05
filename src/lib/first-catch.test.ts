import { describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { CardSchema } from "./card-schema";
import {
  canRequestAccount,
  firstCatchSticker,
  hasAddedCatch,
  isStaleTutorialWrite,
  readFirstCatch,
  resumeFirstCatch,
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
  it.each(["added", "explore"] as const)(
    "R25: a peeled catch at %s is still transferred when the person signs in mid-tour",
    async (stage) => {
      // オーナー報告 2026-09-30「剥がすアニメーションまでやったのに画像が保存されなかった」。
      const peeled = { ...draft, stage };
      expect(canRequestAccount(peeled)).toBe(false);
      expect(hasAddedCatch(peeled)).toBe(true);
      const p = ports();
      await transferFirstCatch(peeled, userId, p);
      expect(p.upload).toHaveBeenCalledTimes(1);
      expect(p.save).toHaveBeenCalledTimes(1);
    },
  );
  it("R25: nothing before the peel counts as an added catch", () => {
    for (const stage of ["camera", "card"] as const)
      expect(hasAddedCatch({ ...draft, stage })).toBe(false);
    expect(hasAddedCatch({ ...draft, photo: null })).toBe(false);
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
  it("a sample walkthrough (AI unavailable before signup) carries answers only, never the sample word", async () => {
    const p = ports();
    await transferFirstCatch({ ...ready, sample: true }, userId, p);
    expect(p.upload).not.toHaveBeenCalled();
    expect(p.save).not.toHaveBeenCalled();
    expect(p.preferences).toHaveBeenCalledTimes(1);
    expect(await readFirstCatch()).toMatchObject({ stage: "done", photo: null, card: null });
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
  // 0件は形として通し、画面が「近づいて撮り直す」と言う（FIRST_CATCH_NO_WORDS）。
  // 決まった語を勝手に足さないことだけは守る。
  it("passes empty AI suggestions through and never invents a fixed word", async () => {
    const services = createFirstCatchServices(
      async () => ({ suggestions: [] }),
      async () => {},
    );
    await expect(services.suggest("any-photo", ready)).resolves.toEqual({ suggestions: [] });
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

describe("ブラウザを開き直した時の引き継ぎ", () => {
  it("答えは戻り、写真や単語は載せない", async () => {
    const { encodeFirstCatchHandoff, decodeFirstCatchHandoff } = await import("./first-catch");
    const draft = {
      version: 1 as const,
      id: "3f8a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
      uiLanguage: "zh-TW" as const,
      targetLanguage: "en" as const,
      dailyMinutes: 15 as const,
      goals: ["travel" as const],
      stage: "camera" as const,
      photo: null,
      card: null,
      capturedAt: null,
    };
    const back = decodeFirstCatchHandoff(encodeFirstCatchHandoff(draft));
    expect(back?.uiLanguage).toBe("zh-TW");
    expect(back?.goals).toEqual(["travel"]);
    expect(back?.stage).toBe("camera");
    expect(decodeFirstCatchHandoff("こわれた")).toBeNull();
    expect(decodeFirstCatchHandoff(null)).toBeNull();
  });
});

describe("終えたチュートリアルは途中の段へ戻らない（2026-10-05 オーナー報告）", () => {
  const finished: FirstCatch = { ...draft, stage: "complete", reviewCompleted: true };

  it("先に頼んだ書き込みの接続が遅れて開いても、最後に頼んだ下書きが残る", async () => {
    // 単語の詳細で解説が届いた控え（段は explore）→ その後に「完了」。iPhone の Safari では
    // 1つ目の IndexedDB の接続が遅れて開くことがある。前は後から頼んだ「完了」の後に
    // explore が書かれ、開き直すと単語の詳細へ戻っていた。
    const realOpen = indexedDB.open.bind(indexedDB);
    const spy = vi.spyOn(indexedDB, "open").mockImplementationOnce((name, version) => {
      const proxy = {} as IDBOpenDBRequest & Record<string, unknown>;
      setTimeout(() => {
        const req = realOpen(name, version);
        req.onupgradeneeded = (e) => proxy.onupgradeneeded?.call(req, e as IDBVersionChangeEvent);
        req.onerror = (e) => proxy.onerror?.call(req, e);
        req.onsuccess = (e) => {
          Object.defineProperty(proxy, "result", { value: req.result, configurable: true });
          proxy.onsuccess?.call(req, e);
        };
      }, 30);
      return proxy;
    });
    const stale = writeFirstCatch({ ...draft, stage: "explore" });
    const done = writeFirstCatch(finished);
    await Promise.all([stale, done]);
    spy.mockRestore();
    expect((await readFirstCatch())?.stage).toBe("complete");
  });

  it.each(["home", "dex", "review", "camera", "card", "added", "explore"] as const)(
    "完了・登録の案内の後に %s を被せる書き込みは古い控えとして捨てる",
    (stage) => {
      expect(isStaleTutorialWrite(finished, { ...finished, stage })).toBe(true);
      expect(isStaleTutorialWrite({ ...finished, stage: "account" }, { ...finished, stage })).toBe(
        true,
      );
    },
  );

  it("先へ進む・やり直す書き込みは通す", () => {
    expect(isStaleTutorialWrite(finished, { ...finished, stage: "account" })).toBe(false);
    expect(isStaleTutorialWrite(finished, { ...finished, stage: "done" })).toBe(false);
    // 最初から・言語を変えた時は reviewCompleted を外す
    expect(
      isStaleTutorialWrite(finished, { ...finished, stage: "home", reviewCompleted: false }),
    ).toBe(false);
    expect(isStaleTutorialWrite(finished, { ...finished, stage: "questions" })).toBe(false);
    // 終える前は、途中の段どうしの行き来（撮り直し・戻る）を止めない
    expect(
      isStaleTutorialWrite({ ...draft, stage: "explore" }, { ...draft, stage: "review" }),
    ).toBe(false);
    expect(isStaleTutorialWrite({ ...draft, stage: "card" }, { ...draft, stage: "camera" })).toBe(
      false,
    );
  });

  it("開き直した時、復習を終えた下書きは完了の画面から続ける", () => {
    expect(resumeFirstCatch({ ...finished, stage: "explore" }).stage).toBe("complete");
    expect(resumeFirstCatch({ ...finished, stage: "review" }).stage).toBe("complete");
    expect(resumeFirstCatch(finished).stage).toBe("complete");
    expect(resumeFirstCatch({ ...finished, stage: "account" }).stage).toBe("account");
    // 終えていない下書きは今まで通り、その段から
    expect(resumeFirstCatch({ ...draft, stage: "explore" }).stage).toBe("explore");
    expect(resumeFirstCatch({ ...draft, stage: "questions" }).stage).toBe("questions");
  });
});
