import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { CATEGORY_KEYS, ROOM_KEYS, normalizeCategory } from "./category";
import { ExtrasSchema, emptyExtras, mergeExtras } from "./extras";
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
import { REGEN_SECTIONS, type RegenSection } from "./card-sections";
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
    const specificity =
      levelNum <= 2
        ? `学習者は入門〜基礎級。**日常でその物を指すときの普通の名前**で呼ぶ` +
          `(例: 「短袖」より「T恤」、「三杯雞」はそのまま「三杯雞」)。`
        : levelNum <= 4
          ? `学習者は進階〜高階級。**店や献立で実際に使われる名前**まで細かく` +
            `(例: 服なら「短袖」「洋裝」、料理なら「三杯雞」「滷肉飯」)。`
          : `学習者は流利級以上。**その道の人が使う正確な名前**まで細かく` +
            `(例: 「純棉短袖」「客家小炒」)。一般名詞は既に知っている。`;

    const prompt =
      data.targetLanguage === "zh-TW"
        ? `この画像から、台湾華語の学習対象として有用な名詞を5つ選んでください。
- 台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）
${specificity}
${langRule}
- 画像に明確に写っているものだけ

**写っている物そのものの名前を出す（いちばん大事）:**
- 台湾人がその写真を見て**最初に口にする名前**を出す。
  料理なら料理名（三杯雞・滷肉飯・珍珠奶茶）であって、材料名（雞肉・米）ではない。
  服なら形の名前（短袖・洋裝・外套）であって、上位の分類（衣服・服裝）ではない。
- **上位の分類語に逃げない。** 「衣服」「食物」「飲料」「動物」は、
  それ以上細かく呼べない写真のときだけ。
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

**distinction(使い分けの一言)は、区別が要るときだけ書く:**
書くのは「母語では1語なのに台湾華語では**別の語に分かれる**」場合だけ。
そのときだけ、見た人が**なぜこの語であって隣の語ではないのか**を選べる。
- 書く例: 衛生紙→「トイレに置く方」/ 面紙→「持ち歩く箱・ポケット」
- 書く例: 湯→「スープ(お湯ではない)」のように、母語からの連想を外す必要があるとき
- **書かない**: 母語と一対一で、迷いようがない語。
  「雞肉」に「鶏の肉全般を指す表現」と書くのは意味の言い換えでしかなく、
  読む人に何も足さない(オーナー指摘 2026-08-20)。そういう語は
  distinction を**空文字**にする。
- 迷ったら空にする。**選ぶ手がかりにならない一言は、無いより悪い** —
  全部の行に何か書いてあると、本当に区別が要る行が埋もれる。`
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
                text: `${prompt}\n\n必ずJSONだけを返してください。形式: {"suggestions":[{"headword":"繁体字","reading_zhuyin":"注音","pinyin":"pinyin","meaning_ja":"日本語","distinction":"使い分けの一言","category_key":"${CATEGORY_KEYS.join("|のどれか: ")}"}]}。**確からしい順に並べ**、3〜5件返してください(無理に5件に埋めない — 写っていない物を足すぐらいなら少なくてよい)。`,
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
  targetLanguage: z.string().default("zh-TW"),
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

    const prompt = `学習者が母語で「${data.query}」と書いた。これが指す台湾華語の候補を挙げてください。

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
  ${worldExampleRule(NL)}
- example_translation: 例文の訳(${NL})

extras 項目（**すべて具体的な内容で必ず埋めること**。空文字・空配列で返さない）:

チャンク分解の共通ルール: parts/chunks は {text: 繁体字パーツ, pos: 役割} の配列。
pos は S(主語)/V(動詞、複数あればV1,V2)/O(目的語、O1,O2)/M(修飾・量詞)/C(接続・介詞)/Ptc(助詞) を使う。
「${data.headword}」自体は必ずどれかのパーツとして含める。

- usage_chunks: ネイティブが「${data.headword}」をどう組み合わせて使うかの型・コロケーションを3〜5個。各 {parts:[{text,pos}], ja:短い説明(${NL})}。例: 拿+衛生紙 → parts:[{text:"拿",pos:"V"},{text:"衛生紙",pos:"N"}]。**その語が実際に現れる形を品詞ごとに網羅する** — 動詞と目的語だけでなく、量詞(M)・状態動詞(Vs)・助動詞(Vaux)・副詞(Adv)・介詞(Prep)・限定詞(Det)・助詞(Ptc)の型も、ネイティブの使用頻度が高い順に入れる。ただし**「量詞+「${data.headword}」だけ」の型は作らない** — それは下の measure_words 欄と丸ごと同じ物になる。量詞を使うなら必ず動詞や述語と一緒の形(例: 拿一張衛生紙)にする。
  **${learnerL1}が語順・量詞・「的」の位置で崩しやすい型を優先して選ぶ**。該当する型があれば ja の説明に「母語だとこう言いたくなるが中国語ではこの順」と一言添える。
${l1Gram}
- example_chunks: example_sentence をパーツ分解した [{text,pos}]
- examples_extra: 追加例文2つ {zh, ja, scene:いつ・どんな気持ちで言うか(短く、${NL}で), chunks:[{text,pos}]}（語彙は ${levelGoal} 以下）
  ${worldExampleRule(NL)}
- usage_context: ネイティブがこの語をどこで見て・使うか（スーパー/夜市/レストラン/ニュース/SNS/新聞など具体的な場所・メディア）と頻度感を1〜2文(${NL})で
- frequency_level: 使用頻度 1〜5 の整数（5=毎日レベル、1=まれ）
- encounter_labels: **この語に出会いやすい所を、短い札で3〜7個**。
  各 {kind, label}。kind は place(場所) / situation(状況) / emotion(気持ち) /
  time(時刻・時期) / media(媒体) / season(季節) のどれか。
  label は**2〜5文字の具体名**(${NL})。例:
  「スーパー」「夜市」「駅」「メニュー」「看板」「ニュース」「道」
  「誕生日」「夜」「春」「うれしい時」。
  **抽象語を書かない** —「日常」「いろいろ」「一般的」は札にならない。
  その語に**特に**出会いやすい所だけを挙げる。どこでも出会う語なら
  無理に埋めず少なく返す。
- register_tag: "口語" / "書面" / "口語・書面" のどれか
- register_scale: 話し言葉⇄書き言葉の度合いを **-2〜+2 の整数**で。-2=完全に口語(友達との会話・SNSだけ)/ -1=やや口語 / 0=中立(どちらでも普通に使う)/ +1=やや書面 / +2=完全に書面(新聞・論文・公文書だけ)。**判断できない語でも必ず出す** — 中立なら 0
- scene_weights: **その語にどこで出会うか**の分布。鍵は次の8つだけで、他を作らない: eat(食べ物・飲み物)/ town(街・店・看板・乗り物)/ house(家の中・家具・道具)/ wear(服・持ち物)/ play(遊び・趣味・道具)/ nature(自然・天気・動植物)/ people(人・体・仕事)/ marks(文字・記号・色・形・お金・書類)。合計が1になる小数で、当てはまらない部屋は入れない。例: 芒果 → {"eat":0.7,"town":0.2,"nature":0.1}
- season_months: 旬の月を1〜12の整数の配列で(例: 芒果なら [5,6,7,8])。**通年なら空配列**
- region_scope: その地域でしか見ないものなら地名(例:「台南」「台湾」)。どこでも見るなら空文字
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
      `frequency_level, register_tag, register_scale, encounter_labels[{kind,label}], ` +
      `scene_weights, season_months, region_scope, ` +
      `related_words[{word,kind,note}], ` +
      `measure_words[{word,zhuyin,pinyin,note}], ` +
      `pronunciation_tips, taiwan_note, etymology, radicals, mnemonic }。` +
      `extras の各項目は空文字・空配列にせず、必ず具体的な内容を入れる。`;

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
        [e.usage_context, e.pronunciation_tips, e.taiwan_note, e.etymology, e.mnemonic].some(
          (v) => !!v && v.trim().length > 0,
        ) ||
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

// 節の一覧は画面と**同じ出所**を見る。別々に持っていたので、
// 片方にだけ足すと「押せるのに弾かれる / 作れるのにボタンが出ない」が
// エラー無しで起きていた。
export type { RegenSection } from "./card-sections";

const RegenInput = z.object({
  word_id: z.string().uuid(),
  section: z.enum(REGEN_SECTIONS),
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
const CHUNK_RULE = `チャンクは {text: 繁体字パーツ, pos: 詞類} の配列。pos は台湾の詞類表の記号を使う: N(名詞)/V(及物動詞)/Vi(不及物)/V-sep(離合詞)/Vs(状態動詞=形容詞)/Vst(状態及物)/Vs-attr/Vs-pred/Vs-sep/Vaux(助動詞)/Vp(変化動詞)/Vpt/Vp-sep/Adv(副詞)/Conj(接続詞)/Prep(介詞)/M(量詞)/Ptc(助詞)/Det(限定詞)。**文を構成する全パーツに付ける**(助詞の「的」「了」「嗎」、副詞の「很」「已經」、限定詞の「這」も省かない)。役割記号(S/O/C/P)は使わない。`;

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
        prompt: `${base}\n{"usage_context":"ネイティブがどこで見て使うか(スーパー/夜市/ニュース/SNS/新聞など具体的に)+頻度感を1〜2文","frequency_level":1〜5の整数,"register_tag":"口語/書面/口語・書面","register_scale":-2〜+2の整数(-2=完全に口語 / 0=中立 / +2=完全に書面)}`,
        schema: z.object({
          usage_context: z.string(),
          frequency_level: z.number().int().min(1).max(5).catch(3),
          register_tag: z.string().catch(""),
          register_scale: z.number().int().min(-2).max(2).nullable().catch(null),
        }),
      },
      example: {
        prompt: `${base}\nネイティブが「${head}」を最も使う場面・気持ちの例文を1つ。\n${exampleSourceRule(material, NL)}\n${CHUNK_RULE}\n{"example_sentence":"繁体字例文","example_translation":"訳(${NL})","example_chunks":[{"text":"","pos":""}]}`,
        schema: z.object({
          example_sentence: z.string().min(1),
          example_translation: z.string().catch(""),
          example_chunks: z
            .array(z.object({ text: z.string(), pos: z.string().catch("") }))
            .catch([]),
        }),
      },
      examples_extra: {
        prompt: `${base}\n追加の例文2つ。それぞれ scene(いつ・どんな気持ちで言うか)と chunks を付ける。\n${exampleSourceRule(material, NL)}\n${CHUNK_RULE}\n{"examples_extra":[{"zh":"","ja":"","scene":"","chunks":[{"text":"","pos":""}]}]}`,
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
        prompt: `${base}\nネイティブが「${head}」をどう組み合わせるかの型・コロケーションを4〜5個。**使用頻度の高い順に、品詞の型を散らす** — 動詞+目的語だけに寄せず、量詞(M)・状態動詞(Vs)・助動詞(Vaux)・副詞(Adv)・介詞(Prep)の型も入れる。ただし**「量詞+「${head}」だけ」の型は作らない**(量詞の欄と丸ごと同じになる)。量詞を使うなら動詞や述語と一緒の形にする。\n${learnerL1}が語順・量詞・「的」の位置で崩しやすい型を優先する。\n${l1Gram}\n${CHUNK_RULE}\n{"usage_chunks":[{"parts":[{"text":"","pos":""}],"ja":"短い説明"}]}`,
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
