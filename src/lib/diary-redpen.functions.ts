import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { internalFailure } from "./safe-error";
import { readingPromptNames, targetProfile } from "./target-profile";
import { toSummary, type RedPenLine, type RedPenSummary } from "./red-pen";
import {
  assertWithinDailyCap,
  explanationLanguageName,
  explanationLanguageRule,
  generateStructured,
  getAiFor,
  getExplanationLanguage,
  getUserLevelGoal,
  getUserTargetLanguage,
  isProUser,
  l1Rule,
  levelInstruction,
  logUsage,
} from "./ai-provider.server";

/**
 * **日記の赤ペン**（オーナー指示 2026-10-01、`red-pen.ts` の注）。
 *
 * - `checkDiaryLine` … 1文書くたびに呼ぶ。速いモデルで、その1文だけに赤を入れる。
 * - `summarizeDiary` … 書き終わった時に1回。言いたかったこと・模範解答・覚える物をまとめて
 *   `journal_entries` に残す（列は既存の物を使う: correction=本人の文を直した全文、
 *   body_zh / body_ja=模範解答とその訳、feedback_ja=言いたかったこと、native_phrases=覚える物）。
 * - `getDiarySummary` … 残したまとめを読む（本の「赤ペンのまとめ」）。
 *
 * 学ぶ言語は固定しない（台湾華語・英語）。解説は表示言語、母語ごとの崩れ方も渡す。
 */

async function learnerContext(userId: string) {
  const target = await getUserTargetLanguage(userId);
  const profile = targetProfile(target);
  const [langRule, levelRule, l1, levelGoal, explainLang] = await Promise.all([
    explanationLanguageRule(userId, target),
    levelInstruction(userId),
    l1Rule(userId, "grammar"),
    getUserLevelGoal(userId),
    getExplanationLanguage(userId),
  ]);
  return {
    target,
    targetName: profile.promptName,
    reading: readingPromptNames(profile).primary,
    langRule,
    levelRule,
    l1,
    levelGoal,
    NL: explanationLanguageName(explainLang),
  };
}

const LineInput = z.object({
  sentence: z.string().min(1).max(400),
  /** 直前までの文（文脈。添削はしない）。 */
  before: z.array(z.string().max(400)).max(4).default([]),
});

const LineSchema = z.object({
  verdict: z.enum(["good", "fix", "better", "say"]).catch("good"),
  corrected: z.string().catch(""),
  marks: z
    .array(
      z.object({
        wrong: z.string().catch(""),
        right: z.string().catch(""),
        why: z.string().catch(""),
      }),
    )
    .max(4)
    .catch([]),
  note: z.string().catch(""),
});

export const checkDiaryLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LineInput.parse(input))
  .handler(async ({ context, data }): Promise<RedPenLine> => {
    const { supabase, userId } = context;
    // 1文ごとに呼ぶので「添削」とは別に数える（上限は暴走止め。人の書く量では届かない）。
    await assertWithinDailyCap(userId, "diary_line");
    const c = await learnerContext(userId);
    const ai = await getAiFor("journal");
    const before = data.before.filter((s) => s.trim()).join("");
    const out = await generateStructured({
      model: ai.gateway(ai.modelFast),
      schema: LineSchema,
      prompt:
        `あなたは${c.targetName}を教える添削の先生（進研ゼミの赤ペン先生のように、答案のすぐ横に赤で書き足す）。` +
        `学習者が日記を1文ずつ書いています。**いま書いた1文だけ**に赤ペンを入れます。\n` +
        `${c.langRule}\n${c.levelRule}\n${c.l1}\n` +
        (before ? `直前までの文（文脈。ここは添削しない）:\n"""\n${before}\n"""\n` : "") +
        `いま書いた文:\n"""\n${data.sentence}\n"""\n\n` +
        `次のキーを持つ JSON を返す:\n` +
        `- verdict: "good"(文法も語も自然で、直す所が無い) / "fix"(文法・語の誤りがある) / ` +
        `"better"(誤りではないが、ネイティブはふつう別の言い方をする) / ` +
        `"say"(${c.targetName}で書かれていない・母語が混ざっている)\n` +
        `- corrected: 学習者が**言いたいこと・気持ちを変えずに**、ネイティブが日記に書く自然な${c.targetName}の1文。` +
        `good なら元の文そのまま。学習者の目標レベル ${c.levelGoal} を超える語彙・文型を使わない。\n` +
        `- marks: 直した所を最大3つ。各 {wrong: 学習者の文から**一字一句そのまま**抜き出した部分, right: 直した形, ` +
        `why: 理由を${c.NL}で20字前後}。good は空配列。say は空配列でよい。\n` +
        `- note: 赤ペンの一言（${c.NL}、40字以内）。直した理由の核心か、この文で使った・使うべき型の名前を具体的に。` +
        `「いいですね」だけの一言にしない。`,
    });
    await logUsage(supabase, userId, "diary_line");
    return {
      verdict: out.verdict,
      corrected: out.verdict === "good" ? data.sentence.trim() : out.corrected.trim(),
      marks: out.verdict === "good" ? [] : out.marks.filter((m) => m.wrong.trim()).slice(0, 3),
      note: out.note.trim(),
    };
  });

const SummaryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().min(1).max(4000),
  /** 書いている間に入れた赤ペン（覚える物のまとめに入れる）。 */
  lines: z
    .array(
      z.object({
        sentence: z.string().max(400),
        corrected: z.string().max(400),
        verdict: z.string().max(10),
      }),
    )
    .max(60)
    .default([]),
});

const SummarySchema = z.object({
  intent: z.string().min(1),
  correction: z.string().catch(""),
  model_answer: z.string().min(1),
  model_answer_translation: z.string().catch(""),
  learn: z
    .array(
      z.object({
        kind: z.enum(["word", "chunk", "pattern", "grammar"]).catch("chunk"),
        text: z.string(),
        reading: z.string().catch(""),
        meaning: z.string().catch(""),
        note: z.string().catch(""),
        example: z.string().catch(""),
      }),
    )
    .min(1)
    .max(10),
});

export const summarizeDiary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SummaryInput.parse(input))
  .handler(async ({ context, data }): Promise<RedPenSummary> => {
    const { supabase, userId } = context;
    await assertWithinDailyCap(userId, "correction");
    const c = await learnerContext(userId);
    const ai = await getAiFor("journal");
    const pro = await isProUser(userId);
    const model = pro ? ai.modelRichPremium : ai.modelRich;
    const fixed = data.lines
      .filter((l) => l.verdict !== "good" && l.corrected.trim())
      .map((l) => `・${l.sentence.trim()} → ${l.corrected.trim()}`)
      .join("\n");
    const out = await generateStructured({
      model: ai.gateway(model),
      schema: SummarySchema,
      prompt:
        `あなたは${c.targetName}を教える添削の先生。学習者が今日の日記を書き終えました。` +
        `答えを読んで満足して終わらせず、**次に自分で言えるようになる物**を残すのが目的。\n` +
        `${c.langRule}\n${c.levelRule}\n${c.l1}\n` +
        `学習者の日記:\n"""\n${data.text}\n"""\n` +
        (fixed ? `書いている間に赤ペンで直した文:\n${fixed}\n` : "") +
        `\n次のキーを持つ JSON を返す:\n` +
        `- intent: この日記で学習者が一番伝えたかったこと・気持ちを${c.NL}で1〜2文（「〜と伝えたかったようです」の形）。\n` +
        `- correction: 学習者の文を、意図を変えずに**最小限だけ**直した全文（${c.targetName}）。\n` +
        `- model_answer: 学習者の言いたいことをもとに、ネイティブがその気持ちを日記に書くならこう書く、という模範解答` +
        `（${c.targetName}、学習者の文より少しだけ長い程度）。目標レベル ${c.levelGoal} の語彙・文型で、` +
        `下の learn の語・型を自然に使う。\n` +
        `- model_answer_translation: model_answer の訳（${c.NL}）。\n` +
        `- learn: 今日この日記から覚える物を4〜8個。学習者が**言いたかったのに言えなかった**物と、` +
        `赤ペンで直した所を優先する。各 {kind: "word"(単語) / "chunk"(ネイティブがよく使う語のかたまり・フレーズ) / ` +
        `"pattern"(文の型・公式) / "grammar"(文法), text: ${c.targetName}の語・かたまり・型（型は「A 比 B 還〜」のように空所を示す）, ` +
        `reading: text の${c.reading}（文法の説明だけの物は空）, meaning: 意味（${c.NL}）, ` +
        `note: いつ・どんな気持ちで使うか、日記のどの文に関係するか（${c.NL}、40字前後）, ` +
        `example: その物を使った短い一文（${c.targetName}）}。` +
        `目標レベルを大きく超える物を入れない。`,
    });
    const summary: RedPenSummary = {
      intent: out.intent.trim(),
      correction: out.correction.trim(),
      model_answer: out.model_answer.trim(),
      model_answer_translation: out.model_answer_translation.trim(),
      learn: out.learn
        .filter((l) => l.text.trim())
        .map((l) => ({
          kind: l.kind,
          text: l.text.trim(),
          reading: l.reading.trim(),
          meaning: l.meaning.trim(),
          note: l.note.trim(),
          example: l.example.trim(),
        })),
    };
    const { error } = await supabase.from("journal_entries").upsert(
      {
        user_id: userId,
        entry_date: data.date,
        user_draft: data.text.trim(),
        correction: summary.correction || null,
        feedback_ja: summary.intent,
        body_zh: summary.model_answer,
        body_ja: summary.model_answer_translation || null,
        // 既存の形（zh / ja / note）に、種類・読み・例文を足して残す。
        native_phrases: summary.learn.map((l) => ({
          zh: l.text,
          ja: l.meaning,
          note: l.note,
          kind: l.kind,
          reading: l.reading,
          example: l.example,
        })) as never,
        model,
      },
      { onConflict: "user_id,entry_date" },
    );
    if (error) throw internalFailure("journal", error, "日記を保存できませんでした");
    await logUsage(supabase, userId, "correction");
    return summary;
  });

const DateInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const getDiarySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DateInput.parse(input))
  .handler(async ({ context, data }): Promise<RedPenSummary | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("journal_entries")
      .select("correction, feedback_ja, body_zh, body_ja, native_phrases")
      .eq("user_id", userId)
      .eq("entry_date", data.date)
      .maybeSingle();
    if (error) throw internalFailure("journal", error, "日記を読み込めませんでした");
    return toSummary(row);
  });
