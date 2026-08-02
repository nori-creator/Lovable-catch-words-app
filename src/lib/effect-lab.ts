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

export type EffectSlot = "scanAnalyzing";

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
};

/** 何も選んでいないときに使う変種(= 現行の見た目)。 */
export const DEFAULT_VARIANT: Record<EffectSlot, string> = {
  scanAnalyzing: "v8current",
};

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
