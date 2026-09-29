/**
 * **本物のようなステッカー**（オーナー指示 2026-09-28「ステッカーを表示するときの添付の動画の
 * ようにリアルに動く感じ再現して」）。参考の動画は、角を指でつまむと**紙のように丸まって
 * めくれ、裏の台紙（白い紙）が見える**。表はグリッター（ラメ）とホログラムで、傾けると光る。
 *
 * GPU（WebGL の断片シェーダ）で1画素ずつ描く:
 *  - めくれ: 指が通った線に沿って**円筒に巻く**（折り紙の鋭い折り目ではなく、紙の厚みの
 *    丸み）。つまんだ点が指の位置に来るよう巻きの軸を決める。巻いた面は裏（台紙の白）。
 *  - 影: めくれた紙の下と、ステッカー全体の下にやわらかい影。
 *  - 表: ホログラムの虹・光の帯・ラメの粒。傾き（指の位置）で動く。
 *  - 形: 切り抜きの輪郭に白いふち（ダイカット）を足す。写真は角の丸い四角。
 *
 * 動きはばね: 離すと速さを引き継いで元の平らな形へ戻る（少しだけ揺れて止まる）。
 * `onPeel` があれば、半分以上めくって離すと**はがし切って**から呼ぶ。
 */
import { useEffect, useRef } from "react";

type Props = {
  src: string;
  /** 写真（四角）か、切り抜き（輪郭のある絵）か。 */
  shape?: "cutout" | "photo";
  /** 表示の一辺（CSS の px）。 */
  size?: number;
  className?: string;
  onPeel?: () => void;
  ariaLabel?: string;
};

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main(){ vUv = p*0.5+0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(p,0.,1.); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uC;      // つまんだ点（キャンバスの 0..1、y は下向き）
uniform vec2 uP;      // 指の位置
uniform float uR;     // 巻きの半径
uniform vec2 uTilt;   // 傾き -1..1
uniform float uTime;
uniform float uPad;
uniform vec2 uRes;
const float PI = 3.14159265;

float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1,311.7)))*43758.5453); }

vec4 art(vec2 x){
  vec2 s = (x - uPad) / (1.0 - 2.0*uPad);
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) return vec4(0.0);
  return texture2D(uTex, s);
}

vec3 holo(vec2 x, vec3 base){
  vec2 s = (x - uPad) / (1.0 - 2.0*uPad);
  float ph = dot(s, vec2(0.62, 0.78))*2.2 + uTilt.x*0.9 - uTilt.y*0.7 + uTime*0.03;
  vec3 rainbow = 0.5 + 0.5*cos(6.2831*(ph + vec3(0.0, 0.33, 0.67)));
  float white = smoothstep(0.82, 0.97, min(base.r, min(base.g, base.b)));
  // 光の帯（傾きで横切る）
  float band = exp(-pow((dot(s - 0.5, normalize(vec2(1.0, -0.55))) - uTilt.x*0.55 + uTilt.y*0.25)*5.5, 2.0));
  // ラメ: 小さな升ごとに向きの違う鏡。傾きが向きに合った粒だけ光る。
  vec2 g = floor(x*uRes/3.0);
  float r = hash(g);
  vec2 nrm = vec2(hash(g + 7.1), hash(g + 3.7))*2.0 - 1.0;
  float spark = pow(max(0.0, 1.0 - length(nrm - uTilt*1.15)*1.6), 10.0) * step(0.45, r);
  vec3 c = base;
  // 絵の色は保つ（虹はうっすら）。白いふちはホロのフィルムなので虹が強い。
  c = mix(c, c*(0.8 + rainbow*0.45), 0.07 + 0.6*white);
  c += rainbow*band*(0.07 + 0.28*white);
  c += vec3(1.0, 0.98, 0.95)*spark*(0.35 + 0.6*white);
  return c;
}

vec3 backPaper(vec2 src, float light){
  // 台紙: 少し灰色の白に、斜めの薄い模様（参考の動画の裏紙と同じ）
  vec2 s = (src - uPad) / (1.0 - 2.0*uPad);
  float stripe = step(0.5, fract((s.x + s.y)*18.0)) * 0.016;
  vec3 paper = vec3(0.93, 0.925, 0.915) - stripe;
  return paper*light;
}

void main(){
  vec2 x = vUv;
  vec2 CP = uC - uP;
  float L = length(CP);
  // 影（全体の下）: 少しずらした輪郭をぼかして敷く
  float sh = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i)*0.785;
    sh += art(x - vec2(0.006, 0.018) + vec2(cos(a), sin(a))*0.014).a;
  }
  sh /= 8.0;
  vec4 outc = vec4(0.0, 0.0, 0.0, sh*0.22);

  if (L < 0.0005) {
    vec4 f = art(x);
    if (f.a > 0.01) {
      vec3 c = holo(x, f.rgb);
      outc = vec4(mix(outc.rgb, c, f.a), max(outc.a, f.a));
    }
    gl_FragColor = outc;
    return;
  }
  vec2 n = CP / L;                       // 指からつまんだ点へ向かう向き
  float R = uR * clamp(L*5.0, 0.2, 1.0); // 少しだけめくる時は丸みも小さい
  float sC = (L + PI*R)*0.5;
  vec2 A = uC - sC*n;                    // 巻きの軸（の上の1点）
  float d = dot(x - A, n);
  vec2 base = x - d*n;
  // 持ち上がった所の下には、もう元の影は無い（めくれた紙の薄い影だけ）
  if (d > 0.0) outc.a *= 0.25;

  // 1) 上の層: 巻き上がって裏返った紙（台紙の白）
  float sb = -1.0;
  if (d < 0.0) sb = PI*R - d;
  else if (d <= R) sb = R*(PI - asin(clamp(d/R, 0.0, 1.0)));
  if (sb > 0.0) {
    vec2 src = base + sb*n;
    vec4 f = art(src);
    if (f.a > 0.5) {
      float light = d < 0.0 ? 0.98 : 0.72 + 0.26*sqrt(max(0.0, 1.0 - d/R));
      // 巻きの縁のつや
      light += d >= 0.0 ? 0.12*exp(-pow((d/R - 0.35)*4.0, 2.0)) : 0.0;
      gl_FragColor = vec4(backPaper(src, light), 1.0);
      return;
    }
  }
  // 2) 下の層: 平らなまま（d<0）、または巻き始めの丸み（0..R）の表
  vec2 srcF = x;
  float shade = 1.0;
  if (d >= 0.0) {
    if (d > R) { gl_FragColor = outc; return; }
    float sf = R*asin(clamp(d/R, 0.0, 1.0));
    srcF = base + sf*n;
    shade = 0.62 + 0.38*sqrt(max(0.0, 1.0 - d/R));
  }
  vec4 f = art(srcF);
  // はがした所（持ち上がった紙の元の場所）は何も無い＝下の影だけ
  if (f.a > 0.01) {
    vec3 c = holo(srcF, f.rgb)*shade;
    // めくれた紙が落とす影（平らな部分、軸の手前）
    if (d < 0.0) {
      float flapShadow = exp(d*40.0)*0.35;
      c *= 1.0 - flapShadow;
    }
    outc = vec4(mix(outc.rgb, c, f.a), max(outc.a, f.a));
  }
  gl_FragColor = outc;
}`;

/** 切り抜きの輪郭の外に白いふち（ダイカット）を足した絵を作る。写真は角の丸い四角。 */
function buildSticker(img: HTMLImageElement, shape: "cutout" | "photo", size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const border = size * 0.035;
  const box = size - border * 2 - 4;
  const s = Math.min(box / iw, box / ih);
  const w = iw * s;
  const h = ih * s;
  const x0 = (size - w) / 2;
  const y0 = (size - h) / 2;
  if (shape === "photo") {
    const r = size * 0.05;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(x0 - border, y0 - border, w + border * 2, h + border * 2, r + border);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, r);
    ctx.clip();
    ctx.drawImage(img, x0, y0, w, h);
    ctx.restore();
    return c;
  }
  // 輪郭を太らせた白い影を作る（円の上を少しずつずらして重ねる）
  const sil = document.createElement("canvas");
  sil.width = sil.height = size;
  const sc = sil.getContext("2d")!;
  for (let a = 0; a < 32; a++) {
    const t = (a / 32) * Math.PI * 2;
    sc.drawImage(img, x0 + Math.cos(t) * border, y0 + Math.sin(t) * border, w, h);
  }
  sc.drawImage(img, x0, y0, w, h);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#fff";
  sc.fillRect(0, 0, size, size);
  ctx.drawImage(sil, 0, 0);
  ctx.drawImage(img, x0, y0, w, h);
  return c;
}

export function HoloSticker({
  src,
  shape = "cutout",
  size = 280,
  className,
  onPeel,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const peelRef = useRef(onPeel);
  peelRef.current = onPeel;

  useEffect(() => {
    const canvas = ref.current;
    const box = wrap.current;
    if (!canvas || !box) return;
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: false,
      alpha: true,
      antialias: true,
    });
    if (!gl) return;
    const reduce = document.documentElement.dataset.motion === "reduce";
    const PAD = 0.1;
    const sh = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let alpha: Uint8ClampedArray | null = null;
    let ready = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sticker = buildSticker(img, shape);
      alpha = sticker.getContext("2d")!.getImageData(0, 0, sticker.width, sticker.height).data;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sticker);
      ready = true;
      dirty = true;
    };
    img.src = src;

    // 状態（すべてキャンバスの 0..1 の座標）
    const C = { x: 0.5, y: 0.5 };
    const P = { x: 0.5, y: 0.5, vx: 0, vy: 0, tx: 0.5, ty: 0.5 };
    const tilt = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let dragging = false;
    let peeling = false; // はがし切りの途中
    let dirty = true;
    let raf = 0;
    let last = 0;
    const start = performance.now();

    const inside = (x: number, y: number) => {
      if (!alpha) return false;
      const sx = (x - PAD) / (1 - 2 * PAD);
      const sy = (y - PAD) / (1 - 2 * PAD);
      if (sx < 0 || sy < 0 || sx > 1 || sy > 1) return false;
      const i = (Math.floor(sy * 1023) * 1024 + Math.floor(sx * 1023)) * 4 + 3;
      return alpha[i] > 128;
    };
    /** つまんだ所から外へ進んで、ステッカーの縁（めくれ始める所）を探す。 */
    const edgeFrom = (x: number, y: number) => {
      let dx = x - 0.5;
      let dy = y - 0.5;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      let ex = x;
      let ey = y;
      for (let t = 0; t < 1; t += 0.004) {
        const qx = x + dx * t;
        const qy = y + dy * t;
        if (!inside(qx, qy)) break;
        ex = qx;
        ey = qy;
      }
      return { x: ex, y: ey };
    };

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    let lastMove = { x: 0, y: 0, t: 0 };
    const down = (e: PointerEvent) => {
      if (peeling) return;
      const q = toLocal(e);
      if (!inside(q.x, q.y)) return;
      canvas.setPointerCapture(e.pointerId);
      const edge = edgeFrom(q.x, q.y);
      C.x = edge.x;
      C.y = edge.y;
      // つまんだ瞬間に少しだけ持ち上がる（押した手応え）
      P.x = C.x + (q.x - C.x) * 0.5 - (C.x - 0.5) * 0.04;
      P.y = C.y + (q.y - C.y) * 0.5 - (C.y - 0.5) * 0.04;
      P.tx = P.x;
      P.ty = P.y;
      P.vx = P.vy = 0;
      dragging = true;
      lastMove = { x: q.x, y: q.y, t: performance.now() };
      dirty = true;
    };
    const move = (e: PointerEvent) => {
      const q = toLocal(e);
      if (dragging) {
        const now = performance.now();
        const dt = Math.max(1, now - lastMove.t) / 1000;
        P.vx = (q.x - lastMove.x) / dt;
        P.vy = (q.y - lastMove.y) / dt;
        lastMove = { x: q.x, y: q.y, t: now };
        // 指に 1:1（つまんだ点が指の下に来る）
        P.x = P.tx = q.x;
        P.y = P.ty = q.y;
      } else {
        tilt.tx = Math.max(-1, Math.min(1, (q.x - 0.5) * 2));
        tilt.ty = Math.max(-1, Math.min(1, (q.y - 0.5) * 2));
      }
      dirty = true;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      const peeled = Math.hypot(P.x - C.x, P.y - C.y);
      // 離した速さも見て、はがす／戻すを決める
      const projX = P.x + P.vx * 0.12;
      const projY = P.y + P.vy * 0.12;
      if (peelRef.current && Math.hypot(projX - C.x, projY - C.y) > 0.55 && peeled > 0.2) {
        peeling = true;
        const nx = (P.x - C.x) / (peeled || 1);
        const ny = (P.y - C.y) / (peeled || 1);
        P.tx = C.x + nx * 2.4;
        P.ty = C.y + ny * 2.4;
        window.setTimeout(() => peelRef.current?.(), reduce ? 0 : 520);
      } else {
        P.tx = C.x;
        P.ty = C.y;
      }
      dirty = true;
    };
    const leave = () => {
      tilt.tx = 0;
      tilt.ty = 0;
      dirty = true;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);

    // ばね（応答 0.42 秒・減衰 0.78＝少しだけ揺れて止まる。紙の張りの感じ）
    const K = ((2 * Math.PI) / 0.42) ** 2;
    const D = 2 * 0.78 * ((2 * Math.PI) / 0.42);
    const KT = ((2 * Math.PI) / 0.6) ** 2;
    const DT = 2 * 0.9 * ((2 * Math.PI) / 0.6);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(1 / 30, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      let moving = false;
      if (!dragging) {
        for (const k of ["x", "y"] as const) {
          const tk = k === "x" ? "tx" : "ty";
          const vk = k === "x" ? "vx" : "vy";
          if (reduce) {
            P[k] = P[tk];
            P[vk] = 0;
            continue;
          }
          P[vk] += (-K * (P[k] - P[tk]) - D * P[vk]) * dt;
          P[k] += P[vk] * dt;
          if (Math.abs(P[k] - P[tk]) > 1e-4 || Math.abs(P[vk]) > 1e-3) moving = true;
          else {
            P[k] = P[tk];
            P[vk] = 0;
          }
        }
      }
      // ふだんは、ゆっくり息をするように少しだけ傾く（ホロが生きて見える）
      const idle = reduce ? 0 : 0.18;
      const breathe = (t - start) / 1000;
      for (const k of ["x", "y"] as const) {
        const tk = k === "x" ? "tx" : "ty";
        const vk = k === "x" ? "vx" : "vy";
        const target =
          tilt[tk] + (k === "x" ? Math.sin(breathe * 0.8) : Math.cos(breathe * 0.6)) * idle;
        tilt[vk] += (-KT * (tilt[k] - target) - DT * tilt[vk]) * dt;
        tilt[k] += tilt[vk] * dt;
      }
      if (!reduce) moving = true; // ラメとホロは常に少し動く
      // 箱ごとの立体の傾き（めくっている間は平らに寄せる）
      const flat = dragging || Math.hypot(P.x - C.x, P.y - C.y) > 0.01 ? 0.35 : 1;
      box.style.transform = `perspective(900px) rotateX(${(-tilt.y * 9 * flat).toFixed(2)}deg) rotateY(${(tilt.x * 11 * flat).toFixed(2)}deg)`;
      if (!ready || !(moving || dirty)) return;
      dirty = false;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u("uC"), C.x, C.y);
      gl.uniform2f(u("uP"), P.x, P.y);
      gl.uniform1f(u("uR"), 0.05);
      gl.uniform2f(u("uTilt"), tilt.x, tilt.y);
      gl.uniform1f(u("uTime"), (t - start) / 1000);
      gl.uniform1f(u("uPad"), PAD);
      gl.uniform2f(u("uRes"), w, h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [src, shape]);

  return (
    <div
      ref={wrap}
      className={className}
      style={{ width: size, height: size, transformStyle: "preserve-3d", willChange: "transform" }}
    >
      <canvas
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        data-holo-sticker
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      />
    </div>
  );
}
