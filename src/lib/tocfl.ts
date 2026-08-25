/**
 * TOCFL(華語文能力測驗)の級。
 *
 * ## いまは `level-scale.ts` の**言い換え**
 * 2026-08-24 の二言語化で、級の目盛りは体系に依らない形
 * (`src/lib/level-scale.ts`)へ移した。TOCFL も CEFR も「6段 + 3帯」で
 * 形が同じなので、段々の絵も読み取り方も共有できる。
 *
 * このファイルを消さずに残しているのは、**呼ぶ側を一度に書き換えないため**。
 * `TOCFL_LEVELS` / `parseTocflStep` などの名前で 10箇所以上から呼ばれていて、
 * 一度に触ると「見た目を変えない」という第2段の約束を確かめにくくなる。
 * ここは中身を持たず、`level-scale.ts` にそのまま渡す。
 *
 * **新しく書くものは `level-scale.ts` を直に使うこと。**
 *
 * ---
 *
 * オーナー:
 * > 「**積み木のイメージではなく、かたちとして積み木のように TOCFL の
 * >  レベル別に段々になっていて、色分けさせていて、この単語がどのレベルか
 * >  視覚的に分かるようにして。**」
 *
 * 前は `TOCFL-2` という文字の札が1つ出ているだけで、**2が6段のうちの
 * どこなのか**が分からなかった。
 *
 * ## 級外を「無い」で済ませない
 * 辞書に級が無い語は珍しくない(固有名詞・新語・方言)。そこを `null` の
 * まま画面に渡すと「段が1つも光らない図」になり、壊れて見える。
 * **級外という段がある**ことにして、6段の外側に置く。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import {
  LEVEL_BANDS,
  LEVEL_INDEXES,
  LEVEL_OUT,
  bandLabelKey as bandLabelKeyOf,
  bandOf as bandOfIndex,
  parseLevelStep,
  stepColorVar as stepColorVarOf,
  stepHeight as stepHeightOf,
  stepsInBand,
  type LevelBand,
  type LevelIndex,
} from "./level-scale";

export const TOCFL_LEVELS = LEVEL_INDEXES;
export type TocflLevel = LevelIndex;

/** 級外(TOCFL の語彙表に載っていない語)。 */
export const TOCFL_OUT = LEVEL_OUT;

/** 段のどれか。`null` は「まだ分からない」で、`"out"` とは違う。 */
export type TocflStep = TocflLevel | typeof TOCFL_OUT;

/**
 * `"TOCFL-2"` `"tocfl 2"` `"2"` `"Level 3"` のどれからでも級を取り出す。
 *
 * - 1〜6 の外(0 や 7)は級ではない → `TOCFL_OUT`
 * - 数字が1つも無い(`"級外"` `"不明"` `""`)→ `null`(分からない)
 */
export function parseTocflStep(raw: string | number | null | undefined): TocflStep | null {
  return parseLevelStep(raw) as TocflStep | null;
}

/** 段の高さ(0〜1)。1級がいちばん低く、6級がいちばん高い。 */
export function stepHeight(level: TocflLevel): number {
  return stepHeightOf(level);
}

/** 色のトークン名(`src/styles.css` の `--level-*`)。素の16進を書かない。 */
export function stepColorVar(step: TocflStep): string {
  return stepColorVarOf(step);
}

/** その段の名前の翻訳キー。 */
export function stepLabelKey(step: TocflStep): string {
  return step === TOCFL_OUT ? "tocfl.out" : "tocfl.level";
}

/**
 * TOCFL の帯(Band)。
 *
 * TOCFL は6つの級を**2つずつ3つの帯**にまとめている。級だけを並べると
 * 「6段のうちの何段目か」しか読めないが、帯まで見えると
 * 「入門のかたまりの中の上」のように**位置の意味**が読める。
 */
export const TOCFL_BANDS = LEVEL_BANDS;
export type TocflBand = LevelBand;

/** その級が属する帯。1-2=A / 3-4=B / 5-6=C。 */
export function bandOf(level: TocflLevel): TocflBand {
  return bandOfIndex(level);
}

/** 帯に属する級(小さい順)。 */
export function levelsInBand(band: TocflBand): TocflLevel[] {
  return stepsInBand(band);
}

/** 帯の名前の翻訳キー。 */
export function bandLabelKey(band: TocflBand): string {
  return bandLabelKeyOf(band);
}
