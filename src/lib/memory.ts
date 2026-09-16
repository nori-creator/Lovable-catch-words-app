import { stabilityOf } from "./srs";

/** ease が渡ってこないときの既定（SM-2 の初期値）。 */
const DEFAULT_EASE = 2.5;

/**
 * 記憶レベル(2026-07-25 再設計)。
 * 信号3色では「撮った直後に覚えている」と「1ヶ月後も覚えている」が
 * 区別できない — 記憶率×間隔から6段階に分け、色は連続したスケールにする。
 * どの画面でも同じ関数を使う(復習一覧・カードバッジ・忘却曲線モーダル)。
 */

export type MemoryLevelInfo = {
  /** 0(忘れかけ)〜5(長期記憶) */
  level: 0 | 1 | 2 | 3 | 4 | 5;
  /** 既定(日本語)のラベル。表示は i18n の memory.level<N> を優先する。 */
  label: string;
  /** i18n キー(memory.level0 … memory.level5)。 */
  labelKey: string;
  /** 塗り(バー・帯グラフ用) */
  bar: string;
  /** テキスト色 */
  text: string;
  /** バッジ用の薄い背景 */
  chip: string;
  dot: string;
};

/**
 * 記憶の6段階。**色は素の Tailwind の番号ではなくトークンで持つ。**
 *
 * 以前は `text-red-600` / `bg-red-100 text-red-700` のように直に書いていた。
 * これには2つの問題があった:
 *  ・**暗いテーマに一切追従しない。** 明るい前提の固定色なので、暗い面では
 *    薄桃色の塊が浮くだけになる(テーマを6つ持っているのに1つ分しか無い)。
 *  ・11px の文字として 2.97〜4.18:1 しか無く、本文の下限 4.5:1 を割っていた。
 *
 * `mem-lv-N` を付けると `--mem` がその段の色になり、`mem-text` / `mem-bar` /
 * `mem-chip` がそれぞれの役目で使う。明暗の値は styles.css 側で持つ。
 */
const LEVELS: MemoryLevelInfo[] = [
  {
    level: 0,
    label: "忘れかけ",
    labelKey: "memory.level0",
    bar: "mem-lv-0 mem-bar",
    text: "mem-lv-0 mem-text",
    chip: "mem-lv-0 mem-chip",
    dot: "🔴",
  },
  {
    level: 1,
    label: "あやうい",
    labelKey: "memory.level1",
    bar: "mem-lv-1 mem-bar",
    text: "mem-lv-1 mem-text",
    chip: "mem-lv-1 mem-chip",
    dot: "🟠",
  },
  {
    level: 2,
    label: "うろ覚え",
    labelKey: "memory.level2",
    bar: "mem-lv-2 mem-bar",
    text: "mem-lv-2 mem-text",
    chip: "mem-lv-2 mem-chip",
    dot: "🟡",
  },
  {
    level: 3,
    label: "定着中",
    labelKey: "memory.level3",
    bar: "mem-lv-3 mem-bar",
    text: "mem-lv-3 mem-text",
    chip: "mem-lv-3 mem-chip",
    dot: "🟢",
  },
  {
    level: 4,
    label: "覚えた",
    labelKey: "memory.level4",
    bar: "mem-lv-4 mem-bar",
    text: "mem-lv-4 mem-text",
    chip: "mem-lv-4 mem-chip",
    dot: "💚",
  },
  {
    level: 5,
    label: "長期記憶",
    labelKey: "memory.level5",
    bar: "mem-lv-5 mem-bar",
    text: "mem-lv-5 mem-text",
    chip: "mem-lv-5 mem-chip",
    dot: "🔵",
  },
];

/**
 * **記憶の強さ (0〜100)。画面に出る「%」はこれ。**
 *
 * ## なぜ「いまの定着度」をそのまま出さないのか
 * （オーナー報告 2026-09-16「SRSは長期記憶なのに、%が覚えたの状態より
 *  低いのが変。一番下に行けば行くほど、記憶の状態がより高く % も高くして」）
 *
 * 定着度 `retention` は「**いまこの瞬間**思い出せる見込み」で、復習した
 * 直後はどの語も 100% になる。**今日キャッチしたばかりの語も 100%**。
 * だから定着度だけで並べると、何も知らない語が一覧のいちばん下（＝
 * いちばん覚えている側）に来る。
 *
 * 逆に、間隔が伸びた語は出題日が近いので定着度が下がっている。その結果
 * **「長期記憶 82%」が「覚えた 95%」より上に並ぶ**、という食い違いが出ていた。
 *
 * ## 何を掛けるか
 * もう一つの軸が**安定度**（次に忘れるまでの長さ）。明日忘れる 100% と
 * 半年もつ 100% は同じではない。この2つを1つの数にまとめる:
 *
 * ```
 *   熟し   = 安定度 / (安定度 + RIPE_HALF)      … 0〜1。長くもつほど 1 へ
 *   強さ   = 定着度 × (RIPE_FLOOR + (1−RIPE_FLOOR) × 熟し)
 * ```
 *
 * `RIPE_FLOOR` は「熟していなくても定着度ぶんは認める」割合。0 にすると
 * キャッチ直後の語が 10% 台になって、覚えたのに忘れたように見える。
 *
 * ## これで何が保証されるか
 * 段（`memoryLevel`）を**この数だけ**から決めるので、
 * **段が上がれば % も必ず上がる**。一覧は強さ順に並ぶ＝下へ行くほど
 * 段も % も高い、というオーナーの求める形になる（`compareByMemory`）。
 *
 * ## 目安（実測）
 * | 語 | 安定度 | 定着度 | 強さ | 段 |
 * |---|---|---|---|---|
 * | 今日キャッチ（未復習） | 9.5日 | 100% | 65 | うろ覚え |
 * | 2回目・間隔3日・昨日正解 | 28.5日 | 97% | 70 | 定着中 |
 * | 間隔30日・昨日正解 | 285日 | 100% | 93 | 覚えた |
 * | 間隔30日・今日が出題日 | 285日 | 90% | 84 | 定着中 |
 * | 間隔90日・昨日正解 | 854日 | 100% | 97 | 長期記憶 |
 */
const RIPE_HALF = 60;
const RIPE_FLOOR = 0.6;

export function memoryStrength(retention: number, stabilityDays: number): number {
  const s = Math.max(0, stabilityDays);
  const ripe = s / (s + RIPE_HALF);
  const v = retention * (RIPE_FLOOR + (1 - RIPE_FLOOR) * ripe);
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * 記憶の強さ（`memoryStrength`）から段を決める。
 *
 * **段の境目は重ならない。** 以前は
 *   ・長期記憶 … 間隔30日以上 かつ 定着度80%以上
 *   ・覚えた   … 定着度85%以上 かつ 復習3回以上
 * と条件の軸が違い、**長期記憶(80%)のほうが覚えた(85%)より低い**という
 * 逆転が起きていた（オーナー報告 2026-09-16）。いまは1本の数を6つに
 * 区切るだけなので、逆転のしようがない。
 *
 * 「間隔が短い語を上限で抑える」役目は、強さの中の**熟し**が引き継いだ。
 * 条件を足すのではなく、1つの数に織り込む。
 */
export function memoryLevel(strength: number): MemoryLevelInfo {
  if (strength < 30) return LEVELS[0];
  if (strength < 50) return LEVELS[1];
  if (strength < 70) return LEVELS[2];
  if (strength < 85) return LEVELS[3];
  if (strength < 95) return LEVELS[4];
  return LEVELS[5];
}

/** 段と強さを一度に出すのに要る最小限。画面ごとに持っている型が違う。 */
export type MemoryInput = {
  /** いまの定着度 0〜100。 */
  retention: number;
  interval_days: number;
  /** 覚えやすさ。無ければ SM-2 の初期値で代用する。 */
  ease?: number;
  /** 安定度(日)。無ければ間隔と ease から出す。 */
  stability_days?: number;
};

/**
 * **段と % を1か所で出す。**
 *
 * 画面ごとに `memoryStrength` と `memoryLevel` を別々に呼ぶと、片方だけ
 * 直した時に**バッジと数字が食い違う**。入口を1つにしておく。
 */
export function memoryOf(w: MemoryInput): { strength: number; level: MemoryLevelInfo } {
  const stability = w.stability_days ?? stabilityOf(w.interval_days, w.ease ?? DEFAULT_EASE);
  const strength = memoryStrength(w.retention, stability);
  return { strength, level: memoryLevel(strength) };
}

export const MEMORY_LEVELS = LEVELS;

/** 並べ替えに要る所だけ。画面ごとに持っている型が違うので、必要な形で受ける。 */
export type MemorySortable = MemoryInput & {
  repetitions?: number;
  headword?: string;
};

/**
 * **記憶が弱いものを上、強いものを下に並べる。**（オーナー指示 2026-09-15
 * 「記憶の状態が表示されるのがバラバラになってる…より記憶してるものを
 * 下に整頓させて」／2026-09-16「一番下に行けば行くほど、記憶の状態が
 * より高く % も高くして」）
 *
 * ## 何で決めるか
 * **記憶の強さ（`memoryStrength`）だけ**。段もこの数から出しているので、
 * 下へ行くほど段が上がり、同時に % も上がる。**逆転が起きない。**
 *
 * 以前はここで「段 → 定着度 → 安定度 → 見出し語」と4段に分けて見ていた。
 * 段と定着度が別々の軸だったため、段が上がっても % は下がる、という並びが
 * できてしまっていた（オーナー報告 2026-09-16）。軸を1本にすればその
 * 継ぎ足しは要らない — 安定度は強さの中にもう入っている。
 *
 * 同じ強さのときだけ見出し語で決める（開くたびに順が変わらないように）。
 */
export function compareByMemory(a: MemorySortable, b: MemorySortable): number {
  const sa = memoryOf(a).strength;
  const sb = memoryOf(b).strength;
  if (sa !== sb) return sa - sb;
  return (a.headword ?? "").localeCompare(b.headword ?? "");
}
