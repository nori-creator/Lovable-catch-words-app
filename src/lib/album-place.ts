/**
 * アルバムの札を**好きな場所に、好きな大きさ、好きな傾きで**置くための数。
 *
 * ## オーナー指示 2026-09-15
 * > 「ホームの画像長押ししたら下に縦横とか出てくるんだけど、そうではなく
 * >  直感的に写真を指で動かせて大きさをズームしたら大きくなるように。
 * >  また傾きも指で決めれるできるようにして。今はカクカクして滑らかに
 * >  画像を自分の好きな場所に好きな大きさで設定できるようになってない。」
 *
 * ## 「カクカク」の正体は、升目そのものだった
 * これまでの持ち方は**升目いくつ分か**（S=1×1 / 縦=1×2 / 横=2×1 / L=2×2）の
 * 4通りだけ。指をどれだけ滑らかに動かしても、結果は4つのどれかに飛ぶので、
 * **滑らかになりようが無い**。場所も並び順（`album_order`）でしか持って
 * いないので、「好きな場所」は表現できなかった。下に出ていた「縦 / 横」の
 * ボタンは、連続で決められないことの埋め合わせだった。
 *
 * だからここでは升目を捨て、**紙の上の座標**で持つ。
 *
 * ## 0〜1 で持つ理由
 * px で持つと、別の端末や横向きで開いたときに**全部ずれる**。台紙の箱に
 * 対する割合で持てば、画面の幅が変わっても同じ見た目になる。台紙は
 * `ALBUM_ASPECT` の決まった形にして、縦も同じ割合で測れるようにする
 * （中身で高さが伸びる箱だと、札を足すたびに置いた物が動いてしまう）。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** 台紙の形（横:縦）。ここを変えると、既に置いた札の縦位置がずれる。 */
export const ALBUM_ASPECT = 4 / 5;

/** 札の基準の大きさ。台紙の幅に対する割合（`scale: 1` のときの幅）。 */
export const BASE_WIDTH = 0.26;

/** 大きさの下限と上限。 */
export const MIN_SCALE = 0.45;
export const MAX_SCALE = 2.6;

/**
 * まっすぐに戻せる幅（度）。
 *
 * 指で回すと**ぴったり 0 度には止められない**。1〜2度だけ傾いた札が並ぶと、
 * 揃えたつもりが揃わず、直す手立ても無い。iOS の写真も同じ理由で吸い付く。
 * 大きく傾ける自由は残したいので、幅は狭く取る。
 */
export const ROT_SNAP_DEG = 4;

/** 札の置き方。**升目ではなく、紙の上の座標。** */
export type Placement = {
  /** 中心の横位置。台紙の幅に対する割合（0=左端, 1=右端）。 */
  x: number;
  /** 中心の縦位置。台紙の高さに対する割合。 */
  y: number;
  /** 基準の大きさに対する倍率。 */
  scale: number;
  /** 傾き（度）。 */
  rot: number;
};

export type Pt = { x: number; y: number };

/** 触れている指。1本なら `b` は無い。 */
export type Grip = { a: Pt; b?: Pt };

/** 2点の真ん中。1本なら その点。 */
export function centroid(g: Grip): Pt {
  if (!g.b) return g.a;
  return { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
}

/** 2点の距離。1本なら 0。 */
export function spread(g: Grip): number {
  if (!g.b) return 0;
  return Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
}

/** 2点を結ぶ線の角度（度）。1本なら 0。 */
export function angle(g: Grip): number {
  if (!g.b) return 0;
  return (Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180) / Math.PI;
}

/** −180〜180 に畳む（359度回した、ではなく −1度回した、と読む）。 */
export function normalizeDeg(deg: number): number {
  let d = ((deg + 180) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

/** 指の動きから、動かす量・倍率・回した角度を出す。 */
export type Delta = { dx: number; dy: number; scale: number; rot: number };

/**
 * **指1本なら動かすだけ。2本なら、動かす・広げる・回すが同時に起きる。**
 *
 * 3つを別々の操作に分けない（「まず大きさ、次に傾き」にしない）のは、
 * 実際の紙を2本の指でつまむとその3つが一度に起きるから。分けた瞬間に
 * 「思ったように動かない」になる。
 *
 * 途中で指の数が変わった回（2本目を足した／離した）は、呼ぶ側が
 * `start` を取り直すこと。ここでは**同じ握りの中の差**だけを見る。
 */
export function gestureDelta(start: Grip, now: Grip): Delta {
  const c0 = centroid(start);
  const c1 = centroid(now);
  const twoFingers = Boolean(start.b && now.b);
  const s0 = spread(start);
  return {
    dx: c1.x - c0.x,
    dy: c1.y - c0.y,
    // 2点が重なっている回（`s0` が 0 に近い）は倍率を出さない。
    // 割ると無限大に飛んで、札が画面外へ吹き飛ぶ。
    scale: twoFingers && s0 > 1 ? spread(now) / s0 : 1,
    rot: twoFingers ? normalizeDeg(angle(now) - angle(start)) : 0,
  };
}

/** 数を範囲に収める。 */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 掴んだときの置き方に、指の動きを足す。
 *
 * @param base 掴んだ瞬間の置き方（**毎回ここから作り直す**ので、引き返せば必ず戻る）
 * @param d 指の動き
 * @param box 台紙の実寸（px）
 */
export function applyDelta(base: Placement, d: Delta, box: { w: number; h: number }): Placement {
  const w = Math.max(box.w, 1);
  const h = Math.max(box.h, 1);
  const rot = normalizeDeg(base.rot + d.rot);
  return {
    // **台紙の外へ出しきらない。** 中心が紙の中に在れば、掴み直せる。
    // 完全に外へ出せてしまうと、二度と触れない札ができる。
    x: clamp(base.x + d.dx / w, 0, 1),
    y: clamp(base.y + d.dy / h, 0, 1),
    scale: clamp(base.scale * d.scale, MIN_SCALE, MAX_SCALE),
    // 指を離すまでは吸い付かせない（動かしている最中に飛ぶと驚く）。
    rot,
  };
}

/**
 * 指を離したときの置き方。**まっすぐの近くだけ、まっすぐに直す。**
 */
export function settle(p: Placement): Placement {
  return Math.abs(normalizeDeg(p.rot)) <= ROT_SNAP_DEG ? { ...p, rot: 0 } : p;
}

/** 札の実寸（px）。傾きは含まない（箱の大きさなので）。 */
export function sizePx(p: Placement, box: { w: number; h: number }): { w: number; h: number } {
  const w = box.w * BASE_WIDTH * p.scale;
  // 札は縦長の印画紙。`photo-print` の見た目に合わせた比。
  return { w, h: w * 1.22 };
}

/**
 * まだ自分で置いていない札の、最初の場所。
 *
 * **昔の升目の並びに寄せる** — ある日いきなり全部が散らばると、
 * 「壊れた」と読まれる。3列の律動をそのまま座標に直し、札ごとに
 * ほんの少しだけ傾けて、紙に貼った風合いを残す。
 *
 * `id` から作るので、**何度描いても同じ場所**に出る（乱数を使うと、
 * 描き直すたびに動く）。
 */
export function autoPlacement(index: number, id: string): Placement {
  const col = index % 3;
  const row = Math.floor(index / 3);
  // 端に寄せすぎない。0.22 / 0.5 / 0.78 の3列。
  const x = 0.22 + col * 0.28;
  // 1行ぶんの高さ。台紙の中で6行ぶんまでは重ならずに並ぶ。
  const y = 0.12 + row * 0.155;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    x,
    y: clamp(y, 0, 1),
    scale: 1,
    // −3.5〜3.5 度。**まっすぐ揃いすぎない**のが紙のアルバムらしさ。
    rot: ((hash % 71) / 70) * 7 - 3.5,
  };
}

/** 保存された値を置き方に直す。**どれか欠けていれば自動の置き方に倒す。** */
export function placementFrom(
  saved: { x?: number | null; y?: number | null; scale?: number | null; rot?: number | null },
  index: number,
  id: string,
): Placement {
  const auto = autoPlacement(index, id);
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    x: clamp(num(saved.x, auto.x), 0, 1),
    y: clamp(num(saved.y, auto.y), 0, 1),
    scale: clamp(num(saved.scale, auto.scale), MIN_SCALE, MAX_SCALE),
    rot: normalizeDeg(num(saved.rot, auto.rot)),
  };
}
