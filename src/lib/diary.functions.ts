import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = "google/gemini-3-flash-preview";

export type DiaryRow = {
  id: string;
  entry_date: string;
  body_target: string | null;
  body_translation: string | null;
  one_liner: string | null;
  mood: string | null;
  status: "draft" | "final";
  visibility: "private" | "friends" | "public";
  sticker_ids: string[];
  place_label: string | null;
  generated_by_ai: boolean;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const DateInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

function rangeForDate(date: string): { start: string; end: string } {
  // [date 00:00Z, date+1 00:00Z)
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export const getDiary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DateInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<DiaryRow | null> => {
    const { supabase, userId } = context;
    const date = data.date ?? todayStr();
    const { data: row, error } = await supabase
      .from("diaries")
      .select(
        "id, entry_date, body_target, body_translation, one_liner, mood, status, visibility, sticker_ids, place_label, generated_by_ai",
      )
      .eq("user_id", userId)
      .eq("entry_date", date)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as DiaryRow | null) ?? null;
  });

const DiarySchema = z.object({
  body_target: z.string().min(1),
  body_translation: z.string().min(1),
});

export const generateDiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DateInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<DiaryRow> => {
    const { supabase, userId } = context;
    const date = data.date ?? todayStr();

    // プロフィール（プレミアム判定・言語・レベル）
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_premium, target_language, level_goal, native_language")
      .eq("id", userId)
      .maybeSingle();
    const isPremium = profile?.is_premium ?? false;
    const targetLanguage = profile?.target_language ?? "zh-TW";
    const levelGoal = profile?.level_goal ?? "TOCFL-2";

    // その日のスタンプ
    const { start, end } = rangeForDate(date);
    const { data: stickers, error: sErr } = await supabase
      .from("stickers")
      .select("id, location_name, created_at, words(headword, meaning_ja, level, category_key)")
      .eq("user_id", userId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true });
    if (sErr) throw new Error(sErr.message);
    const rows = (stickers ?? []) as Array<{
      id: string;
      location_name: string | null;
      created_at: string;
      words: { headword: string; meaning_ja: string; level: string | null; category_key: string | null } | null;
    }>;
    if (rows.length === 0) {
      throw new Error("この日のステッカーがまだありません。まず街でひとつキャッチしましょう。");
    }

    const caught = rows.filter((r) => r.words).map((r) => r.words!);
    const places = Array.from(new Set(rows.map((r) => r.location_name).filter((x): x is string => !!x)));
    const placeLabel = places[0] ?? null;
    const stickerIds = rows.map((r) => r.id);
    const wordList = caught.map((w) => `「${w.headword}」(${w.meaning_ja})`).join("、");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const isTw = targetLanguage === "zh-TW";
    const langName = isTw ? "台湾華語（台湾教育部準拠の繁体字）" : targetLanguage;

    function makerPrompt(retryNote = "") {
      return `あなたは語学学習者の振り返り日記を書くアシスタントです。
今日（${date}${placeLabel ? `・${placeLabel}` : ""}）学習者が街でキャッチした単語: ${wordList}
これらの体験をもとに、${langName}で短い1日の振り返り日記（3〜5文）を書いてください。
- 本文(body_target)は必ず${langName}。学習者目標レベル ${levelGoal}（TOCFL）に合わせ、平易で自然な文に
- 上記のキャッチした単語を自然に3つ以上含める
- それと別に、本文の日本語訳(body_translation)も書く
- 一人称の日記の語り口。誇張せず、その日の出来事と感情を素直に${retryNote ? `\n${retryNote}` : ""}`;
    }

    async function runMaker(retryNote = "") {
      const r = await generateText({
        model: gateway(MODEL),
        prompt: makerPrompt(retryNote),
        experimental_output: Output.object({ schema: DiarySchema }) as never,
      });
      const out = (r as unknown as { experimental_output?: z.infer<typeof DiarySchema> }).experimental_output;
      if (out) return out;
      return DiarySchema.parse(JSON.parse(r.text));
    }

    function countIncluded(body: string): number {
      return caught.filter((w) => body.includes(w.headword)).length;
    }

    let draft = await runMaker();
    let iterations = 1;
    let accepted = 0;

    // Checker（プレミアムのみ）: キャッチ語を3つ以上自然に含み、レベル適合かを検証→不合格なら1回書き直し
    const MAX = 2;
    if (isPremium) {
      const CheckerSchema = z.object({
        ok: z.boolean(),
        included_count: z.number().int().nonnegative(),
        reason: z.string().optional().default(""),
      });
      while (iterations < MAX) {
        const checkerPrompt = `次は${langName}の学習日記です。判定してください。
日記本文: ${draft.body_target}
キャッチした単語: ${wordList}
基準: (a) キャッチした単語を3つ以上自然に含む (b) 学習者レベル ${levelGoal} を大きく超える難語を多用していない
含まれている単語数(included_count)とともに、両方満たすなら ok=true を返す。`;
        const chk = await generateText({
          model: gateway(MODEL),
          prompt: checkerPrompt,
          experimental_output: Output.object({ schema: CheckerSchema }) as never,
        });
        const verdict =
          (chk as unknown as { experimental_output?: z.infer<typeof CheckerSchema> }).experimental_output ??
          { ok: countIncluded(draft.body_target) >= 3, included_count: countIncluded(draft.body_target), reason: "" };
        if (verdict.ok && countIncluded(draft.body_target) >= 3) {
          accepted = 1;
          break;
        }
        iterations++;
        draft = await runMaker("前回はキャッチした単語が不足していました。必ず3つ以上を自然に含めてください。");
      }
      if (accepted === 0 && countIncluded(draft.body_target) >= 3) accepted = 1;
    } else {
      accepted = countIncluded(draft.body_target) >= 3 ? 1 : 0;
    }

    // upsert
    const { data: up, error: upErr } = await supabase
      .from("diaries")
      .upsert(
        {
          user_id: userId,
          entry_date: date,
          body_target: draft.body_target,
          body_translation: draft.body_translation,
          sticker_ids: stickerIds,
          place_label: placeLabel,
          generated_by_ai: true,
          status: "draft",
        },
        { onConflict: "user_id,entry_date" },
      )
      .select(
        "id, entry_date, body_target, body_translation, one_liner, mood, status, visibility, sticker_ids, place_label, generated_by_ai",
      )
      .single();
    if (upErr) throw new Error(upErr.message);

    await supabase.from("ai_runs").insert({
      user_id: userId,
      loop: "diary",
      iterations,
      accepted,
      meta: { date, words: caught.length, premium: isPremium },
    });

    return up as unknown as DiaryRow;
  });

const UpdateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  body_target: z.string().max(4000).optional(),
  body_translation: z.string().max(4000).optional(),
  one_liner: z.string().max(500).optional(),
  mood: z.string().max(40).optional(),
  status: z.enum(["draft", "final"]).optional(),
  visibility: z.enum(["private", "friends", "public"]).optional(),
});

export const updateDiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ context, data }): Promise<DiaryRow> => {
    const { supabase, userId } = context;
    const date = data.date ?? todayStr();
    const patch: Record<string, unknown> = {};
    for (const k of ["body_target", "body_translation", "one_liner", "mood", "status", "visibility"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) throw new Error("更新する項目がありません");
    if (patch.body_target !== undefined || patch.body_translation !== undefined) patch.generated_by_ai = false;

    const { data: row, error } = await supabase
      .from("diaries")
      .update(patch as never)
      .eq("user_id", userId)
      .eq("entry_date", date)
      .select(
        "id, entry_date, body_target, body_translation, one_liner, mood, status, visibility, sticker_ids, place_label, generated_by_ai",
      )
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as DiaryRow;
  });

const ShareInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sticker_id: z.string().uuid(),
  visibility: z.enum(["private", "friends", "public"]).default("friends"),
});

// 日記を投稿化。日記抜粋を caption に入れ、posts へ直接 insert（createPost と同じ前提）。
export const shareDiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ShareInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const date = data.date ?? todayStr();
    const { data: diary, error } = await supabase
      .from("diaries")
      .select("body_target, body_translation, one_liner, visibility")
      .eq("user_id", userId)
      .eq("entry_date", date)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!diary) throw new Error("日記が見つかりません");

    const caption = [diary.body_target, diary.one_liner].filter(Boolean).join("\n\n").slice(0, 500);

    // ステッカーの所有確認（createPost と同じ前提）
    const { data: own } = await supabase
      .from("stickers")
      .select("id")
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!own) throw new Error("ステッカーが見つかりません");

    // 日記の公開範囲も合わせて更新
    await supabase
      .from("diaries")
      .update({ visibility: data.visibility })
      .eq("user_id", userId)
      .eq("entry_date", date);

    const { data: ins, error: insErr } = await supabase
      .from("posts")
      .insert({ user_id: userId, sticker_id: data.sticker_id, caption, visibility: data.visibility })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: ins.id as string };
  });
