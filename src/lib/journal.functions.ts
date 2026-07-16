import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertWithinDailyCap, getAi, isProUser, logUsage } from "./ai-provider.server";

export type NativePhrase = { zh: string; ja: string; note: string };

export type JournalEntry = {
  id: string;
  entry_date: string;
  /** Legacy full model-diary text (feature removed per roadmap B6; kept for old entries). */
  body_zh: string | null;
  body_ja: string | null;
  user_draft: string | null;
  correction: string | null;
  feedback_ja: string | null;
  native_phrases: NativePhrase[] | null;
  used_sticker_ids: string[];
  created_at: string;
};

/**
 * Rows come back from a `select("*")`; the generated DB types may predate the
 * native_phrases migration, so normalize the column here instead of casting.
 */
function toJournalEntry(row: unknown): JournalEntry {
  const r = row as JournalEntry & { native_phrases?: unknown };
  const phrases = Array.isArray(r.native_phrases)
    ? (r.native_phrases as unknown[])
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p) => ({
          zh: typeof p.zh === "string" ? p.zh : "",
          ja: typeof p.ja === "string" ? p.ja : "",
          note: typeof p.note === "string" ? p.note : "",
        }))
        .filter((p) => p.zh)
    : null;
  return { ...r, native_phrases: phrases };
}

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
    return (data ?? []).map(toJournalEntry);
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

const CorrectInput = z.object({ draft: z.string().min(1).max(2000) });

export const correctMyJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CorrectInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertWithinDailyCap(userId, "correction");
    const { today, stickers } = await getTodaysCaptures(supabase, userId);

    const ai = getAi();

    // Roadmap B6: no full model-diary. Correction + "ネイティブならこう言う"
    // phrases + an explanation of the sentence patterns actually used.
    const Schema = z.object({
      correction: z.string().min(1),
      feedback_ja: z.string().min(1),
      native_phrases: z
        .array(z.object({ zh: z.string(), ja: z.string(), note: z.string() }))
        .min(1)
        .max(3),
    });
    const pro = await isProUser(userId);
    const richModel = pro ? ai.modelRichPremium : ai.modelRich;
    const { experimental_output } = await generateText({
      model: ai.gateway(richModel),
      experimental_output: Output.object({ schema: Schema }),
      prompt:
        `あなたは台湾華語(繁體字)のネイティブ作文添削者。学習者が今日の日記を書いてくれました。\n` +
        `今日のキャプチャ参考:\n${describeCaptures(stickers)}\n\n` +
        `学習者の文章:\n"""\n${data.draft}\n"""\n\n` +
        `次を出力:\n` +
        `- correction: 自然な台湾華語(繁體字)に直した完全版。意図はできるだけ尊重。\n` +
        `- feedback_ja: どこをなぜ直したかに加え、この日記で使った(または使うべきだった)文型・語順の「型」を日本語で3〜5項目、優しく解説。\n` +
        `- native_phrases: 学習者が言いたかった気持ちを、台湾のネイティブが実際の会話で使う自然なフレーズ・チャンクで2〜3個。各要素は zh(繁體字フレーズ)、ja(日本語訳)、note(いつ・どんな気持ちで使うか、よく一緒に使う語)。`,
    });

    const baseRow = {
      user_id: userId,
      entry_date: today,
      user_draft: data.draft,
      correction: experimental_output.correction,
      feedback_ja: experimental_output.feedback_ja,
      used_sticker_ids: stickers.map((s: any) => s.id),
      model: richModel,
    };
    // Try with native_phrases first; retry without it if the column hasn't
    // been migrated yet, so correction never breaks on a stale schema.
    let inserted: JournalEntry | null = null;
    {
      const { data: row, error } = await supabase
        .from("journal_entries")
        .upsert(
          { ...baseRow, native_phrases: experimental_output.native_phrases as never },
          { onConflict: "user_id,entry_date" },
        )
        .select("*")
        .single();
      if (!error) {
        inserted = toJournalEntry(row);
      } else if (/native_phrases/.test(error.message)) {
        const { data: row2, error: e2 } = await supabase
          .from("journal_entries")
          .upsert(baseRow, { onConflict: "user_id,entry_date" })
          .select("*")
          .single();
        if (e2) throw new Error(e2.message);
        inserted = { ...toJournalEntry(row2), native_phrases: experimental_output.native_phrases };
      } else {
        throw new Error(error.message);
      }
    }
    await logUsage(supabase, userId, "correction");
    return inserted as JournalEntry;
  });
