/**
 * **演出の作り方の試作: GPU（シェーダー）で描く**（見本・本番は未変更）。
 *
 * > オーナー指示 2026-09-27「AIの分析中、キャッチのアニメーションやBGM 効果音、まさに
 * > チープそのものだから、作り方じたい、最新の方法、最新のモデルを使って最高の演出を
 * > 作りたい。案を複数出して。そもそも作り方を再考して。」
 *
 * 今の演出は CSS（箱を動かす・色を変える）で作っている。ここは**写真そのものを GPU で
 * 1画素ずつ描き直す**作り方の見本。考え方の比較は `docs/effects-rethink.md`。
 *
 *   分析中 … 写真の上を光の帯が通り、帯の所だけ色がずれて（レンズの色収差）、
 *             細かい光の点が瞬く。帯の後ろはわずかに明るく残る。
 *   キャッチ … 写真が「ノイズの形」に沿って端から光の粒になってほどけ、上へ消える。
 *             ほどける縁は明るく光る。
 */
import { useEffect, useRef, useState } from "react";
import { photo } from "./peel-sticker";

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D img;
uniform float t;        // 秒
uniform float mode;     // 0 = 分析中, 1 = キャッチ
uniform float k;        // キャッチの進み 0..1
uniform vec2 res;

float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 q) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(q); q *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 base = texture2D(img, uv).rgb;
  if (mode < 0.5) {
    // 光の帯（上から下へ、2.4秒で1往復）。
    float y = fract(t / 2.4);
    float d = uv.y - y;
    float band = exp(-d * d * 900.0);
    float trail = smoothstep(-0.25, 0.0, d) * (1.0 - step(0.0, d)) * 0.35;
    // 帯の所だけ色をずらす（赤は右へ・青は左へ）。
    float off = band * 0.012;
    vec3 col = vec3(texture2D(img, uv + vec2(off, 0.0)).r, base.g, texture2D(img, uv - vec2(off, 0.0)).b);
    // 細かい光の点（帯の近くで瞬く）。
    vec2 cell = floor(uv * res / 6.0);
    float tw = step(0.985, hash(cell + floor(t * 8.0))) * (band * 2.0 + trail);
    col += vec3(0.55, 0.8, 1.0) * (band * 0.55 + trail * 0.25) + tw;
    gl_FragColor = vec4(col, 1.0);
  } else {
    // ほどける順番: ノイズ＋下ほど早い（下からほどけて、粒は上へ流れる）。
    float n = fbm(uv * 5.0) * 0.7 + (1.0 - uv.y) * 0.3;
    float edge = k * 1.25 - 0.1;
    float gone = smoothstep(edge - 0.02, edge + 0.02, n);
    float rim = exp(-pow((n - edge) * 30.0, 2.0));
    // 粒は上へ流れて消える。
    vec2 drift = vec2(0.0, -k * 0.25 * (1.0 - n));
    vec3 c = texture2D(img, uv + drift * (1.0 - gone)).rgb;
    vec3 glow = vec3(1.0, 0.85, 0.45) * rim * 2.2;
    float alive = gone;
    float spark = step(0.992, hash(floor(uv * res / 3.0) + floor(t * 20.0))) * (1.0 - gone) * (1.0 - k);
    gl_FragColor = vec4(c * alive + glow + spark, max(alive, rim + spark));
  }
}
`;

function useShader(canvas: React.RefObject<HTMLCanvasElement | null>, mode: 0 | 1, run: number) {
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext("webgl", { premultipliedAlpha: false, alpha: true });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
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
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    let raf = 0;
    let ready = false;
    const start = performance.now();
    const img = new Image();
    img.onload = () => {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      ready = true;
    };
    img.src = photo;
    const frame = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth * dpr;
      const h = el.clientHeight * dpr;
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (ready) {
        const secs = (now - start) / 1000;
        gl.uniform1f(u("t"), secs);
        gl.uniform1f(u("mode"), mode);
        // キャッチは 1.4 秒でほどけ切る（ゆっくり始まり、最後は速く）。
        const p = Math.min(1, secs / 1.4);
        gl.uniform1f(u("k"), p * p * (3 - 2 * p));
        gl.uniform2f(u("res"), w, h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [canvas, mode, run]);
}

export function FxLabScene({ q }: { q: URLSearchParams }) {
  const [mode, setMode] = useState<0 | 1>(q.get("fx") === "catch" ? 1 : 0);
  const [run, setRun] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);
  useShader(ref, mode, run);
  const pill = (on: boolean) => ({
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: on ? "var(--primary)" : "var(--card)",
    color: on ? "var(--primary-foreground)" : "var(--foreground)",
    fontWeight: 600,
    fontSize: 13,
  });
  return (
    <div className="space-y-3 pb-28">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" style={pill(mode === 0)} onClick={() => setMode(0)}>
          分析中（光の帯）
        </button>
        <button
          type="button"
          style={pill(mode === 1)}
          onClick={() => {
            setMode(1);
            setRun((r) => r + 1);
          }}
        >
          キャッチ（光の粒にほどける）▶
        </button>
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 360,
          aspectRatio: "1",
          margin: "0 auto",
          borderRadius: 28,
          overflow: "hidden",
          background: "radial-gradient(circle at 50% 40%, #243a5e, #0b1220)",
        }}
      >
        <canvas
          ref={ref}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        写真を GPU で1画素ずつ描き直す作り方の見本（今の演出は箱を動かす CSS）。音は付けていません。
        比べた案と進め方は docs/effects-rethink.md。
      </p>
    </div>
  );
}
