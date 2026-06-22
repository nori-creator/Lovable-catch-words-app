import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = "google/gemini-3-flash-preview";

export type JournalEntry = {
  id: string;
  entry_date: string;
  body_zh: string;
  body_ja: string;
  used_sticker_ids: string[];
  created_at: string;
};

export const listJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as JournalEntry[];
  });

export const generateTodayJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Get today's captured stickers (with words)
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" });
    const today = fmt.format(new Date());
    const start = new Date(`${today}T00:00:00+08:00`).toISOString();
    const { data: stickers, error: sErr } = await supabase
      .from("stickers")
      .select("id, word:words(headword, meaning_ja)")
      .eq("user_id", userId)
      .gte("created_at", start)
      .limit(8);
    if (sErr) throw new Error(sErr.message);
    if (!stickers || stickers.length === 0) {
      throw new Error("今日まだステッカーがありません。撮ってから日記を生成しましょう。");
    }

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(key);

    const words = stickers.map((s: any) => `${s.word?.headword}(${s.word?.meaning_ja})`).join("、");
    const Schema = z.object({
      body_zh: z.string().min(10),
      body_ja: z.string().min(10),
    });
    const { experimental_output } = await generateText({
      model: gateway(MODEL),
      experimental_output: Output.object({ schema: Schema }),
      prompt: `今日キャッチした語: ${words}\n\nこれらの語を全て自然に使った3〜5文の台湾華語の短い日記(body_zh)と、その日本語訳(body_ja)をJSONで返して。繁体字、台湾華語の口語表現を使うこと。`,
    });

    const { data: inserted, error: iErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: today,
        body_zh: experimental_output.body_zh,
        body_ja: experimental_output.body_ja,
        used_sticker_ids: stickers.map((s: any) => s.id),
        model: MODEL,
      })
      .select("*")
      .single();
    if (iErr) throw new Error(iErr.message);
    return inserted as JournalEntry;
  });
