import { describe, expect, it, vi } from "vitest";
import { reserveGuestSlot } from "./first-catch-guest.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function budget() {
  const keys = new Set<string>();
  const db = {
    from: () => ({
      select: () => ({ like: async (_: string, prefix: string) => ({ count: [...keys].filter(key => key.startsWith(prefix.slice(0, -1))).length, error: null }) }),
      insert: async ({ key }: { key: string }) => {
        await Promise.resolve(); // Two concurrent callers can read the same count.
        if (keys.has(key)) return { error: { code: "23505" } };
        keys.add(key);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient<Database>;
  return { db, keys };
}
describe("guest AI reservation", () => {
  it("never spends more paid calls than the cap under concurrent requests", async () => {
    const { db, keys } = budget();
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveGuestSlot(db, "first-catch-budget:test:global:", 5)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(5);
    expect(keys.size).toBe(5);
  });
  it("stops when the quota cannot be checked", async () => {
    const db = { from: () => ({ select: () => ({ like: vi.fn(async () => ({ count: null, error: new Error("offline") })) }) }) } as unknown as SupabaseClient<Database>;
    await expect(reserveGuestSlot(db, "first-catch-budget:test:global:", 5)).rejects.toThrow("FIRST_CATCH_AI_UNAVAILABLE");
  });
});
