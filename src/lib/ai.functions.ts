import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertWithinDailyCap, getAi, isProUser, logUsage } from "./ai-provider.server";

const CATEGORY_KEYS = [
  "fruit","vegetable","drink","food","dessert",
  "vehicle","transport","animal","plant","flower",
  "building","street","sign","shop","home","furniture","appliance","kitchenware","tool",
  "clothes","accessory","shoes","bag","jewelry",
  "stationery","book","tech","gadget","toy","game","sport","instrument",
  "nature","weather","sky","water","mountain",
  "body","face","hand","clothing_part",
  "person","family","job",
  "art","decoration","character","symbol","color","shape",
  "money","document","medicine","other",
] as const;

const SuggestInput = z.object({
  // Cap ~8MB base64 (~6MB raw) to prevent cost/memory abuse via AI vision calls.
  imageBase64: z.string().min(100).max(8_000_000),
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

// Heuristic post-processor: remap the AI's category_key when it lazily returns
// "other" for common items, and gracefully bucket close synonyms.
function normalizeCategory(headword: string, cat: string): typeof CATEGORY_KEYS[number] {
  const h = headword.trim();
  const rules: Array<[RegExp, typeof CATEGORY_KEYS[number]]> = [
    [/^(手|腳|脚|頭|頭髮|髮|眼|眼睛|耳|耳朵|鼻|嘴|嘴巴|臉|舌|牙|牙齒|指|手指|腳趾|肩|膝|膝蓋|肚|肚子|背|胸|腰|脖|脖子)$/, "body"],
    [/(滑鼠|鍵盤|電腦|筆電|螢幕|手機|平板|耳機|喇叭|路由器|插頭|充電器|相機|相機|USB)/, "tech"],
    [/(汽車|車|機車|摩托車|腳踏車|自行車|捷運|公車|火車|高鐵|飛機|船)/, "transport"],
    [/(狗|貓|鳥|魚|兔子|老鼠|馬|牛|羊|豬|雞|鴨|熊)/, "animal"],
    [/(蘋果|香蕉|橘子|柳丁|葡萄|草莓|西瓜|芒果|鳳梨|木瓜|桃|梨|柿子|檸檬)/, "fruit"],
    [/(高麗菜|白菜|菠菜|紅蘿蔔|馬鈴薯|洋蔥|番茄|茄子|青椒|大蒜|薑|蔥)/, "vegetable"],
    [/(咖啡|茶|奶茶|果汁|可樂|水|礦泉水|牛奶|豆漿|啤酒)/, "drink"],
    [/(三明治|飯|麵|包子|餃子|炒飯|炒麵|便當|漢堡|披薩|蛋餅|蔥抓餅|滷肉飯)/, "food"],
    [/(蛋糕|布丁|冰淇淋|甜甜圈|巧克力|餅乾|糖果|奶酪)/, "dessert"],
    [/(花|玫瑰|櫻花|向日葵|鬱金香|百合)$/, "flower"],
    [/(樹|竹|草|葉)$/, "plant"],
    [/(椅子|桌子|沙發|床|櫃子|書架|燈)$/, "furniture"],
    [/(冰箱|洗衣機|微波爐|電視|冷氣|烤箱|吹風機)/, "appliance"],
    [/(鍋|平底鍋|刀|叉|筷子|湯匙|盤子|碗|杯子)$/, "kitchenware"],
    [/(衣服|襯衫|T恤|外套|夾克|大衣|褲子|裙子|洋裝|毛衣|帽子)$/, "clothes"],
    [/(鞋|鞋子|運動鞋|拖鞋|靴子|高跟鞋)$/, "shoes"],
    [/(包包|背包|皮包|錢包|手提袋)$/, "bag"],
    [/(項鍊|戒指|耳環|手鍊|手錶)$/, "jewelry"],
    [/(筆|鉛筆|原子筆|橡皮擦|尺|剪刀|膠水|筆記本|課本)$/, "stationery"],
    [/(書|小說|字典|漫畫|雜誌)$/, "book"],
    [/(硬幣|紙鈔|錢|信用卡)$/, "money"],
    [/(招牌|標誌|標示|指示牌|路牌)/, "sign"],
    [/(藥|藥品|口罩|OK繃|繃帶)/, "medicine"],
  ];
  for (const [re, key] of rules) if (re.test(h)) return key;
  const c = cat as typeof CATEGORY_KEYS[number];
  if (CATEGORY_KEYS.includes(c)) return c;
  return "other";
}

export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = getAi();
    await assertWithinDailyCap(context.userId, "suggest");

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `この画像から、台湾華語の学習対象として有用な名詞を5つ選んでください。
- 台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）
- 学習者目標レベル: ${data.levelGoal}（TOCFL）。これ以下の難易度を優先
- 画像に明確に写っているものだけ

**カテゴリ分類ルール（厳守）:**
- 手・足・顔・目・耳・鼻・口・髪・指・肩・膝など人体部位 → "body"
- マウス・キーボード・PC・スマホ・タブレット・ヘッドホンなど電子機器 → "tech"
- 家具（椅子/机/ソファ） → "furniture"、家電（冷蔵庫/TV） → "appliance"
- 服 → "clothes"、靴 → "shoes"、鞄 → "bag"
- 果物 → "fruit"、野菜 → "vegetable"、飲み物 → "drink"、食べ物 → "food"、お菓子 → "dessert"
- 動物 → "animal"、花 → "flower"、植物 → "plant"
- 車・バイク・電車・バスなど → "transport"
- 看板・標識 → "sign"、お店 → "shop"、建物 → "building"
- 文房具 → "stationery"、本 → "book"、お金 → "money"、薬 → "medicine"

**"other" は本当にどのカテゴリにも当てはまらないときの最終手段。手やマウスを "other" にするのは間違い。**`
        : `画像から${data.targetLanguage}の学習対象として有用な名詞を5つ選び、headword(${data.targetLanguage})、日本語の意味、カテゴリを返してください。`;

    let content: string;
    try {
      const result = await generateText({
        model: ai.gateway(ai.modelFast),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${prompt}\n\n必ずJSONだけを返してください。形式: {"suggestions":[{"headword":"繁体字","reading_zhuyin":"注音","pinyin":"pinyin","meaning_ja":"日本語","category_key":"${CATEGORY_KEYS.join("|のどれか: ")}"}]}。suggestionsは必ず5件。`,
              },
              { type: "image", image: data.imageBase64 },
            ],
          },
        ],
      });
      content = result.text;
    } catch {
      throw new Error("画像のAI読み込みに失敗しました");
    }
    if (!content) throw new Error("AI did not return suggestions");

    await logUsage(context.supabase, context.userId, "suggest");

    try {
      const parsed = SuggestionSchema.parse(parseJsonFromAiText(content));
      return {
        suggestions: parsed.suggestions.map((s) => ({
          ...s,
          category_key: normalizeCategory(s.headword, s.category_key),
        })),
      };
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
  // コーパス風の使用情報(2026-07-13): 頻度・レジスター・類義語との違い・語順・学習tips
  register_note: z.string().default(""),
  synonym_diff: z.string().default(""),
  word_order: z.string().default(""),
  study_tips: z.string().default(""),
  examples_extra: z.array(z.object({
    zh: z.string(),
    ja: z.string(),
  })).default([]),
});

const CardSchema = z.object({
  // 入力が日本語だった場合に解決された台湾華語の見出し語(繁体字)。
  headword_zh: z.string().default(""),
  reading_zhuyin: z.string().default(""),
  pinyin: z.string().default(""),
  meaning_ja: z.string(),
  part_of_speech: z.string().default("名詞"),
  level: z.string().default("TOCFL-2"),
  category_key: z.enum(CATEGORY_KEYS),
  example_sentence: z.string(),
  example_translation: z.string(),
  extras: ExtrasSchema.default(() => ({
    collocations: [], synonyms: [], antonyms: [],
    etymology: "", radicals: "", mnemonic: "", trivia: "",
    common_situation: "", usage_note: "", examples_extra: [],
    register_note: "", synonym_diff: "", word_order: "", study_tips: "",
  })),

});

export type GeneratedCard = z.infer<typeof CardSchema>;

export const generateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CardInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = getAi();
    await assertWithinDailyCap(context.userId, "card");

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `「${data.headword}」について、日本人学習者向けの台湾華語(繁体字)語彙カードを生成してください。

入力語の扱い:
- 入力が台湾華語なら headword_zh にそのまま繁体字で入れる。
- 入力が日本語(または英語)なら、**最も日常的に使われる台湾華語の対応語**に変換し headword_zh に入れる(例:「マンゴー」→「芒果」)。大陸語彙は禁止。

必須項目:
- headword_zh: 上記ルールで決めた台湾華語の見出し語(繁体字)
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
- register_note: 使用頻度とレジスター。話し言葉/書き言葉のどちらで多いか、日常会話・看板・メニュー・新聞・ニュースのどこで最もよく出会うか（1〜2文、日本語。例:「会話で非常によく使う。新聞ではより硬い◯◯が好まれる」）
- synonym_diff: 主要な類義語との使い分け・ニュアンスの違い（1〜2文、日本語）
- word_order: この語が入る典型的な語順・文型パターン（例:「把+芒果+切開」のように繁体字パターン+短い日本語説明）
- study_tips: 日本人学習者向けの勉強のコツ。日本語との違い・発音の注意・声調の覚え方など（1〜2文、日本語）
- examples_extra: 追加の自然な例文2つ {zh, ja}

${data.hintCategory ? `カテゴリのヒント: ${data.hintCategory}` : ""}`
        : `「${data.headword}」(${data.targetLanguage})について、発音、日本語の意味、品詞、レベル、カテゴリ、例文と日本語訳を生成してください。`;

    const pro = await isProUser(context.userId);
    const result = await generateText({
      model: ai.gateway(pro ? ai.modelRichPremium : ai.modelRich),
      prompt,
      experimental_output: Output.object({ schema: CardSchema }) as never,
    });
    const out = (result as unknown as { experimental_output?: z.infer<typeof CardSchema> }).experimental_output;
    const card = out ?? (() => {
      try { return CardSchema.parse(parseJsonFromAiText(result.text)); }
      catch { throw new Error("AI did not return a structured card"); }
    })();
    await logUsage(context.supabase, context.userId, "card");
    const resolvedHead = card.headword_zh?.trim() || data.headword;
    // 入力キャッチ・派生キャッチで生まれた語も共有辞書に蓄積(SNS/日常語彙)。
    void import("./lexicon.server").then(({ learnLexiconEntries }) =>
      learnLexiconEntries([
        {
          headword: resolvedHead,
          zhuyin: card.reading_zhuyin,
          pinyin: card.pinyin,
          meaning_ja: card.meaning_ja,
          pos: card.part_of_speech,
          taiwan_usage: card.extras?.common_situation || null,
        },
      ]),
    );
    return {
      ...card,
      headword_zh: resolvedHead,
      category_key: normalizeCategory(resolvedHead, card.category_key),
    };
  });

// --- Phrase cards (§5.2): front = the scene, back = phrase + replies -------

const PhraseInput = z.object({
  phrase: z.string().min(1).max(80),
  scene: z.string().max(200).default(""),
  targetLanguage: z.string().default("zh-TW"),
});

const PhraseCardSchema = z.object({
  reading_zhuyin: z.string().default(""),
  pinyin: z.string().default(""),
  meaning_ja: z.string(),
  usage_note: z.string().default(""),
  common_situation: z.string().default(""),
  replies: z
    .array(z.object({ zh: z.string(), ja: z.string() }))
    .min(1)
    .max(3),
});

export type GeneratedPhraseCard = z.infer<typeof PhraseCardSchema>;

export const generatePhraseCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PhraseInput.parse(input))
  .handler(async ({ data, context }): Promise<GeneratedPhraseCard> => {
    const ai = getAi();
    await assertWithinDailyCap(context.userId, "phrase_card");
    const result = await generateText({
      model: ai.gateway(ai.modelRich),
      prompt:
        `台湾華語(繁體字)のフレーズカードを作ります。\n` +
        `フレーズ: 「${data.phrase}」\n` +
        (data.scene ? `聞いた/使いたいシーン: ${data.scene}\n` : "") +
        `\n次をJSONで出力:\n` +
        `- reading_zhuyin: フレーズ全体の注音(台湾教育部準拠)\n` +
        `- pinyin: 拼音\n` +
        `- meaning_ja: 日本語の意味(簡潔に)\n` +
        `- usage_note: いつ・誰が・どんなトーンで使うか(1〜2文、日本語)\n` +
        `- common_situation: 最もよくある場面(1文、日本語)\n` +
        `- replies: このフレーズを言われた時の自然な返し方2〜3個 {zh: 繁體字, ja: 日本語訳}。` +
        `例:「請稍等」→「好、謝謝」`,
      experimental_output: Output.object({ schema: PhraseCardSchema }) as never,
    });
    const out = (result as unknown as { experimental_output?: GeneratedPhraseCard }).experimental_output;
    const card = out ?? (() => {
      try { return PhraseCardSchema.parse(parseJsonFromAiText(result.text)); }
      catch { throw new Error("AI did not return a structured phrase card"); }
    })();
    await logUsage(context.supabase, context.userId, "phrase_card");
    return card;
  });
