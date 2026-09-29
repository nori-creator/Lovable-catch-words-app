/**
 * **量詞の「個」は輕聲で読む**（オーナー指示 2026-09-30「個の注音が間違ってる。輕聲なのに
 * 4声になってる」→「輕聲にして」）。
 *
 * 教育部の審訂音は「個」を ㄍㄜˋ としているが、台湾の人が実際に話すときは、量詞の「個」
 * （一個・這個・那個・幾個 …）は輕聲 ˙ㄍㄜ で読むのがふつう。学ぶ人が耳にする音に合わせる。
 *
 * 変えるのは**量詞の「個」だけ**:
 * - 量詞の欄に出る「個」そのもの（`measureWord: true`）
 * - 数・指示の字（一・兩・這・那・哪・幾・每 …）のすぐ後ろの「個」
 *
 * 「個人」「個性」「個子」のように語の頭に来る「個」は、意味が違う（量詞ではない）ので
 * ㄍㄜˋ のまま。読みが字と組めない時（字と音節の数が合わない）も触らない。
 */

const HAN = /[㐀-䶿一-鿿々〇]/u;
/** この字のすぐ後ろの「個」は量詞。 */
const BEFORE_MEASURE = new Set([..."一二三四五六七八九十百千萬万兩两幾几這这那哪每某半多"]);
const GE_ZHUYIN = "ㄍㄜˋ";
const GE_NEUTRAL = "˙ㄍㄜ";

function isMeasureGe(chars: string[], i: number, measureWord: boolean): boolean {
  if (chars[i] !== "個" && chars[i] !== "个") return false;
  // 前の漢字（数字も「數」として扱う）。
  let j = i - 1;
  while (j >= 0 && !HAN.test(chars[j]) && !/[0-9０-９]/.test(chars[j])) j--;
  if (j < 0) return measureWord; // 語の頭: 量詞の欄に出た「個」だけ輕聲
  return /[0-9０-９]/.test(chars[j]) || BEFORE_MEASURE.has(chars[j]);
}

/**
 * 注音（音節を空白で区切った形）の「個」を、量詞なら輕聲に直す。
 * 組めない読みはそのまま返す。
 */
export function neutralizeMeasureGe(
  word: string | null | undefined,
  zhuyin: string | null | undefined,
  { measureWord = false }: { measureWord?: boolean } = {},
): string {
  const reading = zhuyin ?? "";
  const chars = [...(word ?? "").trim()];
  if (!reading.trim() || !chars.some((c) => c === "個" || c === "个")) return reading;
  const syllables = reading.trim().split(/\s+/);
  const han = chars.map((c, i) => ({ c, i })).filter(({ c }) => HAN.test(c));
  if (han.length !== syllables.length) return reading;
  let changed = false;
  const out = syllables.map((s, k) => {
    if (s === GE_ZHUYIN && isMeasureGe(chars, han[k].i, measureWord)) {
      changed = true;
      return GE_NEUTRAL;
    }
    return s;
  });
  return changed ? out.join(" ") : reading;
}

/** ピンインも同じ規則で直す（gè → ge）。音節は空白区切りの時だけ。 */
export function neutralizeMeasureGePinyin(
  word: string | null | undefined,
  pinyin: string | null | undefined,
  { measureWord = false }: { measureWord?: boolean } = {},
): string {
  const reading = pinyin ?? "";
  const chars = [...(word ?? "").trim()];
  if (!reading.trim() || !chars.some((c) => c === "個" || c === "个")) return reading;
  const syllables = reading.trim().split(/\s+/);
  const han = chars.map((c, i) => ({ c, i })).filter(({ c }) => HAN.test(c));
  if (han.length !== syllables.length) return reading;
  let changed = false;
  const out = syllables.map((s, k) => {
    if (/^gè$/i.test(s) && isMeasureGe(chars, han[k].i, measureWord)) {
      changed = true;
      return s[0] === "G" ? "Ge" : "ge";
    }
    return s;
  });
  return changed ? out.join(" ") : reading;
}
