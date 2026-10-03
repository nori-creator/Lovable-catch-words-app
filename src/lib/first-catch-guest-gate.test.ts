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
vi.mock("./first-catch-ai.server", () => ({
  generateFirstCatchAI: vi.fn(async () => ({ ok: true })),
}));

import { executeGuestFirstCatch, GUEST_IP_LIMIT_PER_DAY } from "./first-catch-guest.server";
import { generateFirstCatchAI } from "./first-catch-ai.server";

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
    expect(state.pruned).toEqual(["first-catch-budget:%"]);
    await executeGuestFirstCatch(
      input,
      request({ origin: "https://app.example", "x-forwarded-for": "1.2.3.5" }),
    );
    expect(state.pruned).toHaveLength(1);
  });
});
