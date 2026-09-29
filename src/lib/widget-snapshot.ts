import type { StoryItem } from "@/components/StoryInk";
import { FONTS, isLight, smoothPath } from "@/lib/story-ink-draw";

/**
 * **ウィジェット「今日のアルバム」の絵**（オーナー指示 2026-09-28「ウィジェットの1つの
 * 今日のアルバムを表示はユーザーの書き込みやひとこと、落書きも表示して」）。
 *
 * ## なぜ「1枚の絵」にするのか
 * ウィジェットは Web では作れない（iPhone は Swift、Android は Kotlin — `docs/widgets.md`）。
 * 書き込み（手書きの線・文字・ラベル）を向こうの言葉でもう一度描き直すと、字体や線の
 * なめらかさが画面とずれ、機能を足すたびに2か所を直すことになる。そこで、アプリが
 * **今日のページをそのまま1枚の絵に焼き**、共有の箱に置く。ウィジェットはその絵を
 * 出すだけ。書いた物は、画面で見たとおりにウィジェットにも出る。
 *
 * - 写真: 白い縁（ポラロイド）＋下の余白に**ひとこと**（`caption`）。
 * - 手書き（落書き）: 画面と同じ `smoothPath` の線。
 * - 文字（ラベル）: 画面と同じ字体（`FONTS`）・地の色。
 *
 * 大きさは Apple の表の「中」: 390 / 393pt 幅の iPhone で 338×158pt
 * （Human Interface Guidelines › Widgets）。絵は端末の画素密度（3倍）で作る。
 */
export const WIDGET_MEDIUM = { w: 338, h: 158 } as const;

/** 画面の紙の幅（px）。字と縁の太さはこの幅に対する割合で決まっている（`styles.css`）。 */
const PAPER_W = 358;
const PHOTO_PAD = 6 / PAPER_W;
const PHOTO_PAD_BOTTOM = 8 / PAPER_W;
const CAPTION = 0.05;
const TEXT = 0.067;

/** 1つの物が紙の上で占める高さ（紙の幅に対する割合）。 */
export function itemHeight(it: StoryItem): number {
  if (it.kind === "photo") {
    const inner = it.w - 2 * PHOTO_PAD;
    return PHOTO_PAD + inner + (it.caption ? CAPTION * 1.25 : 0) + PHOTO_PAD_BOTTOM;
  }
  if (it.kind === "sketch") return (it.w * it.box[3]) / Math.max(1, it.box[2]);
  return TEXT * 1.4;
}

/**
 * 書き込み全部を囲む四角（紙の幅に対する割合）。傾きのぶんは外接の四角で見る。
 * 物が無ければ `null`。
 */
export function contentBounds(
  items: StoryItem[],
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!items.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const it of items) {
    const h = itemHeight(it);
    const r = (Math.abs(it.rot) * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(r)) * it.w + Math.abs(Math.sin(r)) * h) / 2;
    const hh = (Math.abs(Math.sin(r)) * it.w + Math.abs(Math.cos(r)) * h) / 2;
    x0 = Math.min(x0, it.x - hw);
    x1 = Math.max(x1, it.x + hw);
    y0 = Math.min(y0, it.y - hh);
    y1 = Math.max(y1, it.y + hh);
  }
  return { x0, y0, x1, y1 };
}

/**
 * 書き込みの四角を、枠（`box`）の中へ**縦横比を保って収める**置き方
 * （切らない。ページの端の落書きも必ず入る）。返すのは、紙の幅1が何 px になるか
 * （`s`）と、ずらし（`dx, dy`）。
 */
export function fitTransform(
  b: { x0: number; y0: number; x1: number; y1: number },
  box: { x: number; y: number; w: number; h: number },
): { s: number; dx: number; dy: number } {
  const bw = Math.max(1e-6, b.x1 - b.x0);
  const bh = Math.max(1e-6, b.y1 - b.y0);
  const s = Math.min(box.w / bw, box.h / bh);
  return {
    s,
    dx: box.x + (box.w - bw * s) / 2 - b.x0 * s,
    dy: box.y + (box.h - bh * s) / 2 - b.y0 * s,
  };
}

export type SnapshotInput = {
  items: StoryItem[];
  /** `photo` の `src` → 読み込み済みの絵。無い写真は薄い灰色の四角で描く。 */
  images: Map<string, CanvasImageSource>;
  /** 左上の見出し（例: 「9月28日」）。 */
  title: string;
  /** 見出しの右の小さい字（例: 「4枚」）。 */
  subtitle?: string;
  /** 紙の色。 */
  paper?: string;
  /** 画素密度（既定 3）。 */
  dpr?: number;
  size?: { w: number; h: number };
};

/**
 * 今日のページを `ctx` に描く。`ctx` の大きさは `size × dpr` にしておく。
 * 絵を作るだけで、保存（共有の箱へ書く）は呼ぶ側（`docs/widgets.md` のステップ2）。
 */
export function drawAlbumSnapshot(ctx: CanvasRenderingContext2D, input: SnapshotInput): void {
  const { w, h } = input.size ?? WIDGET_MEDIUM;
  const dpr = input.dpr ?? 3;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = input.paper ?? "#faf7f0";
  ctx.fillRect(0, 0, w, h);

  // 見出し: 日付＋枚数。
  const pad = 12;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#2b2723";
  ctx.font = "800 12px system-ui, -apple-system, 'Hiragino Sans', sans-serif";
  ctx.fillText(input.title, pad, pad);
  if (input.subtitle) {
    const tw = ctx.measureText(input.title).width;
    ctx.fillStyle = "#8a8176";
    ctx.font = "600 12px system-ui, -apple-system, 'Hiragino Sans', sans-serif";
    ctx.fillText(` · ${input.subtitle}`, pad + tw, pad);
  }

  const bounds = contentBounds(input.items);
  if (bounds) {
    const top = pad + 20;
    const t = fitTransform(bounds, { x: pad, y: top, w: w - pad * 2, h: h - top - 8 });
    for (const it of [...input.items].sort((a, b) => a.z - b.z)) {
      ctx.save();
      ctx.translate(t.dx + it.x * t.s, t.dy + it.y * t.s);
      ctx.rotate((it.rot * Math.PI) / 180);
      drawItem(ctx, it, t.s, input.images);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: StoryItem,
  s: number,
  images: Map<string, CanvasImageSource>,
): void {
  const W = it.w * s;
  const H = itemHeight(it) * s;
  if (it.kind === "photo") {
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#fff";
    ctx.fillRect(-W / 2, -H / 2, W, H);
    ctx.restore();
    const p = PHOTO_PAD * s;
    const side = W - 2 * p;
    const img = images.get(it.src);
    if (img) drawCover(ctx, img, -W / 2 + p, -H / 2 + p, side, side);
    else {
      ctx.fillStyle = "#e6e2da";
      ctx.fillRect(-W / 2 + p, -H / 2 + p, side, side);
    }
    if (it.caption) {
      // ひとこと: 写真の下の余白に、写真の幅に収まる大きさで。
      let size = CAPTION * s;
      ctx.font = `700 ${size}px system-ui, -apple-system, 'Hiragino Sans', sans-serif`;
      const tw = ctx.measureText(it.caption).width;
      if (tw > side) {
        size *= side / tw;
        ctx.font = `700 ${size}px system-ui, -apple-system, 'Hiragino Sans', sans-serif`;
      }
      ctx.fillStyle = "#2b2723";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(it.caption, 0, -H / 2 + p + side + (CAPTION * 1.25 * s) / 2 + 1);
    }
    return;
  }
  if (it.kind === "sketch") {
    const [bx, by, bw] = it.box;
    const k = W / Math.max(1, bw);
    ctx.translate(-W / 2, -H / 2);
    ctx.scale(k, k);
    ctx.translate(-bx, -by);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of it.strokes) {
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.stroke(new Path2D(smoothPath(st.pts.length === 1 ? [st.pts[0], st.pts[0]] : st.pts)));
    }
    return;
  }
  // 文字（ラベル）: 画面と同じ字体・地。
  const font = FONTS.find((f) => f.id === it.font) ?? FONTS[0];
  const px = TEXT * s;
  ctx.font = font.css.replace(/([\d.]+)em/, (_, n) => `${Number(n) * px}px`);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = Math.min(ctx.measureText(it.text).width, W);
  const bw = tw + px * 0.9;
  const bh = px * 1.36;
  if (it.bg !== "none") {
    ctx.fillStyle = it.bg === "solid" ? it.color : "rgb(255 255 255 / 0.72)";
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, px * 0.35);
    ctx.fill();
  }
  ctx.fillStyle = it.bg === "solid" ? (isLight(it.color) ? "#111" : "#fff") : it.color;
  ctx.fillText(it.text, 0, 0, W);
}

/** 絵を枠いっぱいに（はみ出しは切る）。 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const iw = (img as { width: number }).width || w;
  const ih = (img as { height: number }).height || h;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
