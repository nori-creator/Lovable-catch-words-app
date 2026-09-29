/**
 * **three.js の舞台（共通）**（オーナー指示 2026-09-28「①AIの分析中のアニメーション
 * ②キャッチ、祝福のアニメーション③本棚の本と本を開いたあとのページ④図鑑のスライド…
 * Blenderやthree.jsなど最新の3Dモデルを使用し、リアルで現実的なアニメーションを実装して」）。
 *
 * 3D の演出はどれも「canvas を1枚置く → 光と写り込み（部屋の環境光）を用意 → 毎フレーム
 * 動かす → 終わったら全部捨てる」の同じ形なので、ここに1つだけ書く。
 *
 * - 画素の細かさは 2 倍まで（3 倍の iPhone でも 2 倍で描く — 見分けが付かず、重さは半分）。
 * - 画面が裏に回ったら止める（電池を食わない）。
 * - `dispose()` で GPU の物（形・材質・絵・描画器）を全部返す。演出は何度も開くので、
 *   返さないと数回で iPhone の WebGL が落ちる。
 * - WebGL が使えない端末では `null` を返す（呼ぶ側は今まで通りの 2D の演出にする）。
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type StageFrame = (t: number, dt: number) => void;

export type Stage = {
  THREE: typeof THREE;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 画面の大きさ（CSS の px）。 */
  size: { w: number; h: number };
  /** z=0 の面で、画面いっぱいになる幅と高さ（3D の単位）。 */
  viewAt(z: number): { w: number; h: number };
  start(frame: StageFrame): void;
  dispose(): void;
};

export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createStage(
  canvas: HTMLCanvasElement,
  opts: {
    fov?: number;
    z?: number;
    alpha?: boolean;
    /** 部屋の写り込み（紙・金属・ガラスが本物らしく光る）。 */
    environment?: boolean;
    shadows?: boolean;
    background?: string;
    /** 色の出し方。紙吹雪など鮮やかさが要る物は "neutral"（AgX は色が沈む）。 */
    tone?: "agx" | "neutral";
  } = {},
): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: opts.alpha ?? true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = opts.tone === "agx" ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  if (opts.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const scene = new THREE.Scene();
  if (opts.background) scene.background = new THREE.Color(opts.background);
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, 1, 0.1, 100);
  camera.position.set(0, 0, opts.z ?? 10);
  let envTex: THREE.Texture | null = null;
  if (opts.environment !== false) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
  }

  const size = { w: 1, h: 1 };
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === size.w && h === size.h) return;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);

  let raf = 0;
  let last = 0;
  let t = 0;
  let frame: StageFrame | null = null;
  let disposed = false;
  const tick = (now: number) => {
    raf = 0;
    if (disposed || !frame) return;
    // 裏に回っていた間の時間は飛ばす（戻った瞬間に全部が一度に動かない）。
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    frame(t, dt);
    // 演出が自分で終わって片付けた（frame の中で dispose された）なら描かない。
    if (disposed) return;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    } else if (!raf && frame && !disposed) {
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    THREE,
    renderer,
    scene,
    camera,
    size,
    viewAt(z: number) {
      const dist = camera.position.z - z;
      const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
      return { w: h * camera.aspect, h };
    },
    start(f: StageFrame) {
      frame = f;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          for (const v of Object.values(mat)) {
            if (v && typeof v === "object" && "isTexture" in v) (v as THREE.Texture).dispose();
          }
          mat.dispose();
        }
      });
      envTex?.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
