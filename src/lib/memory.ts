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

const LEVELS: MemoryLevelInfo[] = [
  {
    level: 0,
    label: "忘れかけ",
    labelKey: "memory.level0",
    bar: "bg-red-500",
    text: "text-red-600",
    chip: "bg-red-100 text-red-700",
    dot: "🔴",
  },
  {
    level: 1,
    label: "あやうい",
    labelKey: "memory.level1",
    bar: "bg-orange-500",
    text: "text-orange-600",
    chip: "bg-orange-100 text-orange-700",
    dot: "🟠",
  },
  {
    level: 2,
    label: "うろ覚え",
    labelKey: "memory.level2",
    bar: "bg-amber-400",
    text: "text-amber-600",
    chip: "bg-amber-100 text-amber-700",
    dot: "🟡",
  },
  {
    level: 3,
    label: "定着中",
    labelKey: "memory.level3",
    bar: "bg-lime-500",
    text: "text-lime-600",
    chip: "bg-lime-100 text-lime-700",
    dot: "🟢",
  },
  {
    level: 4,
    label: "覚えた",
    labelKey: "memory.level4",
    bar: "bg-emerald-500",
    text: "text-emerald-600",
    chip: "bg-emerald-100 text-emerald-700",
    dot: "💚",
  },
  {
    level: 5,
    label: "長期記憶",
    labelKey: "memory.level5",
    bar: "bg-sky-500",
    text: "text-sky-600",
    chip: "bg-sky-100 text-sky-700",
    dot: "🔵",
  },
];

/**
 * retention: 現在の推定記憶率 0-100。
 * intervalDays: SRS の現在の復習間隔 — 30日以上+高記憶率だけが「長期記憶」。
 * repetitions: 復習回数 — 撮った直後(0-1回)は高記憶率でも「覚えたて」止まり。
 */
export function memoryLevel(
  retention: number,
  intervalDays: number,
  repetitions?: number,
): MemoryLevelInfo {
  if (retention < 30) return LEVELS[0];
  if (retention < 50) return LEVELS[1];
  if (retention < 70) return LEVELS[2];
  // 高記憶率でも、まだ間隔が短い=時間が証明していない語は上限を絞る。
  if (intervalDays >= 30 && retention >= 80) return LEVELS[5];
  if (retention >= 85 && (repetitions == null || repetitions >= 3)) return LEVELS[4];
  if (retention >= 85) return LEVELS[3]; // 覚えたて(まだ2回以下)は「定着中」
  return LEVELS[3];
}

export const MEMORY_LEVELS = LEVELS;
