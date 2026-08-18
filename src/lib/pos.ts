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

export type ChunkStyle = {
  bg: string;
  text: string;
  /** 凡例の丸。**実体のクラス名を持つ。**
      `text-` を `bg-` に置換して作っていたが、Tailwind は**実行時に組み立てた
      クラス名を見つけられない**ので、そのクラスは生成されず丸が消えていた。 */
  dot: string;
  label: string;
};

/**
 * チャンクの配色 — **2色 + 素**。
 *
 * もとは S/V/O/N/M/C/P に7色のパステルを当てていた。独立監査の指摘:
 *
 * > 文を見た瞬間に虹が目に入り、**どこが主節かは分からない**。
 *
 * 色を全部に配ると、色は何も指さなくなる。このアプリが教えているのは
 * `prompt_pattern`(V+O のような型)そのものなので、**動詞と目的語だけ**
 * 塗り、残りは素の面にする。塗られている2つを追えば文の骨格が読める。
 *
 * 色は第2の手がかり。凡例に語(動詞・目的語)を必ず添えるので、
 * 色が読めなくても意味は落ちない。
 */
const PLAIN: ChunkStyle = {
  bg: "bg-secondary",
  text: "text-foreground",
  dot: "bg-foreground",
  label: "そのほか",
};

const STYLES: Record<string, ChunkStyle> = {
  V: { bg: "bg-chunk-v/18", text: "text-chunk-v-ink", dot: "bg-chunk-v", label: "動詞" },
  O: { bg: "bg-chunk-o/18", text: "text-chunk-o-ink", dot: "bg-chunk-o", label: "目的語" },
  N: { bg: "bg-chunk-o/18", text: "text-chunk-o-ink", dot: "bg-chunk-o", label: "名詞" },
  S: PLAIN,
  M: PLAIN,
  C: PLAIN,
  P: PLAIN,
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
/**
 * 凡例。**塗っているものだけ**を出す。
 * 以前は6項目あり、しかも凡例の記号(Ptc)と帯に出る記号(P)が
 * 食い違っていた(独立監査)。記号そのものを帯から外したので、
 * 凡例は「色 → 何か」を言えば足りる。
 */
export const CHUNK_LEGEND: Array<{ key: string; style: ChunkStyle }> = [
  { key: "V", style: STYLES.V },
  { key: "O", style: STYLES.O },
];
