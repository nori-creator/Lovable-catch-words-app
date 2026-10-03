import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { APP_EVENTS, AppEventInput } from "./metrics.functions";
import { LATENCY_EVENTS, MEMBER_FUNNEL_EVENTS } from "./funnel-events";

describe("logAppEvent の許可リスト（ベータの計測）", () => {
  it("accepts every signed-in funnel step", () => {
    for (const kind of MEMBER_FUNNEL_EVENTS) {
      expect(APP_EVENTS).toContain(kind);
      expect(AppEventInput.parse({ kind })).toEqual({ kind });
    }
  });

  it("keeps the earlier kinds (KPI markers, save/background failures)", () => {
    for (const kind of [
      "app_open",
      "first_catch",
      "session_start",
      "save_failed_catch",
      "bg_failed_tts",
    ])
      expect(APP_EVENTS).toContain(kind);
  });

  it("rejects kinds that are not whitelisted", () => {
    expect(() => AppEventInput.parse({ kind: "scan_detect" })).toThrow(); // AI の枠の種類は書かせない
    expect(() => AppEventInput.parse({ kind: "headword:蘋果" })).toThrow();
    expect(() => AppEventInput.parse({})).toThrow();
  });

  it("accepts latency only on latency events, as a bounded integer", () => {
    expect(LATENCY_EVENTS).toEqual(["candidates_shown"]);
    expect(AppEventInput.parse({ kind: "candidates_shown", ms: 2300 })).toEqual({
      kind: "candidates_shown",
      ms: 2300,
    });
    expect(() => AppEventInput.parse({ kind: "shutter", ms: 10 })).toThrow();
    expect(() => AppEventInput.parse({ kind: "candidates_shown", ms: -1 })).toThrow();
    expect(() => AppEventInput.parse({ kind: "candidates_shown", ms: 1.5 })).toThrow();
    expect(() => AppEventInput.parse({ kind: "candidates_shown", ms: 600_001 })).toThrow();
  });
});
