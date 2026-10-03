import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * チュートリアルの写真の分析: 1回20秒の締め切り → 別の AI で1回 → 記録と枠の数え直し。
 * AI はすべて偽物（鍵が無い環境でも動く）。
 */
const generateText = vi.fn();
const reserveAiCallFor = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => generateText(...args) }));
vi.mock("./ai-provider.server", () => ({
  reserveAiCallFor: (...args: unknown[]) => reserveAiCallFor(...args),
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
  reserveAiCallFor.mockReset();
  reserveAiCallFor.mockResolvedValue({ usageId: 77 });
  adminDelete.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("first-catch meanings stay in the display language", () => {
  // 実物確認 2026-10-03（run 37105477674、WebKit）: 表示 繁體中文 × 学習 英語で
  // 「flower 花。植物の生殖器官。」と日本語の意味が出た。
  const zhUiEn = { ...request, uiLanguage: "zh-TW" as const, targetLanguage: "en" as const };
  const KANA = /[ぁ-ゟァ-ヺ]/;

  it("zh-TW UI × en target: a Japanese meaning from the AI is never shown", async () => {
    generateText.mockResolvedValueOnce({
      text: JSON.stringify({
        suggestions: [
          { headword: "flower", meaning_ja: "花。植物の生殖器官。", category_key: "flower" },
          { headword: "latte", meaning_ja: "拿鐵（一種咖啡飲料）", category_key: "drink" },
          {
            headword: "cup",
            meaning_ja: "カップ",
            distinction: "取っ手のある器",
            category_key: "other",
          },
        ],
      }),
    });
    const { value } = await runFirstCatchAI(zhUiEn);
    const suggestions = (
      value as { suggestions: Array<{ headword: string; meaning_ja: string; distinction: string }> }
    ).suggestions;
    expect(suggestions.map((s) => s.headword)).toEqual(["flower", "latte", "cup"]);
    for (const s of suggestions) {
      expect(s.meaning_ja).not.toMatch(KANA);
      expect(s.distinction).not.toMatch(KANA);
    }
    // 表示言語の意味はそのまま、別の言語の意味は（辞書が無ければ）空。
    expect(suggestions.map((s) => s.meaning_ja)).toEqual(["", "拿鐵（一種咖啡飲料）", ""]);
  });

  it("the prompt says the meaning_ja key is not a language instruction", async () => {
    generateText.mockResolvedValueOnce({ text: JSON.stringify({ suggestions: [] }) });
    await runFirstCatchAI(zhUiEn);
    const text = generateText.mock.calls[0][0].messages[0].content[0].text as string;
    expect(text).toContain("Traditional Chinese used in Taiwan");
    expect(text).toContain("never in Japanese");
    expect(text).toContain('"meaning_ja":"<short meaning in Traditional Chinese used in Taiwan>"');
  });

  it("zh-TW UI × en target: the card's Japanese meaning and translations are dropped", async () => {
    generateText.mockResolvedValueOnce({
      text: JSON.stringify({
        headword_zh: "flower",
        meaning_ja: "花",
        example_sentence: "She picked a flower.",
        example_translation: "彼女は花を摘んだ。",
        extras: { usage_chunks: [{ parts: [{ text: "a flower", pos: "N" }], ja: "一輪の花を" }] },
      }),
    });
    const { value } = await runFirstCatchAI({
      ...zhUiEn,
      action: "card",
      headword: "flower",
    } as never);
    const card = value as {
      meaning_ja: string;
      example_translation: string;
      extras: { usage_chunks: Array<{ ja: string }> };
    };
    // 「花」は漢字だけ — 繁體中文の意味としてそのまま使える。
    expect(card.meaning_ja).toBe("花");
    expect(card.example_translation).toBe("");
    expect(card.extras.usage_chunks[0].ja).toBe("");
  });

  it("a lesson whose meanings are all Japanese is treated as unusable for a zh-TW reader", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const japanese = JSON.stringify({
      senses: [{ meaning: "植物の花", note: "" }],
      examples: [
        { sentence: "A flower.", translation: "花です。", situation: "", explanation: "" },
      ],
    });
    generateText.mockResolvedValue({ text: japanese });
    const error = await runFirstCatchAI({
      ...zhUiEn,
      action: "lesson",
      headword: "flower",
      meaning: "花",
    } as never).then(
      () => new Error("expected failure"),
      (e: unknown) => e as Error,
    );
    expect(error.message).toBe("FIRST_CATCH_AI_FORMAT");
  });
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

  it("hedges: asks the second configured model after 6 s and takes its answer (primary aborted)", async () => {
    vi.useFakeTimers();
    generateText.mockImplementationOnce(stall()).mockResolvedValueOnce({ text: reply });
    const pending = runFirstCatchAI(request);
    await vi.advanceTimersByTimeAsync(5_999);
    expect(generateText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const { run } = await pending;
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[1][0].model).toEqual({ id: "backup" });
    expect(generateText.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(run.attempts.map((a) => a.outcome)).toEqual(["cancelled", "ok"]);
    expect(run).toMatchObject({ via: "google:gemini-2.5-flash", hedged: true, ms: 6_000 });
  });

  it("AI_HEDGE_AFTER_MS=0 turns hedging off: the second model starts only after the 20 s deadline", async () => {
    vi.useFakeTimers();
    vi.stubEnv("AI_HEDGE_AFTER_MS", "0");
    generateText.mockImplementationOnce(stall()).mockResolvedValueOnce({ text: reply });
    const pending = runFirstCatchAI(request);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(generateText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const { run } = await pending;
    expect(generateText.mock.calls[1][0].model).toEqual({ id: "backup" });
    expect(run.attempts.map((a) => a.outcome)).toEqual(["timeout", "ok"]);
    expect(run.hedged).toBe(false);
  });

  it("member: a hedged request reserves once and logs which provider answered", async () => {
    vi.useFakeTimers();
    generateText.mockImplementationOnce(stall()).mockResolvedValueOnce({ text: reply });
    const { db, inserted } = memberDb();
    const pending = executeFirstCatchAI(request, { userId: "u1", supabase: db });
    await vi.advanceTimersByTimeAsync(6_000);
    await pending;
    expect(reserveAiCallFor).toHaveBeenCalledTimes(1);
    expect(inserted.find((r) => r.table === "ai_runs")?.row.meta).toMatchObject({
      ok: true,
      via: "google:gemini-2.5-flash",
      hedged: true,
      ms: 6_000,
      attempts: [
        { label: "lovable:google/gemini-3-flash-preview", outcome: "cancelled" },
        { label: "google:gemini-2.5-flash", outcome: "ok", hedged: true, startMs: 6_000 },
      ],
    });
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
    // 予約は1回だけ（2番手の AI は同じ予約で動く）。他の AI と同じ蓋（全体の枠を含む）で取る。
    expect(reserveAiCallFor).toHaveBeenCalledTimes(1);
    expect(reserveAiCallFor).toHaveBeenCalledWith("u1", "first_catch_ai");
    expect(inserted.filter((r) => r.table === "usage_events")).toHaveLength(0);
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

  it.each([
    ["AI_DAILY_CAP 1日の利用上限(24回)に達しました。", "FIRST_CATCH_LIMIT"],
    ["AI_GLOBAL_CAP 本日のAIの利用が上限に達しました。", "FIRST_CATCH_TRIAL_FULL"],
    ["AI_USAGE_CHECK_FAILED 利用回数を確認できませんでした。", "FIRST_CATCH_AI_UNAVAILABLE"],
  ])("member: 枠で断られたら AI を呼ばず、画面のコードで返す（%s）", async (message, code) => {
    reserveAiCallFor.mockRejectedValueOnce(new Error(message));
    const { db, inserted } = memberDb();
    const error = await executeFirstCatchAI(request, { userId: "u1", supabase: db }).then(
      () => new Error("expected failure"),
      (e: unknown) => e as Error,
    );
    expect(error.message).toBe(code);
    expect(generateText).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });
});
