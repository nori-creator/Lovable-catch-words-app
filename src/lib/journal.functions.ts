import { createServerFn } from "@tanstack/react-start";
import { internalFailure } from "./safe-error";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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

/**
 * **打った日記をそのまま保存する**（オーナー指示 2026-09-28「日記はユーザーが
 * タイプしたものが…表示される」）。添削は持たない — AI を
 * 通さず、本人の文を本人の字体で見せるための保存。添削済みの列には触らない
 * （`upsert` は渡した列だけを書き換える）。
 *
 * 日付は本棚の本の「その日」。未来の日には書けない（台湾時間の今日まで）。
 */
const DiaryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().max(4000),
});

export const saveMyDiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DiaryInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
    if (data.date > today) throw new Error("未来の日の日記は書けません");
    const text = data.text.trim();
    const { data: row, error } = await supabase
      .from("journal_entries")
      .upsert(
        { user_id: userId, entry_date: data.date, user_draft: text || null },
        { onConflict: "user_id,entry_date" },
      )
      .select("*")
      .single();
    if (error) throw internalFailure("journal", error, "日記を保存できませんでした");
    return toJournalEntry(row);
  });

/**
 * **その月の日記**（ホームの本棚の本を開いた時。オーナー指示 2026-09-29「ホームのアルバムの
 * 一番上に本棚を一列作って。またアルバムを開くとその月の最初のページが開くようにして」）。
 * 見開きの右ページに、本人が打った日記（無ければ添削・昔の日記）を載せる。
 */
const MonthInput = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export const listMyDiaryMonth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MonthInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [y, m] = data.month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const { data: rows, error } = await supabase
      .from("journal_entries")
      .select("entry_date, user_draft, correction, body_zh")
      .eq("user_id", userId)
      .gte("entry_date", `${data.month}-01`)
      .lt("entry_date", `${next}-01`)
      .order("entry_date", { ascending: true })
      .limit(31);
    if (error) throw internalFailure("journal", error, "日記を読み込めませんでした");
    return (rows ?? []).map(
      (r: {
        entry_date: string;
        user_draft: string | null;
        correction: string | null;
        body_zh: string | null;
      }) => ({
        date: r.entry_date,
        text: r.user_draft ?? r.correction ?? r.body_zh ?? "",
      }),
    );
  });
