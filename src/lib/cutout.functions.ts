import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertWithinDailyCap, isProUser, logUsage } from "./ai-provider.server";
import { MAX_REWARDED_PER_DAY, cutoutAllowance, startOfAppDay } from "./plan-limits";

/** 今日（日本時間）の切り抜きの残り。表が読めなければ null（止めない）。 */
async function cutoutAllowanceFor(userId: string) {
  try {
    if (await isProUser(userId))
      return cutoutAllowance({ isPro: true, usedToday: 0, rewardedToday: 0 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = startOfAppDay(new Date()).toISOString();
    const count = async (kind: string) => {
      const r = await supabaseAdmin
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", kind)
        .gte("created_at", since);
      if (r.error) throw r.error;
      return r.count ?? 0;
    };
    const [server, local, rewardedToday] = await Promise.all([
      count("removebg"),
      count("cutout_local"),
      count("rewarded_cutout"),
    ]);
    return cutoutAllowance({ isPro: false, usedToday: server + local, rewardedToday });
  } catch {
    return null;
  }
}

/**
 * 端末の中で切り抜く時（remove.bg の鍵が無い時）の1枚。remove.bg と同じ枠で数える。
 * 数えられない時は通す（撮影を止めない）。
 */
export const consumeLocalCutout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const allowance = await cutoutAllowanceFor(userId);
    if (allowance && !allowance.allowed) return { allowed: false as const };
    await logUsage(supabase, userId, "cutout_local");
    return { allowed: true as const };
  });

/**
 * ごほうび広告を見終わった（切り抜きを今日1枚追加）。
 *
 * **注意:** いまは端末の「見終わった」をそのまま信じる。AdMob には、見終わったことを
 * Google から直接サーバへ知らせる仕組み（サーバー側認証 = SSV）があり、広告を入れる時に
 * それへ差し替える。それまでの穴は1日 `MAX_REWARDED_PER_DAY` 回で止まる。
 */
export const claimRewardedCutout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = startOfAppDay(new Date()).toISOString();
    const r = await supabaseAdmin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "rewarded_cutout")
      .gte("created_at", since);
    if ((r.count ?? 0) >= MAX_REWARDED_PER_DAY) return { ok: false as const };
    await logUsage(supabase, userId, "rewarded_cutout");
    return { ok: true as const, allowance: await cutoutAllowanceFor(userId) };
  });

const Input = z.object({
  // Same 8MB base64 cap as detectScan.
  imageBase64: z.string().min(100).max(8_000_000),
});

/**
 * Professional cutout via remove.bg (roadmap B2: 最速で精度の高いもの).
 * Enabled by setting REMOVE_BG_API_KEY in Lovable secrets — without the key
 * this returns { available: false } and the client keeps the free in-browser
 * pipeline (@imgly). Paid per image, so it gets its own tight daily cap.
 */
export const removeBackgroundApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ context, data }) => {
    const key = process.env.REMOVE_BG_API_KEY;
    if (!key) return { available: false as const, image: null };

    const { supabase, userId } = context;
    await assertWithinDailyCap(userId, "removebg");
    // 無料は1日3枚（オーナー決定 2026-09-28、`plan-limits.ts`）。数えられない時は
    // 止めない側に倒す（切り抜きは撮影の一部なので、数える表の故障で撮影を止めない）。
    const allowance = await cutoutAllowanceFor(userId);
    if (allowance && !allowance.allowed) {
      return { available: true as const, image: null, limit: "free_daily" as const };
    }

    const b64 = data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_file_b64: b64,
        // "auto" = full resolution (1 credit). REMOVE_BG_SIZE=preview uses the
        // free/cheap 0.25MP tier — fine for sticker-size cutouts.
        size: process.env.REMOVE_BG_SIZE ?? "auto",
        format: "png",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`remove.bg failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    await logUsage(supabase, userId, "removebg");

    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { available: true as const, image: `data:image/png;base64,${btoa(binary)}` };
  });
