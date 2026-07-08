import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * KPI events (roadmap §2/§3): funnel markers recorded into the existing
 * usage_events table — no new tables. The client dedupes (localStorage);
 * the server just accepts a whitelisted kind.
 */

const APP_EVENTS = ["app_open", "onboarding_done", "first_scan", "first_catch"] as const;

export const logAppEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kind: z.enum(APP_EVENTS) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("usage_events").insert({ user_id: userId, kind: data.kind });
    return { ok: true };
  });

/**
 * §7: median scan latencies over the caller's last 20 measured events,
 * shown in the settings developer panel against the spec targets
 * (detect ≤2.5s, tap→audio ≤1.0s).
 */
export const getMyScanMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const median = (xs: number[]): number | null => {
      if (xs.length === 0) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };

    const { data: detectRows, error } = await supabase
      .from("scan_events")
      .select("detect_ms, tap_to_audio_ms, created_at")
      .eq("user_id", userId)
      .not("detect_ms", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) {
      // Column not migrated yet — report empty rather than erroring settings.
      return { detect_ms_median: null, tap_to_audio_ms_median: null, samples: 0 };
    }
    // One scan inserts one row per detected item; collapse near-identical
    // detect_ms values (same scan) by taking distinct values in order.
    const detects: number[] = [];
    const audios: number[] = [];
    for (const r of detectRows ?? []) {
      if (typeof r.detect_ms === "number" && (detects.length === 0 || detects[detects.length - 1] !== r.detect_ms)) {
        detects.push(r.detect_ms);
      }
      if (typeof r.tap_to_audio_ms === "number") audios.push(r.tap_to_audio_ms);
    }
    return {
      detect_ms_median: median(detects.slice(0, 20)),
      tap_to_audio_ms_median: median(audios.slice(0, 20)),
      samples: Math.min(20, detects.length),
    };
  });
