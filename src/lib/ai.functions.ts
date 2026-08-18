import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { CATEGORY_KEYS, ROOM_KEYS, normalizeCategory } from "./category";
import { ExtrasSchema, emptyExtras, mergeExtras } from "./extras";
import { isTargetHeadword } from "./target-language";
import {
  assertWithinDailyCap,
  getAi,
  getAiFor,
  getUserLevelGoal,
  levelInstruction,
  explanationLanguageRule,
  getExplanationLanguage,
  getLearnerL1,
  l1Rule,
  isProUser,
  logUsage,
  parseJsonFromAiText,
  withModelFallback,
  generateStructured,
} from "./ai-provider.server";

const SuggestInput = z.object({
  // Cap ~8MB base64 (~6MB raw) to prevent cost/memory abuse via AI vision calls.
  imageBase64: z.string().min(100).max(8_000_000),
  targetLanguage: z.string().default("zh-TW"),
  levelGoal: z.string().default("TOCFL-2"),
});

const SuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        headword: z.string(),
        reading_zhuyin: z.string().optional().default(""),
        pinyin: z.string().optional().default(""),
        meaning_ja: z.string(),
        category_key: z.enum(CATEGORY_KEYS),
      }),
    )
    .length(5),
});

export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = await getAiFor("scan");
    await assertWithinDailyCap(context.userId, "suggest");
    // レベルはクライアントの申告ではなく**プロフィールを正**とする
    // (以前は既定の TOCFL-2 が常に使われ、設定が効いていなかった)。
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId);

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `この画像から、台湾華語の学習対象として有用な名詞を5つ選んでください。
- 台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）
${levelRule}
${langRule}
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

// extras の形は src/lib/extras.ts が唯一の定義(共有)。

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
  /**
   * どの棚にも当てはまらないときの**新しい棚の提案**。
   *
   * `category_key` は既定の54個に縛ったまま残す — 提案が使えなかったとき
   * (形が壊れている・既存と同じ・DBが受け付けない)に**必ず戻る先**が要る。
   * 提案は「あれば嬉しい」もので、無くてもキャッチは成立する。
   * ここを緩く受けるのは、生成物が必ず想定外を出すから。形を直すのも
   * 諦めるのも `shelf-proposal.ts` で完結させる。
   */
  new_shelf: z
    .object({
      // 型が違うものは**投げずに落とす**。1項目の型違いでカード生成が
      // 丸ごと失敗すると、棚が増えないどころか語が取れない。
      key: z.string().optional().catch(undefined),
      label: z.string().optional().catch(undefined),
      emoji: z.string().optional().catch(undefined),
      room_key: z.string().optional().catch(undefined),
      room_label: z.string().optional().catch(undefined),
    })
    .nullish()
    .catch(null),
  extras: ExtrasSchema.default(() => emptyExtras()),
});

export type GeneratedCard = z.infer<typeof CardSchema>;

/**
 * 母語で書いた「もの + その場の様子」から、**台湾華語の名詞の候補**を出す。
 *
 * ## なぜ1語に決め打ちしないか
 * これまで日本語の入力は `generateCard` に直で渡り、**1語に決め打ち**して
 * いた。「ティッシュ」と書くと1つだけ返ってくるが、台湾では
 * 「衛生紙(トイレの)」と「面紙(ポケットの)」が別物で、どちらが欲しいかは
 * **その場の様子を聞かないと決まらない**(オーナー指摘)。
 * 決め打ちの代わりに、区別のついた候補を並べて選ばせる。
 *
 * ## 名詞だけ
 * ここは「撮ったものの名前が分からない」ときの入口。動詞や形容詞を混ぜると
 * 選ぶ手間が増えるだけで、欲しいものは出てこない。
 */
const WordCandidatesInput = z.object({
  /** 母語で書いた物の名前(例: ティッシュ)。 */
  query: z.string().min(1).max(60),
  /** どこで・どんな様子だったか(任意)。候補を絞る手がかり。 */
  scene: z.string().max(200).optional(),
  targetLanguage: z.string().default("zh-TW"),
});

const CandidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        headword: z.string(),
        reading_zhuyin: z.string().default(""),
        pinyin: z.string().default(""),
        meaning_ja: z.string().default(""),
        /** 他の候補との**違い**を一言で(例: トイレに置く方)。 */
        distinction: z.string().default(""),
      }),
    )
    .default([]),
});

export const suggestWordCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WordCandidatesInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = await getAiFor("scan");
    await assertWithinDailyCap(context.userId, "suggest");
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId);

    const sceneLine = data.scene?.trim()
      ? `その場の様子: 「${data.scene.trim()}」。**この様子に合うものを優先**する。`
      : "その場の様子は聞けていない。よくある使い分けを並べる。";

    const prompt = `学習者が母語で「${data.query}」と書いた。これが指す台湾華語の**名詞**の候補を挙げてください。

${sceneLine}
${levelRule}
${langRule}

守ること:
- **名詞だけ**。動詞・形容詞は出さない。
- **細かく分ける。** 母語の1語が台湾華語では複数の別語になることが多い。
  例:「ティッシュ」→ 衛生紙(トイレに置く)/ 面紙(持ち歩く箱・ポケット)/ 濕紙巾(ウェット)
  例:「お茶」→ 茶(飲み物一般)/ 茶葉(葉)/ 手搖飲(店で買う飲料)
- それぞれの distinction に、**他とどう違うか**を短く書く(15文字程度)。
  違いが書けない候補は挙げない — 同じ物の言い換えを並べても選べない。
- 台湾で実際に使う語だけ。大陸語彙は禁止。繁体字。
- 2〜5個。**確かなものだけ**。1つしか無いならそれだけ返す。`;

    const raw = await generateStructured({
      model: ai.gateway(ai.modelFast),
      schema: CandidateSchema,
      prompt,
    });

    // 生成物は必ず想定外を出す。**学んでいる言語でないものは落とす** —
    // ここを通すと、母語がそのまま見出しになる元の不具合に戻る。
    const seen = new Set<string>();
    const candidates = raw.candidates
      .map((c) => ({ ...c, headword: c.headword.trim() }))
      .filter((c) => isTargetHeadword(c.headword, data.targetLanguage))
      .filter((c) => {
        if (seen.has(c.headword)) return false;
        seen.add(c.headword);
        return true;
      })
      .slice(0, 5);
    return { candidates };
  });

export const generateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CardInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = await getAiFor("card");
    await assertWithinDailyCap(context.userId, "card");
    const levelGoal = await getUserLevelGoal(context.userId);
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId);
    // 解説をどの言語で書くか。プロンプト本文に散らばる「日本語で」という
    // 指示が langRule と矛盾し、英語設定でも日本語の解説が返っていた。
    // 説明文の言語名をここで差し替えて矛盾を無くす。
    const explainLang = await getExplanationLanguage(context.userId);
    const NL = explainLang === "en" ? "英語" : "日本語";
    // 発音のコツは**母語ごとに全く変わる**(有気音が無い/そり舌が無い等)。
    // 設定の母語から具体的な干渉項目を流し込む。
    const l1 = await l1Rule(context.userId, "pronunciation");
    // 語順・量詞・「的」の位置などは母語で崩れ方が違う。例文とチャンクを
    // 「その母語話者が実際に間違える所」に寄せるため、文法側も渡す。
    const l1Gram = await l1Rule(context.userId, "wordorder");
    const l1Info = await getLearnerL1(context.userId);
    const learnerL1 = l1Info.speakerJa;

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `「${data.headword}」について、台湾華語(繁体字)の語彙カードを生成してください。

${langRule}
${levelRule}

入力語の扱い:
- 入力が台湾華語なら headword_zh にそのまま繁体字で入れる。
- 入力が日本語(または英語)なら、**最も日常的に使われる台湾華語の対応語**に変換し headword_zh に入れる(例:「マンゴー」→「芒果」)。大陸語彙は禁止。

必須項目:
- headword_zh: 上記ルールで決めた台湾華語の見出し語(繁体字)
- reading_zhuyin: 注音（ㄅㄆㄇ）。台湾教育部準拠。
- pinyin: 拼音
- meaning_ja: 意味（簡潔に。**解説の言語**で書く — 英語設定なら英語で）
- part_of_speech: 台湾の詞類表の記号で: N/V/Vi/V-sep/Vs/Vst/Vs-attr/Vs-pred/Vs-sep/Vaux/Vp/Vpt/Vp-sep/Adv/Conj/Prep/M/Ptc/Det のどれか。
  V=及物動作動詞(買/做)、Vi=不及物(跑/坐)、Vs=状態動詞・形容詞(冷/漂亮)、Vst=及物状態(喜歡)、Vaux=助動詞(會/能)、Vp=変化動詞(破/感冒)、M=量詞、Ptc=助詞。
- level: TOCFLレベル（TOCFL-1〜6 のいずれか）
- category_key: ${CATEGORY_KEYS.join("/")} のどれか。
  **"other" は最終手段**。身体の部位→body、調理器具→kitchenware、日用品・洗剤・
  化粧品・薬→medicine、道具→tool、書類・証明書→document、人・職業→person/job、
  横断歩道・道路・信号→street、店→shop、交通機関→transport を必ず使う。
- new_shelf: **上の一覧のどれを選んでも「その語らしくない」ときだけ**、新しい棚を提案する。
  当てはまる棚が在るなら **null**(無理に作らない — 似た棚が乱立すると図鑑が壊れる)。
  形式: {key: 英小文字とアンダースコアのみ(例 "night_market_snack"), label: 棚の名前(${NL}・24字まで),
  emoji: 絵文字1つ, room_key: ${ROOM_KEYS.join("/")} のどれか、または新しい部屋の英小文字の鍵,
  room_label: 部屋の名前(${NL}・24字まで)}。
  棚は「街で見かけて集めたくなるまとまり」の粒度で。1語専用の棚は作らない。
- example_sentence: ネイティブが「${data.headword}」を最も使う場面・気持ちの例文（繁体字）。学習者の目標レベルは ${levelGoal} — 語彙・文型はこのレベル以下に抑える
- example_translation: 例文の訳(${NL})

extras 項目（**すべて具体的な内容で必ず埋めること**。空文字・空配列で返さない）:

チャンク分解の共通ルール: parts/chunks は {text: 繁体字パーツ, pos: 役割} の配列。
pos は S(主語)/V(動詞、複数あればV1,V2)/O(目的語、O1,O2)/M(修飾・量詞)/C(接続・介詞)/Ptc(助詞) を使う。
「${data.headword}」自体は必ずどれかのパーツとして含める。

- usage_chunks: ネイティブが「${data.headword}」をどう組み合わせて使うかの型・コロケーションを3〜5個。各 {parts:[{text,pos}], ja:短い説明(${NL})}。例: 拿+衛生紙 → parts:[{text:"拿",pos:"V"},{text:"衛生紙",pos:"O"}]。よく使う動詞・量詞・定番チャンクを優先。
  **${learnerL1}が語順・量詞・「的」の位置で崩しやすい型を優先して選ぶ**。該当する型があれば ja の説明に「母語だとこう言いたくなるが中国語ではこの順」と一言添える。
${l1Gram}
- example_chunks: example_sentence をパーツ分解した [{text,pos}]
- examples_extra: 追加例文2つ {zh, ja, scene:いつ・どんな気持ちで言うか(短く、${NL}で), chunks:[{text,pos}]}（語彙は ${levelGoal} 以下）
- usage_context: ネイティブがこの語をどこで見て・使うか（スーパー/夜市/レストラン/ニュース/SNS/新聞など具体的な場所・メディア）と頻度感を1〜2文(${NL})で
- frequency_level: 使用頻度 1〜5 の整数（5=毎日レベル、1=まれ）
- register_tag: "口語" / "書面" / "口語・書面" のどれか
- related_words: 類義語(kind:"syn")2〜3・反義語(kind:"ant")0〜2・関連語(kind:"rel")2〜3 の配列。各 {word:繁体字, kind, note:使い分け・関係の短い説明(${NL})}。類義語の note には「${data.headword}」とのニュアンスの違いを必ず書く
- measure_words: **名詞の場合のみ**、その名詞に使う量詞を1〜3個 {word:"一張"のように数字1つき繁体字, zhuyin:注音, pinyin:拼音, note:いつその量詞を使うか(複数ある場合は使い分けを短く、${NL}で)}。名詞でなければ空配列
- pronunciation_tips: **${learnerL1}が台湾華語でつまずくポイントに絞った発音アドバイス**（2〜3文、${NL}）。\n${l1}\n  この語の声調の型と、上の干渉項目のうち**この語に実際に当てはまるものだけ**を具体的に書く
- taiwan_note: 台湾ならではの一言雑学（文化・習慣・歴史・流行）を1〜2文(${NL})。誤用しやすい語法の注意があれば1文追加
- etymology: 漢字の語源・成り立ち（1〜2文、${NL}）
- radicals: 部首と意味の説明（1文、${NL}）
- mnemonic: 記憶に残るひとことフレーズ・覚え方（${NL}）

${data.hintCategory ? `カテゴリのヒント: ${data.hintCategory}` : ""}`
        : `「${data.headword}」(${data.targetLanguage})について、発音、意味(${NL})、品詞、レベル、カテゴリ、例文とその訳(${NL})を生成してください。`;

    const pro = await isProUser(context.userId);
    const preferredModel = pro ? ai.modelRichPremium : ai.modelRich;
    // Plain text + robust JSON parse (like suggestWords). We deliberately do NOT
    // use experimental_output / response_format=json_schema here: Gemini's
    // OpenAI-compatible endpoint rejects many json_schema shapes with a 400,
    // which threw the whole call and left every caught word with empty extras.
    //
    // 重要(2026-07-16の不具合修正): 以前はここで「全項目が空のJSONテンプレート」を
    // 例として渡していたため、gemini-3-flash がその空テンプレートをそのまま返し、
    // 27/29語の extras が空(意味しか出ない)になっていた。空の例は絶対に見せず、
    // 「各キーを内容で埋めた1つのJSONだけ返す」と指示する。念のため、返ってきた
    // extras がほぼ空なら1回だけ強めに再生成する。
    const jsonTail =
      `\n\n**出力は上記をすべて内容で埋めた JSON オブジェクト1つだけ**` +
      `（前置き・説明・コードフェンス不要）。含めるキー: ` +
      `headword_zh / reading_zhuyin / pinyin / meaning_ja / part_of_speech / level / ` +
      `category_key / new_shelf / example_sentence / example_translation / ` +
      `extras{ usage_chunks[{parts:[{text,pos}],ja}], example_chunks[{text,pos}], ` +
      `examples_extra[{zh,ja,scene,chunks:[{text,pos}]}], usage_context, ` +
      `frequency_level, register_tag, related_words[{word,kind,note}], ` +
      `measure_words[{word,zhuyin,pinyin,note}], ` +
      `pronunciation_tips, taiwan_note, etymology, radicals, mnemonic }。` +
      `extras の各項目は空文字・空配列にせず、必ず具体的な内容を入れる。`;

    const genOnce = async (extraPush = ""): Promise<GeneratedCard> => {
      // モデルIDが無効なら安全なモデルへ自動フォールバック(404で機能を殺さない)
      const result = await withModelFallback(ai, preferredModel, (m) =>
        generateText({ model: ai.gateway(m), prompt: `${prompt}${jsonTail}${extraPush}` }),
      );
      try {
        return CardSchema.parse(parseJsonFromAiText(result.text));
      } catch {
        throw new Error("AI did not return a structured card");
      }
    };
    const extrasLookEmpty = (c: GeneratedCard): boolean => {
      const e = c.extras;
      if (!e) return true;
      const filled =
        [e.usage_context, e.pronunciation_tips, e.taiwan_note, e.etymology, e.mnemonic].some(
          (v) => !!v && v.trim().length > 0,
        ) ||
        (e.usage_chunks?.length ?? 0) > 0 ||
        (e.related_words?.length ?? 0) > 0 ||
        (e.examples_extra?.length ?? 0) > 0;
      return !filled;
    };
    let card = await genOnce();
    if (extrasLookEmpty(card)) {
      // 1回だけ、空を明確に禁止して作り直す。
      try {
        const retry = await genOnce(
          `\n\n前回 extras が空で不十分でした。今回は usage_chunks / usage_context / ` +
            `related_words / pronunciation_tips / taiwan_note / examples_extra を含め、` +
            `**すべてのextras項目に具体的な内容を必ず入れて**やり直してください。`,
        );
        if (!extrasLookEmpty(retry)) card = retry;
      } catch {
        /* keep the first result */
      }
    }
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
          taiwan_usage: card.extras?.usage_context || card.extras?.common_situation || null,
        },
      ]),
    );
    return {
      ...card,
      headword_zh: resolvedHead,
      category_key: normalizeCategory(resolvedHead, card.category_key),
      // どの言語で書いた解説かを刻む。表示言語を切り替えたときに
      // 古い言語のカードだけを作り直せる(#65)。
      // あわせて**どの母語向けに書いたか**も刻む。発音のコツと語順の説明は
      // 母語ごとに中身が変わるので、母語を変えたら作り直す必要がある。
      extras: { ...card.extras, explain_lang: explainLang, explain_l1: l1Info.code },
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
    const ai = await getAiFor("card");
    await assertWithinDailyCap(context.userId, "phrase_card");
    // Plain text + tolerant parse (see generateCard) — avoid json_schema output
    // that Gemini's OpenAI-compatible endpoint rejects.
    const levelGoal = await getUserLevelGoal(context.userId);
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId);
    // 説明文の言語名。以前ここが「日本語」固定で、英語設定と矛盾していた。
    const explainLang = await getExplanationLanguage(context.userId);
    const NL = explainLang === "en" ? "英語" : "日本語";
    // フレーズの返し方も母語で崩れ方が違う(語順・助詞・丁寧さの出し方)。
    const l1Gram = await l1Rule(context.userId, "wordorder");
    const result = await generateText({
      model: ai.gateway(ai.modelRich),
      prompt:
        `台湾華語(繁體字)のフレーズカードを作ります。\n${langRule}\n${levelRule}\n${l1Gram}\n` +
        `フレーズ: 「${data.phrase}」\n` +
        (data.scene ? `聞いた/使いたいシーン: ${data.scene}\n` : "") +
        `学習者の目標レベル: ${levelGoal}(TOCFL)。repliesの語彙はこのレベル以下に抑える。\n` +
        `\n次をJSONオブジェクトだけで出力(前置き・マークダウン不要):\n` +
        `- reading_zhuyin: フレーズ全体の注音(台湾教育部準拠)\n` +
        `- pinyin: 拼音\n` +
        `- meaning_ja: 意味(簡潔に、${NL}で)\n` +
        `- usage_note: いつ・誰が・どんなトーンで使うか(1〜2文、${NL})\n` +
        `- common_situation: 最もよくある場面(1文、${NL})\n` +
        `- replies: このフレーズを言われた時の自然な返し方2〜3個 {zh: 繁體字, ja: ${NL}訳}。` +
        `例:「請稍等」→「好、謝謝」\n` +
        `形式: {"reading_zhuyin":"","pinyin":"","meaning_ja":"","usage_note":"","common_situation":"","replies":[{"zh":"","ja":""}]}`,
    });
    const card = (() => {
      try {
        return PhraseCardSchema.parse(parseJsonFromAiText(result.text));
      } catch {
        throw new Error("AI did not return a structured phrase card");
      }
    })();
    await logUsage(context.supabase, context.userId, "phrase_card");
    return card;
  });

// --- Pro: 項目別ワンタッチ再生成 (2026-07-25) --------------------------------
// カード全体の作り直しではなく、気に入らない1項目だけをAIに作り直させる。
// words は共有テーブルなので updateWordExtras と同じ所有チェック
// (この語のステッカーを持つユーザーのみ)+Pro 限定+日次キャップ。

const REGEN_SECTIONS = [
  "meaning",
  "measure_words",
  "usage_context",
  "example",
  "examples_extra",
  "usage_chunks",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "taiwan_note",
] as const;
export type RegenSection = (typeof REGEN_SECTIONS)[number];

const RegenInput = z.object({
  word_id: z.string().uuid(),
  section: z.enum(REGEN_SECTIONS),
});

const CHUNK_RULE = `チャンクは {text: 繁体字パーツ, pos: 役割} の配列。pos は S/V(V1,V2)/O(O1,O2)/M/C/Ptc。`;

export const regenerateCardSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegenInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const {
      isProUser: proCheck,
      levelInstruction: lvl,
      explanationLanguageRule: langFn,
    } = await import("./ai-provider.server");
    if (!(await proCheck(userId))) throw new Error("項目の再生成は Pro 限定です");
    await assertWithinDailyCap(userId, "card");

    // 所有チェック: この語のステッカーを持つユーザーだけが編集できる。
    const { data: owned } = await supabase
      .from("stickers")
      .select("id")
      .eq("user_id", userId)
      .eq("word_id", data.word_id)
      .limit(1)
      .maybeSingle();
    if (!owned) throw new Error("この単語を編集する権限がありません");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: word, error } = await supabaseAdmin
      .from("words")
      .select(
        "id, headword, meaning_ja, part_of_speech, source, example_sentence, example_translation, extras",
      )
      .eq("id", data.word_id)
      .maybeSingle();
    if (error || !word) throw new Error("単語が見つかりません");

    const levelRule = await lvl(userId);
    const langRule = await langFn(userId);
    // 各項目の指示にある「日本語で」を表示言語に合わせて差し替える(#65)。
    const regenLang = await getExplanationLanguage(userId);
    const NL = regenLang === "en" ? "英語" : "日本語";
    const l1Pron = await l1Rule(userId, "pronunciation");
    // 語順・コロケーション側にも母語を渡す。単体で作り直したときも
    // 一括生成(generateCard)と同じ観点になるようにする。
    const l1Gram = await l1Rule(userId, "wordorder");
    const learnerL1 = (await getLearnerL1(userId)).speakerJa;
    const head = word.headword as string;
    const base = `台湾華語(繁体字)の単語「${head}」(意味: ${word.meaning_ja})について、カードの一項目だけを作り直します。${langRule} ${levelRule} 出力はJSONオブジェクト1つだけ(前置き不要)。`;

    // 各項目のプロンプトと出力形。extras へのマージで反映する。
    const spec: Record<RegenSection, { prompt: string; schema: z.ZodTypeAny }> = {
      meaning: {
        prompt: `${base}\n{"meaning_ja": "意味(${NL}で簡潔に、複数の意味があれば「/」区切り)"}`,
        schema: z.object({ meaning_ja: z.string().min(1) }),
      },
      measure_words: {
        prompt: `${base}\nこの名詞に使う量詞を1〜3個。複数ある場合は使い分けを note に書く。\n{"measure_words":[{"word":"一張","zhuyin":"ㄧˋ ㄓㄤ","pinyin":"yí zhàng","note":"平らな物に"}]}`,
        schema: z.object({
          measure_words: z
            .array(
              z.object({
                word: z.string(),
                zhuyin: z.string().catch(""),
                pinyin: z.string().catch(""),
                note: z.string().catch(""),
              }),
            )
            .min(1),
        }),
      },
      usage_context: {
        prompt: `${base}\n{"usage_context":"ネイティブがどこで見て使うか(スーパー/夜市/ニュース/SNS/新聞など具体的に)+頻度感を1〜2文","frequency_level":1〜5の整数,"register_tag":"口語/書面/口語・書面"}`,
        schema: z.object({
          usage_context: z.string(),
          frequency_level: z.number().int().min(1).max(5).catch(3),
          register_tag: z.string().catch(""),
        }),
      },
      example: {
        prompt: `${base}\nネイティブが「${head}」を最も使う場面・気持ちの例文を1つ。${CHUNK_RULE}\n{"example_sentence":"繁体字例文","example_translation":"訳(${NL})","example_chunks":[{"text":"","pos":""}]}`,
        schema: z.object({
          example_sentence: z.string().min(1),
          example_translation: z.string().catch(""),
          example_chunks: z
            .array(z.object({ text: z.string(), pos: z.string().catch("") }))
            .catch([]),
        }),
      },
      examples_extra: {
        prompt: `${base}\n追加の例文2つ。それぞれ scene(いつ・どんな気持ちで言うか)と chunks を付ける。${CHUNK_RULE}\n{"examples_extra":[{"zh":"","ja":"","scene":"","chunks":[{"text":"","pos":""}]}]}`,
        schema: z.object({
          examples_extra: z
            .array(
              z.object({
                zh: z.string(),
                ja: z.string().catch(""),
                scene: z.string().catch(""),
                chunks: z
                  .array(z.object({ text: z.string(), pos: z.string().catch("") }))
                  .catch([]),
              }),
            )
            .min(1),
        }),
      },
      usage_chunks: {
        prompt: `${base}\nネイティブが「${head}」をどう組み合わせるかの型・コロケーションを4〜5個。よく使う動詞・量詞・定番チャンク優先。\n${learnerL1}が語順・量詞・「的」の位置で崩しやすい型を優先する。\n${l1Gram}\n${CHUNK_RULE}\n{"usage_chunks":[{"parts":[{"text":"","pos":""}],"ja":"短い説明"}]}`,
        schema: z.object({
          usage_chunks: z
            .array(
              z.object({
                parts: z.array(z.object({ text: z.string(), pos: z.string().catch("") })),
                ja: z.string().catch(""),
              }),
            )
            .min(1),
        }),
      },
      related_words: {
        prompt: `${base}\n類義語(syn)2〜3・反義語(ant)0〜2・関連語(rel)2〜3。類義語の note には「${head}」との使い分けを必ず書く。\n{"related_words":[{"word":"繁体字","kind":"syn|ant|rel","note":"短い説明(${NL})"}]}`,
        schema: z.object({
          related_words: z
            .array(
              z.object({
                word: z.string(),
                kind: z.enum(["syn", "ant", "rel"]).catch("rel"),
                note: z.string().catch(""),
              }),
            )
            .min(1),
        }),
      },
      pronunciation_tips: {
        prompt: `${base}\n${learnerL1}が「${head}」の発音でつまずくポイントに絞ったアドバイス2〜3文(${NL})。\n${l1Pron}\nこの語に実際に当てはまるものだけを具体的に。\n{"pronunciation_tips":""}`,
        schema: z.object({ pronunciation_tips: z.string().min(1) }),
      },
      etymology: {
        prompt: `${base}\n{"etymology":"漢字の語源・成り立ち(1〜2文)","radicals":"部首と意味(1文)"}`,
        schema: z.object({ etymology: z.string().min(1), radicals: z.string().catch("") }),
      },
      mnemonic: {
        prompt: `${base}\n{"mnemonic":"記憶に残るひとことフレーズ・覚え方(${NL})"}`,
        schema: z.object({ mnemonic: z.string().min(1) }),
      },
      taiwan_note: {
        prompt: `${base}\n{"taiwan_note":"台湾ならではの一言雑学(文化・習慣・歴史・流行)1〜2文+誤用しやすい語法があれば1文"}`,
        schema: z.object({ taiwan_note: z.string().min(1) }),
      },
    };

    const { prompt, schema } = spec[data.section];
    const ai = await getAiFor("card");
    const result = await withModelFallback(ai, ai.modelRichPremium, (m) =>
      generateText({ model: ai.gateway(m), prompt }),
    );
    let out: Record<string, unknown>;
    try {
      out = schema.parse(parseJsonFromAiText(result.text)) as Record<string, unknown>;
    } catch {
      throw new Error("AIが項目を生成できませんでした。もう一度お試しください");
    }

    // ベース列(meaning/example)は verified 語では守る(constitution §2-1)。
    const baseUpdate: Record<string, unknown> = {};
    const extrasPatch: Record<string, unknown> = { ...out };
    if (data.section === "meaning") {
      delete extrasPatch.meaning_ja;
      if (word.source !== "verified") baseUpdate.meaning_ja = out.meaning_ja;
    }
    if (data.section === "example") {
      delete extrasPatch.example_sentence;
      delete extrasPatch.example_translation;
      if (word.source !== "verified") {
        baseUpdate.example_sentence = out.example_sentence;
        baseUpdate.example_translation = out.example_translation;
      }
    }

    const merged = mergeExtras(
      (word.extras ?? null) as Parameters<typeof mergeExtras>[0],
      extrasPatch as Parameters<typeof mergeExtras>[1],
    );
    const { error: upErr } = await supabaseAdmin
      .from("words")
      .update({ ...baseUpdate, extras: merged as never } as never)
      .eq("id", data.word_id);
    if (upErr) throw new Error(upErr.message);

    await logUsage(context.supabase, userId, "card");
    return { ok: true, section: data.section };
  });
