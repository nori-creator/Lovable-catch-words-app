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

/**
 * 入れ替えてよい所の品詞 — **具体的な物**（名詞）と、その数え方（量詞）。
 * これに加えて台湾華語の**程度の語**（`DEGREE_CHOICES`）も入れ替えられる
 * （チャンクの表示ルール C5。iOS `docs/chunk-rules.md`）。
 */
const SWAPPABLE: ReadonlySet<PosGroup> = new Set(["n", "m"]);

/**
 * **程度の語の入れ替え候補**（オーナー指示 2026-10-01「マンゴーだったら基本的に甘いって
 * よく言うよね。でもとても甘いのか、少し甘いのかは置き換え可能だよね。このように程度も
 * 変更できるようにして」）。よく使う順。否定（不・不太）は入れない — 「とても甘い」の
 * 1語を替えても「甘くない」にはならず、訳が壊れる。
 */
export const DEGREE_CHOICES = ["很", "超", "非常", "有點", "蠻"] as const;

/** 程度の語の意味（読む人の言語）。型の訳の中で、その語に当たる部分と同じ書き方。 */
const DEGREE_GLOSS: Record<string, { ja: string; en: string }> = {
  很: { ja: "とても", en: "very" },
  超: { ja: "すごく", en: "super" },
  非常: { ja: "非常に", en: "extremely" },
  有點: { ja: "ちょっと", en: "a little" },
  蠻: { ja: "わりと", en: "pretty" },
  好: { ja: "すごく", en: "so" },
};

/** 中国語を読む人には、その語そのもの（訳すと同じ字になる）。 */
export function degreeGloss(word: string, reader?: string | null): string {
  const w = word.trim();
  const g = DEGREE_GLOSS[w];
  if (!g) return "";
  if (reader === "en") return g.en;
  if (reader && normalizeTargetLanguage(reader).startsWith("zh")) return w;
  return g.ja;
}

function isDegreeChoice(part: ChunkPart): boolean {
  return (DEGREE_CHOICES as readonly string[]).includes(part.text.trim());
}

/**
 * 点線（入れ替え可能）として描いてよいか。
 *
 * - 名詞・量詞であること（動詞・形容詞・副詞は入れ替えの枠にしない — 「加熱」が点線に
 *   なっていたのは AI が動詞に `slot` を付けたため）
 * - ほかの具体語（`alts`）が1つ以上あること（押しても何も出ない点線は作らない）
 */
export function isSwappableSlot(part: ChunkPart, language?: string | null): boolean {
  if (!part.slot) return false;
  const alts = (part.alts ?? []).filter((a) => a.text.trim() && a.text.trim() !== part.text.trim());
  if (!alts.length) return false;
  const pos = (part.pos ?? "").trim();
  // 品詞が空の古い札は、alts が在れば入れ替えの札として扱う（前の見た目を保つ）。
  if (!pos) return true;
  if (SWAPPABLE.has(posGroup(pos))) return true;
  // 程度の語（很 → 超・非常・有點・蠻）。動詞・形容詞・ほかの副詞は入れ替えない（C5）。
  return normalizeTargetLanguage(language).startsWith("zh") && isDegreeChoice(part);
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

/**
 * **1語として使われる語を分けない**（チャンクの表示ルール C7。オーナー指示 2026-10-01
 * 「芒果冰のようにひとかたまりとして普段扱われるものはチャンクを分けなくていい」）。
 *
 * 台湾華語で学ぶ語と隣り合った名詞は1語になる（芒果＋冰 → 芒果冰、台灣＋芒果 → 台灣芒果）。
 * 四角が1つだけになった型は「語」であって使い方ではない — `refineUsageChunks` が落とす。
 */
export function mergeCompounds(
  parts: ChunkPart[],
  headword: string,
  language?: string | null,
): ChunkPart[] {
  if (!normalizeTargetLanguage(language).startsWith("zh")) return parts;
  const head = headword.trim();
  if (!head) return parts;
  const out: ChunkPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (
      last &&
      // 名詞の記号（N…）どうしだけ。古い役割の記号（S/O）は名詞句なので合わせない。
      /^N/i.test((last.pos ?? "").trim()) &&
      /^N/i.test((p.pos ?? "").trim()) &&
      (last.text.includes(head) || p.text.includes(head)) &&
      [...(last.text + p.text)].length <= 6
    ) {
      out[out.length - 1] = { text: last.text + p.text, pos: last.pos };
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * 程度の語を入れ替えられる札にする（C5）。AI が候補を付けていない回（補った 很 を含む）は、
 * よく使う程度の語と、その意味（読む人の言語）を付ける。学ぶ語そのものには付けない（C2）。
 */
function withDegreeSlots(
  parts: ChunkPart[],
  headword: string,
  reader?: string | null,
): ChunkPart[] {
  return parts.map((p) => {
    if (!isDegreeChoice(p) || (headword && p.text.includes(headword))) return p;
    const text = p.text.trim();
    return {
      ...p,
      slot: true,
      ja: p.ja?.trim() ? p.ja : degreeGloss(text, reader),
      alts: p.alts?.length
        ? p.alts
        : DEGREE_CHOICES.filter((d) => d !== text).map((d) => ({
            text: d,
            ja: degreeGloss(d, reader),
          })),
    };
  });
}

/** 使い方の型（`usage_chunks`）を画面・音声に出す前の形にする。何度通しても同じ結果。 */
export function tidyUsageParts(
  parts: ChunkPart[],
  language?: string | null,
  opts: { headword?: string; reader?: string | null } = {},
): ChunkPart[] {
  const zh = normalizeTargetLanguage(language).startsWith("zh");
  const merged = opts.headword ? mergeCompounds(parts, opts.headword, language) : parts;
  const withDegree = withDegreeAdverb(merged, language);
  return zh ? withDegreeSlots(withDegree, opts.headword ?? "", opts.reader) : withDegree;
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
