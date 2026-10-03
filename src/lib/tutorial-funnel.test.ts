import { describe, expect, it, vi } from "vitest";
import type { BudgetDb } from "./budget-slots";
import { FUNNEL_RATE_ROOT, FUNNEL_ROOT, parseFunnelKey, TUTORIAL_STEPS } from "./funnel-events";
import { createTutorialTracker, FUNNEL_SENT_KEY, FUNNEL_SID_KEY } from "./tutorial-funnel-client";
import { recordTutorialStepWith } from "./tutorial-funnel.server";

/** `app_config` の偽物: 鍵は一意（23505）、like の数え・消しを本当に当てる。 */
function table(rows: Array<{ key: string; value?: unknown; updated_at: string }> = []) {
  const startsWith = (pattern: string) => (key: string) => key.startsWith(pattern.slice(0, -1));
  const db = {
    from: () => ({
      select: () => ({
        like: async (_: string, pattern: string) => ({
          count: rows.filter((r) => startsWith(pattern)(r.key)).length,
          error: null,
        }),
      }),
      insert: async ({ key, value }: { key: string; value: unknown }) => {
        await Promise.resolve(); // 同時に来た2つが同じ数を読める
        if (rows.some((r) => r.key === key)) return { error: { code: "23505" } };
        rows.push({ key, value, updated_at: new Date().toISOString() });
        return { error: null };
      },
      delete: () => ({
        like: (_: string, pattern: string) => ({
          lt: async (_c: string, before: string) => {
            for (let i = rows.length - 1; i >= 0; i--)
              if (startsWith(pattern)(rows[i].key) && rows[i].updated_at < before)
                rows.splice(i, 1);
            return { error: null };
          },
        }),
      }),
    }),
  } as unknown as BudgetDb;
  return { db, rows };
}

const SID = "0b8e8c1e-6a4f-4c36-9a55-2f3c7a1d9e01";
const NOW = new Date("2026-10-03T04:00:00Z"); // 台湾 12:00
const base = { sid: SID, ipHash: "iphash", secret: "test-secret", now: NOW };

describe("recordTutorialStepWith（登録前のチュートリアルの段）", () => {
  it("counts each step once per session (idempotent), and different steps separately", async () => {
    const { db, rows } = table();
    expect(await recordTutorialStepWith(db, { ...base, step: "welcome_view" })).toEqual({
      counted: true,
    });
    expect(await recordTutorialStepWith(db, { ...base, step: "welcome_view" })).toEqual({
      counted: false,
      reason: "duplicate",
    });
    expect(await recordTutorialStepWith(db, { ...base, step: "questions_done" })).toEqual({
      counted: true,
    });
    const funnel = rows.filter((r) => r.key.startsWith(FUNNEL_ROOT));
    expect(funnel).toHaveLength(2);
    expect(funnel.map((r) => parseFunnelKey(r.key))).toEqual([
      { day: "2026-10-03", step: "welcome_view" },
      { day: "2026-10-03", step: "questions_done" },
    ]);
  });

  it("concurrent duplicates still produce one row", async () => {
    const { db, rows } = table();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => recordTutorialStepWith(db, { ...base, step: "photo_taken" })),
    );
    expect(results.filter((r) => r.counted)).toHaveLength(1);
    expect(rows.filter((r) => r.key.startsWith(FUNNEL_ROOT))).toHaveLength(1);
  });

  it("another session counts again", async () => {
    const { db } = table();
    await recordTutorialStepWith(db, { ...base, step: "catch_done" });
    expect(
      await recordTutorialStepWith(db, {
        ...base,
        sid: "11111111-2222-3333-4444-555555555555",
        step: "catch_done",
      }),
    ).toEqual({ counted: true });
  });

  it("stores no personal data: empty value, session id is hashed, no raw IP", async () => {
    const { db, rows } = table();
    await recordTutorialStepWith(db, { ...base, ipHash: "abc123", step: "signup_view" });
    for (const r of rows) {
      expect(r.key).not.toContain(SID);
      expect(r.value).toEqual({});
    }
    expect(rows.find((r) => r.key.startsWith(FUNNEL_RATE_ROOT))?.key).toBe(
      "funnel-rate:2026-10-03:ip:abc123:0",
    );
  });

  it("rate-limits one network per day and never throws", async () => {
    const { db, rows } = table();
    const r1 = await recordTutorialStepWith(db, { ...base, ipLimit: 2, step: "welcome_view" });
    const r2 = await recordTutorialStepWith(db, { ...base, ipLimit: 2, step: "questions_done" });
    const r3 = await recordTutorialStepWith(db, { ...base, ipLimit: 2, step: "tutorial_start" });
    expect([r1.counted, r2.counted, r3]).toEqual([true, true, { counted: false, reason: "rate" }]);
    expect(rows.filter((r) => r.key.startsWith(FUNNEL_ROOT))).toHaveLength(2);
    // 別の回線は数える
    expect(
      await recordTutorialStepWith(db, {
        ...base,
        ipHash: "other",
        ipLimit: 2,
        step: "tutorial_start",
      }),
    ).toEqual({ counted: true });
  });

  it("stops at the global daily cap", async () => {
    const { db } = table();
    await recordTutorialStepWith(db, { ...base, globalLimit: 1, step: "welcome_view" });
    expect(
      await recordTutorialStepWith(db, {
        ...base,
        sid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        globalLimit: 1,
        step: "welcome_view",
      }),
    ).toEqual({ counted: false, reason: "cap" });
  });

  it("rejects unknown steps and malformed session ids without writing", async () => {
    const { db, rows } = table();
    expect(await recordTutorialStepWith(db, { ...base, step: "email_entered" })).toEqual({
      counted: false,
      reason: "invalid",
    });
    expect(
      await recordTutorialStepWith(db, { ...base, sid: "x@y.com", step: "welcome_view" }),
    ).toEqual({ counted: false, reason: "invalid" });
    expect(rows).toHaveLength(0);
  });

  it("prunes old rate rows (2 days) and old funnel rows (120 days) on the first slot", async () => {
    const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    const { db, rows } = table([
      { key: "funnel-rate:2026-09-28:ip:x:0", updated_at: ago(5) },
      { key: "funnel:2026-05-01:welcome_view:ab", updated_at: ago(155) },
      { key: "funnel:2026-09-20:welcome_view:cd", updated_at: ago(13) },
    ]);
    await recordTutorialStepWith(db, { ...base, step: "welcome_view" });
    expect(
      rows.map((r) => r.key).filter((k) => k.includes("09-28") || k.includes("05-01")),
    ).toEqual([]);
    expect(rows.some((r) => r.key === "funnel:2026-09-20:welcome_view:cd")).toBe(true);
  });

  it("reports unavailable when counting fails (fail closed, no throw)", async () => {
    const broken = {
      from: () => ({
        select: () => ({ like: async () => ({ count: null, error: { message: "down" } }) }),
      }),
    } as unknown as BudgetDb;
    expect(await recordTutorialStepWith(broken, { ...base, step: "welcome_view" })).toEqual({
      counted: false,
      reason: "unavailable",
    });
  });
});

describe("createTutorialTracker（タブごとに1回だけ送る）", () => {
  function memoryStorage() {
    const m = new Map<string, string>();
    return {
      m,
      storage: {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
      },
    };
  }

  it("sends each step once per session with a stable session id", () => {
    const { storage, m } = memoryStorage();
    const send = vi.fn(async (_step: string, _sid: string) => ({ counted: true }));
    let n = 0;
    const track = createTutorialTracker({
      storage: () => storage,
      send,
      newId: () => `session-id-000000${n++}`,
    });
    expect(track("welcome_view")).toBe(true);
    expect(track("welcome_view")).toBe(false);
    expect(track("questions_done")).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((c) => c[1])).toEqual(["session-id-0000000", "session-id-0000000"]);
    expect(JSON.parse(m.get(FUNNEL_SENT_KEY)!)).toEqual(["welcome_view", "questions_done"]);
    expect(m.get(FUNNEL_SID_KEY)).toBe("session-id-0000000");
  });

  it("a reload in the same tab (new tracker, same storage) does not resend", () => {
    const { storage } = memoryStorage();
    const send = vi.fn(async () => undefined);
    const deps = { storage: () => storage, send, newId: () => "session-id-reload-01" };
    createTutorialTracker(deps)("tutorial_start");
    createTutorialTracker(deps)("tutorial_start");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("works (once per page) when storage throws, and swallows send failures", () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    const track = createTutorialTracker({
      storage: () => {
        throw new Error("blocked");
      },
      send,
      newId: () => "session-id-memory-01",
    });
    expect(track("photo_taken")).toBe(true);
    expect(track("photo_taken")).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores names that are not tutorial steps", () => {
    const send = vi.fn(async () => undefined);
    const track = createTutorialTracker({ storage: () => null, send, newId: () => "x".repeat(20) });
    expect(track("not_a_step" as (typeof TUTORIAL_STEPS)[number])).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
