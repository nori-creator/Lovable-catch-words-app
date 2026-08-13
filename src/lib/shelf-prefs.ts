/**
 * 棚の見え方の設定 — 素材と密度。
 *
 * ## なぜ端末に持つのか
 * 「木の棚が好き」「4列で詰めて見たい」は**その人のその端末の好み**であって、
 * アカウントの属性ではない。DBに置くと保存に往復が要り、Supabase が
 * 止まっているときに設定が丸ごと落ちる(実際いま、プロフィール保存が
 * マイグレーション未適用で落ちている)。見え方の設定がそれに巻き込まれる
 * 理由は無いので localStorage に置く。
 */

export const SHELF_MATERIALS = ["none", "oak", "walnut", "obsidian", "concrete", "glass"] as const;
export type ShelfMaterial = (typeof SHELF_MATERIALS)[number];

/** 密度 = 1段に何個並べるか。`spines` だけは並べ方そのものが変わる。 */
export const SHELF_DENSITIES = ["two", "three", "four", "spines"] as const;
export type ShelfDensity = (typeof SHELF_DENSITIES)[number];

/** その密度で1段に入る数。 */
export const DENSITY_PER_SHELF: Record<ShelfDensity, number> = {
  two: 2,
  three: 3,
  four: 4,
  // 背表紙は薄いので同じ幅に多く入る。**6が上限** — 最初8にしたら
  // 1本あたり43pxになり、44pxのタップ領域を割った(検査が落とした)。
  // 320px幅の端末でも 6 なら 46px 残る。
  spines: 6,
};

const MATERIAL_KEY = "dex-shelf-material";
const DENSITY_KEY = "dex-shelf-density";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* プライベートモードなどで書けないことがある。見え方の設定なので黙って諦める。 */
  }
}

/**
 * 既定は「素材なし・3列」。
 *
 * 板を敷いたほうが写真映えはするが、**モノより棚が目立つ**ことがある。
 * 集めたものを見に来ているのだから、既定はモノを邪魔しない側に置く。
 */
export function getShelfMaterial(): ShelfMaterial {
  return read(MATERIAL_KEY, SHELF_MATERIALS, "none");
}
export function setShelfMaterial(v: ShelfMaterial) {
  write(MATERIAL_KEY, v);
}
export function getShelfDensity(): ShelfDensity {
  return read(DENSITY_KEY, SHELF_DENSITIES, "three");
}
export function setShelfDensity(v: ShelfDensity) {
  write(DENSITY_KEY, v);
}

/**
 * 背表紙の色。**同じ語はいつも同じ色**でなければ意味がない —
 * 開くたびに色が変わったら「あの青いやつ」で覚えられない。
 * 見出し語から決めるので、保存も要らず、端末が変わっても同じ色になる。
 */
export function spineColor(headword: string): string {
  let h = 0;
  for (let i = 0; i < headword.length; i++) h = (h * 31 + headword.charCodeAt(i)) >>> 0;
  // 彩度と明度は固定。色相だけ振る = 並べたときに一段の帯として揃う。
  //
  // 明度26%は見た目ではなく**読めるかで決めた値**。背には白い文字を載せる
  // ので、いちばん明るくなる色相(黄、60度)でも 4.5:1 を超える必要がある。
  // 最初 38% にしたら黄と橙で 3.9:1 まで落ち、検査がそれを落とした。
  // 26% なら背の丸みのハイライト(白10%)を重ねても最悪 5.3:1 残る。
  // ここを明るくするときは、必ず色相60度で測り直すこと。
  return `hsl(${h % 360} 42% 26%)`;
}
