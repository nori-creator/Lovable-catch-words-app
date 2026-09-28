/**
 * **AI 分析中の 3D**（①。オーナー指示 2026-09-28）。
 *
 * 撮った写真（DOM の `<img>`、この層の下に在る）の上に、写真と同じ大きさの**点の面**を
 * 3D に張る。光の帯（走査）が上から下へ通るたびに、帯の下の点が**手前へ浮き上がり**、
 * 光って、ゆっくり元の面へ沈む — LiDAR が物の形を測っているように見える。
 * そこへ小さなガラスの輪（AI のレンズ）が漂い、輪の下の点ほど強く光る。
 *
 * カメラはほぼ正面のまま、ごくゆっくり左右に回る。浮き上がった点だけが視差でずれるので、
 * 面が本当に立体になっていると分かる（写真との位置はずれない）。
 *
 * 見た目の数値（帯の幅・浮き上がり・色）は `ANALYZE_LOOK` に集めた。
 */
import { createStage, type Stage } from "./stage";

export const ANALYZE_LOOK = {
  /** 走査が画面を1回通る秒数。 */
  sweepSeconds: 2.4,
  /** 帯の厚み（画面の高さに対する割合）。 */
  band: 0.07,
  /** 帯の下で点が手前へ浮く量（3D の単位）。 */
  lift: 0.55,
  /** 点の色（帯の芯・残光）。アプリの青に寄せる。 */
  core: [0.85, 0.97, 1.0] as const,
  glow: [0.35, 0.78, 1.0] as const,
};

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSweep;     // 帯の中心（-0.5..0.5、上が +）
  uniform float uBand;
  uniform float uLift;
  uniform vec2  uLens;      // レンズの位置（面の座標、-0.5..0.5）
  uniform float uPx;        // 点の基本の大きさ（画素）
  attribute vec2 aUv;       // 面の上の位置（-0.5..0.5）
  attribute float aSeed;
  varying float vHeat;
  varying float vTwinkle;
  void main() {
    float d = aUv.y - uSweep;
    // 帯の前（下側）は鋭く、通り過ぎた後（上側）は長く尾を引く。
    float ahead = exp(-pow(max(-d, 0.0) / (uBand * 0.35), 2.0));
    float behind = exp(-max(d, 0.0) / (uBand * 2.2));
    float heat = d < 0.0 ? ahead : behind;
    float lensD = length(aUv - uLens);
    float lens = smoothstep(0.16, 0.0, lensD);
    heat = clamp(heat + lens * 0.6, 0.0, 1.0);
    vec3 p = position;
    // 浮き上がりは点ごとに少しずつ違う（物の凹凸を測っているように）。
    float bump = 0.55 + 0.45 * sin(aSeed * 43.0 + aUv.x * 9.0);
    p.z += heat * uLift * bump;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vTwinkle = 0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 30.0);
    vHeat = heat;
    gl_PointSize = uPx * (0.8 + heat * 2.8) * (10.0 / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;
  varying float vHeat;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    // 帯の外もわずかに瞬く（面がそこに在ると分かる程度）。
    float a = soft * (0.10 + 0.10 * vTwinkle + vHeat * 1.0);
    vec3 col = mix(uGlow, uCore, vHeat * vHeat);
    gl_FragColor = vec4(col * a, a);
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // 真ん中が一番明るい細い光の帯。左右の端は消える。
    float y = abs(vUv.y - 0.5) * 2.0;
    float core = exp(-y * y * 10.0) + 0.6 * exp(-y * y * 120.0);
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float a = core * edge * uOpacity;
    gl_FragColor = vec4(vec3(0.75, 0.93, 1.0) * a, a);
  }
`;
const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** canvas の上で走らせる。止める関数を返す（WebGL が無ければ `null`）。 */
export function runAnalyze3d(canvas: HTMLCanvasElement): (() => void) | null {
  const stage = createStage(canvas, { fov: 30, z: 10, environment: true });
  if (!stage) return null;
  build(stage);
  return () => stage.dispose();
}

function build(stage: Stage) {
  const { THREE, scene, camera } = stage;
  const view = stage.viewAt(0);
  // 画素 6px ごとに1点（画面の細かさによらず、同じ密度に見える）。
  const cols = Math.max(24, Math.min(90, Math.round(stage.size.w / 6)));
  const rows = Math.max(40, Math.min(170, Math.round(stage.size.h / 6)));
  const n = cols * rows;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const seed = new Float32Array(n);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 格子のままだと機械っぽいので、半マスずつ揺らす。
      const jx = (Math.random() - 0.5) * 0.8;
      const jy = (Math.random() - 0.5) * 0.8;
      const u = (c + 0.5 + jx) / cols - 0.5;
      const v = 0.5 - (r + 0.5 + jy) / rows;
      pos[k * 3] = u * view.w;
      pos[k * 3 + 1] = v * view.h;
      pos[k * 3 + 2] = 0;
      uv[k * 2] = u;
      uv[k * 2 + 1] = v;
      seed[k] = Math.random();
      k++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aUv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const dpr = stage.renderer.getPixelRatio();
  const uniforms = {
    uTime: { value: 0 },
    uSweep: { value: 0.6 },
    uBand: { value: ANALYZE_LOOK.band },
    uLift: { value: ANALYZE_LOOK.lift },
    uLens: { value: new THREE.Vector2(0, 0) },
    uPx: { value: 2.6 * dpr },
    uCore: { value: new THREE.Color(...ANALYZE_LOOK.core) },
    uGlow: { value: new THREE.Color(...ANALYZE_LOOK.glow) },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(points);

  // 走査の光の帯（面の少し手前）。
  const beamUniforms = { uOpacity: { value: 0 } };
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(view.w * 1.05, view.h * ANALYZE_LOOK.band * 1.6),
    new THREE.ShaderMaterial({
      uniforms: beamUniforms,
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.z = ANALYZE_LOOK.lift * 0.6;
  scene.add(beam);

  // AI のレンズ: 虹色に光るガラスの輪（部屋の写り込みで光る）。
  const lensR = Math.min(view.w, view.h) * 0.12;
  const lens = new THREE.Mesh(
    new THREE.TorusGeometry(lensR, lensR * 0.09, 32, 128),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.6,
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 2.2,
    }),
  );
  lens.position.z = 1.1;
  scene.add(lens);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 5, 6);
  scene.add(key);

  const baseZ = camera.position.z;
  stage.start((t: number) => {
    uniforms.uTime.value = t;
    // 走査: 上 → 下。最初の1回は少し待ってから（写真が見えてから）始める。
    const p = ((t + 0.2) % ANALYZE_LOOK.sweepSeconds) / ANALYZE_LOOK.sweepSeconds;
    const sweep = 0.62 - p * 1.24;
    uniforms.uSweep.value = sweep;
    beam.position.y = sweep * view.h;
    beamUniforms.uOpacity.value = Math.min(1, t * 2) * (0.55 + 0.45 * Math.sin(p * Math.PI));
    // レンズ: 写真の上をゆっくり探す（リサージュの道筋、同じ所を往復しない）。
    const lx = Math.sin(t * 0.53) * 0.28 + Math.sin(t * 0.21) * 0.08;
    const ly = Math.sin(t * 0.37 + 1.3) * 0.3;
    uniforms.uLens.value.set(lx, ly);
    lens.position.x = lx * view.w;
    lens.position.y = ly * view.h;
    lens.rotation.x = 0.5 + Math.sin(t * 0.7) * 0.25;
    lens.rotation.y = t * 0.6;
    const appear = Math.min(1, t * 1.6);
    lens.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - appear, 3)));
    // カメラ: ごくゆっくり左右に回る（浮いた点だけが視差でずれる）。
    camera.position.x = Math.sin(t * 0.4) * 0.35;
    camera.position.y = Math.cos(t * 0.31) * 0.2;
    camera.position.z = baseZ;
    camera.lookAt(0, 0, 0);
  });
}
