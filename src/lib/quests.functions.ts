import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateStructured, getAi, logUsage } from "./ai-provider.server";

export type DailyQuest = {
  id: string;
  quest_date: string;
  category_key: string | null;
  target_word: string;
  hint_ja: string;
  reward_xp: number;
  completed_at: string | null;
  sticker_id: string | null;
};

async function todayInTaipei(): Promise<string> {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" });
  return fmt.format(new Date());
}

export const getTodayQuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = await todayInTaipei();
    const { data: existing, error } = await supabase
      .from("daily_quests")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_date", today)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (existing && existing.length > 0) return existing as DailyQuest[];

    // Generate 3 quests via AI
    const ai = getAi();
    const Schema = z.object({
      quests: z.array(z.object({
        category_key: z.string(),
        target_word: z.string(),
        hint_ja: z.string(),
      })).length(3),
    });
    let quests: Array<{ category_key: string; target_word: string; hint_ja: string }>;
    try {
      const out = await generateStructured({
        model: ai.gateway(ai.modelFast),
        schema: Schema,
        prompt: `今日の台湾華語デイリークエスト3つを生成して。街で出会いやすい身近な対象物の華語単語（果物・飲み物・乗り物・店看板など）。各クエスト: category_key, target_word(繁体字), hint_ja(日本語で「街で◯◯を見つけて撮ろう」風)。必ずJSONスキーマに従ってquests配列を3件返す。`,
      });
      quests = out.quests;
      await logUsage(supabase, userId, "quests");
    } catch {
      // Fallback if AI returns malformed structure
      quests = [
        { category_key: "food", target_word: "珍珠奶茶", hint_ja: "街でタピオカミルクティーを見つけて撮ろう" },
        { category_key: "transport", target_word: "捷運", hint_ja: "街でMRT（捷運）の標識を撮ろう" },
        { category_key: "sign", target_word: "便利商店", hint_ja: "街でコンビニの看板を撮ろう" },
      ];
    }
    const rows = quests.map((q) => ({
      user_id: userId,
      quest_date: today,
      category_key: q.category_key,
      target_word: q.target_word,
      hint_ja: q.hint_ja,
      reward_xp: 20,
    }));
    const { data: inserted, error: insErr } = await supabase
      .from("daily_quests").insert(rows).select("*");
    if (insErr) throw new Error(insErr.message);
    return inserted as DailyQuest[];
  });

export const completeQuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ quest_id: z.string().uuid(), sticker_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("daily_quests")
      .update({ completed_at: new Date().toISOString(), sticker_id: data.sticker_id ?? null })
      .eq("id", data.quest_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
