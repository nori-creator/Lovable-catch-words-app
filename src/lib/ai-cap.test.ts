import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_CAP_CODES,
  DAILY_CAPS,
  DEFAULT_GLOBAL_AI_DAILY_CAP,
  GLOBAL_AI_BUDGET_ROOT,
  globalAiDailyCap,
  reserveAiCall,
  resetAiCapLogForTest,
  type AiCapDeps,
} from "./ai-cap";
import type { BudgetDb } from "./budget-slots";
import { readableError } from "./errors";

/** `app_config` の枠を覚える偽物（同時に来た2本が同じ数を読めるようにする）。 */
function budget() {
  const keys = new Map<string, string>(); // key → updated_at
  const deleted: string[] = [];
  const db = {
    from: () => ({
      select: () => ({
        like: async (_: string, pattern: string) => {
          await Promise.resolve();
          const p = pattern.slice(0, -1);
          return { count: [...keys.keys()].filter((k) => k.startsWith(p)).length, error: null };
        },
      }),
      insert: async ({ key }: { key: string }) => {
        await Promise.resolve();
        if (keys.has(key)) return { error: { code: "23505" } };
        keys.set(key, new Date().toISOString());
        return { error: null };
      },
      delete: () => ({
        like: (_: string, pattern: string) => ({
          lt: async () => {
            deleted.push(pattern);
            return { error: null };
          },
        }),
      }),
    }),
  } as unknown as BudgetDb;
  return { db, keys, deleted };
}

/** その人ごとの `usage_events` を覚える偽物。 */
function usage() {
  const rows: Array<{ userId: string; kind: string }> = [];
  return {
    rows,
    count: async (userId: string, kind: string) => {
      await Promise.resolve();
      return rows.filter((r) => r.userId === userId && r.kind === kind).length;
    },
    insert: async (userId: string, kind: string) => {
      rows.push({ userId, kind });
    },
  };
}

const NOW = new Date("2026-10-03T03:00:00Z"); // 台湾 11:00

function deps(over: Partial<AiCapDeps> = {}) {
  const u = usage();
  const b = budget();
  const d: AiCapDeps = {
    countUserKindSince: u.count,
    insertUsage: u.insert,
    budgetDb: b.db,
    globalLimit: 5_000,
    now: () => NOW,
    warn: () => undefined,
    ...over,
  };
  return { d, u, b };
}

beforeEach(() => resetAiCapLogForTest());

describe("reserveAiCall — その人の上限", () => {
  it("呼ぶ前に1回ぶんを記録する（成功の後に足すのではない）", async () => {
    const { d, u } = deps();
    await reserveAiCall(d, "u1", "card");
    expect(u.rows).toEqual([{ userId: "u1", kind: "card" }]);
  });

  it("上限に届いたら断り、印つきの文を投げる", async () => {
    const { d, u } = deps();
    for (let i = 0; i < DAILY_CAPS.wordbook; i++) u.rows.push({ userId: "u1", kind: "wordbook" });
    await expect(reserveAiCall(d, "u1", "wordbook")).rejects.toThrow(AI_CAP_CODES.daily);
    // 別の人は通る
    await expect(reserveAiCall(d, "u2", "wordbook")).resolves.toBeUndefined();
  });

  it("**数えられないときは断る**（前は通していた）", async () => {
    const { d, u } = deps({
      countUserKindSince: async () => {
        throw new Error("db down");
      },
    });
    await expect(reserveAiCall(d, "u1", "card")).rejects.toThrow(AI_CAP_CODES.unavailable);
    expect(u.rows).toEqual([]);
  });

  it("記録できないときも断る", async () => {
    const { d } = deps({
      insertUsage: async () => {
        throw new Error("insert failed");
      },
    });
    await expect(reserveAiCall(d, "u1", "card")).rejects.toThrow(AI_CAP_CODES.unavailable);
  });

  it("上限の無い種類は何もしない", async () => {
    const { d, u, b } = deps();
    await reserveAiCall(d, "u1", "object3d");
    expect(u.rows).toEqual([]);
    expect(b.keys.size).toBe(0);
  });

  it("確保が先なので、続けて送っても上限より多くは通らない", async () => {
    const { d, u } = deps();
    for (let i = 0; i < DAILY_CAPS.journal_prompt - 3; i++)
      u.rows.push({ userId: "u1", kind: "journal_prompt" });
    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(
        await reserveAiCall(d, "u1", "journal_prompt").then(
          () => true,
          () => false,
        ),
      );
    }
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(u.rows).toHaveLength(DAILY_CAPS.journal_prompt);
  });
});

describe("reserveAiCall — 全員の 1 日の上限", () => {
  it("同時に来ても全体の上限より多くは通さない", async () => {
    const { d, b } = deps({ globalLimit: 5 });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => reserveAiCall(d, `u${i}`, "card")),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(5);
    expect(b.keys.size).toBe(5);
    for (const k of b.keys.keys())
      expect(k.startsWith(`${GLOBAL_AI_BUDGET_ROOT}2026-10-03:`)).toBe(true);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason)).toContain(AI_CAP_CODES.global);
  });

  it("全体の上限に届いたら記録に残す", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { d } = deps({ globalLimit: 1 });
    await reserveAiCall(d, "u1", "card");
    await expect(reserveAiCall(d, "u2", "card")).rejects.toThrow(AI_CAP_CODES.global);
    expect(error).toHaveBeenCalledWith(
      "[usage] global AI daily ceiling reached",
      expect.objectContaining({ limit: 1 }),
    );
    error.mockRestore();
  });

  it("全体の上限に届いた人は、その人の行を増やさない", async () => {
    const { d, u } = deps({ globalLimit: 1 });
    await reserveAiCall(d, "u1", "card");
    await reserveAiCall(d, "u1", "card").catch(() => undefined);
    expect(u.rows).toHaveLength(1);
  });

  it("発音（tts）は全体の上限に数えない", async () => {
    const { d, b, u } = deps({ globalLimit: 1 });
    await reserveAiCall(d, "u1", "tts");
    await reserveAiCall(d, "u1", "tts");
    expect(b.keys.size).toBe(0);
    expect(u.rows).toHaveLength(2);
  });

  it("その日の最初の枠で古い日の枠を掃除する", async () => {
    const { d, b } = deps();
    await reserveAiCall(d, "u1", "card");
    expect(b.deleted).toEqual([`${GLOBAL_AI_BUDGET_ROOT}%`]);
    await reserveAiCall(d, "u1", "card");
    expect(b.deleted).toHaveLength(1);
  });

  it("上限は環境変数で変えられる（読めなければ既定 5,000）", () => {
    expect(globalAiDailyCap(undefined)).toBe(DEFAULT_GLOBAL_AI_DAILY_CAP);
    expect(DEFAULT_GLOBAL_AI_DAILY_CAP).toBe(5_000);
    expect(globalAiDailyCap("1200")).toBe(1200);
    for (const bad of ["", "0", "-3", "abc", "1.5"])
      expect(globalAiDailyCap(bad)).toBe(DEFAULT_GLOBAL_AI_DAILY_CAP);
  });
});

describe("上限の文は画面の言語で出る（`errors.ts` の KNOWN_CODES）", () => {
  const t = (k: string) => `[${k}]`;
  it.each(["ja", "en", "zh-TW"] as const)("%s", async (lang) => {
    const { d, u } = deps();
    for (let i = 0; i < DAILY_CAPS.card; i++) u.rows.push({ userId: "u1", kind: "card" });
    const e = await reserveAiCall(d, "u1", "card").catch((x: unknown) => x);
    expect(readableError(e, "FB", lang, t)).toBe("[err.dailyCap]");
    expect(readableError(new Error(`${AI_CAP_CODES.global} x`), "FB", lang, t)).toBe(
      "[err.aiBusy]",
    );
    expect(readableError(new Error(`${AI_CAP_CODES.unavailable} x`), "FB", lang, t)).toBe(
      "[err.usageCheck]",
    );
  });

  it("iOS の道は日本語の文でも上限と分かる（429）", async () => {
    const { statusForError } = await import("./native-fn");
    const { d, u } = deps();
    for (let i = 0; i < DAILY_CAPS.card; i++) u.rows.push({ userId: "u1", kind: "card" });
    const e = await reserveAiCall(d, "u1", "card").catch((x: unknown) => x);
    expect(statusForError(e)).toBe(429);
    expect(statusForError(new Error(`${AI_CAP_CODES.unavailable} x`))).toBe(503);
  });
});
