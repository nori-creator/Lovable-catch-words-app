/**
 * 本棚の 3D の「材質の絵」をその場で描く（画像ファイルを増やさない）。
 *
 * 本物らしさは形より**表面**で決まる。ここで作るのは:
 *  - 布（リネン）の織り目の凹凸（法線の絵）… 布装の本の手ざわり
 *  - 背の箔押し（金の文字・線）… 色・つや・金属の3枚を同じ位置に描く
 *  - 表紙: 凹ませた枠（空押し）に写真を貼り、下に箔の題字
 *  - 小口（紙の束の断面）の細い縞
 *  - 壁の漆喰のざらつき
 *
 * 凹凸は「高さの絵」を描いてから法線の絵に変える（heightToNormal）。
 */

import { diaryFont, wrapDiaryLines, type DiaryFontId } from "@/lib/diary-fonts";
import {
  ALBUM_PAGE_RATIO,
  clamp,
  COLLAGE_CAP_MIN,
  COLLAGE_CAP_W,
  sizePx,
  type Placement,
} from "@/lib/album-place";

export type Canvas = HTMLCanvasElement;

export function canvas(w: number, h: number): Canvas {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** 高さ（灰色の明るさ）から法線の絵（RGB）を作る。strength は凹凸の強さ。 */
export function heightToNormal(height: Canvas, strength = 2): Canvas {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const ctx = out.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** リネンの織り目の高さ（繰り返せる 128px の1枚）。縦糸と横糸が交互に上下する。 */
export function linenHeight(size = 128, seed = 7): Canvas {
  const c = canvas(size, size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const r = rand(seed);
  const thread = 4; // 糸1本の幅（px）
  const jitterX = Array.from({ length: size }, () => r() * 0.35);
  const jitterY = Array.from({ length: size }, () => r() * 0.35);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / thread);
      const cy = Math.floor(y / thread);
      const over = (cx + cy) % 2 === 0; // 縦糸が上か横糸が上か
      const fx = (x % thread) / thread;
      const fy = (y % thread) / thread;
      // 糸の断面は丸い: 真ん中が高い
      const warp = Math.sin(fx * Math.PI) * (0.65 + jitterX[x]);
      const weft = Math.sin(fy * Math.PI) * (0.65 + jitterY[y]);
      let v = over ? 0.5 + warp * 0.5 : 0.5 + weft * 0.5;
      v += (r() - 0.5) * 0.12; // 毛羽
      const i = (y * size + x) * 4;
      const g = Math.max(0, Math.min(255, v * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 布の色を少しまだらにする（染めむら）。 */
function clothBase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  seed: number,
) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const r = rand(seed);
  for (let i = 0; i < 60; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 20 + r() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() > 0.5;
    g.addColorStop(0, light ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // 角と端の擦れ（布が少し白っぽくなる）
  const edge = ctx.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, "rgba(255,255,255,0.06)");
  edge.addColorStop(0.03, "rgba(255,255,255,0)");
  edge.addColorStop(0.97, "rgba(255,255,255,0)");
  edge.addColorStop(1, "rgba(255,255,255,0.06)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
}

const GOLD = "#d8b25a";
/** 箔の文字と線を「色」「つや・金属」「高さ」の3枚に同じ位置で描く。 */
type Layers = {
  color: CanvasRenderingContext2D;
  orm: CanvasRenderingContext2D;
  height: CanvasRenderingContext2D;
};
function foil(l: Layers, draw: (ctx: CanvasRenderingContext2D) => void) {
  // 色: 金。明暗のむらで箔らしく。
  l.color.save();
  l.color.fillStyle = GOLD;
  l.color.strokeStyle = GOLD;
  draw(l.color);
  l.color.restore();
  // つや（G=粗さ 低い）・金属（B=1）
  l.orm.save();
  l.orm.fillStyle = "rgb(255,70,255)";
  l.orm.strokeStyle = "rgb(255,70,255)";
  draw(l.orm);
  l.orm.restore();
  // 高さ: 箔押しは**押し込む**ので少し低い
  l.height.save();
  l.height.fillStyle = "rgb(90,90,90)";
  l.height.strokeStyle = "rgb(90,90,90)";
  draw(l.height);
  l.height.restore();
}

function layers(w: number, h: number) {
  const color = canvas(w, h);
  const orm = canvas(w, h);
  const height = canvas(w, h);
  const l = {
    color: color.getContext("2d")!,
    orm: orm.getContext("2d")!,
    height: height.getContext("2d")!,
  };
  // 布: 粗さ 0.85（G≈217）・金属 0
  l.orm.fillStyle = "rgb(255,217,0)";
  l.orm.fillRect(0, 0, w, h);
  l.height.fillStyle = "rgb(160,160,160)";
  l.height.fillRect(0, 0, w, h);
  return { canvases: { color, orm, height }, l };
}

export type Painted = { color: Canvas; orm: Canvas; normal: Canvas };

const MONTH_EN = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
const SERIF = `"Cormorant Garamond", "Times New Roman", Georgia, serif`;

/**
 * 背（背表紙）。u は背の弧（0＝表側・1＝裏側）、v は高さ（下が 0）。
 * canvas は縦長（上が本の天）。文字は縦に回して置く（洋書と同じ、天から地へ読む）。
 */
export function paintSpine(opts: {
  color: string;
  year: number;
  month: number;
  count: number;
  seed: number;
}): Painted {
  const w = 160;
  const h = 1024;
  const { canvases, l } = layers(w, h);
  clothBase(l.color, w, h, opts.color, opts.seed);
  // 背バンド（天地に2本ずつの細い線）
  foil(l, (ctx) => {
    for (const y of [70, 82, h - 82, h - 70]) ctx.fillRect(18, y, w - 36, 3);
  });
  // 年（天の近く・横書き）
  foil(l, (ctx) => {
    ctx.font = `600 34px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(opts.year), w / 2, 136);
  });
  // 月の名前（縦・天から地へ）
  foil(l, (ctx) => {
    ctx.save();
    ctx.translate(w / 2, h / 2 + 10);
    ctx.rotate(Math.PI / 2);
    ctx.font = `600 60px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(MONTH_EN[opts.month - 1], 0, 0);
    ctx.restore();
  });
  // 地の近く: 語の数（小さな丸の中）
  foil(l, (ctx) => {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h - 150, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `600 30px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(opts.count), w / 2, h - 148);
  });
  return finish(canvases, 128);
}

/** 表紙: 布装に空押しの枠、枠に写真を貼り、下に箔の題字（本物の写真集の作り）。 */
export function paintCover(opts: {
  color: string;
  year: number;
  month: number;
  count: number;
  photo: HTMLImageElement | null;
  seed: number;
}): Painted {
  const w = 720;
  const h = 1024; // 148:210 に近い
  const { canvases, l } = layers(w, h);
  clothBase(l.color, w, h, opts.color, opts.seed);
  // 空押しの枠（写真を貼る窓）: 高さを下げる
  const fx = 120;
  const fy = 150;
  const fw = w - 240;
  const fh = fw * 0.82;
  l.height.fillStyle = "rgb(110,110,110)";
  l.height.fillRect(fx - 16, fy - 16, fw + 32, fh + 32);
  // 窓の縁の段差を少しぼかす（押した跡は丸い）
  l.height.filter = "blur(3px)";
  l.height.drawImage(canvases.height, 0, 0);
  l.height.filter = "none";
  // 凹みの中は影で少し暗い
  l.color.fillStyle = "rgba(0,0,0,0.16)";
  l.color.fillRect(fx - 16, fy - 16, fw + 32, fh + 32);
  // 写真（光沢紙）: 布より少しつやがある
  if (opts.photo) {
    const iw = opts.photo.naturalWidth || opts.photo.width;
    const ih = opts.photo.naturalHeight || opts.photo.height;
    const s = Math.max(fw / iw, fh / ih);
    l.color.save();
    l.color.beginPath();
    l.color.rect(fx, fy, fw, fh);
    l.color.clip();
    l.color.drawImage(opts.photo, fx + (fw - iw * s) / 2, fy + (fh - ih * s) / 2, iw * s, ih * s);
    l.color.restore();
  } else {
    l.color.fillStyle = "#e9e3d6";
    l.color.fillRect(fx, fy, fw, fh);
  }
  l.orm.fillStyle = "rgb(255,90,0)";
  l.orm.fillRect(fx, fy, fw, fh);
  l.height.fillStyle = "rgb(128,128,128)";
  l.height.fillRect(fx, fy, fw, fh);
  // 写真の縁の白い余白（印画紙のふち）
  l.color.strokeStyle = "#f7f4ec";
  l.color.lineWidth = 10;
  l.color.strokeRect(fx + 5, fy + 5, fw - 10, fh - 10);
  // 題字（箔）
  foil(l, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 66px ${SERIF}`;
    ctx.fillText(MONTH_EN[opts.month - 1], w / 2, fy + fh + 140);
    ctx.font = `500 38px ${SERIF}`;
    ctx.fillText(String(opts.year), w / 2, fy + fh + 196);
    ctx.fillRect(w / 2 - 70, fy + fh + 226, 140, 2);
    ctx.font = `500 26px ${SERIF}`;
    ctx.fillText(`${opts.count} words`, w / 2, fy + fh + 268);
  });
  return finish(canvases, 128);
}

/** 高さの絵に織り目を重ねてから法線に変える。 */
function finish(c: { color: Canvas; orm: Canvas; height: Canvas }, tile: number): Painted {
  const h = c.height.getContext("2d")!;
  const weave = linenHeight(tile);
  h.globalCompositeOperation = "overlay";
  h.globalAlpha = 0.55;
  for (let y = 0; y < c.height.height; y += tile) {
    for (let x = 0; x < c.height.width; x += tile) h.drawImage(weave, x, y);
  }
  h.globalAlpha = 1;
  h.globalCompositeOperation = "source-over";
  return { color: c.color, orm: c.orm, normal: heightToNormal(c.height, 2.4) };
}

/** 小口（紙の束の断面）: 厚み方向に細い縞。u が厚み方向。 */
export function paintPageEdge(): Canvas {
  const w = 512;
  const h = 8;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#efe7d6";
  ctx.fillRect(0, 0, w, h);
  const r = rand(3);
  for (let x = 0; x < w; x += 2) {
    const d = r();
    ctx.fillStyle = `rgba(120,100,70,${0.05 + d * 0.12})`;
    ctx.fillRect(x, 0, 1, h);
  }
  return c;
}

/** 漆喰の壁（細かなざらつき）。色と凹凸。 */
export function paintPlaster(): { color: Canvas; normal: Canvas } {
  const s = 512;
  const color = canvas(s, s);
  const height = canvas(s, s);
  const cc = color.getContext("2d")!;
  const hc = height.getContext("2d")!;
  cc.fillStyle = "#c9b8a0"; // 暖かい生成りの漆喰（白すぎると本が沈む）
  cc.fillRect(0, 0, s, s);
  hc.fillStyle = "#808080";
  hc.fillRect(0, 0, s, s);
  const r = rand(11);
  for (let i = 0; i < 2600; i++) {
    const x = r() * s;
    const y = r() * s;
    const rad = 2 + r() * 14;
    const v = Math.round(100 + r() * 60);
    hc.fillStyle = `rgba(${v},${v},${v},0.25)`;
    hc.beginPath();
    hc.ellipse(x, y, rad, rad * (0.5 + r()), r() * 3, 0, Math.PI * 2);
    hc.fill();
    const t = r() > 0.5 ? 255 : 0;
    cc.fillStyle = `rgba(${t},${t},${t},0.018)`;
    cc.beginPath();
    cc.arc(x, y, rad * 2, 0, Math.PI * 2);
    cc.fill();
  }
  hc.filter = "blur(1.2px)";
  hc.drawImage(height, 0, 0);
  hc.filter = "none";
  return { color, normal: heightToNormal(height, 1.6) };
}

/** 1ページ（その日の写真2枚と語）。紙は少し黄みの上質紙。 */
export function paintPage(opts: {
  day: number;
  month: number;
  photos: Array<HTMLImageElement | null>;
  words: string[];
  side: "left" | "right";
}): Canvas {
  const w = 720;
  const h = 1024;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6f1e5";
  ctx.fillRect(0, 0, w, h);
  // 綴じ側（のど）がほんのり暗い＝紙が丸まっている
  const gutter = ctx.createLinearGradient(
    opts.side === "right" ? 0 : w,
    0,
    opts.side === "right" ? 90 : w - 90,
    0,
  );
  gutter.addColorStop(0, "rgba(90,70,40,0.22)");
  gutter.addColorStop(1, "rgba(90,70,40,0)");
  ctx.fillStyle = gutter;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a3128";
  ctx.font = `600 44px ${SERIF}`;
  ctx.textAlign = "left";
  ctx.fillText(`${MONTH_EN[opts.month - 1].slice(0, 3)} ${opts.day}`, 70, 110);
  ctx.fillStyle = "rgba(58,49,40,0.35)";
  ctx.fillRect(70, 132, w - 140, 2);
  const boxes = [
    { x: 80, y: 190, w: 330, h: 330, rot: -0.04 },
    { x: 320, y: 560, w: 320, h: 320, rot: 0.05 },
  ];
  boxes.forEach((b, i) => {
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate(b.rot);
    // 写真の影
    ctx.shadowColor = "rgba(40,30,20,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(-b.w / 2 - 12, -b.h / 2 - 12, b.w + 24, b.h + 64);
    ctx.shadowColor = "transparent";
    const p = opts.photos[i];
    if (p) {
      const iw = p.naturalWidth || p.width;
      const ih = p.naturalHeight || p.height;
      const s = Math.max(b.w / iw, b.h / ih);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.clip();
      ctx.drawImage(p, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
      ctx.restore();
    }
    ctx.fillStyle = "#2b2520";
    ctx.font = `700 34px "Noto Sans TC", "PingFang TC", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(opts.words[i] ?? "", 0, b.h / 2 + 40);
    ctx.restore();
  });
  // 紙の繊維
  const r = rand(opts.day * 7 + opts.month);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(120,100,70,${r() * 0.05})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
  }
  return c;
}

/** 見返し（表紙の裏に貼る紙）: 細かなマーブル風の模様。 */
export function paintEndpaper(color: string): Canvas {
  const w = 720;
  const h = 1024;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#efe6d2";
  ctx.fillRect(0, 0, w, h);
  const r = rand(5);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 180; i++) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath();
    let x = r() * w;
    let y = r() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 160;
      y += (r() - 0.3) * 120;
      ctx.quadraticCurveTo(x + (r() - 0.5) * 80, y - 40, x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

// ── 1日の見開き（オーナー指示 2026-09-28「本棚のアルバムをタップしたら左側に今日撮った
//    画像のアルバム（ユーザーの一言や落書きなども含む）右側に今日の日記を表示」） ──

/** 見開き1つ＝1日。左に写真・一言・落書き、右に本人が打った日記。 */
export type DaySpread = {
  y: number;
  m: number;
  d: number;
  /** その日の写真（最大4枚）と、その下に書く語。 */
  photos: Array<{
    img: HTMLImageElement | null;
    word: string;
    note?: string;
    /**
     * ホームのアルバムでの置き方（`lib/album-day-layout.ts`）。**全部の写真に在れば**、
     * ホームと同じ大きさ・向き・重なりで貼る。無ければ昔の升目（確認用ページ用）。
     */
    place?: Placement;
    /** 札の枠の縦横比（高さ / 幅）と重なりの順。 */
    ratio?: number;
    z?: number;
    /** 字だけの札（写真を貼らず、紙に字を書く）。 */
    plain?: boolean;
    id?: string;
  }>;
  /** 台紙の高さ（幅に対する割合）。置き方が在る時だけ。 */
  boardH?: number;
  /** 落書き（ページの 0〜1 の座標の点列）。 */
  doodles?: Array<{ color: string; width: number; pts: Array<[number, number]> }>;
  /** 本人が打った日記（無ければ白紙）。 */
  diary: string;
  /** ページの頭に書く日付（表示の言語で。無ければ日本語の「9月3日（水）」）。 */
  label?: string;
};

const HAND = `"Zen Kurenaido", cursive`;
/** アプリが書く字（日付・語）。ホームの札の語と同じゴシック。 */
const SANS = `"Noto Sans TC", "PingFang TC", sans-serif`;
const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, side: "left" | "right") {
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(0, 0, w, h);
  const gutter = ctx.createLinearGradient(
    side === "right" ? 0 : w,
    0,
    side === "right" ? 90 : w - 90,
    0,
  );
  gutter.addColorStop(0, "rgba(90,70,40,0.22)");
  gutter.addColorStop(1, "rgba(90,70,40,0)");
  ctx.fillStyle = gutter;
  ctx.fillRect(0, 0, w, h);
}

function fibers(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = rand(seed);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(120,100,70,${r() * 0.05})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
  }
}

/** 細い手書きの字を、3D の光の下でもインクの濃さに見せる（縁を少し足して描く）。 */
function inkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  ctx.strokeStyle = ctx.fillStyle as string;
  ctx.lineWidth = Math.max(1, px * 0.045);
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function dateLabel(s: DaySpread) {
  if (s.label) return s.label;
  const wd = WEEK_JA[new Date(s.y, s.m - 1, s.d).getDay()];
  return `${s.m}月${s.d}日（${wd}）`;
}

/**
 * ページの頭の日付。**ホームのアルバムの日付（`DiaryDate`）と同じくアプリの字体**（太めの
 * ゴシック。オーナー指示 2026-10-02「本棚アルバムの文字は統一して」）。前は左右で手書きの
 * 太さが違い、語のゴシックと3つに割れていた。人が書いた字（一言・日記）だけが手書きで残る。
 */
function paintDateHeading(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = "#2a231c";
  ctx.font = `600 44px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

/**
 * **左のページ: その日のアルバム。** 写真は重ならない位置に少し傾けて貼り（マスキング
 * テープ付き）、下に語、横に本人の一言を手書きで。落書きはその上に重ねる。
 */
export function paintAlbumDay(s: DaySpread): Canvas {
  const w = 720;
  const h = 1024;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  paper(ctx, w, h, "left");
  paintDateHeading(ctx, dateLabel(s), 70, 112);
  if (s.photos.length > 0 && s.photos.every((p) => p.place)) {
    paintPlacedPhotos(ctx, s, w, h);
    paintDoodles(ctx, s, w, h);
    fibers(ctx, w, h, s.d * 7 + s.m);
    return c;
  }
  // 置き場（写真の枚数ごとに、重ならない配置を決めておく）
  const LAYOUTS: Record<number, Array<{ x: number; y: number; s: number; rot: number }>> = {
    1: [{ x: 360, y: 470, s: 400, rot: -0.03 }],
    2: [
      { x: 245, y: 305, s: 260, rot: -0.05 },
      { x: 480, y: 735, s: 260, rot: 0.04 },
    ],
    3: [
      { x: 215, y: 300, s: 230, rot: -0.05 },
      { x: 500, y: 440, s: 220, rot: 0.05 },
      { x: 265, y: 730, s: 220, rot: 0.02 },
    ],
    4: [
      { x: 205, y: 290, s: 200, rot: -0.05 },
      { x: 505, y: 320, s: 195, rot: 0.04 },
      { x: 225, y: 680, s: 195, rot: 0.03 },
      { x: 505, y: 715, s: 200, rot: -0.04 },
    ],
  };
  const list = s.photos.slice(0, 4);
  const slots = LAYOUTS[Math.max(1, list.length)] ?? LAYOUTS[1];
  list.forEach((p, i) => {
    const b = slots[i];
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.shadowColor = "rgba(40,30,20,0.32)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fcfbf7";
    ctx.fillRect(-b.s / 2 - 12, -b.s / 2 - 12, b.s + 24, b.s + 70);
    ctx.shadowColor = "transparent";
    if (p.img) {
      const iw = p.img.naturalWidth || p.img.width;
      const ih = p.img.naturalHeight || p.img.height;
      const k = Math.max(b.s / iw, b.s / ih);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-b.s / 2, -b.s / 2, b.s, b.s);
      ctx.clip();
      ctx.drawImage(p.img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
      ctx.restore();
    }
    // マスキングテープ
    ctx.fillStyle = "rgba(214,190,140,0.62)";
    ctx.save();
    ctx.translate(0, -b.s / 2 - 10);
    ctx.rotate(-0.08);
    ctx.fillRect(-46, -14, 92, 28);
    ctx.restore();
    ctx.fillStyle = "#2b2520";
    ctx.font = `700 ${Math.round(b.s * 0.12)}px "Noto Sans TC", "PingFang TC", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(p.word, 0, b.s / 2 + 44);
    ctx.restore();
    // 本人の一言（語の下に手書きで。写真の外にはみ出さない幅で折る）
    if (p.note) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = "#7a4e2a";
      ctx.font = `400 ${Math.round(Math.max(26, b.s * 0.11))}px ${HAND}`;
      ctx.textAlign = "center";
      const lh = Math.round(Math.max(26, b.s * 0.11) * 1.25);
      wrapCanvas(ctx, p.note, b.s + 10)
        .slice(0, 2)
        .forEach((ln, k) =>
          inkText(ctx, ln, 0, b.s / 2 + 44 + lh * (k + 1), Math.max(26, b.s * 0.11)),
        );
      ctx.restore();
    }
  });
  paintDoodles(ctx, s, w, h);
  fibers(ctx, w, h, s.d * 7 + s.m);
  return c;
}

function paintDoodles(ctx: CanvasRenderingContext2D, s: DaySpread, w: number, h: number) {
  for (const d of s.doodles ?? []) {
    if (d.pts.length < 2) continue;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const P = d.pts.map(([x, y]) => [x * w, y * h] as const);
    ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length - 1; i++) {
      ctx.quadraticCurveTo(
        P[i][0],
        P[i][1],
        (P[i][0] + P[i + 1][0]) / 2,
        (P[i][1] + P[i + 1][1]) / 2,
      );
    }
    ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
    ctx.stroke();
  }
}

// ── ホームのアルバムと同じ台紙（置き方・大きさ・向き・重なり）で貼る（オーナー指示 2026-09-30、
//    決定 2026-10-02「台紙を本のページの形にそろえる」）─────────────────────────────
// 見た目は**本の元の紙のまま**（白い台紙・マスキングテープ・太字の語・茶色の手書きの一言）。
// ホームの `DayCollage` の操作画面を上に重ねるのはやめた（本とページがずれる）。置き方の計算は
// `lib/album-day-layout.ts` の1本を共有し、台紙はページの形なので、ホームの並びがそのまま本に出る。
// 本で並べ直す枝は無い（2つ持つと、片方を直した日に食い違う）。

/** 置き方を計算した時の台紙の幅（CSS px）。字の大きさを canvas へ写す基準。 */
const REF_BOARD_CSS = 340;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 1行に収まるように、収まらなければ末尾を「…」にして返す。 */
function fitOneLine(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > maxW) chars.pop();
  return chars.join("") + "…";
}

/** 折り返して最大 `max` 行（超えた分は最後の行を「…」で結ぶ。CSS の `line-clamp` と同じ）。 */
function clampLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  max: number,
): string[] {
  const lines = wrapCanvas(ctx, text, maxW);
  if (lines.length <= max) return lines;
  const head = lines.slice(0, max);
  head[max - 1] = fitOneLine(ctx, head[max - 1] + "…", maxW);
  return head;
}

function paintPlacedPhotos(ctx: CanvasRenderingContext2D, s: DaySpread, w: number, h: number) {
  const M = 52;
  const top = 150;
  const boardMaxW = w - 2 * M;
  const availH = h - top - 40;
  // 台紙はページの形（`ALBUM_PAGE_RATIO`）なので、ふつうは紙の幅いっぱいにそのまま貼れる。
  // 自分で置いた写真がページより下に在る日（台紙が伸びた日）だけ、収まるまで全体を縮める
  // （置き方の比は変えない — ホームと同じ並びのまま小さくなるだけ）。
  const boardH = s.boardH ?? ALBUM_PAGE_RATIO;
  const bw = Math.min(boardMaxW, availH / boardH);
  const ox = M + (boardMaxW - bw) / 2;
  const k = bw / REF_BOARD_CSS;
  const order = s.photos.map((p, i) => ({ p, i })).sort((a, b) => (a.p.z ?? a.i) - (b.p.z ?? b.i));

  for (const { p } of order) {
    const pl = p.place!;
    const { w: cw, h: ch } = sizePx(pl, bw, p.ratio ?? 1.2);
    const X = ox + pl.x * bw;
    const Y = top + pl.y * bw;
    const capW = clamp(cw + 10, bw * COLLAGE_CAP_MIN, bw * COLLAGE_CAP_W);
    // 一言が台紙の外へはみ出す時は、台紙の中へ寄せる。
    const dx = Math.max(0, ox - (X - capW / 2)) - Math.max(0, X + capW / 2 - (ox + bw));
    paintPhotoCard(ctx, p, { X, Y, cw, ch, rot: pl.rot, k, capW, capDx: dx, plainW: bw });
  }
}

/** 写真の下の字の大きさ（台紙の白い余白・語・一言）。ホームの札と同じ割合。 */
function cardText(cw: number, k: number) {
  const strip = Math.max(30 * k, cw * 0.2);
  const wordPx = clamp(cw * 0.12, 15 * k, 26 * k);
  const notePx = Math.max(13 * k, 20);
  return { strip, wordPx, notePx, lh: notePx * 1.3 };
}

/** 写真1枚（台紙・写真・テープ・語・一言）を、中心 (X, Y) に傾けて描く。 */
function paintPhotoCard(
  ctx: CanvasRenderingContext2D,
  p: DaySpread["photos"][number],
  o: {
    X: number;
    Y: number;
    cw: number;
    ch: number;
    rot: number;
    k: number;
    capW: number;
    capDx: number;
    /** 字だけの札が語と一言を書ける幅。 */
    plainW: number;
  },
) {
  const { X, Y, cw, ch, k } = o;
  const { strip, wordPx, notePx, lh } = cardText(cw, k);
  ctx.save();
  ctx.translate(X, Y);
  ctx.rotate((o.rot * Math.PI) / 180);

  if (p.plain) {
    // 字だけの札: 枠も地も持たず、紙に語と一言を書く。
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${wordPx}px ${SANS}`;
    ctx.fillStyle = "#2b2520";
    ctx.fillText(fitOneLine(ctx, p.word, Math.max(cw, wordPx * 3)), -cw / 2, -ch / 2 + wordPx);
    if (p.note) {
      ctx.font = `400 ${notePx}px ${HAND}`;
      ctx.fillStyle = "#7a4e2a";
      clampLines(ctx, p.note, Math.max(cw, o.plainW * COLLAGE_CAP_MIN), 3).forEach((ln, n) =>
        inkText(ctx, ln, -cw / 2, -ch / 2 + wordPx + lh * (n + 1), notePx),
      );
    }
    ctx.restore();
    return;
  }

  // 白い台紙（元の本と同じ: 影つき・角ばった紙）
  const pad = Math.max(8, cw * 0.045);
  ctx.shadowColor = "rgba(40,30,20,0.32)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#fcfbf7";
  ctx.fillRect(-cw / 2, -ch / 2, cw, ch + strip);
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetY = 0;
  // 写真（枠いっぱいに `cover`）
  const px = -cw / 2 + pad;
  const py = -ch / 2 + pad;
  const pw = cw - 2 * pad;
  const ph = ch - pad;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  if (p.img) {
    const iw = p.img.naturalWidth || p.img.width;
    const ih = p.img.naturalHeight || p.img.height;
    if (iw && ih) {
      const sc = Math.max(pw / iw, ph / ih);
      ctx.drawImage(p.img, px + (pw - iw * sc) / 2, py + (ph - ih * sc) / 2, iw * sc, ih * sc);
    }
  } else {
    ctx.fillStyle = "#e9e4d6";
    ctx.fillRect(px, py, pw, ph);
  }
  ctx.restore();
  // マスキングテープ
  ctx.fillStyle = "rgba(214,190,140,0.62)";
  ctx.save();
  ctx.translate(0, -ch / 2 - 4);
  ctx.rotate(-0.08);
  const tw = clamp(cw * 0.34, 56, 100);
  ctx.fillRect(-tw / 2, -14, tw, 28);
  ctx.restore();
  // 語（太字・真ん中）
  ctx.fillStyle = "#2b2520";
  ctx.font = `700 ${wordPx}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const wordY = ch / 2 + strip * 0.68;
  ctx.fillText(fitOneLine(ctx, p.word, cw - 2 * pad), 0, wordY);
  // 本人の一言（茶色の手書き。3行まで、台紙の幅で折る）
  if (p.note) {
    ctx.font = `400 ${notePx}px ${HAND}`;
    ctx.fillStyle = "#7a4e2a";
    clampLines(ctx, p.note, o.capW, 3).forEach((ln, n) =>
      inkText(ctx, ln, o.capDx, ch / 2 + strip + lh * (n + 1) - lh * 0.15, notePx),
    );
  }
  ctx.restore();
}

function wrapCanvas(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  return wrapDiaryLines(text, maxW, (t) => ctx.measureText(t).width);
}

/**
 * **右のページ: その日の日記。** 罫線の日記帳に、本人が打った文を本人が選んだ字体で。
 * 行は罫線に乗せる（手書きの日記帳と同じ）。長い日は字を少し小さくして1ページに収める。
 */
export function paintDiary(s: DaySpread, font: DiaryFontId): Canvas {
  const w = 720;
  const h = 1024;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  paper(ctx, w, h, "right");
  const f = diaryFont(font);
  const left = 96;
  const right = w - 70;
  const top = 190;
  // 字の大きさ: 1ページに収まるまで小さく（下限あり）
  let px = 46;
  let lines: string[] = [];
  for (; px >= 28; px -= 2) {
    ctx.font = `400 ${px}px ${f.family}`;
    lines = wrapCanvas(ctx, s.diary, right - left);
    if (top + lines.length * px * f.leading < h - 80) break;
  }
  const lh = Math.round(px * f.leading);
  // 罫線と余白の線
  ctx.strokeStyle = "rgba(90,120,170,0.22)";
  ctx.lineWidth = 2;
  for (let y = top + lh * 0.28; y < h - 50; y += lh) {
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(w - 40, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(200,80,80,0.28)";
  ctx.beginPath();
  ctx.moveTo(78, 60);
  ctx.lineTo(78, h - 40);
  ctx.stroke();
  // 日付（左のアルバムのページと同じ字体・大きさ）
  paintDateHeading(ctx, dateLabel(s), left, 124);
  // 本文
  ctx.fillStyle = "#1c2640";
  ctx.font = `400 ${px}px ${f.family}`;
  if (s.diary.trim()) {
    // 3D の光（トーンマッピング）で細い字は灰色に浮く。ペンの太さぶん縁を足して、
    // 紙に書いたインクの濃さにする。
    ctx.strokeStyle = "#1c2640";
    ctx.lineWidth = Math.max(1, px * 0.045);
    ctx.lineJoin = "round";
    lines.forEach((ln, i) => {
      ctx.strokeText(ln, left, top + i * lh);
      ctx.fillText(ln, left, top + i * lh);
    });
  }
  fibers(ctx, w, h, s.d * 13 + s.m);
  return c;
}

/** 扉（表紙を開いて最初の右ページ）: その月の題を手書きで。 */
export function paintTitlePage(title: string, subtitle: string): Canvas {
  const w = 720;
  const h = 1024;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  paper(ctx, w, h, "right");
  // 扉もアルバム・日記のページと同じ字体（本の中の字は1つの系統に揃える）。
  ctx.fillStyle = "#3a3128";
  ctx.textAlign = "center";
  ctx.font = `600 56px ${SANS}`;
  ctx.fillText(title, w / 2, h * 0.44);
  ctx.fillStyle = "rgba(58,49,40,0.6)";
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText(subtitle, w / 2, h * 0.44 + 60);
  fibers(ctx, w, h, 3);
  return c;
}

/** まだ何も無いページ（紙だけ）。 */
export function paintBlank(side: "left" | "right"): Canvas {
  const c = canvas(720, 1024);
  const ctx = c.getContext("2d")!;
  paper(ctx, 720, 1024, side);
  fibers(ctx, 720, 1024, side === "left" ? 11 : 17);
  return c;
}
