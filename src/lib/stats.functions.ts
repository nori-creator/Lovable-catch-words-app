import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { countStreak } from "@/lib/streak";

export type UserStats = {
  xp: number;
  level: number;
  /**
   * **撮った**日が何日続いているか。
   * 以前はこれを単に `streak` と呼んでいたが、要望の「連続何日」は
   * **復習**のほうを指していた。名前で取り違えるので、両方を別の欄で持つ。
   */
  capture_streak: number;
  /** **復習した**日が何日続いているか(`review_history` を数える)。 */
  review_streak: number;
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

    const [stickersRes, reviewsDueRes, reviewsAllRes, questsRes, historyRes] = await Promise.all([
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
      // **復習の連続と「今日やった数」はここだけを見る。**
      // `reviews.last_reviewed_at` は1枚につき1行しか持たないので、
      // 同じ日に2回やっても1回に潰れる。1日の上限
      // (`reviews.functions.ts`)は `review_history` を数えているので、
      // 別の出所で数えると**同じ「今日の復習」が画面と上限で食い違う**。
      supabase
        .from("review_history")
        .select("reviewed_at")
        .eq("user_id", userId)
        .order("reviewed_at", { ascending: false })
        .limit(3000),
    ]);

    const stickers = stickersRes.data ?? [];
    const reviewsAll = reviewsAllRes.data ?? [];
    const quests = questsRes.data ?? [];

    // **先に台北の暦日へ落としてから数える。** 日にちの計算に時差を
    // 持ち込まないための決まりごと(`lib/streak.ts` に理由)。
    const today = taipeiDateString(new Date());
    const history = historyRes.data ?? [];
    const captureStreak = countStreak(
      stickers.map((s) => taipeiDateString(new Date(s.created_at))),
      today,
    );
    const reviewStreak = countStreak(
      history.map((h) => taipeiDateString(new Date(h.reviewed_at))),
      today,
    );
    const reviewsDoneToday = history.filter(
      (h) => taipeiDateString(new Date(h.reviewed_at)) === today,
    ).length;

    const xpFromStickers = stickers.length * 10;
    const xpFromReviews = reviewsAll.reduce((sum, r) => sum + (r.last_score ?? 0) * 2, 0);
    const xpFromQuests = quests.reduce((sum, q) => sum + (q.reward_xp ?? 0), 0);
    const xp = xpFromStickers + xpFromReviews + xpFromQuests;
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1);

    return {
      xp,
      level,
      capture_streak: captureStreak,
      review_streak: reviewStreak,
      captured_total: stickers.length,
      reviews_due: reviewsDueRes.count ?? 0,
      reviews_done_today: reviewsDoneToday,
    };
  });
