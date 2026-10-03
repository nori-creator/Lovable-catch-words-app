import { describe, expect, it, vi } from "vitest";
import {
  GUEST_GLOBAL_LIMIT_PER_DAY,
  GUEST_IP_LIMIT_PER_DAY,
  guestClientIp,
  guestIpBucket,
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
    // 1回の体験は 3〜6 回。15 回でも撮り直しを含めて 2〜3 回通せる（断られても匿名の道へ）。
    expect(GUEST_IP_LIMIT_PER_DAY).toBeGreaterThanOrEqual(12);
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
  it("refuses a call without an Origin header (browsers always send one on POST)", () => {
    const req = new Request("http://internal/_serverFn/x", {
      method: "POST",
      headers: { "x-forwarded-host": "app.example", host: "internal" },
    });
    expect(isSameOriginRequest(req)).toBe(false);
  });
  it("falls back to the per-device account only for gate refusals, not for real AI errors", () => {
    for (const code of [
      "FIRST_CATCH_LIMIT",
      "FIRST_CATCH_TRIAL_FULL",
      "FIRST_CATCH_ORIGIN",
      "FIRST_CATCH_AI_UNAVAILABLE",
    ])
      expect(isGuestRefusal(new Error(code))).toBe(true);
    expect(isGuestRefusal(new Error("Invalid input"))).toBe(false);
    expect(isGuestRefusal("FIRST_CATCH_LIMIT")).toBe(false);
  });
});

describe("guestIpBucket（数える単位）", () => {
  it("puts every address of one IPv6 /64 into the same bucket", () => {
    const a = guestIpBucket("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
    expect(a).toBe("2001:db8:1234:5678::/64");
    expect(guestIpBucket("2001:0db8:1234:5678::1")).toBe(a);
    expect(guestIpBucket("2001:DB8:1234:5678:ffff::")).toBe(a);
    expect(guestIpBucket("[2001:db8:1234:5678::9]:443")).toBe(a);
    expect(guestIpBucket("2001:db8:1234:5678::9%eth0")).toBe(a);
  });
  it("keeps different /64s apart", () => {
    expect(guestIpBucket("2001:db8:1234:5679::1")).not.toBe(guestIpBucket("2001:db8:1234:5678::1"));
    expect(guestIpBucket("::1")).toBe("0:0:0:0::/64");
  });
  it("leaves IPv4 alone (including the IPv4-mapped IPv6 form and a port)", () => {
    expect(guestIpBucket("1.2.3.4")).toBe("1.2.3.4");
    expect(guestIpBucket("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(guestIpBucket("1.2.3.4:5678")).toBe("1.2.3.4");
    expect(guestIpBucket("1.2.3.4")).not.toBe(guestIpBucket("1.2.3.5"));
  });
  it("does not crash on junk (counts it as it is)", () => {
    expect(guestIpBucket("not-an-ip")).toBe("not-an-ip");
    expect(guestIpBucket("1:2:3:4:5:6:7:8:9")).toBe("1:2:3:4:5:6:7:8:9");
  });
});

describe("guest budget limits", () => {
  it("15 per address per day (監査 2026-10-03, was 30), 1000 for everyone", () => {
    expect(GUEST_IP_LIMIT_PER_DAY).toBe(15);
    expect(GUEST_GLOBAL_LIMIT_PER_DAY).toBe(1000);
  });
});
