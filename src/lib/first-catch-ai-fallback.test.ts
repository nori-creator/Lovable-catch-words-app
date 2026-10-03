import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * チュートリアルの写真の分析: 1回20秒の締め切り → 別の AI で1回 → 記録と枠の数え直し。
 * AI はすべて偽物（鍵が無い環境でも動く）。
 */
const generateText = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => generateText(...args) }));
vi.mock("./ai-provider.server", () => ({
  getAiAttemptChain: vi.fn(async () => [
    { label: "lovable:google/gemini-3-flash-preview", model: { id: "primary" } },
    { label: "google:gemini-2.5-flash", model: { id: "backup" } },
  ]),
  parseJsonFromAiText: (text: string) => JSON.parse(text),
}));
const adminDelete = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      delete: () => ({
        eq: (...a: unknown[]) => ({
          eq: async (...b: unknown[]) => {
            adminDelete(...a, ...b);
            return { error: null };
          },
        }),
      }),
    }),
  },
}));

import { executeFirstCatchAI, runFirstCatchAI } from "./first-catch-ai.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PHOTO = `data:image/jpeg;base64,${"A".repeat(200)}`;
const request = {
  action: "suggest" as const,
  uiLanguage: "ja" as const,
  targetLanguage: "zh-TW" as const,
  preferences: { dailyMinutes: 10 as const, interests: [], goals: [] },
  photo: PHOTO,
};
const reply = JSON.stringify({
  suggestions: [{ headword: "杯子", meaning_ja: "コップ", category_key: "food", distinction: "" }],
});

function stall() {
  return ({ abortSignal }: { abortSignal: AbortSignal }) =>
    new Promise((_, reject) =>
      abortSignal.addEventListener("abort", () => reject(new Error("aborted"))),
    );
}

function memberDb() {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ gte: async () => ({ count: 3, error: null }) }) }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        const done = Promise.resolve({ error: null });
        return Object.assign(done, {
          select: () => ({ single: async () => ({ data: { id: 77 }, error: null }) }),
        });
      },
    }),
  } as unknown as SupabaseClient<Database>;
  return { db, inserted };
}

beforeEach(() => {
  generateText.mockReset();
  adminDelete.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("first-catch AI attempts", () => {
  it("calls the provider without hidden SDK retries and with an abort signal", async () => {
    generateText.mockResolvedValueOnce({
      text: reply,
      usage: { inputTokens: 900, outputTokens: 80 },
    });
    const { value, run } = await runFirstCatchAI(request);
    expect(value).toMatchObject({ suggestions: [{ headword: "杯子" }] });
    expect(generateText).toHaveBeenCalledTimes(1);
    const args = generateText.mock.calls[0][0];
    expect(args.maxRetries).toBe(0);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
    expect(args.model).toEqual({ id: "primary" });
    expect(run).toMatchObject({ ok: true, tokensIn: 900, tokensOut: 80 });
  });

  it("switches to the second configured model after 20 s", async () => {
    vi.useFakeTimers();
    generateText.mockImplementationOnce(stall()).mockResolvedValueOnce({ text: reply });
    const pending = runFirstCatchAI(request);
    await vi.advanceTimersByTimeAsync(20_000);
    const { run } = await pending;
    expect(generateText.mock.calls[1][0].model).toEqual({ id: "backup" });
    expect(run.attempts.map((a) => a.outcome)).toEqual(["timeout", "ok"]);
  });

  it("member: a fully timed-out request is logged in ai_runs and its reservation refunded", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
    generateText.mockImplementation(stall());
    const { db, inserted } = memberDb();
    const pending = executeFirstCatchAI(request, { userId: "u1", supabase: db }).then(
      () => new Error("expected failure"),
      (e: unknown) => e as Error,
    );
    await vi.advanceTimersByTimeAsync(40_000);
    const error = await pending;
    expect(error.message).toBe("FIRST_CATCH_ANALYSIS_TIMEOUT");
    // 予約は1回だけ（2番手の AI は同じ予約で動く）。
    expect(inserted.filter((r) => r.table === "usage_events")).toHaveLength(1);
    expect(adminDelete).toHaveBeenCalledWith("id", 77, "kind", "first_catch_ai");
    const log = inserted.find((r) => r.table === "ai_runs")?.row;
    expect(log).toMatchObject({ loop: "first_catch_ai", accepted: 0, iterations: 2 });
    expect(log?.meta).toMatchObject({
      ok: false,
      refunded: true,
      attempts: [{ outcome: "timeout" }, { outcome: "timeout" }],
    });
  });

  it("member: an unusable reply still counts against the daily limit", async () => {
    generateText.mockResolvedValue({ text: "not json" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, inserted } = memberDb();
    const error = await executeFirstCatchAI(request, { userId: "u1", supabase: db }).then(
      () => new Error("expected failure"),
      (e: unknown) => e as Error,
    );
    expect(error.message).toBe("FIRST_CATCH_AI_FORMAT");
    expect(adminDelete).not.toHaveBeenCalled();
    expect(inserted.find((r) => r.table === "ai_runs")?.row.meta).toMatchObject({
      refunded: false,
      attempts: [{ outcome: "unusable" }, { outcome: "unusable" }],
    });
  });

  it("member: success is logged with latency and tokens", async () => {
    generateText.mockResolvedValueOnce({ text: reply, usage: { inputTokens: 5, outputTokens: 6 } });
    const { db, inserted } = memberDb();
    await executeFirstCatchAI(request, { userId: "u1", supabase: db });
    expect(inserted.find((r) => r.table === "ai_runs")?.row).toMatchObject({
      accepted: 1,
      tokens_in: 5,
      tokens_out: 6,
      meta: { ok: true, attempts: [{ outcome: "ok" }] },
    });
  });
});
