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

/**
 * 色を持つ品詞の群。**詞類表の10群(NORI指定)。**
 *
 * ## なぜ2色から10群に戻したか
 * 一時期、塗るのは動詞と目的語だけにしていた(「色を全部に配ると、色は
 * 何も指さなくなる」という独立監査の指摘への答え)。だが実際のカードでは
 * **動詞と目的語しか色が付かず、残りは全部同じ灰色**で、名詞なのか
 * 副詞なのか介詞なのかが読み取れなかった。台湾華語の学習では
 * 「この語は Vs(状態動詞)であって V ではない」ことが語順を決めるので、
 * そこを潰すと教材として成り立たない。
 *
 * 虹にならないようにするのは**色相ではなく明度**の側で担保する —
 * 明度と彩度を固定して色相だけを回すので、10色が対等に並び、
 * どれか1つが勝手に主役に見えることが無い(`--pos-*` を見ること)。
 */
export type PosGroup = "n" | "v" | "vs" | "vaux" | "adv" | "m" | "conj" | "prep" | "ptc" | "det";

export type ChunkStyle = {
  /** 札そのもの。色は `--pos` を経由するので、クラスは2つで足りる。 */
  pill: string;
  /** 凡例の丸。 */
  dot: string;
  label: string;
};

const GROUP_LABEL: Record<PosGroup, string> = {
  n: "名詞",
  v: "動詞",
  vs: "状態動詞(形容詞)",
  vaux: "助動詞",
  adv: "副詞",
  m: "量詞",
  conj: "接続詞",
  prep: "介詞",
  ptc: "助詞",
  det: "限定詞",
};

/**
 * 詞類表の記号 → 群。**長い記号から先に見る。**
 * `Vs-attr` を `V` より先に判定しないと、状態動詞が全部ただの動詞になる。
 */
const EXACT: Record<string, PosGroup> = {
  N: "n",
  V: "v",
  Vi: "v",
  "V-sep": "v",
  Vp: "v",
  Vpt: "v",
  "Vp-sep": "v",
  Vs: "vs",
  Vst: "vs",
  "Vs-attr": "vs",
  "Vs-pred": "vs",
  "Vs-sep": "vs",
  Vaux: "vaux",
  Adv: "adv",
  Conj: "conj",
  Prep: "prep",
  M: "m",
  Ptc: "ptc",
  Det: "det",
};

/**
 * 古いデータの役割記号。**production に既に入っている語を壊さない。**
 * S(主語)と O(目的語)はふつう名詞句なので名詞の色に落とす。
 * C は補語、P は助詞として書かれていた。
 */
const LEGACY: Record<string, PosGroup> = {
  S: "n",
  O: "n",
  C: "prep",
  P: "ptc",
};

export function posGroup(pos: string): PosGroup {
  const p = (pos || "").trim();
  if (!p) return "ptc";
  const exact = EXACT[p];
  if (exact) return exact;
  // V1 / V2 / O1 / O2 のような番号付き。番号を落として引き直す。
  const numless = p.replace(/[0-9０-９]+$/, "");
  const byNum = EXACT[numless] ?? LEGACY[numless];
  if (byNum) return byNum;
  const legacy = LEGACY[p];
  if (legacy) return legacy;
  // 表に無い綴り。**長い順に前方一致**で拾う(Vs-attr → Vs → V の順)。
  const prefixes: Array<[RegExp, PosGroup]> = [
    [/^Vaux/i, "vaux"],
    [/^Vs/i, "vs"],
    [/^Vst/i, "vs"],
    [/^V/i, "v"],
    [/^Adv/i, "adv"],
    [/^Conj/i, "conj"],
    [/^Prep/i, "prep"],
    [/^Det/i, "det"],
    [/^Ptc/i, "ptc"],
    [/^M/i, "m"],
    [/^N/i, "n"],
  ];
  for (const [re, g] of prefixes) if (re.test(p)) return g;
  return "ptc";
}

export function chunkStyle(pos: string): ChunkStyle {
  const g = posGroup(pos);
  return { pill: `chunk-pill pos-${g}`, dot: `pos-dot pos-${g}`, label: GROUP_LABEL[g] };
}

/**
 * 凡例。**その文に実際に出てきた群だけ**を、詞類表の並びで出す。
 * 出ていない群まで並べると、色と語の対応を探す手間だけが増える。
 */
const GROUP_ORDER: PosGroup[] = ["n", "v", "vs", "vaux", "adv", "m", "conj", "prep", "ptc", "det"];

export function chunkLegendFor(poses: string[]): Array<{ key: PosGroup; style: ChunkStyle }> {
  const seen = new Set(poses.map(posGroup));
  return GROUP_ORDER.filter((g) => seen.has(g)).map((g) => ({
    key: g,
    style: { pill: `chunk-pill pos-${g}`, dot: `pos-dot pos-${g}`, label: GROUP_LABEL[g] },
  }));
}
