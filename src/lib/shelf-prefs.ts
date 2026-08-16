/**
 * 図鑑の見え方 — **3つの完成した見え方から1つを選ぶ**。
 *
 * ## なぜ作り直したか
 * もとは「素材6種 × 並べ方4種」で、テーマ派生を含めると 120 通りあった。
 * 独立監査の指摘はこうだった:
 *
 * > 390px 幅・棚1本あたり高さ8〜10pxで「なし / ガラス / コンクリート」の
 * > 差は説明されなければ気づかれない。24通りは、**選ばなかったことの表明**。
 * > Value & Focus の「何を作らないと決めたか」に一度も答えていない。
 *
 * さらに「並べ方」の行には *2列 / 3列 / 4列 / 背表紙* が同居していた。
 * 前3つは密度、背表紙は**表示形式**で、分類が違うものが同じ帯にいた。
 *
 * ## 作り直しの考え方
 * 掛け合わせをやめ、**それぞれ完成した見え方**を3つだけ置く。
 * 素材・列数・モノの見せ方は、見え方ごとにこちらで決める —
 * 組み合わせをユーザーに解かせない。時計の文字盤を選ぶのと同じで、
 * 選ぶのは「どれが好きか」であって「木目 × 4列は変にならないか」ではない。
 *
 * | 見え方 | 板 | 列 | モノ |
 * |---|---|---|---|
 * | 棚(既定) | 無し(細い線) | 3 | 切り抜きが立つ |
 * | 書架 | 木 | 6 | 背表紙で詰める |
 * | 標本 | 無し(細い線) | 2 | 大きく、余白を広く |
 *
 * ## なぜ端末に持つのか
 * 「どの見え方が好きか」は**その人のその端末の好み**で、アカウントの
 * 属性ではない。DBに置くと保存に往復が要り、Supabase が止まっていると
 * 設定が丸ごと落ちる(実際いま、プロフィール保存が落ちている)。
 */

import { ROOM_CATEGORIES, ROOM_KEYS } from "@/lib/category";

export const SHELF_STYLES = ["shelf", "library", "specimen"] as const;
export type ShelfStyle = (typeof SHELF_STYLES)[number];

/** 板の素材。見え方ごとにこちらで決めるので、単独では選ばせない。 */
export type ShelfMaterial = "none" | "oak" | "walnut" | "obsidian" | "concrete" | "glass";

/** 見え方 → 実際の描き方。ここが唯一の対応表。 */
export const STYLE_SPEC: Record<
  ShelfStyle,
  { material: ShelfMaterial; perShelf: number; spines: boolean }
> = {
  // 既定。板を敷くと**モノより棚が目立つ**ことがある。集めたものを
  // 見に来ているのだから、既定はモノを邪魔しない側に置く。
  shelf: { material: "none", perShelf: 3, spines: false },
  // 一覧性がいちばん高い。写真は見えなくなるので既定にはしない。
  // 6本が上限 — 8本にしたら1本43pxで、44pxのタップ領域を割った。
  library: { material: "oak", perShelf: 6, spines: true },
  // 写真をいちばん静かに見せる。列を減らすぶん1つが大きい。
  specimen: { material: "none", perShelf: 2, spines: false },
};

const STYLE_KEY = "dex-shelf-style";
/** 旧・素材/密度の鍵。読むだけ(移行のため)。 */
const OLD_MATERIAL_KEY = "dex-shelf-material";
const OLD_DENSITY_KEY = "dex-shelf-density";

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* プライベートモードなどで書けないことがある。見え方の設定なので黙って諦める。 */
  }
}

/**
 * いまの見え方。
 *
 * 旧設定からの移行も見る。**背表紙を選んでいた人は書架へ**、それ以外は
 * 既定へ。移行を書かないと、背表紙で見ていた人が黙って棚に戻される。
 */
export function getShelfStyle(): ShelfStyle {
  if (typeof localStorage === "undefined") return "shelf";
  try {
    const v = localStorage.getItem(STYLE_KEY);
    if (v && (SHELF_STYLES as readonly string[]).includes(v)) return v as ShelfStyle;
    if (localStorage.getItem(OLD_DENSITY_KEY) === "spines") return "library";
    if (localStorage.getItem(OLD_DENSITY_KEY) === "two") return "specimen";
    return "shelf";
  } catch {
    return "shelf";
  }
}

export function setShelfStyle(v: ShelfStyle) {
  write(STYLE_KEY, v);
}

/** 旧鍵の掃除。移行が済んだら残す理由が無い。 */
export function clearLegacyShelfPrefs() {
  try {
    localStorage.removeItem(OLD_MATERIAL_KEY);
    localStorage.removeItem(OLD_DENSITY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 背表紙の色。**棚(カテゴリー)から決める。**
 *
 * 以前は見出し語のハッシュだった。そのせいで同じ語が、カバー表示では
 * 実物の色(芒果=オレンジ)、背表紙表示では無関係な色(芒果=こげ茶)に
 * なっていた。独立監査の言い方が正確だった:
 *
 * > 色は「意味を持つ」か「持たない」かのどちらかでなければならない。
 * > ここでは**カバーでは意味があるように見せて、背表紙では嘘になる**。
 * > 学習者は色と語を結びつけて覚えるので、能動的に誤学習させる。
 *
 * 棚から決めれば、色が言っているのは「どの棚の本か」だけになる。
 * 実物の色について嘘をつかないし、棚ごとに帯が揃って一覧性も上がる。
 * 同じ棚の中の見分けは、背に刷ってある語そのものが担う。
 */
export function spineColor(categoryKey: string): string {
  const room = ROOM_KEYS.find((r) =>
    (ROOM_CATEGORIES[r] as readonly string[]).includes(categoryKey),
  );
  const roomIndex = room ? ROOM_KEYS.indexOf(room) : ROOM_KEYS.length;
  // 色相は**部屋の数で等分**する。カテゴリーのハッシュにしていたら、
  // 54 個を 360 度に散らすので**別の棚が同じ色になった**(実際、果物と
  // 乗り物が同じ紫になった)。部屋は8つなので 45 度ずつ離れて衝突しない。
  const base = (roomIndex * 360) / (ROOM_KEYS.length + 1);
  // 同じ部屋の中は±10度しかずらさない。**ほぼ同じ色でいい** —
  // 部屋がひとつの帯として読めるほうが、棚ごとに色が散るより
  // 「いまどの部屋を見ているか」が分かる。棚どうしの見分けは、
  // 色ではなく棚の見出し(🍎 果物)が担う。
  let h = 0;
  for (let i = 0; i < categoryKey.length; i++) h = (h * 31 + categoryKey.charCodeAt(i)) >>> 0;
  const hue = Math.round(base + ((h % 21) - 10)) % 360;
  // 明度26%は見た目ではなく**読めるかで決めた値**。背には白い文字を載せる
  // ので、いちばん明るくなる色相(黄、60度)でも 4.5:1 を超える必要がある。
  // 最初 38% にしたら黄と橙で 3.9:1 まで落ち、検査がそれを落とした。
  return `hsl(${(hue + 360) % 360} 42% 26%)`;
}
