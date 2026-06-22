import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserStats = {
  xp: number;
  level: number;
  streak: number;
  captured_total: number;
  reviews_due: number;
  reviews_done_today: number;
};

function taipeiDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d);
}

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserStats> => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();

    const [stickersRes, reviewsDueRes, reviewsAllRes, questsRes] = await Promise.all([
      supabase
        .from("stickers")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("due_at", nowIso),
      supabase
        .from("reviews")
        .select("id, last_score, last_reviewed_at")
        .eq("user_id", userId)
        .not("last_reviewed_at", "is", null),
      supabase
        .from("daily_quests")
        .select("reward_xp, completed_at")
        .eq("user_id", userId)
        .not("completed_at", "is", null),
    ]);

    const stickers = stickersRes.data ?? [];
    const reviewsAll = reviewsAllRes.data ?? [];
    const quests = questsRes.data ?? [];

    // Streak: consecutive Taipei-days with at least one sticker
    const daysSet = new Set(stickers.map((s) => taipeiDateString(new Date(s.created_at))));
    let streak = 0;
    const cursor = new Date();
    // If today not present but yesterday is, streak still counts from yesterday
    const today = taipeiDateString(cursor);
    if (!daysSet.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
    for (;;) {
      const key = taipeiDateString(cursor);
      if (daysSet.has(key)) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      } else break;
      if (streak > 365) break;
    }

    const todayKey = today;
    const reviewsDoneToday = reviewsAll.filter(
      (r) => r.last_reviewed_at && taipeiDateString(new Date(r.last_reviewed_at)) === todayKey,
    ).length;

    const xpFromStickers = stickers.length * 10;
    const xpFromReviews = reviewsAll.reduce((sum, r) => sum + (r.last_score ?? 0) * 2, 0);
    const xpFromQuests = quests.reduce((sum, q) => sum + (q.reward_xp ?? 0), 0);
    const xp = xpFromStickers + xpFromReviews + xpFromQuests;
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1);

    return {
      xp,
      level,
      streak,
      captured_total: stickers.length,
      reviews_due: reviewsDueRes.count ?? 0,
      reviews_done_today: reviewsDoneToday,
    };
  });
