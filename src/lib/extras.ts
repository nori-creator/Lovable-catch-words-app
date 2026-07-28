import { z } from "zod";

/**
 * 単語カードの extras の唯一の定義(2026-07-25 詳細カード再構成)。
 * 以前は ai.functions / ghost.functions / stickers.functions がそれぞれ
 * 同じ形を別々に持っていて、フィールドを増やすたびにどこかの zod が
 * 黙って新フィールドを落とす事故が起きていた。全員ここを import する。
 *
 * すべて .catch なので、欠けていても型が違っても落ちずに既定値になる
 * (AI出力・古いDB行のどちらにも耐える)。
 */

export const ChunkPartSchema = z.object({
  text: z.string(),
  // 役割ラベル: S/V/V1/V2/O/M/C/Ptc など(復習の添削と同じ色体系で描画)
  pos: z.string().catch(""),
});
export type ChunkPart = z.infer<typeof ChunkPartSchema>;

export const UsageChunkSchema = z.object({
  parts: z.array(ChunkPartSchema).catch([]),
  ja: z.string().catch(""),
});
export type UsageChunk = z.infer<typeof UsageChunkSchema>;

export const RelatedWordSchema = z.object({
  word: z.string(),
  kind: z.enum(["syn", "ant", "rel"]).catch("rel"),
  note: z.string().catch(""),
});
export type RelatedWord = z.infer<typeof RelatedWordSchema>;

const ExampleExtraSchema = z.object({
  zh: z.string(),
  ja: z.string().catch(""),
  /** いつ・どんな気持ちで言う一文か(例:「夜市で値段を聞くとき」)。 */
  scene: z.string().catch(""),
  chunks: z.array(ChunkPartSchema).catch([]),
});

export const ExtrasSchema = z.object({
  // --- 旧フィールド(古いカードの表示互換のため保持) ---------------------
  collocations: z.array(z.string()).catch([]),
  synonyms: z.array(z.string()).catch([]),
  antonyms: z.array(z.string()).catch([]),
  trivia: z.string().catch(""),
  common_situation: z.string().catch(""),
  usage_note: z.string().catch(""),
  register_note: z.string().catch(""),
  synonym_diff: z.string().catch(""),
  word_order: z.string().catch(""),
  study_tips: z.string().catch(""),
  // --- 現行フィールド ------------------------------------------------------
  etymology: z.string().catch(""),
  radicals: z.string().catch(""),
  mnemonic: z.string().catch(""),
  examples_extra: z.array(ExampleExtraSchema).catch([]),
  /** 頻度・使う場面(統合): どこで見て使うか+口語/書面+頻度の説明。 */
  usage_context: z.string().catch(""),
  /** 使用頻度レベル 1〜5(5=毎日レベル)。視覚メーター用。 */
  frequency_level: z.number().int().min(1).max(5).nullable().catch(null),
  /** 「口語」「書面」「口語・書面」など。 */
  register_tag: z.string().catch(""),
  /** 使い方の型・チャンク(コロケーション+語順を統合、品詞色分け)。 */
  usage_chunks: z.array(UsageChunkSchema).catch([]),
  /** メイン例文のパーツ分解。 */
  example_chunks: z.array(ChunkPartSchema).catch([]),
  /** 類義語・反義語・関連語(使い分けノート付き)。 */
  related_words: z.array(RelatedWordSchema).catch([]),
  /** 量詞(名詞のみ)。複数ある場合は使い分けノート付き。 */
  measure_words: z
    .array(
      z.object({
        word: z.string(),
        zhuyin: z.string().catch(""),
        pinyin: z.string().catch(""),
        note: z.string().catch(""),
      }),
    )
    .catch([]),
  /** 日本人向けの発音のコツ(声調・有気音・そり舌・鼻音韻尾など)。 */
  pronunciation_tips: z.string().catch(""),
  /** 台湾での一言雑学(文化・習慣・歴史・流行)+語法の注意。 */
  taiwan_note: z.string().catch(""),
  /**
   * この解説を**どの言語で書いたか**("ja" / "en")。
   * 設定の表示言語を英語に変えたとき、日本語のまま残った古い解説を
   * 自動で作り直すための目印(空=言語不明の旧データ=日本語とみなす)。
   */
  explain_lang: z.string().catch(""),
});

export type WordExtrasDTO = z.infer<typeof ExtrasSchema>;

export function emptyExtras(): WordExtrasDTO {
  return ExtrasSchema.parse({});
}

/** DBやAIから来た生の extras を安全に正規化(壊れていれば null)。 */
export function normalizeExtras(raw: unknown): WordExtrasDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const res = ExtrasSchema.safeParse(raw);
  return res.success ? res.data : null;
}

/** True when an extras object carries at least one non-empty field. */
export function hasExtrasContent(e: Partial<WordExtrasDTO> | null | undefined): boolean {
  if (!e) return false;
  // explain_lang は内容ではなく目印なので「中身がある」判定から外す。
  return Object.entries(e).some(([k, v]) =>
    k === "explain_lang"
      ? false
      : Array.isArray(v)
        ? v.length > 0
        : typeof v === "string"
          ? v.trim().length > 0
          : v != null,
  );
}

/**
 * Merge incoming extras over existing: a non-empty incoming field wins, an
 * empty one never erases what's already saved.
 */
export function mergeExtras(
  cur: Partial<WordExtrasDTO> | null | undefined,
  inc: Partial<WordExtrasDTO> | null | undefined,
): WordExtrasDTO {
  const base: Record<string, unknown> = { ...emptyExtras(), ...(cur ?? {}) };
  for (const [k, v] of Object.entries(inc ?? {})) {
    const filled = Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;
    if (filled) base[k] = v;
  }
  const res = ExtrasSchema.safeParse(base);
  return res.success ? res.data : emptyExtras();
}
