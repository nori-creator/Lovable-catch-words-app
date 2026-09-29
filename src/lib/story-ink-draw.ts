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

// ---- 書く道具（Instagram のストーリーのペンを参考に、2026-09-28 R11） ----------------

/** ペン / マーカー（半透明で重ねると濃くなる）/ ネオン（光る縁）/ 消しゴム。 */
export type InkTool = "pen" | "marker" | "neon";
export const INK_TOOLS: InkTool[] = ["pen", "marker", "neon"];

/** 太さのスライダーの範囲（紙の幅 1000 に対する値）。 */
export const INK_MIN_WIDTH = 4;
export const INK_MAX_WIDTH = 48;

/** 道具ごとの線の描き方（SVG の属性）。 */
export function strokeStyle(tool: InkTool | undefined, color: string, width: number) {
  if (tool === "marker")
    return {
      stroke: color,
      strokeWidth: width * 1.8,
      strokeOpacity: 0.45,
      strokeLinecap: "square" as const,
    };
  if (tool === "neon")
    return {
      stroke: "#ffffff",
      strokeWidth: width * 0.55,
      strokeOpacity: 1,
      strokeLinecap: "round" as const,
      glow: color,
    };
  return { stroke: color, strokeWidth: width, strokeOpacity: 1, strokeLinecap: "round" as const };
}

/**
 * 消しゴム: 指の点から `radius` 以内を通る線を丸ごと消す（Instagram と違い、線の
 * 一部だけ削らない — 手書きの字が途中で切れて汚く残らない）。
 */
export function eraseAt<T extends { pts: Array<[number, number]>; width: number }>(
  strokes: T[],
  p: [number, number],
  radius: number,
): T[] {
  // 点だけでなく、点と点の間の線分との距離で見る（速く書いた線は点がまばら）。
  const segDist = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  };
  return strokes.filter((s) => {
    const r = radius + s.width / 2;
    if (s.pts.length === 1) return Math.hypot(s.pts[0][0] - p[0], s.pts[0][1] - p[1]) > r;
    for (let i = 1; i < s.pts.length; i++) if (segDist(s.pts[i - 1], s.pts[i]) <= r) return false;
    return true;
  });
}
