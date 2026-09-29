/**
 * **注音を1字ずつ、その字の右に縦に**（オーナー指示 2026-09-27「注音を
 * 各漢字の右に縦に表示して。ピンインはそのまま」）。
 *
 * 台湾の教科書と同じ組み方: 字の右に注音の記号を上から縦に積み、
 * 声調の印（ˊ ˇ ˋ）はその列のさらに右、軽声の印（˙）は列の上に置く。
 *
 * ここは**組み合わせだけ**を決める（画面は `ZhuyinWord`）。
 * 字の数と音節の数が合わないとき（「2個」「T恤」のように字でない物が
 * 混ざる語、読みが欠けた語）は `null` を返し、画面は今までどおり
 * 読みを下の行に出す。**ずれた読みを字に当てるくらいなら、並べない。**
 */

import { neutralizeMeasureGe } from "./tw-neutral-tone";

const HAN = /[㐀-䶿一-鿿々〇]/u;
const TONES = "ˊˇˋ";
const NEUTRAL = "˙";

export type ZhuyinSyllable = {
  /** 注音の記号（声調の印を除く）。上から縦に積む。 */
  body: string;
  /** 2〜4声の印。1声は空。 */
  tone: string;
  /** 軽声（˙）か。 */
  neutral: boolean;
};

export type ZhuyinUnit = { char: string; zhuyin: ZhuyinSyllable | null };

/** 1音節を記号と声調に分ける。 */
export function splitSyllable(raw: string): ZhuyinSyllable {
  let body = "";
  let tone = "";
  let neutral = false;
  for (const ch of raw) {
    if (TONES.includes(ch)) tone = ch;
    else if (ch === NEUTRAL) neutral = true;
    else body += ch;
  }
  return { body, tone, neutral };
}

/**
 * 見出し語と注音を1字ずつ組にする。組めなければ `null`。
 *
 * 注音は音節を空白で区切った形（「ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ」）で保存されている。
 */
export function pairZhuyin(
  headword: string | null | undefined,
  zhuyin: string | null | undefined,
): ZhuyinUnit[] | null {
  const word = (headword ?? "").trim();
  // 量詞の「個」は輕聲で読む（`tw-neutral-tone.ts`、オーナー指示 2026-09-30）。
  const reading = neutralizeMeasureGe(word, zhuyin).trim();
  if (!word || !reading) return null;
  const syllables = reading.split(/\s+/).filter(Boolean);
  const chars = [...word];
  const hanCount = chars.filter((c) => HAN.test(c)).length;
  if (hanCount === 0 || hanCount !== syllables.length) return null;
  // 音節は注音の記号でできている物だけ。ピンインや英字が来たら組まない。
  if (!syllables.every((s) => /^[ㄅ-ㄩㄪ-ㄭˊˇˋ˙]+$/u.test(s))) return null;
  let i = 0;
  return chars.map((char) =>
    HAN.test(char) ? { char, zhuyin: splitSyllable(syllables[i++]) } : { char, zhuyin: null },
  );
}
