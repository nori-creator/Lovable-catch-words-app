import { refineUsageChunks, type WordExtrasDTO } from "./extras";
import { registerScaleOf } from "./register-scale";

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

/** カードに並ぶ節。**順序はここでは決めない**(既定の並びは画面側)。 */
export const SECTION_IDS = [
  "meaning",
  "web_images",
  "usage_context",
  "encounter",
  "example",
  "examples_extra",
  "usage_chunks",
  "measure_words",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "taiwan_note",
  "real_usage",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

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
