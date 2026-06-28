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

function parseJsonFromAiText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1]);

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));

  return JSON.parse(trimmed);
}

export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `この画像から、台湾華語の学習対象として有用な名詞を5つ選んでください。
- 台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）
- 学習者目標レベル: ${data.levelGoal}（TOCFL）。これ以下の難易度を優先
- 画像に明確に写っているものだけ
- 各候補に注音、拼音、日本語意味、カテゴリを必ず付ける`
        : `画像から${data.targetLanguage}の学習対象として有用な名詞を5つ選び、headword(${data.targetLanguage})、日本語の意味、カテゴリを返してください。`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "manual-chat-completions",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${prompt}\n\n必ずJSONだけを返してください。形式: {"suggestions":[{"headword":"繁体字","reading_zhuyin":"注音","pinyin":"pinyin","meaning_ja":"日本語","category_key":"${CATEGORY_KEYS.join("|のどれか: ")}"}]}。suggestionsは必ず5件。`,
              },
              { type: "image_url", image_url: { url: data.imageBase64 } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("画像のAI読み込みに失敗しました");
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI did not return suggestions");

    try {
      return SuggestionSchema.parse(parseJsonFromAiText(content));
    } catch {
      throw new Error("AI did not return structured suggestions");
    }
  });

const CardInput = z.object({
  headword: z.string().min(1),
  targetLanguage: z.string().default("zh-TW"),
  hintCategory: z.string().optional(),
});

const ExtrasSchema = z.object({
  collocations: z.array(z.string()).default([]),
  synonyms: z.array(z.string()).default([]),
  antonyms: z.array(z.string()).default([]),
  etymology: z.string().default(""),
  radicals: z.string().default(""),
  mnemonic: z.string().default(""),
  trivia: z.string().default(""),
  common_situation: z.string().default(""),
  usage_note: z.string().default(""),
  examples_extra: z.array(z.object({
    zh: z.string(),
    ja: z.string(),
  })).default([]),
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
  extras: ExtrasSchema.default({
    collocations: [], synonyms: [], antonyms: [],
    etymology: "", radicals: "", mnemonic: "", trivia: "",
    common_situation: "", usage_note: "", examples_extra: [],
  }),
});

export type GeneratedCard = z.infer<typeof CardSchema>;

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
        ? `「${data.headword}」という台湾華語の単語について、台湾人学習者向けに語彙カードを生成してください。

必須項目:
- reading_zhuyin: 注音（ㄅㄆㄇ）。台湾教育部準拠。
- pinyin: 拼音
- meaning_ja: 日本語の意味（簡潔に）
- part_of_speech: 品詞（名詞/動詞/形容詞/副詞など日本語表記）
- level: TOCFLレベル（TOCFL-1〜6 のいずれか）
- category_key: ${CATEGORY_KEYS.join("/")} のどれか
- example_sentence: 台湾で日常的に使う自然な例文（繁体字）
- example_translation: 例文の日本語訳

extras 項目（できる限り埋めること、不明な場合は空配列または空文字で可）:
- collocations: 一緒に使われる典型的なコロケーション3〜5個（繁体字）
- synonyms: 類義語2〜4個（繁体字）
- antonyms: 反義語1〜3個（繁体字）
- etymology: 漢字の語源・成り立ち（1〜2文、日本語）
- radicals: 部首と意味の説明（1文、日本語）
- mnemonic: 記憶に残るひとことフレーズ・覚え方（日本語）
- trivia: 台湾文化の雑学・面白い豆知識（1〜2文、日本語）
- common_situation: ネイティブが最もよく使う場面・状況（1〜2文、日本語）
- usage_note: 注意したい語法・誤用しやすいポイント（1〜2文、日本語）
- examples_extra: 追加の自然な例文2つ {zh, ja}

${data.hintCategory ? `カテゴリのヒント: ${data.hintCategory}` : ""}`
        : `「${data.headword}」(${data.targetLanguage})について、発音、日本語の意味、品詞、レベル、カテゴリ、例文と日本語訳を生成してください。`;

    const result = await generateText({
      model: gateway(MODEL),
      prompt,
      experimental_output: Output.object({ schema: CardSchema }) as never,
    });
    const out = (result as unknown as { experimental_output?: z.infer<typeof CardSchema> }).experimental_output;
    if (!out) {
      try {
        return CardSchema.parse(parseJsonFromAiText(result.text));
      } catch {
        throw new Error("AI did not return a structured card");
      }
    }
    return out;
  });
