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

/**
 * 昔の升目の寸法（オーナー指示 2026-09-15「デフォルトで表示するのは今までと
 * 同じ大きさにして」）。
 *
 * 自由配置にしたとき、基準の幅を目分量で 0.26 に置いたせいで**札が一回り
 * 小さくなった**。昔は `grid-cols-3 gap-x-4 auto-rows-[7rem] gap-y-8` の
 * 升目で、幅 316px の台紙なら 1升 = (316 − 16×2) ÷ 3 = 94.7px、
 * 1段 = 112px。ここはその実寸を**割合に直して置いたもの**なので、
 * 見た目は昔とぴったり同じになる。
 *
 * すべて**台紙の幅に対する割合**。高さに対する割合ではない（下の注）。
 */
export const GAP_X = 16 / 316;
export const GAP_Y = 32 / 316;
/** 1升の幅 ＝ 札の基準の大きさ（`scale: 1` のときの幅）。 */
export const BASE_WIDTH = (1 - 2 * GAP_X) / 3;
/** 1段の高さ（`auto-rows-[7rem]`）。 */
export const ROW_H = 112 / 316;
/** 升目は3列。 */
export const COLS = 3;

/**
 * 台紙の高さの下限（幅に対する割合）。札が少ない日でも紙らしい面積を残す。
 */
export const MIN_BOARD_H = 1.25;

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

/** 昔の升目の4通り。**表にはまだこの列が在る**ので、初期の形はここから。 */
export type AlbumSize = "small" | "portrait" | "landscape" | "large";

/** 大きさ → 升目（横, 縦）。 */
export const SIZE_CELLS: Record<AlbumSize, readonly [number, number]> = {
  small: [1, 1],
  portrait: [1, 2],
  landscape: [2, 1],
  large: [2, 2],
};

/** 升目いくつ分 → 幅（台紙の幅に対する割合）。間の隙間も足す。 */
export function cellsWidth(cx: number): number {
  return cx * BASE_WIDTH + (cx - 1) * GAP_X;
}

/** 升目いくつ分 → 高さ（台紙の**幅**に対する割合）。 */
export function cellsHeight(cy: number): number {
  return cy * ROW_H + (cy - 1) * GAP_Y;
}

/** その大きさの札の、縦横の比（高さ ÷ 幅）。 */
export function ratioOf(size: AlbumSize): number {
  const [cx, cy] = SIZE_CELLS[size];
  return cellsHeight(cy) / cellsWidth(cx);
}

/** その大きさの札の、初期の倍率。 */
export function scaleOf(size: AlbumSize): number {
  return cellsWidth(SIZE_CELLS[size][0]) / BASE_WIDTH;
}

/**
 * 札の置き方。**升目ではなく、紙の上の座標。**
 *
 * ## 縦も「台紙の**幅**」で測る
 * 高さで測ると、札を1枚足して台紙が伸びた瞬間に**置いてある札が全部
 * 上へ動く**（割合は同じでも、掛ける高さが変わるため）。幅で測れば、
 * 台紙が縦に伸びても置いた物は動かない。
 */
export type Placement = {
  /** 中心の横位置。台紙の幅に対する割合（0=左端, 1=右端）。 */
  x: number;
  /** 中心の縦位置。**台紙の幅**に対する割合（0=上端）。 */
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
 * @param boardW 台紙の幅（px）。縦もこれで測る（`Placement` の注）
 * @param maxY 縦の下限（台紙の高さぶん）。ここを越えて下へは出せない
 */
export function applyDelta(base: Placement, d: Delta, boardW: number, maxY: number): Placement {
  const w = Math.max(boardW, 1);
  return {
    // **台紙の外へ出しきらない。** 中心が紙の中に在れば、掴み直せる。
    // 完全に外へ出せてしまうと、二度と触れない札ができる。
    x: clamp(base.x + d.dx / w, 0, 1),
    y: clamp(base.y + d.dy / w, 0, Math.max(maxY, 0)),
    scale: clamp(base.scale * d.scale, MIN_SCALE, MAX_SCALE),
    // 指を離すまでは吸い付かせない（動かしている最中に飛ぶと驚く）。
    rot: normalizeDeg(base.rot + d.rot),
  };
}

/**
 * 指を離したときの置き方。**まっすぐの近くだけ、まっすぐに直す。**
 */
export function settle(p: Placement): Placement {
  return Math.abs(normalizeDeg(p.rot)) <= ROT_SNAP_DEG ? { ...p, rot: 0 } : p;
}

/**
 * 札の実寸（px）。傾きは含まない（箱の大きさなので）。
 *
 * 縦横の比は**最初の大きさから決まる**（`ratioOf`）。指で広げても比は
 * 変わらない — 変えてしまうと、横長に貼った写真がつまむたびに縦長に
 * なってしまう。
 */
export function sizePx(p: Placement, boardW: number, ratio: number): { w: number; h: number } {
  const w = boardW * BASE_WIDTH * p.scale;
  return { w, h: w * ratio };
}

/**
 * まだ自分で置いていない札を、**昔の升目とまったく同じ所に置く**。
 *
 * オーナー指示 2026-09-15「デフォルトで表示するのは今までと同じ大きさに
 * して」。大きさだけ戻しても、並びが違えば「同じ」にはならないので、
 * CSS グリッドの流し込み（`grid-auto-flow: row`、密詰めなし）をそのまま
 * なぞる。carriage は**後戻りしない** — そこが密詰めとの違いで、
 * 昔の絵と1枚でもずれると別の並びになる。
 *
 * 返すのは升目の位置（列, 段）。座標に直すのは `placeFromCell`。
 */
export function packAuto(sizes: readonly AlbumSize[]): Array<{ col: number; row: number }> {
  /** 埋まっている升目。`"row,col"`。 */
  const taken = new Set<string>();
  const fits = (row: number, col: number, cx: number, cy: number) => {
    if (col + cx > COLS) return false;
    for (let r = row; r < row + cy; r++)
      for (let c = col; c < col + cx; c++) if (taken.has(`${r},${c}`)) return false;
    return true;
  };
  let row = 0;
  let col = 0;
  const out: Array<{ col: number; row: number }> = [];
  for (const size of sizes) {
    const [cx, cy] = SIZE_CELLS[size];
    // 置ける所まで carriage を進める。**戻らない。**
    while (!fits(row, col, cx, cy)) {
      col += 1;
      if (col + cx > COLS) {
        col = 0;
        row += 1;
      }
    }
    for (let r = row; r < row + cy; r++)
      for (let c = col; c < col + cx; c++) taken.add(`${r},${c}`);
    out.push({ col, row });
    col += cx;
    if (col >= COLS) {
      col = 0;
      row += 1;
    }
  }
  return out;
}

/** 升目の位置と大きさ → 置き方（中心の座標）。 */
export function placeFromCell(
  cell: { col: number; row: number },
  size: AlbumSize,
  id: string,
): Placement {
  const [cx, cy] = SIZE_CELLS[size];
  const w = cellsWidth(cx);
  const h = cellsHeight(cy);
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    x: cell.col * (BASE_WIDTH + GAP_X) + w / 2,
    y: cell.row * (ROW_H + GAP_Y) + h / 2,
    scale: scaleOf(size),
    // −3.5〜3.5 度。**まっすぐ揃いすぎない**のが紙のアルバムらしさ。
    // `id` から作るので、何度描いても同じ（乱数だと描き直すたびに動く）。
    rot: ((hash % 71) / 70) * 7 - 3.5,
  };
}

/**
 * 台紙の高さ（幅に対する割合）。**中身から決める。**
 *
 * 決め打ちの形にすると、札が増えた日に下がはみ出すか、少ない日に紙が
 * 余りすぎる。縦を幅で測っているので（`Placement` の注）、ここが伸びても
 * 置いてある札は動かない。
 */
export function boardHeight(items: ReadonlyArray<{ place: Placement; ratio: number }>): number {
  let bottom = 0;
  for (const it of items) {
    const h = BASE_WIDTH * it.place.scale * it.ratio;
    bottom = Math.max(bottom, it.place.y + h / 2);
  }
  // 下に一息ぶんの余白。ぴったりで切ると、紙の縁と札が擦れて見える。
  return Math.max(MIN_BOARD_H, bottom + GAP_Y);
}

/** 保存された値を置き方に直す。**どれか欠けていれば自動の置き方に倒す。** */
export function placementFrom(
  saved: { x?: number | null; y?: number | null; scale?: number | null; rot?: number | null },
  auto: Placement,
): Placement {
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    x: clamp(num(saved.x, auto.x), 0, 1),
    // 縦の上限はここでは掛けない（台紙の高さは中身から決まるので、
    // 読む時点ではまだ分からない）。負にだけならないようにする。
    y: Math.max(num(saved.y, auto.y), 0),
    scale: clamp(num(saved.scale, auto.scale), MIN_SCALE, MAX_SCALE),
    rot: normalizeDeg(num(saved.rot, auto.rot)),
  };
}

/**
 * **誌面の自動配置**（オーナー指示 2026-09-22）。
 *
 * > ホームを開いたら雑誌のように撮った画像が有機的に重なり合って写真が
 * > 並ぶようにしたい。
 *
 * ## なぜ升目（`packAuto`）では足りないか
 * `packAuto` は昔の CSS グリッドをなぞる物で、**1段の高さが決め打ち**
 * （`ROW_H`）。ところが札の実際の高さは**写真そのものの縦横比**から決まる
 * ので、縦長の写真が1枚入るだけでその下に大きな空きができる（実測: 7枚で
 * 台紙が 2550px、半分近くが空白）。
 *
 * ## 作り
 * 2列の石積み（masonry）に、**わざと重なりと段差を付ける**。
 *
 * ・列の幅は `COLLAGE_COL_W` … 2列で 1.16。**左右で必ず重なる**
 * ・**字の幅は `COLLAGE_CAP_W` に抑える** … 写真は真ん中を越えるが、
 *   字は自分の側の外半分から出ない。これが「重なっているのに読める」を
 *   成り立たせている唯一の約束
 * ・その日の1枚目だけ大きく、**2枚目はその横**に並ぶ … 1ページに見える
 * ・**同じ列の中では重ねない** … 縦に重ねると、上の札の時刻と語が
 *   下の札に隠れる（実測で全部隠れた）。重なりは左右だけで作る
 * ・空いているほうの列へ積む … 片方だけが先へ伸びて空白ができない
 * ・幅と傾きは `id` から作る … 何度描いても同じ（乱数だと描き直すたびに動く）
 *
 * 返すのは中心の座標。**保存された置き方があればそちらが勝つ**
 * （`placementFrom`）ので、ここは「まだ自分で置いていない札」の初期値。
 */
/**
 * 列の幅（台紙の幅に対する割合）。
 *
 * **2列で 1.16 ＝ 必ず重なる。**（オーナー指示 2026-09-22「雑誌みたいに
 * いろんな角度で画像が有機的に重なりかさあって1つの作品になるように」）
 * 0.5 にすると左右がちょうど突き合わさるだけで、重なりが1枚も出ない。
 *
 * 重ねても字が隠れないのは、**字の幅を `COLLAGE_CAP_W` に抑えてある**
 * から。左の字は 0〜0.42、右の写真は 0.42〜1 に居るので、決して当たらない。
 */
export const COLLAGE_COL_W = 0.58;
/**
 * 写真の下に書く字の幅の上限（台紙の幅に対する割合）。
 *
 * 写真は真ん中を越えて重なるが、**字は自分の側の外半分から出ない**。
 * これが「重なっているのに読める」を成り立たせている唯一の約束なので、
 * `COLLAGE_COL_W` を広げるときは必ずこちらも見直すこと
 * （`1 - COLLAGE_COL_W` を越えてはいけない）。
 */
export const COLLAGE_CAP_W = 0.42;
/**
 * その日の1枚目の幅（台紙の幅に対する割合）。
 *
 * **0.8 から 0.58 に下げた**（オーナー指示 2026-09-22「パッと今日撮った
 * 写真が一目で見えるように文字や画像の大きさを調整して…画面を開いたときの
 * 情報量や作品感を出したい」）。0.8 だと実測で 1枚目だけが高さ 344px
 * （画面の 4割）を占め、表紙と合わせて**最初の画面に写真が1枚半しか
 * 入らなかった**。これなら右の列が1枚目の横に並ぶので、同じ高さに
 * 2枚入り、しかも重なるぶん誌面らしくなる。
 *
 * 列の幅（`COLLAGE_COL_W`）と同じ値にしてあるのは、**字の幅の約束
 * （`COLLAGE_CAP_W`）を1枚目にもそのまま効かせる**ため。ここだけ広げると、
 * 1枚目が触られて最前面に来た回に、反対の列の字を覆う。
 */
export const COLLAGE_HERO_W = 0.58;
/** 右の列を最初に下げるぶん（台紙の幅に対する割合）。 */
export const COLLAGE_STAGGER = 0.05;
/**
 * 同じ列の上下に入れる息。**字のぶん（`extra`）はこれとは別に数える。**
 * ここは純粋に「紙の余白」で、広すぎると1画面に入る枚数が減る。
 */
export const COLLAGE_GAP = 0.022;
/**
 * 枠の縦横比の上限・下限。
 *
 * 写真そのものの比をそのまま使うと、縦長の1枚（比 1.5）が画面の半分を
 * 占めて**その日の他の写真が1枚も見えなくなる**。逆に極端な横長は帯に
 * なって何が写っているか読めない。4:5 〜 3:2 に収める（`object-cover`
 * なので、外れたぶんは上下（左右）が少しだけ切れる）。
 */
export const COLLAGE_RATIO_MIN = 0.66;
export const COLLAGE_RATIO_MAX = 1.15;

/**
 * 比を誌面に収まる範囲へ。壊れた値（0・NaN）は 1 に倒す。
 *
 * **写真にだけ掛ける。** 文字から調べた語の枠（`PLAIN_RATIO`）はここより
 * 低いのが正しい（字が1〜2行しか無いので、写真と同じ高さを取ると字だけが
 * 空白に浮く）。だから `packCollage` の中では掛けず、呼ぶ側が写真の比に
 * だけ掛ける — 置き方の計算と描く形で**同じ1つの数**を使う。
 */
export function collageRatio(ratio: number): number {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return clamp(r, COLLAGE_RATIO_MIN, COLLAGE_RATIO_MAX);
}

export function packCollage(
  items: ReadonlyArray<{
    id: string;
    ratio: number;
    /**
     * 写真の**下に付く字**のぶん（台紙の幅に対する割合）。
     *
     * 時刻・語の札・手書きの一言は写真の枠の外に出るので、ここを
     * 数えないと**次の札が字の上に乗る**。札ごとに一言の有無が違うので、
     * 呼ぶ側が渡す。
     */
    extra?: number;
  }>,
): Placement[] {
  /**
   * `id` から決まる 0〜1。同じ札なら何度でも同じ値。
   *
   * **素朴な `h*31 + 文字` では足りない。** `s0` `s1` `s2` … と連番の id が
   * 来ると、出てくる値もほぼ連番になり、**傾きが全部同じ向きに揃う**
   * （実測 −1.146°, −1.140°, −1.134° …＝ 0.006 刻み）。
   * 最後に一度かき混ぜて、隣の id が離れた値になるようにする。
   */
  const seed = (id: string, salt: number) => {
    let h = 0x811c9dc5 ^ salt;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 15;
    h = Math.imul(h, 0x2545f491) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  /** 壊れた比（0・NaN）でも積めるようにするだけ。**丸め込みはしない。** */
  const safeRatio = (r: number) => (Number.isFinite(r) && r > 0 ? r : 1);
  /** 各列の「ここから下が空いている」位置。 */
  const bottom = [0, COLLAGE_STAGGER];
  /** 各列に何枚目まで置いたか（大小の律動を列ごとに刻む）。 */
  const placedIn = [0, 0];
  /**
   * **その日の1枚目は大きく、左に。**（参考の誌面はどちらも、大きな1枚が
   * 座って、その脇と下に小さい写真が散る形になっている。これが「1ページ」に
   * 見えるかどうかを決めている。）
   *
   * 右の列（右端寄せ）と**必ず重なる**幅なので、2枚目は1枚目の下ではなく
   * **横**に並ぶ。そのぶん最初の画面に入る枚数が増える。
   *
   * 札が2枚しかない日に大きな1枚を置くと、残り1枚が取り残されるので、
   * 3枚以上の日だけ。
   */
  const hero = items.length >= 3;
  return items.map((it, i) => {
    if (hero && i === 0) {
      const w = COLLAGE_HERO_W;
      const h = w * safeRatio(it.ratio);
      const y = h / 2;
      const capTop = y + h / 2;
      // 左の列は1枚目の下から。**右の列は上のまま**（横に並ぶ）。
      bottom[0] = capTop + (it.extra ?? 0) + COLLAGE_GAP;
      return {
        x: clamp(w / 2, 0, 1),
        y,
        scale: w / BASE_WIDTH,
        // 1枚目は**わずかに左へ**。大きい物ほど傾きは小さく見せる
        // （大きく傾けると、それだけで画面が落ち着かなくなる）。
        rot: -(0.6 + seed(it.id, 13) * 1.4),
      };
    }
    /**
     * **空いているほうの列へ置く。**
     *
     * 左右を1枚ずつ交互に振ると、縦長が続いた列だけが先へ伸び、
     * **もう片方の列に画面まるごとの空白ができる**（実測: 右の列が
     * 230px ぶん空いたまま、左だけが下へ伸びた）。石積みの定石どおり、
     * そのとき短いほうへ積む。並びだけで決まるので、何度描いても同じ。
     */
    const col = bottom[0] <= bottom[1] ? 0 : 1;
    /**
     * 幅を揺らす（列の幅の 78〜100%）。大小が混ざるほど誌面らしくなる。
     *
     * 真ん中を越えるのは**わざと**で、そこが重なりを作っている。隠れないのは
     * 字のほうを `COLLAGE_CAP_W` に抑えてあるから — 上限をここで広げると、
     * 右の札の左端が左の字の側へ食い込んで、時刻と語が読めなくなる。
     */
    /**
     * **大・小・中・小の律動**（オーナー指示 2026-09-22「大小、重ねたり、
     * バランスをとって毎日の画像を一つの作品にして。いまただ適当に並んでる
     * だけ」）。前は幅を `id` から乱数で揺らしていたので、大きい物が2枚
     * 続いたり小さい物が固まったりして、**並びに意図が見えなかった**。
     * 列ごとに決まった律動を刻み、乱数はわずかな揺らぎ（±3%）だけにする。
     */
    // 一番大きい拍でも 1枚目（`COLLAGE_HERO_W`）より小さい — **主役は1枚**。
    const RHYTHM = [0.94, 0.8, 0.88, 0.76] as const;
    const beat = RHYTHM[placedIn[col] % RHYTHM.length];
    placedIn[col] += 1;
    const w = COLLAGE_COL_W * clamp(beat + (seed(it.id, 7) - 0.5) * 0.06, 0.73, 0.97);
    const h = w * safeRatio(it.ratio);
    // 列の中心。左右の端に寄せる（字は外側に付くので、外側を空けない）。
    const cx = col === 0 ? w / 2 : 1 - w / 2;
    const y = bottom[col] + h / 2;
    bottom[col] = y + h / 2 + (it.extra ?? 0) + COLLAGE_GAP;
    return {
      x: clamp(cx, 0, 1),
      y,
      scale: w / BASE_WIDTH,
      /**
       * **左の列は左へ、右の列は右へ傾ける**（1〜3.5度）。
       *
       * 前は −4〜4 度を札ごとにばらばらに振っていた。隣どうしが同じ向きに
       * 傾くと平行な2枚になり、逆に倒れ合うと喧嘩して、どちらも「適当に
       * 置いた」に見えた（オーナー報告 2026-09-22）。外側へ開く向きに
       * 揃えると、左右が1枚の見開きとして釣り合う — 参考の誌面もそう。
       */
      rot: (col === 0 ? -1 : 1) * (1 + seed(it.id, 13) * 2.5),
    };
  });
}
