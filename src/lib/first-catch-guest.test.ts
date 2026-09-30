import { describe, expect, it, vi } from "vitest";
import {
  GUEST_GLOBAL_LIMIT_PER_DAY,
  GUEST_IP_LIMIT_PER_DAY,
  guestClientIp,
  isSameOriginRequest,
  reserveGuestSlot,
} from "./first-catch-guest.server";
import { isGuestRefusal } from "./first-catch-services";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function budget() {
  const keys = new Set<string>();
  const db = {
    from: () => ({
      select: () => ({
        like: async (_: string, prefix: string) => ({
          count: [...keys].filter((key) => key.startsWith(prefix.slice(0, -1))).length,
          error: null,
        }),
      }),
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
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => reserveGuestSlot(db, "first-catch-budget:test:global:", 5)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(keys.size).toBe(5);
  });
  it("stops when the quota cannot be checked", async () => {
    const db = {
      from: () => ({
        select: () => ({ like: vi.fn(async () => ({ count: null, error: new Error("offline") })) }),
      }),
    } as unknown as SupabaseClient<Database>;
    await expect(reserveGuestSlot(db, "first-catch-budget:test:global:", 5)).rejects.toThrow(
      "FIRST_CATCH_AI_UNAVAILABLE",
    );
  });
});

describe("guest gate", () => {
  it("one tutorial (suggest + card + lesson + a retry) fits well inside a day's cap", () => {
    expect(GUEST_IP_LIMIT_PER_DAY).toBeGreaterThanOrEqual(24);
    expect(GUEST_GLOBAL_LIMIT_PER_DAY).toBeGreaterThan(GUEST_IP_LIMIT_PER_DAY);
  });
  it("reads the caller address from whichever header the host sets, never a shared 'unknown'", () => {
    expect(guestClientIp(new Headers({ "cf-connecting-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(guestClientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }))).toBe("5.6.7.8");
    expect(guestClientIp(new Headers())).toBeNull();
  });
  it("accepts same-origin and proxied-host requests, refuses a foreign page", () => {
    const at = (headers: Record<string, string>) =>
      new Request("http://internal/_serverFn/x", { method: "POST", headers });
    expect(isSameOriginRequest(at({}))).toBe(true);
    expect(isSameOriginRequest(at({ origin: "http://internal" }))).toBe(true);
    expect(
      isSameOriginRequest(at({ origin: "https://app.example", "x-forwarded-host": "app.example" })),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        at({ origin: "https://evil.example", "x-forwarded-host": "app.example" }),
      ),
    ).toBe(false);
  });
  it("falls back to the per-device account only for gate refusals, not for real AI errors", () => {
    for (const code of ["FIRST_CATCH_LIMIT", "FIRST_CATCH_ORIGIN", "FIRST_CATCH_AI_UNAVAILABLE"])
      expect(isGuestRefusal(new Error(code))).toBe(true);
    expect(isGuestRefusal(new Error("Invalid input"))).toBe(false);
    expect(isGuestRefusal("FIRST_CATCH_LIMIT")).toBe(false);
  });
});
