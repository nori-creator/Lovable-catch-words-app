/**
 * UIテーマ(2026-07-27) — 開発者だけが切り替えられる比較用パレット。
 *
 * 設計の考え方: 現行(Apple的な深い青 + 白)は**必ず残す**。他は
 * 「並べた時に気持ちいい」「所有したくなる」を狙った10案で、
 * 色数を絞り(下地・面・主色1・強調1)、影と余白で階層を作る。
 * data-ui-theme 属性を <html> に載せ、CSS変数だけを差し替える
 * (コンポーネントは一切変更しない = 現行デザインを壊さない)。
 */

export type UiThemeId =
  | "default"
  | "museum"
  | "titanium"
  | "collection"
  | "darkroom"
  | "washi"
  | "nightmarket"
  | "linen"
  | "ink"
  | "atelier"
  | "aurora";

export type UiThemeMeta = {
  id: UiThemeId;
  name: string;
  concept: string;
  /** プレビュー用の代表色(下地・主色・強調)。 */
  swatch: [string, string, string];
};

export const UI_THEMES: UiThemeMeta[] = [
  {
    id: "default",
    name: "現行 (Apple Blue)",
    concept: "白い余白と深い青。浮遊感と細い影 — いまのアプリの基準。",
    swatch: ["#fdfdff", "#1d6ef5", "#e8f0ff"],
  },
  {
    id: "collection",
    name: "Collection Premium",
    concept: "紺 × シャンパンゴールド。高級時計のケースを開ける所有感。",
    swatch: ["#0f1830", "#c9a44c", "#1b2a4e"],
  },
  {
    id: "museum",
    name: "Museum White",
    concept: "美術館の白壁。作品(写真)が主役、UIは限界まで引く。",
    swatch: ["#f7f6f3", "#2b2b2b", "#d8d4cc"],
  },
  {
    id: "titanium",
    name: "Titanium",
    concept: "冷たい金属のグレーに一点の青。道具としての精度感。",
    swatch: ["#f2f3f5", "#3a4654", "#7d90a8"],
  },
  {
    id: "darkroom",
    name: "Darkroom",
    concept: "暗室の赤灯。写真を現像する時間そのものを演出に。",
    swatch: ["#141013", "#e0563f", "#241a1d"],
  },
  {
    id: "washi",
    name: "Washi",
    concept: "和紙と墨。台湾の紙のメニューや看板と地続きの質感。",
    swatch: ["#f6f2e9", "#3f3a34", "#c8b89a"],
  },
  {
    id: "nightmarket",
    name: "Night Market",
    concept: "夜市のネオン。濃紺の夜に温かい灯りが浮かぶ。",
    swatch: ["#101728", "#ffb03a", "#2a3a5c"],
  },
  {
    id: "linen",
    name: "Linen",
    concept: "麻の生地と若草。生活に馴染む、目が疲れない明るさ。",
    swatch: ["#f4f4ef", "#4a7c59", "#dfe3d6"],
  },
  {
    id: "ink",
    name: "Ink",
    concept: "純黒に白の線。写真のコントラストが最大になる額縁。",
    swatch: ["#0b0b0c", "#f2f2f2", "#1d1d20"],
  },
  {
    id: "atelier",
    name: "Atelier",
    concept: "アトリエの生成りと赤茶。手作業の温度を残す。",
    swatch: ["#faf7f2", "#a8452f", "#e8ded0"],
  },
  {
    id: "aurora",
    name: "Aurora",
    concept: "深い藍から紫へのグラデーション。AIの知性を色で表す。",
    swatch: ["#0d1024", "#7b6cf6", "#1b2145"],
  },
];

const KEY = "ui-theme-v1";
const EVENT = "ui-theme-changed";

export function getUiTheme(): UiThemeId {
  if (typeof window === "undefined") return "default";
  const v = localStorage.getItem(KEY) as UiThemeId | null;
  return v && UI_THEMES.some((t) => t.id === v) ? v : "default";
}

export function applyUiTheme(id: UiThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (id === "default") root.removeAttribute("data-ui-theme");
  else root.setAttribute("data-ui-theme", id);
}

export function setUiTheme(id: UiThemeId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* noop */
  }
  applyUiTheme(id);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

/** アプリ起動時に保存済みテーマを適用する。 */
export function initUiTheme() {
  applyUiTheme(getUiTheme());
}
