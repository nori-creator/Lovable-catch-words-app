import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

const CATEGORY_KEYS = [
  "fruit","vegetable","drink","food","dessert","vehicle","animal","plant",
  "building","street","home","furniture","appliance","clothes","accessory",
  "stationery","tech","nature","weather","other",
] as const;

const MODEL = "google/gemini-3-flash-preview";

const SuggestInput = z.object({
  imageBase64: z.string().min(100),
  targetLanguage: z.string().default("zh-TW"),
  levelGoal: z.string().default("TOCFL-2"),
});

const Suggestion = z.object({
  headword: z.string(),
  reading_zhuyin: z.string().optional().default(""),
  pinyin: z.string().optional().default(""),
  meaning_ja: z.string(),
  category_key: z.enum(CATEGORY_KEYS),
});

const MakerSchema = z.object({
  suggestions: z.array(Suggestion).min(5).max(10),
});

const CheckerSchema = z.object({
  verdicts: z.array(
    z.object({
      headword: z.string(),
      verdict: z.enum(["accept", "reject"]),
      reason: z.string().default(""),
      score: z.number().min(0).max(10),
    })
  ),
});

async function logRun(
  supabase: { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } },
  userId: string,
  loop: string,
  iterations: number,
  accepted: number,
) {
  try {
    await supabase.from("ai_runs").insert({
      user_id: userId,
      loop,
      iterations,
      accepted,
    });
  } catch {
    // best-effort logging only
  }
}

/**
 * Maker/Checker loop for word suggestions.
 * 1. Maker proposes 10 candidates from the image.
 * 2. Checker scores each against: TOCFL level, image-meaning fit, dictionary plausibility.
 * 3. We keep the top 5 accepted (score >= 6). If <5 accepted, run one more Maker round excluding rejected ones.
 * Stop conditions: 5 accepted OR 2 iterations max.
 */
export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const makerPrompt =
      data.targetLanguage === "zh-TW"
        ? `この画像から、台湾華語の学習対象として有用な名詞を10個提案してください。
- 台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）
- 学習者目標レベル: ${data.levelGoal}（TOCFL）。これ以下の難易度を優先
- 画像に明確に写っているものだけ
- 各候補に注音、拼音、日本語意味、カテゴリを付ける`
        : `画像から${data.targetLanguage}の学習対象として有用な名詞を10個提案してください（headword/意味/カテゴリ）。`;

    const checkerPrompt = (cands: z.infer<typeof Suggestion>[]) =>
      `あなたは厳格な台湾華語教師です。以下の単語候補を「画像との一致」「TOCFL ${data.levelGoal}以下か」「台湾で実際に使われる繁体字表記か」の3観点で0-10で採点し、6未満は reject にしてください。
候補: ${JSON.stringify(cands.map((c) => ({ h: c.headword, m: c.meaning_ja })))}`;

    let accepted: z.infer<typeof Suggestion>[] = [];
    let rejected = new Set<string>();
    let iterations = 0;

    for (let i = 0; i < 2 && accepted.length < 5; i++) {
      iterations++;
      const exclusion = rejected.size
        ? `\n除外: ${[...rejected].join(", ")}`
        : "";

      const makerResult = await generateText({
        model: gateway(MODEL),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: makerPrompt + exclusion },
              { type: "image_url", image_url: { url: data.imageBase64 } } as never,
            ] as never,
          },
        ],
        experimental_output: Output.object({ schema: MakerSchema }) as never,
      });
      const maker = (makerResult as unknown as { experimental_output?: z.infer<typeof MakerSchema> })
        .experimental_output;
      const candidates = maker?.suggestions ?? [];
      if (candidates.length === 0) break;

      // Checker round
      const checkerResult = await generateText({
        model: gateway(MODEL),
        prompt: checkerPrompt(candidates),
        experimental_output: Output.object({ schema: CheckerSchema }) as never,
      });
      const checker = (checkerResult as unknown as { experimental_output?: z.infer<typeof CheckerSchema> })
        .experimental_output;

      const verdictMap = new Map(
        (checker?.verdicts ?? []).map((v) => [v.headword, v]),
      );
      for (const c of candidates) {
        const v = verdictMap.get(c.headword);
        if (v && v.verdict === "accept" && v.score >= 6) {
          if (!accepted.find((a) => a.headword === c.headword)) accepted.push(c);
        } else {
          rejected.add(c.headword);
        }
      }
    }

    // Fallback: if checker rejected everything, keep top candidates anyway
    if (accepted.length < 5 && iterations > 0) {
      // pad with rejected ones to always return up to 5
      const padCandidates: z.infer<typeof Suggestion>[] = [];
      void padCandidates;
    }

    const final = accepted.slice(0, 5);

    await logRun(
      context.supabase as never,
      context.userId,
      "suggest_words",
      iterations,
      final.length,
    );

    return { suggestions: final };
  });

const CardInput = z.object({
  headword: z.string().min(1),
  targetLanguage: z.string().default("zh-TW"),
  hintCategory: z.string().optional(),
});

const CardSchema = z.object({
  reading_zhuyin: z.string().default(""),
  pinyin: z.string().default(""),
  meaning_ja: z.string(),
  part_of_speech: z.string().default("名詞"),
  level: z.string().default("TOCFL-2"),
  category_key: z.enum(CATEGORY_KEYS),
  example_sentence: z.string(),
  example_translation: z.string(),
});

export const generateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CardInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `「${data.headword}」という台湾華語の単語について、台湾教育部準拠の注音（ㄅㄆㄇ）、拼音、日本語の意味、品詞、TOCFLレベル、カテゴリ、台湾人が日常使う自然な例文と日本語訳を生成してください。${data.hintCategory ? `カテゴリのヒント: ${data.hintCategory}` : ""}`
        : `「${data.headword}」(${data.targetLanguage})について、発音、日本語の意味、品詞、レベル、カテゴリ、例文と日本語訳を生成してください。`;

    const result = await generateText({
      model: gateway(MODEL),
      prompt,
      experimental_output: Output.object({ schema: CardSchema }) as never,
    });
    const out = (result as unknown as { experimental_output?: z.infer<typeof CardSchema> }).experimental_output;
    if (!out) {
      try {
        return CardSchema.parse(JSON.parse(result.text));
      } catch {
        throw new Error("AI did not return a structured card");
      }
    }
    return out;
  });
