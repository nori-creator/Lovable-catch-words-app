/**
 * **手に入れた 3D の物を、指で 360 度回して眺める**（Pro 機能の表示側。R13）。
 *
 * - 横に払うと回り、離すと勢いのまま回って、空気の抵抗でゆっくり止まる（慣性）。
 *   触っていない間は、ゆっくり自分で回る（展示台のターンテーブル）。
 * - 縦に払うと少しだけ上下に傾く（真上・真下は見せない — 物の底が破綻しやすいので）。
 * - 部屋の光（環境光）で本物らしく光り、床に柔らかい影を落とす。
 * - 出てくる時は、小さく回りながら台の上に「ぽん」と置かれる。
 *
 * 形は GLB の場所から読む（窓口の AI が作った物）。無ければ見本の形（`demo`）を置く。
 */
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createStage, type Stage } from "./stage";

export type ObjectViewer = {
  dispose(): void;
};

export function createObjectViewer(
  canvas: HTMLCanvasElement,
  src: { glbUrl: string } | { demo: (stage: Stage) => THREE.Object3D },
  opts: { onReady?: () => void; background?: string } = {},
): ObjectViewer | null {
  const stage = createStage(canvas, {
    fov: 30,
    z: 6,
    alpha: !opts.background,
    background: opts.background,
    shadows: true,
    environment: true,
    tone: "neutral",
  });
  if (!stage) return null;
  const { THREE: T, scene, camera } = stage;
  camera.position.set(0, 0.9, 6);
  camera.lookAt(0, 0.35, 0);

  // 台（見えない床）: 影だけを受ける。
  const floor = new T.Mesh(new T.PlaneGeometry(12, 12), new T.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 8;
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 2;
  key.shadow.camera.bottom = -2;
  scene.add(key);
  scene.add(new T.HemisphereLight(0xffffff, 0xb8c4d6, 0.6));

  let clock = 0;
  let appearAt = -1;
  const turntable = new T.Group();
  scene.add(turntable);

  const place = (obj: THREE.Object3D) => {
    // 大きさを揃え（高さ 1.6）、底を床に着ける。
    const box = new T.Box3().setFromObject(obj);
    const size = box.getSize(new T.Vector3());
    const s = 1.6 / Math.max(size.y, size.x * 0.8, size.z * 0.8, 0.001);
    obj.scale.multiplyScalar(s);
    const b2 = new T.Box3().setFromObject(obj);
    const c = b2.getCenter(new T.Vector3());
    obj.position.x -= c.x;
    obj.position.z -= c.z;
    obj.position.y -= b2.min.y;
    obj.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    turntable.add(obj);
    appearAt = clock;
    opts.onReady?.();
  };
  if ("glbUrl" in src) {
    new GLTFLoader().load(
      src.glbUrl,
      (g: { scene: THREE.Object3D }) => place(g.scene),
      undefined,
      () => opts.onReady?.(),
    );
  } else {
    place(src.demo(stage));
  }

  // 回す: 角度と角速度（rad/s）。触っていない間はゆっくり自転。
  let yaw = -0.5;
  let yawV = 0;
  let pitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let idleSince = 0;
  const AUTO = 0.35;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
    yawV = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dt = Math.max(1, e.timeStamp - lastT) / 1000;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const w = Math.max(1, canvas.clientWidth);
    const d = (dx / w) * Math.PI * 1.6;
    yaw += d;
    yawV = yawV * 0.5 + (d / dt) * 0.5;
    pitch = Math.max(-0.35, Math.min(0.5, pitch + (dy / w) * 1.2));
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
  };
  const onUp = () => {
    dragging = false;
    idleSince = clock;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.style.touchAction = "none";

  stage.start((t: number, dt: number) => {
    clock = t;
    if (!dragging) {
      // 勢いは空気の抵抗で減る。止まって 1.2 秒したら、ゆっくり自転に戻る。
      yawV *= Math.exp(-dt * 1.8);
      const auto = t - idleSince > 1.2 ? AUTO : 0;
      yawV += (auto - yawV) * Math.min(1, dt * 0.8) * (Math.abs(yawV) < AUTO * 1.5 ? 1 : 0);
      yaw += yawV * dt;
      pitch += (0.08 - pitch) * Math.min(1, dt * 2);
    }
    turntable.rotation.y = yaw;
    turntable.rotation.x = pitch * 0.6;
    // 出てくる動き: 0.9 秒で小さく回りながら置かれる（行き過ぎは 3% まで）。
    if (appearAt >= 0) {
      const p = Math.min(1, (t - appearAt) / 0.9);
      const e = 1 - Math.pow(1 - p, 3);
      const over = Math.sin(p * Math.PI) * 0.03;
      turntable.scale.setScalar(0.4 + 0.6 * e + over);
      turntable.position.y = (1 - e) * 0.6;
    }
  });

  return {
    dispose() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      stage.dispose();
    },
  };
}

/**
 * 見本の形: タピオカミルクティー（窓口が無い試作・確認用ページで使う）。
 * 透明なカップ・ミルクティー・底のタピオカ・太いストロー・ふた。
 */
export function demoBubbleTea(stage: Stage): THREE.Object3D {
  const T = stage.THREE;
  const g = new T.Group();
  const cupProfile = [
    new T.Vector2(0.0, 0),
    new T.Vector2(0.42, 0),
    new T.Vector2(0.52, 1.5),
    new T.Vector2(0.54, 1.52),
  ];
  const cup = new T.Mesh(
    new T.LatheGeometry(cupProfile, 64),
    new T.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      transmission: 0.9,
      thickness: 0.05,
      transparent: true,
      opacity: 0.35,
      side: T.DoubleSide,
    }),
  );
  g.add(cup);
  const teaProfile = [
    new T.Vector2(0, 0.02),
    new T.Vector2(0.405, 0.02),
    new T.Vector2(0.49, 1.3),
    new T.Vector2(0, 1.3),
  ];
  const tea = new T.Mesh(
    new T.LatheGeometry(teaProfile, 64),
    new T.MeshStandardMaterial({ color: 0xc8976a, roughness: 0.45 }),
  );
  g.add(tea);
  const pearlGeo = new T.SphereGeometry(0.075, 20, 14);
  const pearlMat = new T.MeshPhysicalMaterial({
    color: 0x2a160c,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const pearls = new T.InstancedMesh(pearlGeo, pearlMat, 46);
  const m = new T.Matrix4();
  let k = 0;
  for (let layer = 0; layer < 3; layer++) {
    const n = [20, 16, 10][layer];
    for (let i = 0; i < n && k < 46; i++, k++) {
      const a = (i / n) * Math.PI * 2 + layer * 0.3;
      const r = [0.3, 0.2, 0.1][layer] + Math.random() * 0.05;
      m.makeTranslation(Math.cos(a) * r, 0.1 + layer * 0.13, Math.sin(a) * r);
      pearls.setMatrixAt(k, m);
    }
  }
  g.add(pearls);
  const lid = new T.Mesh(
    new T.CylinderGeometry(0.56, 0.56, 0.04, 64),
    new T.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.1,
      transparent: true,
      opacity: 0.55,
    }),
  );
  lid.position.y = 1.54;
  g.add(lid);
  const straw = new T.Mesh(
    new T.CylinderGeometry(0.055, 0.055, 1.6, 24),
    new T.MeshStandardMaterial({ color: 0x0a84ff, roughness: 0.3 }),
  );
  straw.position.set(0.12, 1.45, 0);
  straw.rotation.z = -0.12;
  g.add(straw);
  return g;
}
