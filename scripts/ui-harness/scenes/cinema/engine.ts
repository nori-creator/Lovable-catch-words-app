/**
 * **映画のような演出（GPU・3D）**の中身。three.js ＋ 光のにじみ（ブルーム）。
 *
 *  A 光の粒: 写真が 16,384 粒の光にほどけ、渦を巻いて図鑑へ吸い込まれる
 *  B 3D カード: 写真が厚みのある虹色のカードになり、回りながら図鑑へ差し込まれる
 *
 * どちらも 分析中 → キャッチ → 祝福（紙吹雪＋光の筋）の3幕。
 * 動きの時計は1つ（`t`）で、音（audio.ts）と振動も同じ時計で打つ。
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type FxMode = "particles" | "card";
export type FxPhase = "idle" | "analyze" | "catch" | "celebrate";

const PW = 1.3; // 写真の幅（three.js の単位）
const PY = 0.22; // 写真の中心の高さ
const TARGET = new THREE.Vector3(0, -1.02, 0.1); // 図鑑（下の方）
const GRID = 128; // 128×128 = 16,384 粒
const CONFETTI = 320;

const PARTICLE_VERT = `
attribute vec2 aUv;
attribute vec3 aRand;
uniform float uT;
uniform float uTime;
uniform float uSize;
uniform vec3 uTarget;
uniform sampler2D uTex;
varying vec3 vColor;
varying float vAlpha;
float delayOf(vec2 uv, float r){ return r*0.30 + (1.0-uv.y)*0.22; }
void main(){
  vec3 base = vec3((aUv.x-0.5)*${PW.toFixed(2)}, (aUv.y-0.5)*${PW.toFixed(2)} + ${PY.toFixed(2)}, 0.0);
  float d = delayOf(aUv, aRand.x);
  float t = clamp((uT - d) / 0.55, 0.0, 1.0);
  float e = t*t*(3.0-2.0*t);
  // 渦: ほどけた粒は一度ふわっと浮いて、らせんを描く
  float ang = e*6.2831*(0.6 + aRand.y) + aRand.z*6.2831;
  float rad = sin(3.14159*e)*(0.25 + 0.45*aRand.z);
  vec3 mid = base + vec3(cos(ang)*rad, 0.35*sin(3.14159*e) + sin(ang)*rad*0.4, sin(ang)*rad*0.8);
  vec3 p = mix(mid, uTarget, smoothstep(0.42, 1.0, t));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float glow = sin(3.14159*t);
  gl_PointSize = uSize * (1.0 + 0.8*glow) * (1.0 - 0.75*smoothstep(0.75, 1.0, t)) / -mv.z;
  gl_Position = projectionMatrix * mv;
  vColor = texture2D(uTex, aUv).rgb * (1.0 + 0.5*glow) + vec3(1.0, 0.85, 0.55)*glow*0.25;
  vAlpha = step(0.0001, t) * (1.0 - smoothstep(0.96, 1.0, t));
}`;
const PARTICLE_FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vColor, a*vAlpha*0.55);
}`;

const PHOTO_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const PHOTO_FRAG = `
uniform sampler2D uTex;
uniform float uT;        // キャッチの進み（ほどけ）
uniform float uScan;     // 分析中の光の帯の位置（0..1、-1 で無し）
uniform float uTime;
varying vec2 vUv;
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 cell = floor(vUv*${GRID}.0);
  float d = hash(cell)*0.30 + (1.0-vUv.y)*0.22;   // 粒と同じ順でほどける
  float gone = step(d, uT);
  if (gone > 0.5) discard;
  vec3 col = texture2D(uTex, vUv).rgb;
  // ほどける縁が光る
  float edge = smoothstep(0.06, 0.0, d - uT) * step(0.001, uT);
  col += vec3(1.0, 0.8, 0.45) * edge * 1.2;
  // 分析中の光の帯（色ずれ＋明るい芯）
  if (uScan >= 0.0) {
    float dy = vUv.y - (1.0 - uScan);
    float band = exp(-dy*dy*700.0);
    float off = band*0.012;
    col = vec3(texture2D(uTex, vUv + vec2(off,0.0)).r, col.g, texture2D(uTex, vUv - vec2(off,0.0)).b);
    col += vec3(0.55, 0.8, 1.0)*band*0.6;
    float tw = step(0.992, hash(cell + floor(uTime*10.0))) * band * 1.2;
    col += tw;
  }
  // 角を丸める
  vec2 q = abs(vUv - 0.5) - 0.5 + 0.06;
  float rr = length(max(q, 0.0)) - 0.06;
  if (rr > 0.0) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function raysTexture() {
  // 柔らかい光の筋: 細い楔を何本も、ぼかして重ねる（くっきりした放射線は安っぽい）
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.filter = "blur(10px)";
  ctx.translate(256, 256);
  for (let i = 0; i < 28; i++) {
    ctx.rotate((Math.PI * 2) / 28 + (i % 3) * 0.05);
    const len = 170 + ((i * 53) % 80);
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    g.addColorStop(0, "rgba(255,236,200,0.35)");
    g.addColorStop(1, "rgba(255,236,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-9 - (i % 4) * 3, -len);
    ctx.lineTo(9 + (i % 4) * 3, -len);
    ctx.lineTo(2, 0);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CinemaWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private raf = 0;
  private mode: FxMode = "particles";
  phase: FxPhase = "idle";
  private phaseT0 = 0;
  private photoTex: THREE.Texture | null = null;
  private photo!: THREE.Mesh;
  private photoMat!: THREE.ShaderMaterial;
  private points!: THREE.Points;
  private pointsMat!: THREE.ShaderMaterial;
  private card!: THREE.Mesh;
  private ghosts: THREE.Mesh[] = [];
  private trail: THREE.Vector3[] = [];
  private cardLight!: THREE.PointLight;
  private dust!: THREE.Points;
  private slot!: THREE.Sprite;
  private rays!: THREE.Mesh;
  private confetti!: THREE.InstancedMesh;
  private conf: { p: Float32Array; v: Float32Array; r: Float32Array; w: Float32Array } | null =
    null;
  private dummy = new THREE.Object3D();
  private reduce = false;
  /** 検査用: 1 より小さくすると演出がゆっくり進む（遅い端末でも途中を撮れる）。 */
  timeScale = 1;
  onPhase?: (p: FxPhase) => void;
  onBeat?: (b: "catch" | "land" | "celebrate") => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.reduce = document.documentElement.dataset.motion === "reduce";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#0b1020");
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    this.camera.position.set(0, 0, 3.2);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 光のにじみは「明るい所だけ」に（しきい値を高く・強さは控えめ）。低いと画面全体が白む。
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.build();
  }

  private build() {
    // 背景: 奥に大きなぼけた光（映画の夜景の玉ボケ）
    const bokehTex = radialTexture("rgba(255,255,255,0.9)", "rgba(255,255,255,0)");
    const bokeh = new THREE.Group();
    const hues = ["#3b6fd8", "#7b4bd6", "#d6874b", "#2fa3a3", "#d64b8a"];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: bokehTex,
          color: hues[i % hues.length],
          transparent: true,
          opacity: 0.18 + ((i * 37) % 10) / 60,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const s = 0.25 + ((i * 53) % 10) / 18;
      m.scale.set(s, s, 1);
      m.position.set(
        ((i * 71) % 100) / 30 - 1.65,
        ((i * 37) % 100) / 30 - 1.6,
        -2.2 - (i % 3) * 0.4,
      );
      bokeh.add(m);
    }
    this.scene.add(bokeh);

    // 写真（A 用）
    this.photoMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: null },
        uT: { value: 0 },
        uScan: { value: -1 },
        uTime: { value: 0 },
      },
      vertexShader: PHOTO_VERT,
      fragmentShader: PHOTO_FRAG,
      transparent: true,
    });
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(PW, PW), this.photoMat);
    this.photo.position.set(0, PY, 0);
    this.scene.add(this.photo);

    // 粒（A 用）
    const n = GRID * GRID;
    const uvs = new Float32Array(n * 2);
    const rnd = new Float32Array(n * 3);
    const pos = new Float32Array(n * 3);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        uvs[i * 2] = (x + 0.5) / GRID;
        uvs[i * 2 + 1] = (y + 0.5) / GRID;
        rnd[i * 3] = Math.random();
        rnd[i * 3 + 1] = Math.random();
        rnd[i * 3 + 2] = Math.random();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aUv", new THREE.BufferAttribute(uvs, 2));
    g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    this.pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: 9 * Math.min(2, window.devicePixelRatio || 1) },
        uTarget: { value: TARGET.clone() },
        uTex: { value: null },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.pointsMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // カード（B 用）: 厚み 3% の板。表は虹色の膜（iridescence）＋透明な上塗り
    const front = new THREE.MeshPhysicalMaterial({
      color: "#d9d9d9", // 写真が照明で白飛びしないよう、少しだけ下げる
      roughness: 0.25,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.45,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [150, 520],
    });
    const edge = new THREE.MeshPhysicalMaterial({ color: "#f5f3ee", roughness: 0.5 });
    this.card = new THREE.Mesh(new THREE.BoxGeometry(PW, PW, 0.04), [
      edge,
      edge,
      edge,
      edge,
      front,
      new THREE.MeshStandardMaterial({ color: "#e9e6df", roughness: 0.7 }),
    ]);
    this.card.position.set(0, PY, 0);
    this.card.visible = false;
    this.scene.add(this.card);
    for (let i = 0; i < 7; i++) {
      const ghost = new THREE.Mesh(
        new THREE.PlaneGeometry(PW, PW),
        new THREE.MeshBasicMaterial({
          transparent: true,
          // 残像は「足し算」だと重なって白飛びする。普通の半透明で薄く重ねる。
          opacity: 0.22 * (1 - i / 7),
          depthWrite: false,
          color: "#9aa6c0",
        }),
      );
      ghost.visible = false;
      this.ghosts.push(ghost);
      this.scene.add(ghost);
    }
    this.cardLight = new THREE.PointLight("#ffffff", 1.1, 4, 1.6);
    this.scene.add(this.cardLight);
    this.scene.add(new THREE.AmbientLight("#8aa2ff", 0.12));
    const key = new THREE.DirectionalLight("#ffffff", 0.55);
    key.position.set(-1, 2, 3);
    this.scene.add(key);

    // 分析中に漂う塵（被写界深度でぼけた光の粒）
    const dn = 420;
    const dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 3;
      dp[i * 3 + 1] = (Math.random() - 0.5) * 3.2;
      dp[i * 3 + 2] = Math.random() * 1.6 - 0.4;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({
        map: bokehTex,
        size: 0.05,
        color: "#bcd4ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.dust);

    // 図鑑の差し込み口（下）
    this.slot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture("rgba(120,190,255,1)", "rgba(40,90,255,0)"),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.slot.position.copy(TARGET);
    this.slot.scale.set(0.5, 0.5, 1);
    this.scene.add(this.slot);

    // 祝福: 光の筋
    this.rays = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        map: raysTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.rays.position.set(0, -0.2, -0.3);
    this.scene.add(this.rays);

    // 祝福: 紙吹雪（金属の薄い紙。表裏で光り方が変わる）
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.045, 0.026),
      new THREE.MeshStandardMaterial({
        metalness: 0.75,
        roughness: 0.28,
        side: THREE.DoubleSide,
      }),
      CONFETTI,
    );
    const colors = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff", "#f4a261", "#b388ff"];
    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI; i++) {
      c.set(colors[i % colors.length]);
      this.confetti.setColorAt(i, c);
      this.dummy.position.set(0, -10, 0);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    // 最初は画面の外に置くので、見えない所として省かれないようにする
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
  }

  async load(photoUrl: string) {
    const tex = await new THREE.TextureLoader().loadAsync(photoUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.photoTex = tex;
    this.photoMat.uniforms.uTex.value = tex;
    this.pointsMat.uniforms.uTex.value = tex;
    const front = (this.card.material as THREE.MeshPhysicalMaterial[])[4];
    front.map = tex;
    front.needsUpdate = true;
    for (const gh of this.ghosts) (gh.material as THREE.MeshBasicMaterial).map = tex;
    this.resize();
  }

  setMode(m: FxMode) {
    this.mode = m;
    this.reset();
  }

  reset() {
    this.phase = "idle";
    this.photoMat.uniforms.uT.value = 0;
    this.photoMat.uniforms.uScan.value = -1;
    this.pointsMat.uniforms.uT.value = 0;
    this.photo.visible = this.mode === "particles";
    this.points.visible = this.mode === "particles";
    this.card.visible = this.mode === "card";
    this.card.position.set(0, PY, 0);
    this.card.rotation.set(0, 0, 0);
    this.card.scale.setScalar(1);
    for (const gh of this.ghosts) gh.visible = false;
    this.trail = [];
    this.conf = null;
    (this.rays.material as THREE.MeshBasicMaterial).opacity = 0;
    this.onPhase?.("idle");
  }

  start(phase: FxPhase) {
    if (phase === "catch") this.reset();
    this.phase = phase;
    this.phaseT0 = performance.now();
    if (phase === "celebrate") this.burst();
    this.onPhase?.(phase);
  }

  private burst() {
    const p = new Float32Array(CONFETTI * 3);
    const v = new Float32Array(CONFETTI * 3);
    const r = new Float32Array(CONFETTI * 3);
    const w = new Float32Array(CONFETTI * 3);
    for (let i = 0; i < CONFETTI; i++) {
      p[i * 3] = TARGET.x + (Math.random() - 0.5) * 0.1;
      p[i * 3 + 1] = TARGET.y;
      p[i * 3 + 2] = TARGET.z;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; // 上向きに扇状
      const s = 2.4 + Math.random() * 2.2;
      v[i * 3] = Math.cos(a) * s * 0.55;
      v[i * 3 + 1] = -Math.sin(a) * s;
      v[i * 3 + 2] = (Math.random() - 0.3) * 1.6;
      r[i * 3] = Math.random() * 6;
      r[i * 3 + 1] = Math.random() * 6;
      r[i * 3 + 2] = Math.random() * 6;
      w[i * 3] = (Math.random() - 0.5) * 14;
      w[i * 3 + 1] = (Math.random() - 0.5) * 14;
      w[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    this.conf = { p, v, r, w };
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 写真と図鑑が必ず入る距離（幅も高さも）
    const vfov = (this.camera.fov * Math.PI) / 180;
    const needH = 2.7;
    const needW = 1.9;
    const dist = Math.max(
      needH / 2 / Math.tan(vfov / 2),
      needW / 2 / (Math.tan(vfov / 2) * this.camera.aspect),
    );
    this.camera.position.z = dist;
    this.camera.updateProjectionMatrix();
  }

  begin() {
    let last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(1 / 30, (now - last) / 1000) * this.timeScale;
      last = now;
      this.tick(now, dt);
      this.composer.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(now: number, dt: number) {
    const time = now / 1000;
    const pt = ((now - this.phaseT0) / 1000) * this.timeScale;
    this.photoMat.uniforms.uTime.value = time;
    this.pointsMat.uniforms.uTime.value = time;
    const dustMat = this.dust.material as THREE.PointsMaterial;
    // 塵はゆっくり漂う
    this.dust.rotation.y = Math.sin(time * 0.1) * 0.2;
    this.dust.position.y = Math.sin(time * 0.3) * 0.05;
    const slotMat = this.slot.material as THREE.SpriteMaterial;
    slotMat.opacity = 0.3 + Math.sin(time * 2) * 0.05;
    const raysMat = this.rays.material as THREE.MeshBasicMaterial;
    this.rays.rotation.z += dt * 0.25;

    if (this.phase === "analyze") {
      dustMat.opacity = Math.min(0.9, dustMat.opacity + dt * 1.5);
      if (this.mode === "particles") {
        this.photoMat.uniforms.uScan.value = (pt / 1.8) % 1;
        this.photo.rotation.y = Math.sin(time * 0.8) * 0.12;
        this.photo.rotation.x = Math.cos(time * 0.6) * 0.06;
      } else {
        // カードは光がなめるように動いて、虹色の膜が色を変える
        this.card.rotation.y = Math.sin(time * 0.9) * 0.35;
        this.card.rotation.x = Math.cos(time * 0.7) * 0.12;
        this.cardLight.position.set(Math.sin(time * 1.4) * 1.6, 0.8, 1.4);
      }
    } else {
      dustMat.opacity = Math.max(0, dustMat.opacity - dt * 1.2);
      this.photoMat.uniforms.uScan.value = -1;
    }

    if (this.phase === "catch") {
      const dur = this.reduce ? 0.01 : this.mode === "particles" ? 1.9 : 1.5;
      const p = Math.min(1, pt / dur);
      if (this.mode === "particles") {
        this.photoMat.uniforms.uT.value = p * 1.25;
        this.pointsMat.uniforms.uT.value = p * 1.25;
        this.photo.rotation.set(0, 0, 0);
      } else {
        // 浮く → 1回半まわる → 小さくなって弧を描き差し込み口へ
        const lift = Math.min(1, p / 0.25);
        const fly = Math.max(0, (p - 0.25) / 0.75);
        const e = fly * fly * (3 - 2 * fly);
        const start = new THREE.Vector3(0, PY, 0.35 * Math.sin((Math.PI / 2) * lift));
        const ctrl = new THREE.Vector3(0.9, 0.6, 0.6);
        const a = start.clone().lerp(ctrl, e);
        const b = ctrl.clone().lerp(TARGET, e);
        this.card.position.copy(a.lerp(b, e));
        this.card.rotation.set(
          -0.3 * e,
          Math.PI * 3 * e + 0.15 * lift,
          0.25 * Math.sin(Math.PI * e),
        );
        this.card.scale.setScalar(1 - 0.86 * e);
        this.cardLight.position.set(this.card.position.x - 0.6, this.card.position.y + 0.8, 1.5);
        // 残像（動きのにじみ）
        this.trail.unshift(this.card.position.clone());
        this.trail.length = Math.min(this.trail.length, 14);
        this.ghosts.forEach((gh, i) => {
          const at = this.trail[(i + 1) * 2];
          gh.visible = fly > 0.05 && !!at;
          if (at) {
            gh.position.copy(at);
            gh.rotation.copy(this.card.rotation);
            gh.scale.setScalar(this.card.scale.x);
          }
        });
      }
      slotMat.opacity = 0.35 + 0.65 * Math.max(0, (p - 0.7) / 0.3);
      if (p >= 1) {
        this.onBeat?.("land");
        this.card.visible = false;
        for (const gh of this.ghosts) gh.visible = false;
        this.start("celebrate");
      }
    }

    if (this.phase === "celebrate") {
      const p = Math.min(1, pt / 2.6);
      raysMat.opacity = Math.sin(Math.PI * Math.min(1, pt / 1.8)) * 0.55;
      this.slot.scale.setScalar(0.5 + Math.sin(Math.PI * Math.min(1, pt / 0.5)) * 0.9);
      if (p >= 1) {
        this.phase = "idle";
        this.onPhase?.("idle");
      }
    } else {
      this.slot.scale.set(0.5, 0.5, 1);
      raysMat.opacity = Math.max(0, raysMat.opacity - dt * 2);
    }

    // 紙吹雪: 重力・空気の抵抗・ひらひら（回転しながら落ちる）
    if (this.conf) {
      const { p, v, r, w } = this.conf;
      for (let i = 0; i < CONFETTI; i++) {
        const k = i * 3;
        v[k + 1] -= 3.2 * dt;
        const drag = Math.exp(-2.1 * dt);
        v[k] *= drag;
        v[k + 1] *= drag;
        v[k + 2] *= drag;
        v[k] += Math.sin(time * 3 + i) * 0.4 * dt; // ひらひら
        p[k] += v[k] * dt;
        p[k + 1] += v[k + 1] * dt;
        p[k + 2] += v[k + 2] * dt;
        r[k] += w[k] * dt;
        r[k + 1] += w[k + 1] * dt;
        r[k + 2] += w[k + 2] * dt;
        this.dummy.position.set(p[k], p[k + 1], p[k + 2]);
        this.dummy.rotation.set(r[k], r[k + 1], r[k + 2]);
        this.dummy.updateMatrix();
        this.confetti.setMatrixAt(i, this.dummy.matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
