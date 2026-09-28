/**
 * **宣伝動画（15 秒・縦 1080×1920）**の絵を、時刻 t（秒）から1枚ずつ描く。
 *
 * 同じ t なら必ず同じ絵になる（乱数は種から作る）。だから
 *  - 確認用ページでは時計に合わせて再生でき、
 *  - `scripts/promo/render.mjs` では 1/30 秒ずつ止めて1枚ずつ撮り、動画に焼ける。
 *
 * 構成（モーショングラフィックスの定石: 文字 → 使う場面 → 気持ちいい瞬間 → 積み重ね → ロゴ）
 *  0.0–2.6  「街は、ことばでできている。」文字が1字ずつぼけから立ち上がる
 *  2.6–6.2  スマホで撮る → 光の帯が走る → 写っている物に語の札がはじけて出る
 *  6.2–9.2  写真がステッカーになって浮き、回って図鑑へ。紙吹雪
 *  9.2–12.4 アルバムに写真が次々に貼られ、記憶の線が伸びる
 *  12.4–15  ロゴと一言
 */
export const W = 1080;
export const H = 1920;
export const DURATION = 15;

export type FilmAssets = {
  cafe: HTMLImageElement;
  cat: HTMLImageElement;
  flower: HTMLImageElement;
  interests: HTMLImageElement;
};

const JP = `"Noto Sans JP", "Hiragino Sans", "IPAGothic", sans-serif`;
const TC = `"Noto Sans TC", "PingFang TC", "WenQuanYi Zen Hei", sans-serif`;
const BLUE = "#0a84ff";

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const expo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
/** 少しだけ行き過ぎて戻る「ばね」（減衰比 0.7 相当）。 */
const spring = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(9 * x));

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

/** 夜の街の玉ボケ（奥で漂う）。 */
function bokeh(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const r = rng(7);
  const hues = [210, 265, 30, 185, 330];
  for (let i = 0; i < 34; i++) {
    const x = r() * W + Math.sin(t * 0.3 + i) * 30;
    const y = r() * H - t * 18 * (0.5 + r());
    const rad = 40 + r() * 140;
    const h = hues[i % hues.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `hsla(${h},80%,65%,${0.22 * alpha})`);
    g.addColorStop(1, `hsla(${h},80%,65%,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** 1字ずつ、下からぼけて立ち上がる文字。 */
function riseText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
  t: number,
  start: number,
  opts: { color?: string; font?: string; stagger?: number; weight?: number } = {},
) {
  ctx.save();
  ctx.font = `${opts.weight ?? 900} ${size}px ${opts.font ?? JP}`;
  ctx.textBaseline = "alphabetic";
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    const p = seg(
      t,
      start + i * (opts.stagger ?? 0.045),
      start + i * (opts.stagger ?? 0.045) + 0.6,
    );
    const s = spring(p);
    ctx.globalAlpha = clamp(p * 1.6);
    const blur = (1 - easeOut(p)) * 18;
    ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
    ctx.fillStyle = opts.color ?? "#fff";
    ctx.fillText(c, x, y + (1 - s) * size * 0.6);
    x += widths[i];
  });
  ctx.restore();
}

function phone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 40;
  ctx.fillStyle = "#0d0f14";
  rr(ctx, x - 22, y - 22, w + 44, h + 44, 110);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 3;
  rr(ctx, x - 22, y - 22, w + 44, h + 44, 110);
  ctx.stroke();
}

function chip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  word: string,
  pinyin: string,
  p: number,
) {
  const s = spring(p);
  if (p <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = clamp(p * 2);
  ctx.font = `700 54px ${TC}`;
  const w1 = ctx.measureText(word).width;
  ctx.font = `500 30px ${JP}`;
  const w2 = ctx.measureText(pinyin).width;
  const w = Math.max(w1, w2) + 70;
  const h = 128;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  rr(ctx, -w / 2, -h - 26, w, h, 36);
  ctx.fill();
  ctx.shadowColor = "transparent";
  // 吹き出しの尾
  ctx.beginPath();
  ctx.moveTo(-18, -27);
  ctx.lineTo(0, 0);
  ctx.lineTo(18, -27);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.font = `700 54px ${TC}`;
  ctx.fillText(word, 0, -h + 44);
  ctx.fillStyle = BLUE;
  ctx.font = `600 30px ${JP}`;
  ctx.fillText(pinyin, 0, -h + 86);
  // 物の位置の点
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 18, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

function confetti(ctx: CanvasRenderingContext2D, t: number, t0: number, ox: number, oy: number) {
  const dt = t - t0;
  if (dt < 0 || dt > 3) return;
  const r = rng(99);
  const colors = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff", "#f4a261", "#b388ff"];
  for (let i = 0; i < 160; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
    const sp = 900 + r() * 1300;
    const vx = Math.cos(a) * sp * 0.6;
    const vy = Math.sin(a) * sp;
    const drag = Math.exp(-2.2 * dt);
    const x = ox + (vx * (1 - drag)) / 2.2 + Math.sin(dt * 5 + i) * 30;
    const y = oy + (vy * (1 - drag)) / 2.2 + 0.5 * 1400 * dt * dt * 0.55;
    const rot = r() * 6 + dt * (r() - 0.5) * 18;
    ctx.save();
    ctx.globalAlpha = clamp(1.4 - dt / 2.4);
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, Math.abs(Math.cos(dt * 8 + i)) + 0.15); // ひらひら（裏返る）
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-14, -8, 28, 16);
    ctx.restore();
  }
}

function polaroid(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  word: string,
  x: number,
  y: number,
  size: number,
  rot: number,
  p: number,
) {
  if (p <= 0) return;
  const s = spring(p);
  ctx.save();
  ctx.translate(x, y + (1 - easeOut(p)) * -260);
  ctx.rotate(rot * s + (1 - s) * 0.4);
  ctx.scale(0.6 + 0.4 * s, 0.6 + 0.4 * s);
  ctx.globalAlpha = clamp(p * 2);
  ctx.shadowColor = "rgba(60,40,20,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(-size / 2 - 18, -size / 2 - 18, size + 36, size + 110);
  ctx.shadowColor = "transparent";
  ctx.save();
  ctx.beginPath();
  ctx.rect(-size / 2, -size / 2, size, size);
  ctx.clip();
  cover(ctx, img, -size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.fillStyle = "#2a2420";
  ctx.font = `700 48px ${TC}`;
  ctx.textAlign = "center";
  ctx.fillText(word, 0, size / 2 + 66);
  ctx.restore();
}

export function drawFilm(ctx: CanvasRenderingContext2D, t: number, a: FilmAssets) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  // 背景: 夜の青から、後半は朝の紙の色へ
  const warm = seg(t, 8.8, 9.6);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, `rgb(${lerp(10, 246, warm)},${lerp(16, 240, warm)},${lerp(32, 228, warm)})`);
  bg.addColorStop(1, `rgb(${lerp(4, 236, warm)},${lerp(6, 226, warm)},${lerp(14, 208, warm)})`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (warm < 1) bokeh(ctx, t, 1 - warm);

  // ---- 1. 文字 --------------------------------------------------------------
  if (t < 3.2) {
    const out = seg(t, 2.4, 3.0);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(0, -out * 120);
    riseText(ctx, "街は、", W / 2, 820, 150, t, 0.15);
    riseText(ctx, "ことばで", W / 2, 1000, 150, t, 0.45);
    riseText(ctx, "できている。", W / 2, 1180, 150, t, 0.8);
    riseText(ctx, "The city is made of words.", W / 2, 1320, 44, t, 1.4, {
      font: JP,
      weight: 500,
      stagger: 0.012,
      color: "rgba(255,255,255,0.75)",
    });
    ctx.restore();
  }

  // ---- 2. 撮る → 語がはじける ------------------------------------------------
  const pIn = seg(t, 2.6, 3.4);
  const pOut = seg(t, 6.1, 6.6);
  if (pIn > 0 && pOut < 1) {
    const pw = 780;
    const ph = 1560;
    const px = (W - pw) / 2;
    const py = 180 + (1 - spring(pIn)) * 1400;
    ctx.save();
    ctx.globalAlpha = 1 - pOut;
    phone(ctx, px, py, pw, ph);
    ctx.save();
    rr(ctx, px, py, pw, ph, 92);
    ctx.clip();
    // 撮った瞬間の白いフラッシュ
    cover(ctx, a.cafe, px, py, pw, ph);
    const flash = Math.max(0, 1 - Math.abs(t - 3.55) / 0.12);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.85})`;
      ctx.fillRect(px, py, pw, ph);
    }
    // 光の帯（AI が見ている）
    const sc = seg(t, 3.7, 4.9);
    if (sc > 0 && sc < 1) {
      const by = py + ph * easeInOut(sc);
      const g = ctx.createLinearGradient(0, by - 140, 0, by + 20);
      g.addColorStop(0, "rgba(120,190,255,0)");
      g.addColorStop(0.85, "rgba(160,215,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0.95)");
      ctx.fillStyle = g;
      ctx.fillRect(px, by - 140, pw, 160);
    }
    ctx.restore();
    // 語の札がはじける
    chip(ctx, px + pw * 0.46, py + ph * 0.62, "咖啡", "kāfēi", seg(t, 4.9, 5.4));
    chip(ctx, px + pw * 0.78, py + ph * 0.42, "花", "huā", seg(t, 5.05, 5.55));
    chip(ctx, px + pw * 0.22, py + ph * 0.36, "窗戶", "chuānghù", seg(t, 5.2, 5.7));
    ctx.restore();
  }

  // ---- 3. ステッカー → 図鑑 --------------------------------------------------
  const st = seg(t, 6.2, 8.0);
  if (t >= 6.2 && t < 9.4) {
    const lift = spring(seg(t, 6.2, 6.8));
    const fly = easeInOut(seg(t, 7.1, 8.0));
    const size = lerp(620, 150, fly);
    const cx = lerp(W / 2, W / 2, fly) + Math.sin(fly * Math.PI) * 260;
    const cy = lerp(H * 0.44, H * 0.86, fly) - Math.sin(fly * Math.PI) * 220;
    const rot = lerp(-0.05, 0.25, lift) + fly * Math.PI * 2;
    // 図鑑の差し込み口
    ctx.save();
    const glow = ctx.createRadialGradient(W / 2, H * 0.86, 0, W / 2, H * 0.86, 220);
    glow.addColorStop(0, `rgba(80,160,255,${0.55 + 0.4 * seg(t, 7.8, 8.1)})`);
    glow.addColorStop(1, "rgba(80,160,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(W / 2 - 220, H * 0.86 - 220, 440, 440);
    ctx.restore();
    if (t < 8.05) {
      // きらめく尾
      const r = rng(3);
      for (let i = 0; i < 40 && fly > 0.02; i++) {
        const back = fly - i * 0.012;
        if (back <= 0) break;
        const bx = W / 2 + Math.sin(back * Math.PI) * 260 + (r() - 0.5) * 50;
        const by =
          lerp(H * 0.44, H * 0.86, back) - Math.sin(back * Math.PI) * 220 + (r() - 0.5) * 50;
        ctx.fillStyle = `rgba(255,236,190,${0.8 * (1 - i / 40)})`;
        ctx.beginPath();
        ctx.arc(bx, by, 5 + r() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20 + 60 * lift;
      ctx.shadowOffsetY = 10 + 40 * lift;
      ctx.fillStyle = "#fff";
      rr(ctx, -size / 2 - size * 0.05, -size / 2 - size * 0.05, size * 1.1, size * 1.1, size * 0.1);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      rr(ctx, -size / 2, -size / 2, size, size, size * 0.07);
      ctx.clip();
      cover(ctx, a.cafe, -size / 2, -size / 2, size, size);
      // ホロの光の帯
      const sweep = seg(t, 6.3, 7.2);
      const g = ctx.createLinearGradient(
        -size + sweep * size * 2.4,
        -size,
        sweep * size * 2.4,
        size,
      );
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(200,255,240,0.45)");
      g.addColorStop(0.6, "rgba(255,200,240,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.restore();
    }
    if (st > 0.2) riseText(ctx, "キャッチ！", W / 2, 360, 120, t, 6.4, { stagger: 0.05 });
    confetti(ctx, t, 8.0, W / 2, H * 0.86);
  }

  // ---- 4. アルバム＋記憶の線 ---------------------------------------------------
  if (t >= 9.0 && t < 12.9) {
    const out = seg(t, 12.3, 12.8);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    // 紙の罫線
    ctx.strokeStyle = "rgba(120,100,70,0.12)";
    ctx.lineWidth = 2;
    for (let y = 300; y < H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(W - 60, y);
      ctx.stroke();
    }
    riseText(ctx, "撮った日が、アルバムになる。", W / 2, 240, 66, t, 9.2, {
      color: "#2a2420",
      stagger: 0.03,
    });
    polaroid(ctx, a.cafe, "咖啡", 300, 600, 330, -0.06, seg(t, 9.3, 9.9));
    polaroid(ctx, a.cat, "貓", 780, 640, 330, 0.07, seg(t, 9.55, 10.15));
    polaroid(ctx, a.flower, "花", 320, 1120, 330, 0.05, seg(t, 9.8, 10.4));
    polaroid(ctx, a.interests, "書店", 770, 1160, 330, -0.08, seg(t, 10.05, 10.65));
    // 記憶の線（忘れかけ → 復習でまた上がる）
    const lp = easeInOut(seg(t, 10.6, 12.0));
    const x0 = 120;
    const x1 = W - 120;
    const yTop = 1580;
    const yBot = 1760;
    // 忘却曲線: 放っておくと下がる → 0.45 で復習して上がる → 次はゆっくり下がる
    const curve = (u: number) => {
      const r = u < 0.45 ? Math.exp((-1.6 * u) / 0.45) : Math.exp((-0.5 * (u - 0.45)) / 0.55);
      return lerp(yBot, yTop, r);
    };
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 80 * lp; i++) {
      const u = i / 80;
      const x = lerp(x0, x1, u);
      const y = curve(u);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (lp > 0) {
      const u = lp;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(lerp(x0, x1, u), curve(u), 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    riseText(ctx, "忘れる前に、そっと復習。", W / 2, 1520, 56, t, 10.9, {
      color: "#2a2420",
      weight: 700,
      stagger: 0.03,
    });
    ctx.restore();
  }

  // ---- 5. ロゴ ---------------------------------------------------------------
  if (t >= 12.4) {
    const p = seg(t, 12.4, 13.2);
    const r = 150 * spring(p);
    ctx.save();
    ctx.fillStyle = BLUE;
    ctx.shadowColor = "rgba(10,132,255,0.45)";
    ctx.shadowBlur = 60;
    ctx.beginPath();
    ctx.arc(W / 2, 780, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // 中のシャッターの輪
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 16 * spring(p);
    ctx.beginPath();
    ctx.arc(
      W / 2,
      780,
      r * 0.55,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * expo(seg(t, 12.6, 13.4)),
    );
    ctx.stroke();
    ctx.restore();
    riseText(ctx, "CatchWords", W / 2, 1080, 124, t, 12.8, {
      font: JP,
      stagger: 0.035,
      color: "#1c1c1e",
    });
    riseText(ctx, "撮るだけで、ことばが集まる。", W / 2, 1210, 60, t, 13.3, {
      color: "#3a3a3c",
      weight: 700,
      stagger: 0.025,
    });
    riseText(ctx, "台湾華語から、はじめよう。", W / 2, 1300, 44, t, 13.8, {
      color: "#6e6e73",
      weight: 500,
      stagger: 0.02,
    });
  }

  // フィルムの質感: ごく薄い粒子と周辺減光
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${lerp(0.35, 0.12, warm)})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 音を置く時刻（動画に焼く時と、確認用ページで鳴らす時で同じ表を使う）。 */
export const SOUND_CUES: Array<{
  at: number;
  name: "analyze" | "catch" | "celebrate" | "stinger";
  gain: number;
}> = [
  { at: 3.55, name: "catch", gain: 0.6 }, // シャッター
  { at: 3.7, name: "analyze", gain: 0.5 },
  { at: 4.7, name: "analyze", gain: 0.45 },
  { at: 7.05, name: "catch", gain: 1 }, // ステッカーが飛ぶ
  { at: 7.2, name: "stinger", gain: 0.9 }, // 曲（8 秒）→ 15.2 秒まで
  { at: 8.0, name: "celebrate", gain: 0.9 }, // 紙吹雪
];
