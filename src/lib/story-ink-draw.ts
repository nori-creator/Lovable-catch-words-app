/**
 * アルバムの書き込み（`StoryInk`）を**描く決まり**。画面（SVG / CSS）と
 * ウィジェットの絵（`widget-snapshot.ts`、canvas）が同じ線・同じ字体で描くよう、
 * ここに1つだけ置く。
 */
export type FontId = "modern" | "classic" | "signature" | "type";

export const FONTS: Array<{ id: FontId; key: string; css: string }> = [
  {
    id: "modern",
    key: "ink.fontModern",
    css: "800 1em system-ui, -apple-system, 'Hiragino Sans', sans-serif",
  },
  { id: "classic", key: "ink.fontClassic", css: "700 1em 'Hiragino Mincho ProN', Georgia, serif" },
  {
    id: "signature",
    key: "ink.fontSignature",
    css: "400 1.1em 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive",
  },
  { id: "type", key: "ink.fontType", css: "600 0.95em ui-monospace, 'Courier New', monospace" },
];

/** 点列を、中点を通る2次曲線でなめらかに（指の震えを抑える）。ウィジェットの絵（`widget-snapshot.ts`）も同じ線で描く。 */
export function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length < 3)
    return `M${pts[0][0]} ${pts[0][1]} L${pts.map((p) => p.join(" ")).join(" L")}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}

export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
