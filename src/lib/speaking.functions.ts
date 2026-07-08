import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getAi, logUsage } from "./ai-provider.server";
import { buildBranchPlan, parseBranchPlan, resolveBranches, type Branch } from "./wordtree";

/**
 * Speaking-output review (spec §6): the learner looks at their own photo and
 * says one sentence using the word. This returns the correction, an
 * explanation, ONE usage pattern (= the word-tree branch this review
 * unlocks), the native feeling, and a model answer. Single rich-model call.
 */

export type PatternPart = { text: string; role: "S" | "V" | "O" | "M" };

export type SpeakingFeedback = {
  correction: string;
  feedback_ja: string;
  pattern: {
    chunk_zh: string;
    chunk_ja: string;
    parts: PatternPart[];
  };
  native_feeling: string;
  model_answer: string;
  alternative: string;
  /** The word-tree branch presented as today's pattern (null = no stock). */
  unlocked_branch: Branch | null;
};

const FeedbackInput = z.object({
  sticker_id: z.string().uuid(),
  transcript: z.string().min(1).max(500),
  hint_used: z.boolean().default(false),
  /** 'voice' when spoken via recognition, 'text' when typed (write-mode fallback). */
  input_kind: z.enum(["voice", "text"]).default("voice"),
});

const FeedbackSchema = z.object({
  correction: z.string().min(1),
  feedback_ja: z.string().min(1),
  pattern: z.object({
    chunk_zh: z.string().default(""),
    chunk_ja: z.string().default(""),
    parts: z
      .array(z.object({ text: z.string(), role: z.enum(["S", "V", "O", "M"]) }))
      .default([]),
  }),
  native_feeling: z.string().default(""),
  model_answer: z.string().min(1),
  alternative: z.string().default(""),
});

export const getSpeakingFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackInput.parse(input))
  .handler(async ({ context, data }): Promise<SpeakingFeedback> => {
    const { supabase, userId } = context;

    // Load the card (RLS scopes to the owner) + how many reviews it has had.
    const { data: sticker, error } = await supabase
      .from("stickers")
      .select(
        "id, caption, location_name, branch_plan, words(headword, meaning_ja, part_of_speech, entry_type, extras)",
      )
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const word = (sticker as unknown as {
      words: { headword: string; meaning_ja: string; part_of_speech: string | null; entry_type: string; extras: unknown } | null;
    } | null)?.words;
    if (!sticker || !word) throw new Error("カードが見つかりません");

    const { count } = await supabase
      .from("review_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("sticker_id", data.sticker_id);
    const reviewCount = count ?? 0;

    // Word tree: the pattern we present IS the branch this review unlocks.
    const plan =
      parseBranchPlan((sticker as { branch_plan?: unknown }).branch_plan) ??
      buildBranchPlan(word.extras as Parameters<typeof buildBranchPlan>[0]);
    const resolved = resolveBranches(plan, Math.max(1, reviewCount));
    const branch = resolved.justUnlocked;

    const isPhrase = word.entry_type === "phrase";
    const ai = getAi();
    const { experimental_output } = await generateText({
      model: ai.gateway(ai.modelRich),
      experimental_output: Output.object({ schema: FeedbackSchema }),
      prompt:
        `あなたは台湾華語(繁體字)のネイティブ話者で、日本人学習者のスピーキングコーチです。\n` +
        `学習者は自分で撮った「${word.headword}」(${word.meaning_ja})の写真を見て、その時の経験を一文で話しました。\n` +
        (sticker.caption ? `撮影時のメモ: 「${sticker.caption}」\n` : "") +
        (sticker.location_name ? `撮影場所: ${sticker.location_name}\n` : "") +
        `学習者の発話${data.input_kind === "voice" ? "(音声認識の文字起こし)" : "(タイピング)"}: 「${data.transcript}」\n` +
        (data.hint_used ? `※学習者は単語を思い出せずヒントを見ました。\n` : "") +
        (branch
          ? `今回提示する「型」: 「${branch.zh}」${branch.ja ? `(${branch.ja})` : ""} — この表現を必ず pattern に使って解説してください。\n`
          : `今回の「型」: この単語をネイティブが最もよく使うコロケーションを1つ選んで pattern にしてください。\n`) +
        (isPhrase ? `これはフレーズカードです。返答として自然か、言い方のトーンも見てください。\n` : "") +
        `\n次をJSONで出力:\n` +
        `- correction: 発話を自然な台湾華語(繁體字)に直した完全な一文。意図は最大限尊重。すでに自然なら同じ文でよい\n` +
        `- feedback_ja: 何が良くて何が不自然か、なぜかを日本語で2〜4項目、優しく簡潔に\n` +
        `- pattern: { chunk_zh: 上記の型を含む短いチャンク, chunk_ja: 日本語訳, parts: chunk_zhを意味のかたまりに分割し各パーツに役割を付与 (S=主語, V=動詞, O=目的語, M=修飾語・その他) }\n` +
        `- native_feeling: ネイティブがこの単語を使う時の気持ち・状況を1〜2文の日本語で\n` +
        `- model_answer: この写真の場面で言うお手本の一文(繁體字)\n` +
        `- alternative: 別の言い方をもう一つ(繁體字)`,
    });

    await logUsage(supabase, userId, "speaking_feedback");

    return {
      ...experimental_output,
      unlocked_branch: branch,
    };
  });
