/**
 * エフェクト・ラボ(開発者専用)
 *
 * 「昔の演出に戻したい。でもどのバージョンか思い出せない」ための仕組み。
 * 過去のコミットから演出を1つずつ取り出して**変種(variant)**として残し、
 * 実機で切り替えながら見比べて選べるようにする。
 *
 * 大事なのは「全部を同じ時点に戻す」のではなく、**枠ごとに別の時点を選べる**
 * こと(スキャンはv3、キャッチはv7…のように混ぜられる)。
 * だから選択は枠(slot)ごとに独立して保存する。
 *
 * 選択は端末ローカル(localStorage)。開発者が自分の端末で見比べるための
 * ものなので、サーバーには保存しない。
 */

export type EffectSlot = "scanAnalyzing" | "catchLanding";

export type VariantMeta = {
  id: string;
  /** 実機で見分けるための短い名前。 */
  label: string;
  /** いつ頃の版か(見分けの手がかり)。 */
  date: string;
  /** 何が違うのかを一言で。 */
  note: string;
};

/**
 * 枠ごとの変種一覧。id は保存値なので**変えない**こと。
 * 並び順は「古い→新しい」。
 */
export const EFFECT_VARIANTS: Record<EffectSlot, VariantMeta[]> = {
  scanAnalyzing: [
    {
      id: "v1probe",
      label: "探査ドット",
      date: "07-16",
      note: "画面のあちこちに探査点が点滅し、段階ごとに文言が変わる",
    },
    {
      id: "v2liquid",
      label: "リキッドメタル",
      date: "07-17",
      note: "液体金属がうねり、波紋が広がる重厚な演出",
    },
    {
      id: "v3crystal",
      label: "結晶化",
      date: "07-20",
      note: "リキッドメタル＋文字が1字ずつ結晶化して現れる",
    },
    {
      id: "v4calm",
      label: "静かな分析中",
      date: "07-20",
      note: "装飾を削り「分析中」を落ち着いて見せる",
    },
    {
      id: "v5optionb",
      label: "オプションB(青染め)",
      date: "07-20",
      note: "画面全体がアプリの青に染まる＋進行バー3本",
    },
    {
      id: "v6minimal",
      label: "ミニマル",
      date: "07-25",
      note: "最小限。きらめき1つと短い文言だけ",
    },
    {
      id: "v7fullscreen",
      label: "全画面スキャン",
      date: "07-27",
      note: "全画面の刷新版。段階が大きく表示される",
    },
    {
      id: "v8current",
      label: "現行",
      date: "07-28",
      note: "いま動いているもの(青染め＋細い進行バー)",
    },
  ],
  catchLanding: [
    {
      id: "v1classic",
      label: "クラシック",
      date: "07-20",
      note: "画面の9割まで拡大 → 少しタメて上へ抜け、図鑑にドン",
    },
    {
      id: "v2fullwidth",
      label: "画面いっぱい",
      date: "07-21",
      note: "写真全体が画面の横幅いっぱいまで広がる",
    },
    {
      id: "v3voiceline",
      label: "決め台詞つき",
      date: "07-27",
      note: "画面いっぱい＋空中のタメで決め台詞が鳴る(現行)",
    },
  ],
};

/** 何も選んでいないときに使う変種(= 現行の見た目)。 */
export const DEFAULT_VARIANT: Record<EffectSlot, string> = {
  scanAnalyzing: "v8current",
  catchLanding: "v3voiceline",
};

/**
 * フロー単位のプリセット(NORI採用の代案)。
 *
 * 「スキャン→図鑑に入るまで」を**まとめて一つの時代**として選べるようにする。
 * 枠ごとに1つずつ選ぶのは、どれが何と組み合わさっていたか思い出せないと
 * かえって難しい。まず「この時期の一式」で当たりを付け、気に入らない枠だけ
 * 下の一覧で差し替える — という順序で選べるのが狙い。
 *
 * variants に書いていない枠は触らない(部分的なプリセットも作れる)。
 */
export type FlowPreset = {
  id: string;
  label: string;
  date: string;
  note: string;
  variants: Partial<Record<EffectSlot, string>>;
};

export const FLOW_PRESETS: FlowPreset[] = [
  {
    id: "era0717",
    label: "リキッドメタル期",
    date: "07-17",
    note: "重厚な液体金属のスキャン。キャッチは画面9割まで拡大",
    variants: { scanAnalyzing: "v2liquid", catchLanding: "v1classic" },
  },
  {
    id: "era0720",
    label: "結晶化期",
    date: "07-20",
    note: "文字が1字ずつ結晶化。キャッチはクラシック",
    variants: { scanAnalyzing: "v3crystal", catchLanding: "v1classic" },
  },
  {
    id: "era0721",
    label: "静かな分析期",
    date: "07-21",
    note: "装飾を削った分析中＋写真が横幅いっぱいに広がるキャッチ",
    variants: { scanAnalyzing: "v4calm", catchLanding: "v2fullwidth" },
  },
  {
    id: "era0727",
    label: "全画面・決め台詞期",
    date: "07-27",
    note: "全画面スキャン＋空中のタメで決め台詞",
    variants: { scanAnalyzing: "v7fullscreen", catchLanding: "v3voiceline" },
  },
  {
    id: "eraNow",
    label: "現行",
    date: "07-28",
    note: "青染めの分析中＋決め台詞つきキャッチ",
    variants: { scanAnalyzing: "v8current", catchLanding: "v3voiceline" },
  },
];

/** プリセットを丸ごと適用する(書いてある枠だけ変える)。 */
export function applyFlowPreset(preset: FlowPreset): void {
  for (const [slot, id] of Object.entries(preset.variants)) {
    if (id) setVariant(slot as EffectSlot, id);
  }
}

/** いまの選択と完全に一致するプリセット(無ければ null = 自分で混ぜた状態)。 */
export function matchingFlowPreset(): string | null {
  for (const p of FLOW_PRESETS) {
    const all = Object.entries(p.variants).every(
      ([slot, id]) => getVariant(slot as EffectSlot) === id,
    );
    if (all) return p.id;
  }
  return null;
}

const KEY = (slot: EffectSlot) => `effect-lab:${slot}`;
const EVENT = "effect-lab-changed";

export function getVariant(slot: EffectSlot): string {
  if (typeof window === "undefined") return DEFAULT_VARIANT[slot];
  try {
    const saved = localStorage.getItem(KEY(slot));
    if (saved && EFFECT_VARIANTS[slot].some((v) => v.id === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_VARIANT[slot];
}

export function setVariant(slot: EffectSlot, id: string): void {
  try {
    localStorage.setItem(KEY(slot), id);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

export function resetVariant(slot: EffectSlot): void {
  try {
    localStorage.removeItem(KEY(slot));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

export const EFFECT_LAB_EVENT = EVENT;

/**
 * ラボは開発者だけに見せる。?dev=1 か localStorage の dev フラグで開く
 * (アプリ内の他の開発者向け表示と同じ合図)。
 */
export function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("dev") === "1") return true;
    return window.localStorage.getItem("catchwords_dev") === "1";
  } catch {
    return false;
  }
}
