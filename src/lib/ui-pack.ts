/**
 * 見た目パック(2026-07-29) — 「全く違うアプリ」を丸ごと切り替える仕組み。
 * 開発者だけが設定画面から比較して選ぶ。
 *
 * ## 現行を壊さないための最重要ルール
 * **origin パックは <html> に data-ui-pack を付けない。**
 * 属性が無ければ pack-styles.css のセレクタは1つも当たらず、
 * styles.css の :root / .dark と既存クラスがそのまま効く。
 * つまり現行デザインは**1行も変わらない**。これが設計の土台。
 *
 * ## なぜ「軸」ではなく「パック1つ」なのか
 * 当初は色・書体・形・モーション・素材…を独立した属性に分ける案だった。
 * が、狙いは「並べて比べたい完成品」であって組み合わせ実験ではない。
 * 属性を1つに絞るほうがCSSの当たり方が読みやすく、現行を巻き込む事故も
 * 起きにくい。JSXの分岐に必要なレイアウト種別だけ、パックから引く。
 *
 * ## 既存クラスを再利用しない方針
 * styles.css には .cab-slot / .polaroid / .crystal-in など未使用クラスが
 * 大量に残っているが、これらは過去にボツになったデザイン。
 * パックの見た目は pack-styles.css に**ゼロから書き起こす**。
 */

export type PackId =
  | "origin"
  | "card"
  | "sticker"
  | "cellar"
  | "watch"
  | "garage"
  | "museum"
  | "artspace"
  | "photofeed"
  | "arfield"
  | "vfeed"
  | "library"
  | "timeline"
  | "wall"
  | "streaming"
  | "darkroom";

/**
 * 収集物の並べ方。JSXの構造そのものが変わるものだけを種別にする。
 * album は**現行の実装をそのまま通す**ための値。
 */
export type LayoutId =
  /** 現行: 傾いた写真がアルバム台紙に貼られる */
  | "album"
  /** カード1枚が主役。大きく1〜2列 */
  | "card"
  /** 棚に並ぶ。横長のセル */
  | "shelf"
  /** 隙間の無い正方グリッド */
  | "grid"
  /** 縦全画面スワイプ。1件=1画面 */
  | "feed-v"
  /** 横スクロールの行が縦に積まれる */
  | "rail"
  /** 時系列の1列。高密度 */
  | "timeline"
  /** 地図が主役 */
  | "map";

export type UiPackMeta = {
  id: PackId;
  /** 表示名。実在アプリ名は使わない。 */
  name: string;
  /** 何を感じさせたいか(1行)。 */
  concept: string;
  /** 何を参考にした型か。説明のためだけに書く。 */
  reference: string;
  layout: LayoutId;
  /** 一覧に出す代表色(下地・主色・面)。 */
  swatch: [string, string, string];
  /**
   * このパックでだけ追加で読み込む Google Fonts の family 指定。
   * 既定の読み込み量を増やさないため、**選択したときに初めて**注入する。
   */
  fontQuery?: string;
  /** 暗い下地のパックか(プレビューの縁取りを変えるのに使う)。 */
  dark?: boolean;
};

/**
 * 商標について: 実在アプリのロゴ・商標・独自アイコンは複製しない。
 * 再現するのは配置と体験の型(縦全画面スワイプ、横スクロールの棚、
 * 時系列の1列など)だけ。名前も一般名で付ける。
 */
export const UI_PACKS: UiPackMeta[] = [
  {
    id: "origin",
    name: "現行 (Origin)",
    concept: "白い余白と深い青。傾いた写真が台紙に貼られたアルバム。",
    reference: "いまのアプリ — 基準線",
    layout: "album",
    swatch: ["#fdfdff", "#1d6ef5", "#e8f0ff"],
  },
  {
    id: "card",
    name: "Trading Card",
    concept: "1枚が主役。傾けると箔が走り、レア度で枠が変わる。",
    reference: "トレーディングカードのコレクション",
    layout: "card",
    swatch: ["#131a2b", "#ffd45e", "#25314f"],
    fontQuery: "Bungee:wght@400",
    dark: true,
  },
  {
    id: "sticker",
    name: "Sticker Book",
    concept: "台紙に貼る。空き枠が埋まっていく気持ちよさ。",
    reference: "シール帳・シールブック",
    layout: "grid",
    swatch: ["#fff7e8", "#ff6b9d", "#ffe0b2"],
    fontQuery: "Baloo+2:wght@600;800",
  },
  {
    id: "cellar",
    name: "Wine Cellar",
    concept: "暗い木の棚に横たわる。年代順に増えていく蔵。",
    reference: "ワインセラー",
    layout: "shelf",
    swatch: ["#1a1210", "#b8894a", "#2a1e19"],
    fontQuery: "Cormorant+Garamond:wght@400;600",
    dark: true,
  },
  {
    id: "watch",
    name: "Watch Case",
    concept: "起毛のケースに整列。蓋を開ける所有感。",
    reference: "高級腕時計のコレクションケース",
    layout: "grid",
    swatch: ["#10182e", "#c9a44c", "#1a2540"],
    fontQuery: "Cormorant+Garamond:wght@300;500",
    dark: true,
  },
  {
    id: "garage",
    name: "Garage",
    concept: "黒とクローム。スポットライトの下の展示台。",
    reference: "高級車のコレクション",
    layout: "rail",
    swatch: ["#0c0c0e", "#d8d8dc", "#17171b"],
    fontQuery: "Chakra+Petch:wght@400;600",
    dark: true,
  },
  {
    id: "museum",
    name: "Museum",
    concept: "白壁に額装。UIは限界まで消え、作品だけが残る。",
    reference: "美術館",
    layout: "grid",
    swatch: ["#f7f6f3", "#2b2b2b", "#e6e3dc"],
    fontQuery: "Cormorant+Garamond:wght@300;400",
  },
  {
    id: "artspace",
    name: "Gallery Modern",
    concept: "極太の文字と原色1点。意図的に崩した非対称。",
    reference: "現代アート",
    layout: "card",
    swatch: ["#f2f0eb", "#ff3b18", "#111111"],
    fontQuery: "Archivo+Black",
  },
  {
    id: "photofeed",
    name: "Photo Feed",
    concept: "隙間のない正方グリッドと、上部の丸いリング。",
    reference: "写真SNS風",
    layout: "grid",
    swatch: ["#ffffff", "#e1306c", "#fafafa"],
  },
  {
    id: "arfield",
    name: "AR Field",
    concept: "地図が全面。単語が地面から湧いてくる。",
    reference: "位置ゲーム風",
    layout: "map",
    swatch: ["#0f2a3d", "#4fd1c5", "#16394f"],
    fontQuery: "Baloo+2:wght@700",
    dark: true,
  },
  {
    id: "vfeed",
    name: "Vertical Feed",
    concept: "1語=1画面。指ひとつで無限に送れる。",
    reference: "縦型動画SNS風",
    layout: "feed-v",
    swatch: ["#000000", "#25f4ee", "#151515"],
    dark: true,
  },
  {
    id: "library",
    name: "Video Library",
    concept: "16:9のサムネが横に流れる棚。続きから戻れる。",
    reference: "動画プラットフォーム風",
    layout: "rail",
    swatch: ["#0f0f0f", "#ff0033", "#1c1c1c"],
    dark: true,
  },
  {
    id: "timeline",
    name: "Timeline",
    concept: "細い線で区切られた高密度の1列。速く流し読める。",
    reference: "短文SNS風",
    layout: "timeline",
    swatch: ["#000000", "#1d9bf0", "#16181c"],
    dark: true,
  },
  {
    id: "wall",
    name: "Social Wall",
    concept: "角丸カードが積まれ、下に反応の行がつく。",
    reference: "SNSのウォール風",
    layout: "timeline",
    swatch: ["#f0f2f5", "#1877f2", "#ffffff"],
  },
  {
    id: "streaming",
    name: "Streaming",
    concept: "巨大なヒーローの下に、横スクロールの行が続く。",
    reference: "動画配信サービス風",
    layout: "rail",
    swatch: ["#141414", "#e50914", "#1f1f1f"],
    dark: true,
  },
  {
    id: "darkroom",
    name: "Darkroom",
    concept: "赤灯だけの暗所。写真が暗から明へ現像されて現れる。",
    reference: "写真の暗室",
    layout: "card",
    swatch: ["#140f11", "#e0563f", "#241a1d"],
    dark: true,
  },
];

const KEY = "ui-pack-v1";
const EVENT = "ui-pack-changed";
const FONT_LINK_ID = "ui-pack-fonts";

export function packMeta(id: PackId): UiPackMeta {
  return UI_PACKS.find((p) => p.id === id) ?? UI_PACKS[0];
}

export function getUiPack(): PackId {
  if (typeof window === "undefined") return "origin";
  try {
    const v = localStorage.getItem(KEY) as PackId | null;
    return v && UI_PACKS.some((p) => p.id === v) ? v : "origin";
  } catch {
    return "origin";
  }
}

/**
 * そのパックでだけ必要な書体を読み込む。
 * 既定(origin)では1バイトも増やさないのが目的。
 */
function ensureFonts(meta: UiPackMeta) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!meta.fontQuery) {
    existing?.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${meta.fontQuery}&display=swap`;
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function applyUiPack(id: PackId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // origin は属性を**付けない**。これで現行のCSSがそのまま効く。
  if (id === "origin") {
    root.removeAttribute("data-ui-pack");
    ensureFonts(UI_PACKS[0]);
    return;
  }
  root.setAttribute("data-ui-pack", id);
  ensureFonts(packMeta(id));
}

export function setUiPack(id: PackId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ストレージが使えなくても表示だけは切り替える */
  }
  applyUiPack(id);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

/** アプリ起動時に保存済みパックを適用する。 */
export function initUiPack() {
  applyUiPack(getUiPack());
}

/** パック変更を購読する(React 側のフックから使う)。 */
export function subscribeUiPack(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
