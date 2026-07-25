/**
 * 品詞(詞類表)ユーティリティ。
 *
 * 台湾の中国語教材(國語教學中心系)の詞類表に準拠した記号を正とする:
 *   N/V/Vi/V-sep/Vs/Vst/Vs-attr/Vs-pred/Vs-sep/Vaux/Vp/Vpt/Vp-sep/
 *   Adv/Conj/Prep/M/Ptc/Det
 * AIにもこの記号で part_of_speech を出させ、表示時に日本語の説明を添える。
 */

export const POS_TABLE: Record<string, string> = {
  N: "名詞",
  V: "動詞(及物)",
  Vi: "動詞(不及物)",
  "V-sep": "離合詞",
  Vs: "状態動詞(形容詞)",
  Vst: "状態動詞(及物)",
  "Vs-attr": "状態動詞(限定用法のみ)",
  "Vs-pred": "状態動詞(述語用法のみ)",
  "Vs-sep": "状態離合詞",
  Vaux: "助動詞",
  Vp: "変化動詞",
  Vpt: "変化動詞(及物)",
  "Vp-sep": "変化離合詞",
  Adv: "副詞",
  Conj: "接続詞",
  Prep: "介詞(前置詞)",
  M: "量詞",
  Ptc: "助詞",
  Det: "限定詞",
};

/** "Vs" → "Vs · 状態動詞(形容詞)"。表に無い表記(旧データの「名詞」等)はそのまま。 */
export function posDisplay(pos: string | null | undefined): string {
  const p = (pos ?? "").trim();
  if (!p) return "";
  const label = POS_TABLE[p];
  return label ? `${p} · ${label}` : p;
}

// ---------------------------------------------------------------------------
// チャンク(文のパーツ)の配色 — 復習の添削と単語詳細で同じ色体系を使う。
// 色は第2の手がかり: ラベル文字も必ず一緒に描く(色覚多様性)。
// ---------------------------------------------------------------------------

export type ChunkStyle = { bg: string; text: string; label: string };

const STYLES: Record<string, ChunkStyle> = {
  S: { bg: "bg-sky-100 dark:bg-sky-500/25", text: "text-sky-900 dark:text-sky-100", label: "主語" },
  V: { bg: "bg-rose-100 dark:bg-rose-500/25", text: "text-rose-900 dark:text-rose-100", label: "動詞" },
  O: { bg: "bg-emerald-100 dark:bg-emerald-500/25", text: "text-emerald-900 dark:text-emerald-100", label: "目的語" },
  N: { bg: "bg-emerald-100 dark:bg-emerald-500/25", text: "text-emerald-900 dark:text-emerald-100", label: "名詞" },
  M: { bg: "bg-amber-100 dark:bg-amber-500/25", text: "text-amber-900 dark:text-amber-100", label: "修飾・量詞" },
  C: { bg: "bg-violet-100 dark:bg-violet-500/25", text: "text-violet-900 dark:text-violet-100", label: "接続" },
  P: { bg: "bg-stone-200 dark:bg-stone-500/25", text: "text-stone-800 dark:text-stone-100", label: "助詞" },
};

/**
 * 役割ラベル(S/V/V1/V2/O/O1/M/Adv/C/Conj/Prep/Ptc/Det/N…)を配色に解決。
 * V1/V2 のような番号付きも V の色に落ちる。
 */
export function chunkStyle(pos: string): ChunkStyle {
  const p = (pos || "").trim();
  if (/^S/i.test(p)) return STYLES.S;
  if (/^V/i.test(p)) return STYLES.V;
  if (/^O/i.test(p)) return STYLES.O;
  if (/^N/i.test(p)) return STYLES.N;
  if (/^(M|Adv)/i.test(p)) return STYLES.M;
  if (/^(C|Conj|Prep)/i.test(p)) return STYLES.C;
  if (/^(P|Ptc|Det)/i.test(p)) return STYLES.P;
  return STYLES.M;
}

/** 凡例に出す代表色(順序固定)。 */
export const CHUNK_LEGEND: Array<{ key: string; style: ChunkStyle }> = [
  { key: "S", style: STYLES.S },
  { key: "V", style: STYLES.V },
  { key: "O", style: STYLES.O },
  { key: "M", style: STYLES.M },
  { key: "C", style: STYLES.C },
  { key: "Ptc", style: STYLES.P },
];
