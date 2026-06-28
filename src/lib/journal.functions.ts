import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = "google/gemini-3-flash-preview";

export type JournalEntry = {
  id: string;
  entry_date: string;
  body_zh: string | null;
  body_ja: string | null;
  user_draft: string | null;
  correction: string | null;
  feedback_ja: string | null;
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

async function getTodaysCaptures(supabase: any, userId: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" });
  const today = fmt.format(new Date());
  const start = new Date(`${today}T00:00:00+08:00`).toISOString();
  const { data, error } = await supabase
    .from("stickers")
    .select("id, caption, location_name, created_at, word:words(headword, meaning_ja)")
    .eq("user_id", userId)
    .gte("created_at", start)
    .order("created_at", { ascending: true })
    .limit(12);
  if (error) throw new Error(error.message);
  return { today, stickers: data ?? [] };
}

function describeCaptures(stickers: any[]) {
  return stickers
    .map((s) => {
      const t = new Date(s.created_at).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Taipei",
      });
      const head = s.word?.headword ?? "?";
      const meaning = s.word?.meaning_ja ?? "";
      const where = s.location_name ? `@${s.location_name}` : "";
      const note = s.caption ? `「${s.caption}」` : "";
      return `${t} ${head}(${meaning}) ${where} ${note}`.trim();
    })
    .join("\n");
}

export const generateTodayJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { today, stickers } = await getTodaysCaptures(supabase, userId);
    if (stickers.length === 0) {
      throw new Error("今日まだ写真がありません。撮ってから日記を生成しましょう。");
    }

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(key);

    const Schema = z.object({
      body_zh: z.string().min(10),
      body_ja: z.string().min(10),
    });
    const { experimental_output } = await generateText({
      model: gateway(MODEL),
      experimental_output: Output.object({ schema: Schema }),
      prompt:
        `あなたは台湾華語の作文の先生。学習者の今日のキャプチャから、その日の流れが伝わる自然な「模範」日記を書いてください。\n\n` +
        `今日のキャプチャ（時刻 単語(意味) @場所 「ひとことメモ」）:\n${describeCaptures(stickers)}\n\n` +
        `条件:\n- 4〜6文、繁体字、台湾華語の口語\n- 時間の流れに沿って、場所やひとことメモも自然に反映\n- できれば上記の単語を使う\n- body_zh と body_ja(自然な日本語訳) をJSONで返す`,
    });

    const { data: inserted, error: iErr } = await supabase
      .from("journal_entries")
      .upsert(
        {
          user_id: userId,
          entry_date: today,
          body_zh: experimental_output.body_zh,
          body_ja: experimental_output.body_ja,
          used_sticker_ids: stickers.map((s: any) => s.id),
          model: MODEL,
        },
        { onConflict: "user_id,entry_date" },
      )
      .select("*")
      .single();
    if (iErr) throw new Error(iErr.message);
    return inserted as JournalEntry;
  });

const CorrectInput = z.object({ draft: z.string().min(1).max(2000) });

export const correctMyJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CorrectInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { today, stickers } = await getTodaysCaptures(supabase, userId);

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(key);

    const Schema = z.object({
      correction: z.string().min(1),
      feedback_ja: z.string().min(1),
    });
    const { experimental_output } = await generateText({
      model: gateway(MODEL),
      experimental_output: Output.object({ schema: Schema }),
      prompt:
        `あなたは台湾華語(繁體字)のネイティブ作文添削者。学習者が今日の日記を書いてくれました。\n` +
        `今日のキャプチャ参考:\n${describeCaptures(stickers)}\n\n` +
        `学習者の文章:\n"""\n${data.draft}\n"""\n\n` +
        `次を出力:\n- correction: 自然な台湾華語(繁體字)に直した完全版。意図はできるだけ尊重。\n- feedback_ja: どこをなぜ直したか、文法/語彙/語感のポイントを日本語で3〜5項目、優しく解説。`,
    });

    const { data: inserted, error: iErr } = await supabase
      .from("journal_entries")
      .upsert(
        {
          user_id: userId,
          entry_date: today,
          user_draft: data.draft,
          correction: experimental_output.correction,
          feedback_ja: experimental_output.feedback_ja,
          used_sticker_ids: stickers.map((s: any) => s.id),
          model: MODEL,
        },
        { onConflict: "user_id,entry_date" },
      )
      .select("*")
      .single();
    if (iErr) throw new Error(iErr.message);
    return inserted as JournalEntry;
  });
