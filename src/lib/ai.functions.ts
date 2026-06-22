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

const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      headword: z.string(),
      reading_zhuyin: z.string().optional().default(""),
      pinyin: z.string().optional().default(""),
      meaning_ja: z.string(),
      category_key: z.enum(CATEGORY_KEYS),
    })
  ).length(5),
});

export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `この画像から、台湾華語の学習対象として有用な名詞を5つ選んでください。
- 台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）
- 学習者目標レベル: ${data.levelGoal}（TOCFL）。これ以下の難易度を優先
- 画像に明確に写っているものだけ
- 各候補に注音、拼音、日本語意味、カテゴリを必ず付ける`
        : `画像から${data.targetLanguage}の学習対象として有用な名詞を5つ選び、headword(${data.targetLanguage})、日本語の意味、カテゴリを返してください。`;

    const result = await generateText({
      model: gateway(MODEL),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: data.imageBase64 } } as never,
          ] as never,
        },
      ],
      experimental_output: Output.object({ schema: SuggestionSchema }) as never,
    });

    const out = (result as unknown as { experimental_output?: z.infer<typeof SuggestionSchema> }).experimental_output;
    if (!out) {
      try {
        const parsed = JSON.parse(result.text);
        return SuggestionSchema.parse(parsed);
      } catch {
        throw new Error("AI did not return structured suggestions");
      }
    }
    return out;
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
