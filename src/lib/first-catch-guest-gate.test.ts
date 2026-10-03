/**
 * ゲストの体験の関所を、偽の `app_config` で通して確かめる（監査 2026-10-03）。
 * - Origin の無い呼び出しは AI に届かない
 * - 同じ IPv6 /64 の別のアドレスは同じ枠を使う
 * - その日の最初の枠で、古い日の枠の行を消す
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ key: string; updated_at: string }>,
  pruned: [] as string[],
  released: [] as string[],
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        like: async (_: string, pattern: string) => ({
          count: state.rows.filter((r) => r.key.startsWith(pattern.slice(0, -1))).length,
          error: null,
        }),
      }),
      insert: async ({ key }: { key: string }) => {
        if (state.rows.some((r) => r.key === key)) return { error: { code: "23505" } };
        state.rows.push({ key, updated_at: new Date().toISOString() });
        return { error: null };
      },
      delete: () => ({
        // 返事を受け取れなかった回の枠の返却（2026-10-03）。
        in: async (_: string, keys: string[]) => {
          state.released.push(...keys);
          state.rows = state.rows.filter((r) => !keys.includes(r.key));
          return { error: null };
        },
        like: (_: string, pattern: string) => ({
          lt: async () => {
            state.pruned.push(pattern);
            return { error: null };
          },
        }),
      }),
    }),
  },
}));
vi.mock("./first-catch-ai.server", async () => {
  const actual =
    await vi.importActual<typeof import("./first-catch-ai.server")>("./first-catch-ai.server");
  return {
    runFirstCatchAI: vi.fn(async () => ({
      value: { ok: true },
      run: { action: "card", ok: true, ms: 1, attempts: [], chargeable: true },
    })),
    failedRun: actual.failedRun,
    runMeta: actual.runMeta,
  };
});

import { executeGuestFirstCatch, GUEST_IP_LIMIT_PER_DAY } from "./first-catch-guest.server";
import { runFirstCatchAI as generateFirstCatchAI } from "./first-catch-ai.server";
import { AiAttemptsFailed } from "./ai-attempts";

const input = {
  action: "card",
  headword: "腳踏車",
  targetLanguage: "zh-TW",
  uiLanguage: "ja",
  preferences: { dailyMinutes: 5, goals: [], interests: [] },
};
const request = (headers: Record<string, string>) =>
  new Request("https://app.example/_serverFn/x", { method: "POST", headers });

beforeEach(() => {
  state.rows.length = 0;
  state.pruned.length = 0;
  state.released.length = 0;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.restoreAllMocks();
  vi.mocked(generateFirstCatchAI).mockClear();
});

describe("executeGuestFirstCatch", () => {
  it("refuses a call without Origin before spending anything", async () => {
    await expect(
      executeGuestFirstCatch(input, request({ "x-forwarded-for": "1.2.3.4" })),
    ).rejects.toThrow("FIRST_CATCH_ORIGIN");
    expect(state.rows).toEqual([]);
    expect(generateFirstCatchAI).not.toHaveBeenCalled();
  });

  it("counts one IPv6 /64 as one guest", async () => {
    const origin = "https://app.example";
    for (let i = 0; i < GUEST_IP_LIMIT_PER_DAY; i++) {
      await executeGuestFirstCatch(
        input,
        request({ origin, "x-forwarded-for": `2001:db8:1:2::${(i + 1).toString(16)}` }),
      );
    }
    // 同じ /64 の、まだ使っていないアドレスでも枠は尽きている。
    await expect(
      executeGuestFirstCatch(input, request({ origin, "x-forwarded-for": "2001:db8:1:2:ffff::1" })),
    ).rejects.toThrow("FIRST_CATCH_LIMIT");
    // 別の /64 は通る。
    await expect(
      executeGuestFirstCatch(input, request({ origin, "x-forwarded-for": "2001:db8:1:3::1" })),
    ).resolves.toEqual({ ok: true });
  });

  it("prunes old budget rows on the first reservation of the day", async () => {
    await executeGuestFirstCatch(
      input,
      request({ origin: "https://app.example", "x-forwarded-for": "1.2.3.4" }),
    );
    expect(state.pruned).toEqual(["first-catch-budget:%", "first-catch-run:%"]);
    await executeGuestFirstCatch(
      input,
      request({ origin: "https://app.example", "x-forwarded-for": "1.2.3.5" }),
    );
    expect(state.pruned).toHaveLength(2);
  });

  it("gives the slots back and logs the failure when no AI reply arrived (timeouts)", async () => {
    vi.mocked(generateFirstCatchAI).mockRejectedValueOnce(
      new AiAttemptsFailed(
        "FIRST_CATCH_AI_TIMEOUT",
        [
          { label: "a:m", ms: 20_000, outcome: "timeout", code: "timeout" },
          { label: "b:m", ms: 20_000, outcome: "timeout", code: "timeout" },
        ],
        null,
      ),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      executeGuestFirstCatch(
        input,
        request({ origin: "https://app.example", "x-forwarded-for": "1.2.3.4" }),
      ),
    ).rejects.toThrow("FIRST_CATCH_AI_TIMEOUT");
    expect(state.released).toHaveLength(2);
    expect(state.rows.filter((r) => r.key.startsWith("first-catch-budget:"))).toEqual([]);
    expect(state.rows.map((r) => r.key)).toEqual([
      expect.stringMatching(/^first-catch-run:\d{4}-\d{2}-\d{2}:fail:/),
    ]);
  });

  it("keeps the slot when a reply arrived but was unusable", async () => {
    vi.mocked(generateFirstCatchAI).mockRejectedValueOnce(
      new AiAttemptsFailed(
        "FIRST_CATCH_AI_FORMAT",
        [{ label: "a:m", ms: 900, outcome: "unusable", code: "FIRST_CATCH_AI_FORMAT" }],
        null,
      ),
    );
    await expect(
      executeGuestFirstCatch(
        input,
        request({ origin: "https://app.example", "x-forwarded-for": "1.2.3.4" }),
      ),
    ).rejects.toThrow("FIRST_CATCH_AI_FORMAT");
    expect(state.released).toEqual([]);
    expect(state.rows.filter((r) => r.key.startsWith("first-catch-budget:"))).toHaveLength(2);
  });
});
