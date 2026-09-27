/**
 * **紙をめくる形の計算**（オーナー指示 2026-09-27「添付動画のように、どこから
 * でもページがめくれるように。めくった時の残像やページの柔らかさを再現」）。
 *
 * 参考動画（ほぼ日手帳・絵本）の形は「角を掴んで引くと、紙が斜めの折り目で
 * 折り返り、裏が見える」。これは次の作図で出せる:
 *
 *   ・動く角 C0（右上か右下）と、いまの角の位置 P。
 *   ・**折り目 = C0 と P の垂直二等分線**（紙は伸びないので、折り返した角は
 *     元の角と折り目について対称な所に来る）。
 *   ・折り目より C0 側の紙は折り返されて、折り目で**鏡に映した**位置に来る。
 *   ・折り目の反対側は、まだ平らなまま。
 *
 * 座標は「めくる1枚」の中の px。**背（綴じ目）が x=0、紙の端が x=W**。
 * 見開きの左の紙をめくるときは、呼ぶ側が左右を裏返してから使う。
 */

export type Pt = { x: number; y: number };

export type CurlGeometry = {
  /** 折り目の上の1点（C0 と P の中点）。 */
  mid: Pt;
  /** 折り目の法線（C0 の側を向く単位ベクトル）。 */
  n: Pt;
  /** まだ平らな部分（C0 と反対側）。紙の四角を折り目で切った多角形。 */
  flat: Pt[];
  /** 折り返される部分（C0 の側）。**折り返す前**の位置で。 */
  lifted: Pt[];
  /** 折り返しの変換（CSS の `matrix(a,b,c,d,e,f)` の6つ）。 */
  matrix: [number, number, number, number, number, number];
};

/** 背から紙が外れないように、角の位置を縛る。 */
export function constrainCorner(P: Pt, C0: Pt, W: number, H: number): Pt {
  // 動く角と同じ側の背の角（上の角なら (0,0)）から W より遠くへは行けない。
  const near = { x: 0, y: C0.y };
  // 反対側の背の角からは対角線の長さより遠くへは行けない。
  const far = { x: 0, y: C0.y === 0 ? H : 0 };
  let q = clampDist(P, near, W);
  q = clampDist(q, far, Math.hypot(W, H));
  return q;
}

function clampDist(p: Pt, c: Pt, r: number): Pt {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d <= r || d === 0) return p;
  return { x: c.x + (dx / d) * r, y: c.y + (dy / d) * r };
}

/**
 * 紙の四角 [0,W]×[0,H] を、`dot(n, p - m) <= 0` の側だけ残して切る
 * （Sutherland–Hodgman を1本の線だけで）。
 */
export function clipRect(W: number, H: number, n: Pt, m: Pt, keepPositive = false): Pt[] {
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const side = (p: Pt) => {
    const v = n.x * (p.x - m.x) + n.y * (p.y - m.y);
    return keepPositive ? -v : v;
  };
  const out: Pt[] = [];
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i];
    const b = rect[(i + 1) % rect.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if (sa <= 0 !== sb <= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** 角 C0 が P まで引かれたときの形。P が C0 と同じなら何も折れていない。 */
export function curlGeometry(C0: Pt, P: Pt, W: number, H: number): CurlGeometry | null {
  const dx = C0.x - P.x;
  const dy = C0.y - P.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  const n = { x: dx / len, y: dy / len };
  const mid = { x: (C0.x + P.x) / 2, y: (C0.y + P.y) / 2 };
  const flat = clipRect(W, H, n, mid, false);
  const lifted = clipRect(W, H, n, mid, true);
  // 折り目についての鏡映: p' = p - 2 (n·(p-m)) n
  const k = n.x * mid.x + n.y * mid.y;
  const matrix: CurlGeometry["matrix"] = [
    1 - 2 * n.x * n.x,
    -2 * n.x * n.y,
    -2 * n.x * n.y,
    1 - 2 * n.y * n.y,
    2 * k * n.x,
    2 * k * n.y,
  ];
  return { mid, n, flat, lifted, matrix };
}

/** 多角形を CSS の `clip-path: polygon(...)` に。 */
export function polygonCss(pts: Pt[]): string {
  if (pts.length < 3) return "polygon(0 0, 0 0, 0 0)";
  return `polygon(${pts.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(", ")})`;
}

/**
 * 折り目に沿った陰影のための、CSS の `linear-gradient` の角度と、
 * 折り目がその線のどこ（px）に来るか。
 *
 * CSS の線形グラデーションは箱の中心を通る線で、長さは
 * `|W sinθ| + |H cosθ|`。点 p の位置は `(p - 中心)·u + 長さ/2`。
 */
export function foldGradient(
  n: Pt,
  mid: Pt,
  W: number,
  H: number,
): { angle: number; at: number; length: number } {
  const angle = (Math.atan2(n.x, -n.y) * 180) / Math.PI;
  const rad = (angle * Math.PI) / 180;
  const length = Math.abs(W * Math.sin(rad)) + Math.abs(H * Math.cos(rad));
  const at = (mid.x - W / 2) * n.x + (mid.y - H / 2) * n.y + length / 2;
  return { angle, at, length };
}
