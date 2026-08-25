import { refineUsageChunks, type WordExtrasDTO } from "./extras";
import { registerScaleOf } from "./register-scale";
import { targetProfile, type ProfileSection } from "./target-profile";

/**
 * 語のカードの節。**画面と生成側で1つの出所を共有する。**
 *
 * ## なぜ切り出したか
 * 「作り直せる節」の一覧が `WordCard.tsx` と `ai.functions.ts` の
 * **2箇所に別々に書かれていた**。片方だけに足すと、
 *   ・画面にだけ足す → 「作る」を押せるのに server が弾く
 *   ・server にだけ足す → 作れるのにボタンが出ない
 * どちらも**エラーにならず、押した人にだけ起きる**。
 * `quick_facts` を足したときは両方に手で書いて、たまたま合っていた。
 * たまたま合うものは、いつか合わなくなる。
 */

/**
 * カードに並ぶ節の**全部**(どの学習言語のカードにも出うる物の集合)。
 *
 * ## 順序はここでは決めない
 * 既定の並びは `target-profile.ts` の `sections` が言語ごとに持っている。
 * ここは**存在の定義**だけ — 「この名前の節がある」という一覧。
 *
 * ## 言語ごとに出る物が違う
 *   台湾華語だけ … `measure_words`(量詞) / `taiwan_note`
 *   英語だけ     … `forms` / `countability` / `stress` /
 *                  `phrasal_verbs` / `culture_note`
 * どちらに出るかを `if (lang === …)` で書かない。`sectionsFor()` を通す。
 */
export const SECTION_IDS = [
  // --- どの言語のカードにも出る -------------------------------------------
  "meaning",
  "web_images",
  "usage_context",
  "encounter",
  "example",
  "examples_extra",
  "usage_chunks",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "real_usage",
  // --- 台湾華語のカードだけ -----------------------------------------------
  "measure_words",
  "taiwan_note",
  // --- 英語のカードだけ ---------------------------------------------------
  "forms",
  "countability",
  "stress",
  "phrasal_verbs",
  "culture_note",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/**
 * その学習言語のカードに出る節を、**その言語の並び順で**返す。
 *
 * 出所は `target-profile.ts` の `sections` ただ1つ。画面の既定の並びも、
 * 裏で順に作る仕組みも、設定の並べ替えの一覧も、全部ここを通る。
 *
 * **`ProfileSection` と `SectionId` は同じ物を指す2つの名前**で、
 * 片方に足して片方に足し忘れると型が合わなくなる — それを狙っている
 * (`card-sections.test.ts` が両者の集合が一致することも数えている)。
 */
export function sectionsFor(lang: string | null | undefined): readonly SectionId[] {
  return targetProfile(lang).sections;
}

/**
 * **`SectionId` と `ProfileSection` が1文字も違わないことを、型で確かめる。**
 *
 * 同じ物の名前が2つある(片方は値の並び、片方は言語ごとの一覧の型)。
 * 循環 import になるので1つにまとめられないが、**片方だけに足す**のは
 * この app が何度もやった形なので、足りない側で `tsc` が落ちるようにする。
 * どちらの向きも見る — `sectionsFor` の戻り型だけでは片側しか守れない。
 */
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SectionNamesMatch = Assert<Same<SectionId, ProfileSection>>;

/**
 * AI で作り直せる節。外部リンク系(`web_images` / `real_usage`)は
 * 生成物ではないので入らない。
 */
export const REGEN_SECTIONS = [
  "meaning",
  "usage_context",
  "example",
  "examples_extra",
  "usage_chunks",
  "measure_words",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "taiwan_note",
  // --- 英語のカードの節 ---------------------------------------------------
  // **`forms` はここに入らない。** 語形は ECDICT から入る辞書の事実で、
  // AI に作らせる物ではない。作らせると "child" の複数形が "childs" に
  // なり得るし、待ち時間とお金を、既に手元にある答えのために払うことになる。
  "countability",
  "stress",
  "phrasal_verbs",
  "culture_note",
] as const;

export type RegenSection = (typeof REGEN_SECTIONS)[number];

/**
 * その節が AI で作り直せるか。
 *
 * **型を絞る形で書く。** `REGEN_SECTIONS.includes(id)` を直に書くと、
 * `id` が広い型のままなので、server に渡す所で型が合わなくなる
 * (合わせるためにキャストを置くと、食い違いを検査で捕まえられなくなる)。
 */
export function isRegenSection(id: SectionId): id is RegenSection {
  return (REGEN_SECTIONS as readonly string[]).includes(id);
}

/**
 * その節に**中身があるか**。
 *
 * ## なぜ画面から出したか
 * この判定は `WordCard.tsx` の中にあって、画面だけが知っていた。
 * 裏で項目を順に作る仕組み(オーナー指摘「候補を選択した瞬間から裏で
 * 単語の詳細のすべての項目を作り始めてる。項目の上から順に」)を足すと、
 * **server も「この節はまだ空か」を知る必要がある**。同じ問いに2つの答えが
 * あると、server が「空だ」と言い続けて作り直し、画面は「埋まっている」と
 * 言い続ける — 止まらない生成になる。判定はここ1つにする。
 *
 * ## 描く条件と数える条件を必ず一致させる
 * 過去に2回、数え方と描き方がずれて**見出しだけの空の節**が出た
 * (`usage_chunks` と `usage_context`)。中身の有無は「Body が実際に何かを
 * 描くか」で決める。
 */
export type SectionContentInput = {
  headword: string;
  meaning_ja?: string | null;
  example_sentence?: string | null;
  /** `normalizeExtras` を通した extras。 */
  extras: WordExtrasDTO | null;
  /** 「出会う見込み」は数えた答えが届いているときだけ描ける。 */
  hasEncounter?: boolean;
};

export function sectionHasContent(id: SectionId, input: SectionContentInput): boolean {
  const ex = input.extras ?? ({} as WordExtrasDTO);
  switch (id) {
    case "meaning":
      return !!input.meaning_ja;
    case "usage_context":
      return !!(
        ex.usage_context ||
        ex.register_note ||
        ex.common_situation ||
        ex.frequency_level ||
        registerScaleOf(ex) !== null
      );
    case "encounter":
      return !!input.hasEncounter;
    case "example":
      return !!input.example_sentence;
    case "examples_extra":
      return (ex.examples_extra?.length ?? 0) > 0;
    case "usage_chunks":
      return (
        refineUsageChunks(ex.usage_chunks, ex.measure_words, input.headword).length > 0 ||
        (ex.collocations?.length ?? 0) > 0 ||
        !!ex.word_order
      );
    case "measure_words":
      return (ex.measure_words?.length ?? 0) > 0;
    case "related_words":
      return (
        (ex.related_words?.length ?? 0) > 0 ||
        (ex.synonyms?.length ?? 0) > 0 ||
        (ex.antonyms?.length ?? 0) > 0 ||
        !!ex.synonym_diff
      );
    case "pronunciation_tips":
      return !!(ex.pronunciation_tips || ex.study_tips);
    case "etymology":
      return !!ex.etymology || !!ex.radicals;
    case "mnemonic":
      return !!ex.mnemonic;
    case "taiwan_note":
      return !!(ex.taiwan_note || ex.trivia || ex.usage_note);
    // --- 英語のカードの節 ---------------------------------------------------
    case "forms":
      // `forms` が在るだけでは足りない。**活用の無い語**(不変化名詞など)は
      // 全欄が空のオブジェクトになるので、見出しだけの空の節になる。
      // `lemma` は原形で、活用そのものではないので数えない。
      return !!(
        ex.forms &&
        [
          ex.forms.plural,
          ex.forms.past,
          ex.forms.pastParticiple,
          ex.forms.ing,
          ex.forms.third,
          ex.forms.comparative,
          ex.forms.superlative,
        ].some(Boolean)
      );
    case "countability":
      return !!ex.countability;
    case "stress":
      // 音節に切れていなければ描く物が無い。`note` だけでは節にしない。
      return (ex.stress?.syllables?.length ?? 0) > 0;
    case "phrasal_verbs":
      return (ex.phrasal_verbs?.length ?? 0) > 0;
    case "culture_note":
      return !!ex.culture_note;
    // 外の情報を見に行くだけの節は、いつでも描ける。
    case "web_images":
    case "real_usage":
      return true;
  }
}

/**
 * まだ作られていない節を、**画面に並ぶ順のまま**返す。
 * 順番はオーナーの指定(「項目の上から順に」)そのものなので、
 * ここで並べ替えない。
 */
export function missingSections(
  order: readonly SectionId[],
  input: SectionContentInput,
): RegenSection[] {
  return order.filter(
    (id): id is RegenSection => isRegenSection(id) && !sectionHasContent(id, input),
  );
}
