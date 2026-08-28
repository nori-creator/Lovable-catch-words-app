import { createServerFn } from "@tanstack/react-start";
import { meaningRule, distinctionRule } from "@/lib/meaning-rule";
import { mnemonicRule } from "@/lib/mnemonic-rule";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";
import { readingPromptNames, targetProfile } from "./target-profile";
import { resolveLevel } from "./level-source";
import { LEVEL_INDEXES } from "./level-scale";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { CATEGORY_KEYS, ROOM_KEYS, normalizeCategory } from "./category";
import { ExtrasSchema, emptyExtras, mergeExtras, normalizeExtras } from "./extras";
import { scrubForeignNotes } from "./note-language";
import {
  worldExampleRule,
  exampleSourceRule,
  DIARY_COUNT,
  type PersonalMaterial,
} from "./example-sources";
import { CardSchema, CardShapeError, type GeneratedCard } from "./card-schema";

// 形は `card-schema.ts` に移したが、**取り込み元は変えない** —
// 5箇所が `@/lib/ai.functions` から型を取っている。移した都合を
// 呼ぶ側に押し付けない。
export type { GeneratedCard };
import { isTargetHeadword } from "./target-language";
import { taiwanUsageFrom } from "./taiwan-usage";
import { REGEN_SECTIONS, sectionHasContent, type RegenSection } from "./card-sections";
import {
  assertWithinDailyCap,
  getAi,
  getAiFor,
  getUserLevelGoal,
  getUserTargetLanguage,
  levelInstruction,
  explanationLanguageRule,
  getExplanationLanguage,
  explanationLanguageName,
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
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
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
        /** 他の候補との**使い分け**を一言(例: トイレに置く方)。
            日本語の1語が台湾華語では複数の別語になるので、意味だけでは選べない。
            出せなかった回もあるので既定は空 — 空なら描かない。 */
        distinction: z.string().optional().default(""),
        // カード側で踏んだのと同じ罠。棚名が一覧の外だと、
        // **5件まとめて**落ちて「AI did not return structured suggestions」
        // しか残らない。棚は後から直せるので、ここで語を捨てない。
        category_key: z.enum(CATEGORY_KEYS).catch("other"),
      }),
    )
    // 件数も固定しない。4件返ってきた回に**1件も出さない**のは重すぎる。
    .min(1)
    .max(8),
});

export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = await getAiFor("scan");
    await assertWithinDailyCap(context.userId, "suggest");
    // レベルはクライアントの申告ではなく**プロフィールを正**とする
    // (以前は既定の TOCFL-2 が常に使われ、設定が効いていなかった)。
    // 級は**細かさの目安**としてだけ使う(下の `specificity`)。
    const levelGoal = await getUserLevelGoal(context.userId);
    const levelNum = Number(levelGoal.match(/(\d)/)?.[1] ?? 2);
    const langRule = await explanationLanguageRule(context.userId);

    // **ここに `levelInstruction` をそのまま掛けない。**
    //
    // あれは「語彙は必ずこの範囲に収める」と言う指示で、**解説や例文**には
    // 正しい。しかし**学ぶ語の候補**に掛けると、その人が既に知っている
    // 語しか出せなくなる。オーナー指摘(2026-08-20):
    //
    //   「三杯雞の画像をとっても雞肉としか表示されない。服を撮ったときに
    //     衣服としか表示されない。レベルの高い人が衣服という単語を
    //     調べないよね。短袖とかは調べるけど」
    //
    // 候補にとってレベルは**上限ではなく下限**で、「どこまで細かい名前で
    // 呼ぶか」を決める物。だから級の縛りは外し、細かさの指示に置き換える。
    // **例は言語ごとに違う。** 「短袖」「三杯雞」は台湾華語の例で、
    // 英語の学習者に渡しても手掛かりにならない。表は
    // `target-profile.ts` の `capture.specificity` が持つ。
    const profile = targetProfile(data.targetLanguage);
    const band = levelNum <= 2 ? 0 : levelNum <= 4 ? 1 : 2;
    const bandName = ["入門〜基礎", "中位", "上位"][band];
    const specificity = `学習者は${bandName}の級。${profile.capture.specificity[band]}`;

    // **分岐しない。** 前は「台湾華語なら40行、それ以外は1行」だった。
    // カテゴリの規則も「上位の分類語に逃げない」も**写真の話であって
    // 言語の話ではない**ので、どの言語にも要る。言語で変わる所だけを
    // プロフィールから受け取る。
    const prompt = `この画像から、${profile.promptName}の学習対象として有用な名詞を5つ選んでください。
- ${profile.capture.scriptRule}
${specificity}
${langRule}
- 画像に明確に写っているものだけ

**写っている物そのものの名前を出す（いちばん大事）:**
- その言語を話す人がその写真を見て**最初に口にする名前**を出す。
  ${profile.capture.namingExamples}
- **確からしい順に並べる。** 1つ目が「これは何か」への答え。
  自信の無いものを上に置かない。

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

**"other" は本当にどのカテゴリにも当てはまらないときの最終手段。手やマウスを "other" にするのは間違い。**

${distinctionRule(profile.promptName, profile.capture.distinctionExamples)}`;

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
                text: `${prompt}\n\n必ずJSONだけを返してください。**${profile.promptName}の語を出す。他の言語の語を混ぜない。**\n形式: {"suggestions":[{"headword":"${profile.capture.jsonHeadwordHint}",${profile.capture.jsonReadingHint},"meaning_ja":"意味(上で指定した解説の言語で)","distinction":"使い分けの一言","category_key":"${CATEGORY_KEYS.join("|のどれか: ")}"}]}。**確からしい順に並べ**、3〜5件返してください(無理に5件に埋めない — 写っていない物を足すぐらいなら少なくてよい)。`,
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
    if (!content) throw new Error("AIから候補が返りませんでした。もう一度お試しください。");

    await logUsage(context.supabase, context.userId, "suggest");

    try {
      const parsed = SuggestionSchema.parse(parseJsonFromAiText(content));
      return {
        suggestions: parsed.suggestions.map((s) => ({
          ...s,
          category_key: normalizeCategory(s.headword, s.category_key),
        })),
      };
    } catch (e) {
      // **理由を飲まない**(カード生成で踏んだのと同じ)。
      console.warn("suggestWords: 候補の形が合わない", {
        why: e instanceof Error ? e.message : String(e),
        head: content.slice(0, 300),
      });
      throw new Error("候補の形が整いませんでした。もう一度お試しください。");
    }
  });

const CardInput = z.object({
  headword: z.string().min(1),
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
  hintCategory: z.string().optional(),
});

// extras の形は src/lib/extras.ts が唯一の定義(共有)。

// カードの形は `lib/card-schema.ts` が唯一の定義(試験もそこに在る)。

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
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
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

    // 学習言語の名前も分け方の例も、言語の表から取る(決め打たない)。
    const candProfile = targetProfile(data.targetLanguage);
    const prompt = `学習者が母語で「${data.query}」と書いた。これが指す${candProfile.promptName}の候補を挙げてください。

${sceneLine}
${levelRule}
${langRule}

守ること:
- **品詞を選ばない。** 書かれた物が動詞なら動詞、形容詞なら形容詞で答える
  (「走る」→ 跑步 / 跑、「速い」→ 快)。
  ここは**写真に写った物の候補ではなく、人が打ち込んだ言葉**なので、
  名詞に絞ると動詞や形容詞を打った人に候補が1つも返らない。
  返らないと母語のまま次へ渡り、最後に「学んでいる言語の単語ではありません」
  とだけ出る — 打った人には**機能が壊れているようにしか見えない**
  (オーナー指摘 2026-08-20「単語の文字入力がエラーが出て、機能してない」)。
- **細かく分ける。** 母語の1語が${candProfile.promptName}では複数の別語になることが多い。
  例: ${candProfile.capture.distinctionExamples}
- それぞれの distinction に、**他とどう違うか**を短く書く(15文字程度)。
  違いが書けない候補は挙げない — 同じ物の言い換えを並べても選べない。
- 実際に使われている語だけ。${candProfile.capture.scriptRule}。
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
    // **3つある表示言語を2つに潰さない。** ここは
    // `explainLang === "en" ? "英語" : "日本語"` だった — 繁體中文を
    // 選んだ人が「日本語」に落ち、AI が日本語で解説を書いていた
    // (オーナー報告「項目に日本語が混ざる」)。正は
    // `explanationLanguageName()` 1つ。
    const NL = explanationLanguageName(explainLang);
    // 発音のコツは**母語ごとに全く変わる**(有気音が無い/そり舌が無い等)。
    // 設定の母語から具体的な干渉項目を流し込む。
    const l1 = await l1Rule(context.userId, "pronunciation");
    // 語順・量詞・「的」の位置などは母語で崩れ方が違う。例文とチャンクを
    // 「その母語話者が実際に間違える所」に寄せるため、文法側も渡す。
    const l1Gram = await l1Rule(context.userId, "wordorder");
    const l1Info = await getLearnerL1(context.userId);
    const learnerL1 = l1Info.speakerJa;

    // **ここも分岐しない**(上の候補と同じ理由)。前は台湾華語以外が
    // 「発音、意味、品詞、レベル、カテゴリ、例文とその訳を生成してください」
    // の1行に落ちていて、カテゴリの規則も棚の提案も届かなかった。
    const cardProfile = targetProfile(data.targetLanguage);
    // **辞書を引く言語と、級の目盛りを同じ値から出す。** 別々に書くと、
    // 英語のカードを台湾華語の辞書で引く回ができる。
    const cardLanguage = cardProfile.code;
    // 読みの呼び名は言語ごと(注音/拼音 と IPA 米/英)。`readings` から引く。
    const cardReadingNames = readingPromptNames(cardProfile);
    // **保存する形をそのまま並べる**(`TOCFL-1` / `A1`)。名前(`1` / `A1`)を
    // 並べると、AI が `1` と答えて `parseLevelStep` の外に落ちる。
    const levelNames = LEVEL_INDEXES.map((n) => cardProfile.levels.toStored(n)).join(" / ");
    const prompt = `「${data.headword}」について、${cardProfile.promptName}の語彙カードを生成してください。

${langRule}
${levelRule}

入力語の扱い:
- 入力が${cardProfile.promptName}なら headword_zh にそのまま入れる。
- 入力が母語(日本語・繁體中文など)なら、**最も日常的に使われる${cardProfile.promptName}の対応語**に変換し headword_zh に入れる(例:「マンゴー」→「芒果」/「傘」→「umbrella」)。

必須項目:
- headword_zh: 上記ルールで決めた${cardProfile.promptName}の見出し語
${cardProfile.capture.readingRule}
- meaning_ja: ${meaningRule(cardProfile.promptName, NL)}
- part_of_speech: ${cardProfile.capture.posRule}
- level: ${cardProfile.levels.id} のレベル（${levelNames} のいずれか）。
  **公式の語彙表に載っていると確信できないときは "${cardProfile.levels.outStored}"（級外）と答える。**
  検定の語彙表に無い語に級を付けると、公式の級と見分けが付かなくなる
  （オーナー指摘 2026-08-27 ⑭）。当てずっぽうで級を付けるより、級外のほうが正しい。
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
- example_sentence: ネイティブが「${data.headword}」を最も使う場面・気持ちの例文（${cardProfile.promptName}）。学習者の目標レベルは ${levelGoal} — 語彙・文型はこのレベル以下に抑える
  ${worldExampleRule(NL)}
- example_translation: 例文の訳(${NL})

extras 項目（**すべて具体的な内容で必ず埋めること**。空文字・空配列で返さない）:

チャンク分解の共通ルール: parts/chunks は {text: ${cardProfile.promptName}のパーツ, pos: 役割} の配列。
pos は ${cardProfile.chunkRoles.join(" / ")} を使う。
「${data.headword}」自体は必ずどれかのパーツとして含める。

- usage_chunks: ネイティブが「${data.headword}」を**実際にいちばん高い頻度で**組み合わせて使う型を3〜5個。各 {parts:[{text,pos}], ja:短い説明(${NL})}。
  **厳選する。思いつく組み合わせを並べない。** その語で口を開いたときに最初に出る形だけを、頻度の高い順に。
  ${specificChunkRule(data.headword, levelGoal)}
  **短くする**: ${cardProfile.chunkPrompt.lengthRule} それを超えるものは型ではなく例文なので、例文の欄に任せる。
  そのまま声に出せる形にする。「${data.headword}」自体を必ずどれかのパーツに含める。
  ${cardProfile.chunkPrompt.styleRule}
  **${learnerL1}が崩しやすい型を優先する**。該当する型があれば ja に「母語だとこう言いたくなるが${cardProfile.promptName}ではこの形」と一言添える。
${l1Gram}
- example_chunks: example_sentence をパーツ分解した [{text,pos}]
- examples_extra: 追加例文2つ {zh, ja, scene:いつ・どんな気持ちで言うか(短く、${NL}で), chunks:[{text,pos}]}（語彙は ${levelGoal} 以下）
  ${worldExampleRule(NL)}
- usage_context: ネイティブがこの語をどこで見て・使うか（スーパー/夜市/レストラン/ニュース/SNS/新聞など具体的な場所・メディア）と頻度感を1〜2文(${NL})で
- frequency_level: 使用頻度 1〜5 の整数（5=毎日レベル、1=まれ）
- encounter_labels: **この語に出会いやすい所を、短い札で3〜7個**。
  各 {kind, label}。kind は place(場所) / situation(状況) / emotion(気持ち) /
  time(時刻・時期) / media(媒体) / season(季節) / trait(その物じたいの性質) のどれか。
  label は**2〜5文字の具体名**(${NL})。例:
  place「スーパー」「夜市」「駅」/ media「メニュー」「看板」「ニュース」/
  time「朝」「夜」/ season「春」/ situation「注文するとき」/
  emotion「うれしい時」/ trait「熱い」「持ち歩ける」「使い捨て」。
  trait は**その物の手ざわり・大きさ・熱さ・扱い方**など、出会う場所では
  なく物そのものの性質。物でない語(動詞・形容詞)には付けない。
  **抽象語を書かない** —「日常」「いろいろ」「一般的」は札にならない。
  その語に**特に**出会いやすい所だけを挙げる。どこでも出会う語なら
  無理に埋めず少なく返す。
- register_tag: "口語" / "書面" / "口語・書面" のどれか
- register_scale: 話し言葉⇄書き言葉の度合いを **-2〜+2 の整数**で。-2=完全に口語(友達との会話・SNSだけ)/ -1=やや口語 / 0=中立(どちらでも普通に使う)/ +1=やや書面 / +2=完全に書面(新聞・論文・公文書だけ)。**判断できない語でも必ず出す** — 中立なら 0
- scene_weights: **その語にどこで出会うか**の分布。鍵は次の8つだけで、他を作らない: eat(食べ物・飲み物)/ town(街・店・看板・乗り物)/ house(家の中・家具・道具)/ wear(服・持ち物)/ play(遊び・趣味・道具)/ nature(自然・天気・動植物)/ people(人・体・仕事)/ marks(文字・記号・色・形・お金・書類)。合計が1になる小数で、当てはまらない部屋は入れない。例: 芒果 → {"eat":0.7,"town":0.2,"nature":0.1}
- season_months: 旬の月を1〜12の整数の配列で(例: 芒果なら [5,6,7,8])。**通年なら空配列**
- region_scope / region_scope_kind: **「そこにしか無い」と言い切れる時だけ**。
  region_scope に地名(例:「台南」「台湾」)、region_scope_kind に理由を
  specialty(その土地の産物・名物) / institution(その土地にしか無い仕組み・店・制度) /
  regional_word(語そのものがその土地でしか使われない言い方) のどれかで返す。
  **どれとも言えないなら region_scope は空文字、region_scope_kind は null。**
  訊いているのは「この語をどこで見かけたか」ではなく「**そこ以外には無いか**」。
  ✗ 立扇(扇風機)・冷氣(エアコン)・泡芙(シュークリーム)・葡式蛋塔(エッグタルト)・
    棒(すごい) … どれも台湾で見かけるが、台湾にしか無い物ではない → 空文字
  ○ 文旦・肉燥麵(台湾の名物 → specialty) / 悠遊卡(台湾だけの仕組み → institution) /
    その土地だけの言い方(→ regional_word)
  **迷ったら空文字にする。** 誤って限定と書くほうが、書かないより害が大きい
- related_words: 類義語(kind:"syn")2〜3・反義語(kind:"ant")0〜2・関連語(kind:"rel")2〜3 の配列。各 {word:${cardProfile.promptName}の語, kind, note:使い分け・関係の短い説明(${NL}), reading:その語の${cardReadingNames.primary}${cardReadingNames.alt ? `, reading_alt:その語の${cardReadingNames.alt}` : ""}}。類義語の note には「${data.headword}」とのニュアンスの違いを必ず書く。**reading を空にしない** — 読めない語を並べても覚えられない
- measure_words: **名詞の場合のみ**、その名詞に使う量詞を1〜3個 {word:"一張"のように数字1つき繁体字, zhuyin:注音, pinyin:拼音, note:いつその量詞を使うか(複数ある場合は使い分けを短く、${NL}で)}。名詞でなければ空配列。**note を中国語で書かない** — 中国語なのは word/zhuyin/pinyin だけ
- pronunciation_tips: **${learnerL1}が${cardProfile.promptName}でつまずくポイントに絞った発音アドバイス**（2〜3文、${NL}）。\n${l1}\n  ${cardProfile.capture.pronunciationFocus}と、上の干渉項目のうち**この語に実際に当てはまるものだけ**を具体的に書く
- ${cardProfile.capture.noteField}: ${cardProfile.capture.noteRule}（${NL}）
- etymology: ${cardProfile.capture.etymologyRule}（${NL}）
${cardProfile.capture.relativesRule ? `- etymology_relatives: ${cardProfile.capture.relativesRule}（note は${NL}）` : "- etymology_relatives: **空配列**"}
- radicals: ${cardProfile.capture.radicalsRule}
- mnemonic: ${mnemonicRule(data.targetLanguage, l1Info.code, NL)}

${data.hintCategory ? `カテゴリのヒント: ${data.hintCategory}` : ""}`;

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
      `frequency_level, register_tag, register_scale, encounter_labels[{kind,label}], ` +
      `scene_weights, season_months, region_scope, region_scope_kind, ` +
      `related_words[{word,kind,note}], ` +
      `measure_words[{word,zhuyin,pinyin,note}], ` +
      `pronunciation_tips, ${cardProfile.capture.noteField}, etymology, radicals, mnemonic }。` +
      `extras の各項目は空文字・空配列にせず、必ず具体的な内容を入れる。` +
      // **「必ず埋めろ」が限定の誤りを作っていた**(オーナー指摘 2026-08-28 ②
      // 「立扇という単語の時に台湾限定と出た」)。本番で `region_scope` の
      // 入った9語のうち6語が誤りだったのは、当てはまらない語でも埋めろと
      // 迫っていたから。**空が正しい欄**をここで名指しで外す。
      `\n\nただし次の欄は**当てはまらなければ空にする**（無理に埋めない）: ` +
      `region_scope（そこにしか無い物でなければ空文字）/ ` +
      `region_scope_kind（同上、null）/ ` +
      `season_months（通年なら空配列）/ ` +
      `measure_words（名詞でなければ空配列）。`;

    const genOnce = async (extraPush = ""): Promise<GeneratedCard> => {
      // モデルIDが無効なら安全なモデルへ自動フォールバック(404で機能を殺さない)
      const result = await withModelFallback(ai, preferredModel, (m) =>
        generateText({ model: ai.gateway(m), prompt: `${prompt}${jsonTail}${extraPush}` }),
      );
      // **失敗の理由を飲まない。**
      //
      // ここは `catch {}` で全部を握り潰し、"AI did not return a structured
      // card" という英語の1行だけを残していた。JSONが壊れていたのか、
      // どの項目が形に合わなかったのか、そもそも空だったのかが
      // **誰にも分からない**ので、2か月直せなかった
      // (`learnLexiconEntries` の `catch {}` で辞書の蓄積が死んでいたのと
      //  同じ形)。何が落ちたかは必ず記録に残す。
      let raw: unknown;
      try {
        raw = parseJsonFromAiText(result.text);
      } catch {
        console.warn("generateCard: JSONとして読めない", {
          headword: data.headword,
          head: result.text.slice(0, 300),
        });
        throw new CardShapeError("JSONとして読めない返答");
      }
      const checked = CardSchema.safeParse(raw);
      if (checked.success) return checked.data;
      const why = checked.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`)
        .join(" / ");
      console.warn("generateCard: カードの形が合わない", {
        headword: data.headword,
        why,
        head: result.text.slice(0, 300),
      });
      throw new CardShapeError(why);
    };
    const extrasLookEmpty = (c: GeneratedCard): boolean => {
      const e = c.extras;
      if (!e) return true;
      const filled =
        [
          e.usage_context,
          e.pronunciation_tips,
          // **その言語の一言メモを見る。** `taiwan_note` に決め打つと、
          // 英語のカードは `culture_note` が埋まっていても「空」と判定され、
          // 作り直しが毎回走る(費用も待ち時間も倍になる)。
          e.taiwan_note,
          e.culture_note,
          e.etymology,
          e.mnemonic,
        ].some((v) => !!v && v.trim().length > 0) ||
        (e.usage_chunks?.length ?? 0) > 0 ||
        (e.related_words?.length ?? 0) > 0 ||
        (e.examples_extra?.length ?? 0) > 0;
      return !filled;
    };
    // 形が合わなかったときも**1度だけ**やり直す。以前は一発勝負で、
    // モデルが1項目外しただけでその語が永久にカードにならなかった。
    let card: GeneratedCard;
    try {
      card = await genOnce();
    } catch (e) {
      if (!(e instanceof CardShapeError)) throw e;
      card = await genOnce(
        `\n\n前回の返答は形が合いませんでした(${e.message})。` +
          `**JSONオブジェクト1つだけ**を、上に挙げたキーで返してください。` +
          `category_key は指定した一覧の中から必ず1つ選ぶこと。`,
      ).catch((again: unknown) => {
        // 2回とも駄目なら、**その人に読める言葉で**伝える。
        // 英語の1行を日本語の画面に出したまま2か月放置していた。
        throw new Error(
          `カードの形が整いませんでした。もう一度お試しください。` +
            `(${again instanceof Error ? again.message : String(again)})`,
        );
      });
    }
    if (extrasLookEmpty(card)) {
      // 1回だけ、空を明確に禁止して作り直す。
      try {
        const retry = await genOnce(
          `\n\n前回 extras が空で不十分でした。今回は usage_chunks / usage_context / ` +
            `related_words / pronunciation_tips / ${cardProfile.capture.noteField} / examples_extra を含め、` +
            `**すべてのextras項目に具体的な内容を必ず入れて**やり直してください。`,
        );
        if (!extrasLookEmpty(retry)) card = retry;
      } catch {
        /* keep the first result */
      }
    }
    await logUsage(context.supabase, context.userId, "card");
    const resolvedHead = card.headword_zh?.trim() || data.headword;

    /**
     * **級は辞書が正**（オーナー指摘 2026-08-27 ⑭）。
     *
     * ここは辞書を一度も見ずに AI の答えをそのまま採っていた。本番の
     * 辞書には級の分かっている語が英語 7,009 / 台湾華語 4,496 も入って
     * いるので、**答えが手元にあるのに当て推量を買っていた**ことになる。
     * 決め方は `level-source.ts` に1つだけ置いてある。
     *
     * 引けなかったとき（列が無い環境・通信の失敗）は `undefined` のまま
     * 通す — 「辞書に無い語」として AI の答えを読む道に落ちる。
     * ここで `null` にすると、**全部の語が級外**になる。
     */
    let dictStep: number | null | undefined;
    let examTags: string[] = [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: entry, error: dictErr } = await supabaseAdmin
        .from("dictionary_entries")
        .select("level_step, exam_tags")
        .eq("language", cardLanguage)
        .eq("headword", resolvedHead)
        .maybeSingle();
      if (!dictErr && entry) {
        dictStep = entry.level_step ?? null;
        // 級が空の語に**級の代わりに**出す事実(`exam-tags.ts` の注)。
        examTags = (entry.exam_tags as string[] | null) ?? [];
      }
    } catch (e) {
      console.warn("generateCard: 辞書の級を引けなかった", e);
    }
    const level = resolveLevel({ scale: cardProfile.levels, dictStep, aiLevel: card.level });
    // 入力キャッチ・派生キャッチで生まれた語も共有辞書に蓄積(SNS/日常語彙)。
    void import("./lexicon.server").then(({ learnLexiconEntries }) =>
      learnLexiconEntries([
        {
          headword: resolvedHead,
          zhuyin: card.reading_zhuyin,
          pinyin: card.pinyin,
          meaning_ja: card.meaning_ja,
          pos: card.part_of_speech,
          // **地の文を入れない。** ここは制約付きの列で、
          // `usage_context`(「スーパーや夜市でよく見かける」)を直に入れていた。
          // 一括 upsert なので、その1行のせいで**その回の語が1つも入らない**。
          taiwan_usage: taiwanUsageFrom({
            registerTag: card.extras?.register_tag,
            frequencyLevel: card.extras?.frequency_level,
            prose: card.extras?.usage_context || card.extras?.common_situation,
          }),
          notes: card.extras?.usage_context || card.extras?.common_situation || null,
        },
      ]),
    );
    return {
      ...card,
      headword_zh: resolvedHead,
      level: level.stored,
      category_key: normalizeCategory(resolvedHead, card.category_key),
      // どの言語で書いた解説かを刻む。表示言語を切り替えたときに
      // 古い言語のカードだけを作り直せる(#65)。
      // あわせて**どの母語向けに書いたか**も刻む。発音のコツと語順の説明は
      // 母語ごとに中身が変わるので、母語を変えたら作り直す必要がある。
      // **学ぶ言語で返ってきた注記を落とす**(オーナー報告「量詞の説明が
      // 台湾華語になってる」)。プロンプトで言うだけでは 0 にならないので、
      // 返ってきた物のほうを見る(`src/lib/note-language.ts`)。
      extras: {
        ...scrubForeignNotes(card.extras ?? {}, explainLang),
        // **辞書の事実で上書きする。** AI が書いた物より後に置く。
        exam_tags: examTags,
        explain_lang: explainLang,
        explain_l1: l1Info.code,
      },
    };
  });

// --- Phrase cards (§5.2): front = the scene, back = phrase + replies -------

const PhraseInput = z.object({
  phrase: z.string().min(1).max(80),
  scene: z.string().max(200).default(""),
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
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
    // **3つある表示言語を2つに潰さない。** ここは
    // `explainLang === "en" ? "英語" : "日本語"` だった — 繁體中文を
    // 選んだ人が「日本語」に落ち、AI が日本語で解説を書いていた
    // (オーナー報告「項目に日本語が混ざる」)。正は
    // `explanationLanguageName()` 1つ。
    const NL = explanationLanguageName(explainLang);
    // フレーズの返し方も母語で崩れ方が違う(語順・助詞・丁寧さの出し方)。
    const l1Gram = await l1Rule(context.userId, "wordorder");
    /**
     * **学習言語を決め打たない。** ここは「台湾華語(繁體字)のフレーズカードを
     * 作ります」から始まり、読みも返し方も繁體字で固定されていた。
     * 英語を学ぶ人が一言をフレーズとして拾うと、**英語の画面に中文の
     * フレーズカード**が返ってくる（オーナー報告の症状と同じ形）。
     */
    const phraseProfile = targetProfile(await getUserTargetLanguage(context.userId));
    const result = await generateText({
      model: ai.gateway(ai.modelRich),
      prompt:
        `${phraseProfile.promptName}のフレーズカードを作ります。\n${langRule}\n${levelRule}\n${l1Gram}\n` +
        `フレーズ: 「${data.phrase}」\n` +
        (data.scene ? `聞いた/使いたいシーン: ${data.scene}\n` : "") +
        `学習者の目標レベル: ${levelGoal}(${phraseProfile.levels.id})。repliesの語彙はこのレベル以下に抑える。\n` +
        `\n次をJSONオブジェクトだけで出力(前置き・マークダウン不要):\n` +
        `${phraseProfile.capture.readingRule}\n` +
        `- meaning_ja: ${meaningRule(phraseProfile.promptName, NL)}\n` +
        `- usage_note: いつ・誰が・どんなトーンで使うか(1〜2文、${NL})\n` +
        `- common_situation: 最もよくある場面(1文、${NL})\n` +
        `- replies: このフレーズを言われた時の自然な返し方2〜3個 ` +
        `{zh: ${phraseProfile.capture.jsonHeadwordHint}, ja: ${NL}訳}。` +
        `**${phraseProfile.promptName}で書く。**\n` +
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

// 節の一覧は画面と**同じ出所**を見る。別々に持っていたので、
// 片方にだけ足すと「押せるのに弾かれる / 作れるのにボタンが出ない」が
// エラー無しで起きていた。
export type { RegenSection } from "./card-sections";

const RegenInput = z.object({
  word_id: z.string().uuid(),
  section: z.enum(REGEN_SECTIONS),
  /**
   * **まだ空のときだけ作る**(初回の作成)。裏で項目を上から順に埋めていく
   * 仕組みが使う。
   *
   * 「作り直し」(すでに在る解説を捨てて作り直す)は Pro のまま。
   * **カードを最初に完成させることまで有料にはしない** — 無料の人の
   * カードが意味だけで止まってしまう。
   */
  only_if_empty: z.boolean().optional().default(false),
});

/**
 * チャンクの記号。**役割(S/V/O)ではなく詞類表(NORI指定)。**
 *
 * 以前は S/V/O/M/C/Ptc という「文の役割」で出させていた。画面では動詞と
 * 目的語しか色が付かず、残りは全部同じ灰色になっていた — 名詞なのか
 * 副詞なのか介詞なのかが読み取れない。台湾華語では
 * 「この語は Vs(状態動詞)であって V ではない」ことが語順を決めるので、
 * 学習の中身そのものが落ちていた。
 *
 * 台湾の教材(國語教學中心系)の詞類表をそのまま使う。`POS_TABLE` と
 * 同じ記号なので、単語の品詞欄と帯の色が同じ体系で読める。
 */
/**
 * **言語ごとの詞類表を引く**（オーナー報告 2026-08-26、3度目
 * 「単語のチャンク型の項目が生成されてない」）。
 *
 * ここは台湾の詞類表を直に書いていたので、英語のカードにも
 * `V-sep`(離合詞)や `Ptc`(助詞)を選ばせていた。英語に無い記号を
 * 求められた生成は、当たり障りのない物を返すか、丸ごと外す。
 * 記号の一覧は `target-profile.ts` が言語ごとに持つ。
 */
function chunkRule(language: string | null | undefined): string {
  const p = targetProfile(language);
  return `チャンクは {text: ${p.promptName}のパーツ, pos: 品詞} の配列。${p.chunkPrompt.posRule}`;
}

/**
 * **どの語にも付く組み合わせを書かせない**(オーナー指示 2026-08-28 ③)。
 *
 * > 「「買う（買）」や好きのような、どの名詞にも使える汎用的な組み合わせでは、
 * >  実践的なスピーキング力は養えません。」
 *
 * ## ここに1つだけ置く理由
 * 型の指示文は**2箇所**にある（カードを作るときと、その節だけ作り直すとき）。
 * 片方だけ直すと、作り直したカードにだけ汎用の型が戻ってくる — 使う人には
 * 「たまに悪くなる」としか見えない。この app が何度も踏んだ形。
 *
 * 返ってきた物のほうも `lib/generic-chunks.ts` が落とす。指示文と門の
 * **両方**を置くのは、指示文が守られない回が実際に在るから。
 */
function specificChunkRule(headword: string, levelGoal: string): string {
  return (
    `**どの語にも付く組み合わせを書かない。**\n` +
    `✗「買${headword}」「喜歡${headword}」「有${headword}」のように、買う・好き・持っている だけを` +
    `足した形 — 名詞さえあれば言えるので、その語について何も教えていない。\n` +
    `○ **その語とだけ強く結び付いている**言い方（飲み物なら「半糖少冰」「加珍珠」、` +
    `動詞ならその動詞が取る決まった相手・補語、形容詞なら一緒に立つ名詞）。\n` +
    `基準は「**その語を別の語に入れ替えたら成り立たなくなるか**」。成り立つ形は書かない。\n` +
    `語彙のネットワーク（一緒に立つ語）と構文の型（公式）の2種類を混ぜて返す。\n` +
    `**学習者の目標レベル ${levelGoal} に合わせる** — このレベルで実際に口に出せる` +
    `語彙・文型に収める。難しい型を並べても言えるようにはならない。`
  );
}

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
    if (!data.only_if_empty && !(await proCheck(userId))) {
      throw new Error("項目の再生成は Pro 限定です");
    }
    await assertWithinDailyCap(userId, "card");

    // 所有チェック: この語のステッカーを持つユーザーだけが編集できる。
    const { data: owned } = await supabase
      .from("stickers")
      .select("id, caption, location_name, taken_at")
      .eq("user_id", userId)
      .eq("word_id", data.word_id)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!owned) throw new Error("この単語を編集する権限がありません");

    // 例文をその人の記録から作るための材料(オーナー指摘)。
    // **例文の項目を作り直すときだけ**読む — ほかの項目には要らないし、
    // 毎回2本の問い合わせを足す理由が無い。
    let material: PersonalMaterial = {};
    if (data.section === "example" || data.section === "examples_extra") {
      const st = owned as {
        caption?: string | null;
        location_name?: string | null;
        taken_at?: string | null;
      };
      // 日記が読めなくても例文は作れる。**失敗で全体を落とさない。**
      const { data: diaryRows } = await supabase
        .from("journal_entries")
        .select("user_draft")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .limit(DIARY_COUNT);
      material = {
        caption: st.caption ?? null,
        place: st.location_name ?? null,
        takenAt: st.taken_at ?? null,
        diaries: ((diaryRows ?? []) as Array<{ user_draft: string | null }>).map(
          (d) => d.user_draft,
        ),
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: word, error } = await supabaseAdmin
      .from("words")
      .select(
        "id, headword, language, meaning_ja, part_of_speech, source, example_sentence, example_translation, extras",
      )
      .eq("id", data.word_id)
      .maybeSingle();
    if (error || !word) throw new Error("単語が見つかりません");

    // すでに埋まっている節を、裏の自動生成が上書きしない。
    // **判定は画面と同じ関数**(`card-sections.ts`)。ここに写しを置くと、
    // server が「空だ」と言い続けて作り直し、画面は「埋まっている」と
    // 言い続ける — 止まらない生成になる。
    if (
      data.only_if_empty &&
      sectionHasContent(data.section, {
        headword: word.headword as string,
        // **学習言語を渡す。** 渡さないと英語のカードの例文を台湾華語の
        // 目盛りで数え、英語の型を1つ残らず「無い」と判ずる — つまり
        // 作っても作っても空のままになる(`card-sections.ts` の注)。
        language: word.language as string | null,
        meaning_ja: word.meaning_ja as string | null,
        example_sentence: word.example_sentence as string | null,
        extras: normalizeExtras(word.extras),
      })
    ) {
      return { ok: true, section: data.section, filled: false };
    }

    const levelRule = await lvl(userId);
    // 型はレベルで変える(オーナー指示 2026-08-28 ③「ユーザーの語学の
    // レベルによって表示するものを変えるのは守って」)。作り直すときも
    // 同じレベルに合わせないと、その節だけ別のレベルの型になる。
    const regenLevelGoal = await getUserLevelGoal(userId);
    const langRule = await langFn(userId);
    // 各項目の指示にある「日本語で」を表示言語に合わせて差し替える(#65)。
    const regenLang = await getExplanationLanguage(userId);
    // 表示言語は3つある(2026-08-25)。`=== "en" ? … : "日本語"` と書くと、
    // 台湾の人の解説だけが黙って日本語で作られる。呼び名の表は1つ。
    const NL = explanationLanguageName(regenLang);
    const l1Pron = await l1Rule(userId, "pronunciation");
    // 語順・コロケーション側にも母語を渡す。単体で作り直したときも
    // 一括生成(generateCard)と同じ観点になるようにする。
    const l1Gram = await l1Rule(userId, "wordorder");
    const regenL1 = await getLearnerL1(userId);
    const learnerL1 = regenL1.speakerJa;
    const head = word.headword as string;
    // **学習言語を決め打たない。** ここは「台湾華語(繁体字)の単語」と
    // 直に書いてあった。英語のカードをそのまま流すと、AI は英語の語を
    // 渡されながら「台湾華語の単語だ」と言われる。呼び名は言語の表が持つ。
    const regenProfile = targetProfile(word.language as string | null);
    const targetName = regenProfile.promptName;
    const regenReadingNames = readingPromptNames(regenProfile);
    const base = `${targetName}の単語「${head}」(意味: ${word.meaning_ja})について、カードの一項目だけを作り直します。${langRule} ${levelRule} 出力はJSONオブジェクト1つだけ(前置き不要)。`;

    // 各項目のプロンプトと出力形。extras へのマージで反映する。
    const spec: Record<RegenSection, { prompt: string; schema: z.ZodTypeAny }> = {
      meaning: {
        prompt: `${base}\n${meaningRule(regenProfile.promptName, NL)}\n{"meaning_ja": ""}`,
        schema: z.object({ meaning_ja: z.string().min(1) }),
      },
      measure_words: {
        prompt: `${base}\nこの名詞に使う量詞を1〜3個。複数ある場合は使い分けを note に書く。\n**note は必ず${NL}で書く。中国語で書かない**(word/zhuyin/pinyin だけが中国語)。\n{"measure_words":[{"word":"一張","zhuyin":"ㄧˋ ㄓㄤ","pinyin":"yí zhàng","note":"平らな物に"}]}`,
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
        prompt: `${base}\n{"usage_context":"ネイティブがどこで見て使うか(スーパー/夜市/ニュース/SNS/新聞など具体的に)+頻度感を1〜2文","frequency_level":1〜5の整数,"register_tag":"口語/書面/口語・書面","register_scale":-2〜+2の整数(-2=完全に口語 / 0=中立 / +2=完全に書面)}`,
        schema: z.object({
          usage_context: z.string(),
          frequency_level: z.number().int().min(1).max(5).catch(3),
          register_tag: z.string().catch(""),
          register_scale: z.number().int().min(-2).max(2).nullable().catch(null),
        }),
      },
      example: {
        prompt: `${base}\nネイティブが「${head}」を最も使う場面・気持ちの例文を1つ。\n${exampleSourceRule(material, NL)}\n${chunkRule(word.language as string | null)}\n{"example_sentence":"${targetName}の例文","example_translation":"訳(${NL})","example_chunks":[{"text":"","pos":""}]}`,
        schema: z.object({
          example_sentence: z.string().min(1),
          example_translation: z.string().catch(""),
          example_chunks: z
            .array(z.object({ text: z.string(), pos: z.string().catch("") }))
            .catch([]),
        }),
      },
      examples_extra: {
        prompt: `${base}\n追加の例文2つ。それぞれ scene(いつ・どんな気持ちで言うか)と chunks を付ける。\n${exampleSourceRule(material, NL)}\n${chunkRule(word.language as string | null)}\n{"examples_extra":[{"zh":"","ja":"","scene":"","chunks":[{"text":"","pos":""}]}]}`,
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
        prompt: `${base}\nネイティブが「${head}」を**実際にいちばん高い頻度で**組み合わせて使う型を4〜5個。**厳選する。思いつく組み合わせを並べない。**\n${specificChunkRule(head, regenLevelGoal)}\n**短くする**: ${regenProfile.chunkPrompt.lengthRule}\nそのまま声に出せる形にする。${regenProfile.chunkPrompt.styleRule}\n${learnerL1}が崩しやすい型を優先する。\n${l1Gram}\n${chunkRule(word.language as string | null)}\n{"usage_chunks":[{"parts":[{"text":"","pos":""}],"ja":"短い説明"}]}`,
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
        prompt: `${base}\n類義語(syn)2〜3・反義語(ant)0〜2・関連語(rel)2〜3。類義語の note には「${head}」との使い分けを必ず書く。\n**reading を空にしない** — 読めない語を並べても覚えられない(オーナー指示 2026-08-27 ⑧)。\n{"related_words":[{"word":"${targetName}の語","kind":"syn|ant|rel","note":"短い説明(${NL})","reading":"${regenReadingNames.primary}"${regenReadingNames.alt ? `,"reading_alt":"${regenReadingNames.alt}"` : ""}}]}`,
        schema: z.object({
          related_words: z
            .array(
              z.object({
                word: z.string(),
                kind: z.enum(["syn", "ant", "rel"]).catch("rel"),
                note: z.string().catch(""),
                reading: z.string().catch(""),
                reading_alt: z.string().catch(""),
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
        prompt: `${base}\n${regenProfile.capture.relativesRule ? `etymology_relatives: ${regenProfile.capture.relativesRule}\n` : ""}{"etymology":"${regenProfile.capture.etymologyRule}(${NL})","etymology_relatives":[{"word":"","note":""}],"radicals":"${regenProfile.capture.radicalsRule}"}`,
        schema: z.object({
          etymology: z.string().min(1),
          etymology_relatives: z
            .array(z.object({ word: z.string().catch(""), note: z.string().catch("") }))
            .catch([]),
          radicals: z.string().catch(""),
        }),
      },
      mnemonic: {
        prompt: `${base}\n${mnemonicRule(word.language as string | null, regenL1.code, NL)}\n{"mnemonic":""}`,
        schema: z.object({ mnemonic: z.string().min(1) }),
      },
      taiwan_note: {
        prompt: `${base}\n{"taiwan_note":"${regenProfile.capture.noteRule}"}`,
        schema: z.object({ taiwan_note: z.string().min(1) }),
      },
      // --- 英語のカードの節 ---------------------------------------------
      // **`forms`(活用)はここに無い。** 語形は ECDICT から来る辞書の事実で、
      // AI に作らせる物ではない(作らせると "child" の複数形が "childs" に
      // なり得る)。取り込みの時点で埋まっているので、作り直す口も要らない。
      countability: {
        prompt: `${base}\n「${head}」が可算名詞か不可算名詞かと、付く冠詞。\n**${learnerL1}にとってここが最大のつまずき**(母語に冠詞が無い/薄い)ので、note には「なぜ間違えやすいか」ではなく「**どう言えば正しいか**」を書く。\nkind は countable / uncountable / both のどれか。両方あるなら、どちらの意味でどちらになるかを note に書く。\narticle は実際に付く形("a" / "an" / "the" / 付かないなら "—")。\n**note は必ず${NL}で書く。**\n{"countability":{"kind":"uncountable","article":"—","note":"数えるときは a piece of ~ を使う"}}`,
        schema: z.object({
          countability: z.object({
            kind: z.enum(["countable", "uncountable", "both"]).catch("countable"),
            article: z.string().catch(""),
            note: z.string().catch(""),
          }),
        }),
      },
      stress: {
        prompt: `${base}\n「${head}」を音節に切って、どこを強く読むか。\nsyllables は綴りを音節ごとに切った配列(例: "photograph" → ["pho","to","graph"])。**綴りの文字を1つも足さない・落とさない** — つないだら元の語に戻ること。\nprimary は第一強勢の音節の添字(0始まり)、secondary は第二強勢があればその添字、無ければ null。\n**${learnerL1}は声調の言語なので強勢が意識に上りにくい。** note には、この語で特に気をつける点を1文だけ(${NL}で)。\n{"stress":{"syllables":["pho","to","graph"],"primary":0,"secondary":2,"note":"最初を強く、あとは軽く"}}`,
        schema: z.object({
          stress: z.object({
            syllables: z.array(z.string()).min(1),
            primary: z.number().int().min(0).nullable().catch(null),
            secondary: z.number().int().min(0).nullable().catch(null),
            note: z.string().catch(""),
          }),
        }),
      },
      phrasal_verbs: {
        prompt: `${base}\n「${head}」を使う句動詞を2〜4個。**語そのものからは意味が読めない物を優先する**(give up / give in のような物。give me は句動詞ではない)。\n「${head}」が句動詞を作らない語なら、その語を**含む**よく使う連語を挙げる。\nmeaning は${NL}で、example は英語の短い一文。\n{"phrasal_verbs":[{"phrase":"give up","meaning":"あきらめる","example":"Do not give up now."}]}`,
        schema: z.object({
          phrasal_verbs: z
            .array(
              z.object({
                phrase: z.string(),
                meaning: z.string().catch(""),
                example: z.string().catch(""),
              }),
            )
            .min(1),
        }),
      },
      /**
       * 英語の一言メモ。オーナー指示 2026-08-26:
       * > 「台湾人が学習言語英語で勉強する時、単語の項目の台湾ノートは
       * >  要らない。そのかわりひと言単語に関する雑学や知識やを
       * >  コメントをかいて」
       *
       * 前はここが「米/英の言い方の違い」だけだった。違いが無い語のほうが
       * 多いので、**大半の語でこの節が薄くなる**。何を書くかは
       * `target-profile.ts` の `noteRule` が唯一の正
       * (カード全体を作るときの指示と同じ文を使う)。
       */
      culture_note: {
        prompt: `${base}\n${regenProfile.capture.noteRule}(${NL}で)\n{"culture_note":""}`,
        schema: z.object({ culture_note: z.string().min(1) }),
      },
    };

    const { prompt, schema } = spec[data.section];
    const ai = await getAiFor("card");
    // **高性能なモデルは Pro の中身**(オーナーが挙げた有料機能の1つ)。
    // 無料の人にも項目は埋まる — 書き手が変わるだけ。
    const model = (await proCheck(userId)) ? ai.modelRichPremium : ai.modelRich;
    const result = await withModelFallback(ai, model, (m) =>
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
    // 作り直しの経路にも同じ掃除を通す。**片方だけ直すと、もう片方から
    // 中国語の注記が入り続ける**(この app が何度も踏んだ兄弟の取りこぼし)。
    const extrasPatch: Record<string, unknown> = {
      ...scrubForeignNotes(out as Parameters<typeof scrubForeignNotes>[0], regenLang),
    };
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
    return { ok: true, section: data.section, filled: true };
  });
