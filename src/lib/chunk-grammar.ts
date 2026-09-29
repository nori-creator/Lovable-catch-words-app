import { posGroup, type PosGroup } from "./pos";
import { normalizeTargetLanguage } from "./target-lang";
import type { ChunkPart } from "./extras";

/**
 * **返ってきた型を、画面に出す前に正す**（オーナー指示 2026-09-29「チャンクの動詞の加熱が
 * なぜか点線になってる。点線は汎用性があるチャンクのなかの入れ替え可能な具体的なものにする」
 * 「滷味＋入味 很がない。実際にネイティブが使う形で表示して。これは文法的に正しくない。
 * これは致命的」）。
 *
 * 指示文でも頼んでいるが（`ai.functions.ts` の `formulaChunkRule`）、**保存済みの語**と
 * **指示が守られなかった回**の両方に効くよう、描く直前にもここを通す。
 */

/** 入れ替えてよい所の品詞 — **具体的な物**（名詞）と、その数え方（量詞）だけ。 */
const SWAPPABLE: ReadonlySet<PosGroup> = new Set(["n", "m"]);

/**
 * 点線（入れ替え可能）として描いてよいか。
 *
 * - 名詞・量詞であること（動詞・形容詞・副詞は入れ替えの枠にしない — 「加熱」が点線に
 *   なっていたのは AI が動詞に `slot` を付けたため）
 * - ほかの具体語（`alts`）が1つ以上あること（押しても何も出ない点線は作らない）
 */
export function isSwappableSlot(part: ChunkPart): boolean {
  if (!part.slot) return false;
  const alts = (part.alts ?? []).filter((a) => a.text.trim() && a.text.trim() !== part.text.trim());
  if (!alts.length) return false;
  const pos = (part.pos ?? "").trim();
  // 品詞が空の古い札は、alts が在れば入れ替えの札として扱う（前の見た目を保つ）。
  if (!pos) return true;
  return SWAPPABLE.has(posGroup(pos));
}

/** 状態動詞の前に立つ程度・否定の語。これが既に在れば 很 を足さない。 */
const DEGREE = [
  "很",
  "好",
  "超",
  "太",
  "真",
  "非常",
  "蠻",
  "滿",
  "挺",
  "比較",
  "更",
  "最",
  "有點",
  "有一點",
  "不",
  "沒",
  "還",
  "特別",
  "相當",
  "越來越",
  "這麼",
  "那麼",
  "多",
];

/** 述語になる状態動詞か（限定用法だけの `Vs-attr`、目的語を取る `Vst` は除く）。 */
function isPredicateStative(pos: string): boolean {
  const p = pos.trim();
  if (p === "Vs-attr" || p === "Vst") return false;
  return posGroup(p) === "vs";
}

function startsWithDegree(text: string): boolean {
  const t = text.trim();
  return DEGREE.some((d) => t.startsWith(d));
}

/**
 * **台湾華語の「名詞＋形容詞」の型に 很 を補う。**
 *
 * 台湾華語では形容詞（状態動詞）を述語にするとき、裸では言わない — 「滷味入味」は
 * 対比の含みが付いた不自然な形で、ネイティブは「滷味很入味」と言う。型が
 * 「名詞 ＋ 状態動詞」で終わっていて、間に程度・否定の語が無いときだけ 很 を入れる。
 *
 * 狭く当てる: 最後の札が述語の状態動詞で、その直前が名詞のときだけ。
 * 「好吃的＋滷味」（限定用法）や「滷味＋很＋入味」（既に在る）は触らない。
 */
export function withDegreeAdverb(parts: ChunkPart[], language?: string | null): ChunkPart[] {
  if (!normalizeTargetLanguage(language).startsWith("zh")) return parts;
  if (parts.length < 2) return parts;
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (!isPredicateStative(last.pos ?? "")) return parts;
  if (posGroup(prev.pos ?? "") !== "n") return parts;
  if (startsWithDegree(last.text)) return parts;
  if (parts.some((p) => posGroup(p.pos ?? "") === "adv")) return parts;
  return [...parts.slice(0, -1), { text: "很", pos: "Adv" }, last];
}

/** 使い方の型（`usage_chunks`）を画面・音声に出す前の形にする。何度通しても同じ結果。 */
export function tidyUsageParts(parts: ChunkPart[], language?: string | null): ChunkPart[] {
  return withDegreeAdverb(parts, language);
}

/**
 * **語を入れ替えた型の訳**（R20「点線のなかのほかの単語をタップしたら、もとの単語と同じように
 * 訳が表示され」）。訳の中で元の語に当たる所を、入れ替えた語の意味に差し替える。
 *
 * 元の語に当たる所は、① その語の意味（`part.ja`。新しいカード）、② 語そのもの（「豆干の滷味を
 * 買う」のように訳にも同じ字で出る語）の順に探す。見つからない時は訳を作り替えず、
 * 「元の訳（元の語 → 入れ替えた語: 意味）」の形で、何を替えたかが分かるように出す。
 */
export function swappedTranslation(
  translation: string | null | undefined,
  parts: ChunkPart[],
  pick: Record<number, number>,
): string {
  let out = (translation ?? "").trim();
  const notes: string[] = [];
  for (const [key, k] of Object.entries(pick)) {
    const i = Number(key);
    const part = parts[i];
    const alt = k >= 0 ? part?.alts?.[k] : undefined;
    if (!part || !alt) continue;
    const to = (alt.ja || alt.text).trim();
    const from = [part.ja?.trim(), part.text.trim()].find((f) => f && out.includes(f));
    if (from) out = out.replace(from, to);
    else notes.push(`${part.text} → ${alt.text}${alt.ja ? `: ${alt.ja}` : ""}`);
  }
  return notes.length ? `${out}（${notes.join("、")}）` : out;
}
