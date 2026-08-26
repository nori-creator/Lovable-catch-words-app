import { normalizeTargetLanguage } from "./target-lang";
import type { L1Code } from "./l1";

/**
 * 「覚え方」を**その人の母語の記憶に引っ掛ける**ための指示。
 *
 * オーナー指示 2026-08-26:
 * > 「覚え方のコツの欄は母語、表示言語によって解説を母語に合わせて。
 * >  mnemonics や覚え方や母語（ここでは例として日本語）として定着している
 * >  単語との関連や簡単な英単語との関連で記憶しやすい言葉があれば関連させて
 * >  （**実際の固有名詞との関連付けがあればなおいい**）」
 * >
 * > 例: ドッヂボール → dodge（避ける）／チョークスリーパー・チョーカー → choke／
 * >     pop-up ads・popcorn → pop up／ポケモンのリザードン → lizard／
 * >     マインクラフトのエンチャント → enchant／TGI Friday's → TGIF
 *
 * ## なぜ (学習言語 × 母語) の表なのか
 *
 * 覚え方の引っ掛かりは**両方の言語に依る**。学習言語だけでは決まらない。
 *
 * - 日本語話者に `dodge` を教えるなら「ドッヂボール」が最短の橋になる。
 *   同じ橋は台湾の学習者には掛からない（「躲避球」は音を借りていない）。
 * - 台湾の学習者には `chocolate` ↔「巧克力」のような**音訳**が効く。
 *   日本語話者にも「チョコレート」が効くが、字の形が違うので手掛かりが違う。
 * - 日本語話者が台湾華語を学ぶときは、**同じ漢字**がいちばんの橋であり、
 *   同時にいちばんの罠でもある（「手紙」＝トイレットペーパー）。
 *
 * だから `target-profile.ts`（学習言語の表）にも `l1.ts`（母語の表）にも
 * 置けない。**組み合わせの表**として1箇所に置き、両方から読む。
 *
 * ## 無理に作らせない
 * 橋が無い語に橋を捏造させると、**嘘を覚える**。
 * 「無ければ語の形・音・意味そのものから作る」を必ず添える。
 */

/** 母語ごとの「その言語に定着している物」の呼び方と、実際に効く例。 */
type Bridge = {
  /** その母語で「外から来て定着した語」を何と呼ぶか。 */
  loanwordName: string;
  /** 実際に効く例。**その文化で通じる物だけ**を並べる。 */
  examples: string;
};

/** `${学習言語}|${母語}` の組み合わせ。 */
const BRIDGES: Record<string, Bridge> = {
  "en|ja": {
    loanwordName: "カタカナ語・日本で通じる固有名詞（商品名・作品名・店名）",
    examples:
      "「ドッヂボール」→ dodge（避ける）／" +
      "「チョーカー」「チョークスリーパー」→ choke（締める）／" +
      "「ポップコーン」「ポップアップ広告」→ pop up（跳び出す）／" +
      "ポケモンの「リザードン」→ lizard（とかげ）／" +
      "マインクラフトの「エンチャント」→ enchant（魔法をかける）／" +
      "「TGI Friday's」→ TGIF",
  },
  "en|zh-TW": {
    loanwordName: "台湾で定着している音訳語・台湾で通じる固有名詞（ブランド・作品名）",
    examples:
      "「巧克力」→ chocolate ／「沙發」→ sofa ／「三明治」→ sandwich ／" +
      "「馬拉松」→ marathon ／「幽默」→ humor ／「邏輯」→ logic ／" +
      "「星巴克」→ Starbucks ／「寶可夢」→ Pokémon（pocket monster）",
  },
  "zh-TW|ja": {
    loanwordName: "日本語の漢語（同じ漢字を使う語）",
    examples:
      "「電車」「学校」のように**日本語とほぼ同じ意味**の語は、その旨を書けば一発で覚わる。" +
      "逆に**同じ字で意味が違う語は必ず警告する** —" +
      "「手紙」＝トイレットペーパー／「汽車」＝自動車／「走」＝歩く／「湯」＝スープ。" +
      "ここを書かないと、覚えたつもりで間違える",
  },
  "zh-TW|en": {
    loanwordName: "英語に入っている中国語由来の語",
    examples:
      "kung fu ←「功夫」／ tofu ←「豆腐」／ typhoon ←「颱風」／" +
      "dim sum ←「點心」／ feng shui ←「風水」／ tea ←「茶」",
  },
};

/**
 * 「覚え方」の欄に渡す指示。
 *
 * @param targetLanguage 学習している言語
 * @param l1Code 読む人の母語（`reader-language.ts` が決めた1つ）
 * @param explanationLanguageName 解説を書く言語の呼び名（「日本語」など）
 */
export function mnemonicRule(
  targetLanguage: string | null | undefined,
  l1Code: L1Code | string | null | undefined,
  explanationLanguageName: string,
): string {
  const target = normalizeTargetLanguage(targetLanguage);
  const l1 = (l1Code ?? "").trim();
  const bridge = BRIDGES[`${target}|${l1}`];

  const head =
    `記憶に残るひとことの覚え方（${explanationLanguageName}）。\n` +
    `  **${explanationLanguageName}で書く。** 学習者はこの言葉で読む。`;

  if (!bridge) {
    // 組み合わせの表に無い（母語＝学習言語など、本来起きない形）。
    // **橋を捏造させない。** 語そのものから作らせる。
    return (
      `${head}\n` +
      "  語の形・音・意味そのものから、短くて絵が浮かぶ覚え方を作る。\n" +
      "  こじつけが過ぎるものは書かない — **覚え間違いの種になる。**"
    );
  }

  return (
    `${head}\n` +
    `  **いちばん良いのは、${bridge.loanwordName}との結び付け。**\n` +
    `  すでに知っている物に引っ掛けるのが、いちばん記憶に残る。\n` +
    `  例: ${bridge.examples}\n` +
    "  次に良いのは、その人が知っていそうな**やさしい語**との結び付け。\n" +
    "  **橋が無い語に橋を捏造しない。** 音が少し似ているだけの物を\n" +
    "  無理に結び付けると、**間違った意味や綴りを一緒に覚えてしまう。**\n" +
    "  その場合は語の形・音・意味そのものから短い覚え方を作る。"
  );
}

/** 表に組み合わせが在るか（試験と門で数えるため）。 */
export function hasMnemonicBridge(
  targetLanguage: string | null | undefined,
  l1Code: L1Code | string | null | undefined,
): boolean {
  return `${normalizeTargetLanguage(targetLanguage)}|${(l1Code ?? "").trim()}` in BRIDGES;
}
