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
  /**
   * 一目で分かる要点。**表として出す**ための、短い「見出し: 中身」の並び。
   *
   * ## なぜ地の文と別に持つか
   * 解説はこれまで全部が地の文だった。描く側でどれだけ組み直しても、
   * 中身が文である以上「読む」しかない(オーナー指摘:「文章だけでなく、
   * 表のように一目で解説を理解できるように」)。表にしたいなら、
   * **表になる形で生成させる**必要がある。
   *
   * 中身は短く。value が長い文になったら、それは地の文の項目の仕事。
   */
  quick_facts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .catch([]),
  pronunciation_tips: z.string().catch(""),
  /** 台湾での一言雑学(文化・習慣・歴史・流行)+語法の注意。 */
  taiwan_note: z.string().catch(""),
  /**
   * この解説を**どの言語で書いたか**("ja" / "en")。
   * 設定の表示言語を英語に変えたとき、日本語のまま残った古い解説を
   * 自動で作り直すための目印(空=言語不明の旧データ=日本語とみなす)。
   */
  explain_lang: z.string().catch(""),
  /**
   * この解説を**どの母語の学習者向けに書いたか**(L1Code: "ja"/"en"/…)。
   *
   * 発音のコツと語順の説明は母語ごとに中身が変わる — 日本語話者には
   * 「有気音と無気音の区別が無い」、韓国語話者には「f が無い」と書く。
   * だから母語設定を変えたら、表示言語と同じように作り直す必要がある。
   * 空=旧データで、母語不明。日本語向けとみなす。
   */
  explain_l1: z.string().catch(""),
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
  // explain_lang / explain_l1 は内容ではなく目印なので「中身がある」判定から外す。
  return Object.entries(e).some(([k, v]) =>
    k === "explain_lang" || k === "explain_l1"
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
    const filled = Array.isArray(v)
      ? v.length > 0
      : typeof v === "string"
        ? v.trim().length > 0
        : v != null;
    if (filled) base[k] = v;
  }
  const res = ExtrasSchema.safeParse(base);
  return res.success ? res.data : emptyExtras();
}

/**
 * 表に出せる要点だけを残す。
 *
 * **片側だけ埋まった行を残さない。** 表は行が揃っていることが値打ちなので、
 * 見出しだけ・中身だけの行が混ざると、表に見えなくなる。
 * 生成物は必ず片側を落としてくるので、描く前にここで閉じる。
 */
export function usableQuickFacts(
  facts: ReadonlyArray<{ label?: string; value?: string }> | null | undefined,
): Array<{ label: string; value: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; value: string }> = [];
  for (const f of facts ?? []) {
    const label = (f?.label ?? "").trim();
    const value = (f?.value ?? "").trim();
    if (!label || !value) continue;
    // 同じ見出しが2行あると、どちらが正なのか読み手に決めさせることになる。
    if (seen.has(label)) continue;
    seen.add(label);
    // 長い文は表の中身ではない。地の文の項目が引き受ける。
    // 生成側には20字と言ってあるが、少しの超過では落とさない —
    // 落とすのは「明らかに文になっている」ものだけ。
    if (value.length > 40) continue;
    out.push({ label, value });
    if (out.length >= 6) break;
  }
  return out;
}
