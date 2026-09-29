/**
 * **図鑑の 3D 展示室**（④。オーナー指示 2026-09-28「図鑑のスライド…three.js など最新の
 * 3Dモデルを使用し、リアルで現実的なアニメーション」、R11「図鑑スライドを3D空間の中央で
 * 鑑賞する形に（白っぽい背景）」）。
 *
 * 白い展示室の床の上に、白い額に入った写真が並ぶ。真ん中の1枚だけ天井のスポットライトが
 * 当たり、床に柔らかい光の輪と影が落ちる。左右の作品は浅く向きを変えて奥へ下がり、
 * 少し暗くなる（美術館で1点を鑑賞している見え方）。
 *
 * 送りは DOM のカバーフローと同じ `offset`（何枚目が真ん中か、小数で連続）で受ける。
 * 指の追従・ばね・勢いの見込みは呼ぶ側（React）が持ち、ここは「offset の時の姿」を
 * 毎フレーム描くだけ。額の姿勢もばね（小さな遅れ）で追うので、速く送っても
 * 作品が紙のようにぱたぱた返らず、重さのある物として回る。
 */
import type * as THREE from "three";
import { createStage, type Stage } from "./stage";

export type GalleryItem = {
  id: string;
  /** 写真（無い語は null — 文字だけの札を描く）。 */
  image: string | null;
  word: string;
  gloss?: string;
};

export type Gallery3D = {
  setOffset(offset: number): void;
  /** 画面の点（CSS px）が当たった作品の番号。 */
  pick(x: number, y: number): number | null;
  dispose(): void;
};

const FRAME_W = 1.0;
const FRAME_H = 1.28;
const FRAME_D = 0.06;
const SPACING = 0.92;

/** offset からの距離 rel のときの、作品の置き場所と向き。 */
export function galleryPose3d(rel: number): {
  x: number;
  z: number;
  ry: number;
  lift: number;
  light: number;
} {
  const a = Math.abs(rel);
  const near = Math.min(1, a);
  const far = Math.max(0, a - 1);
  const s = Math.sign(rel);
  return {
    // 真ん中の隣までは広く、その先は詰める（壁ぞいに並んだ作品）。
    x: s * (near * SPACING * 0.86 + far * SPACING * 0.5),
    z: -near * 0.95 - far * 0.45,
    // 真ん中に向かって浅く向く（最大 38°）。
    ry: -s * near * 0.66,
    // 真ん中の1枚だけ少し持ち上がる。
    lift: (1 - near) * 0.06,
    light: 1 - Math.min(1, a * 0.55),
  };
}

export function createGallery3d(
  canvas: HTMLCanvasElement,
  items: GalleryItem[],
  opts: { onReady?: () => void } = {},
): Gallery3D | null {
  const stage = createStage(canvas, {
    fov: 32,
    z: 5.8,
    alpha: false,
    background: "#f5f3ef",
    shadows: false,
    environment: true,
  });
  if (!stage) return null;
  return build(stage, items, opts);
}

function build(stage: Stage, items: GalleryItem[], opts: { onReady?: () => void }): Gallery3D {
  const { THREE, scene, camera, renderer } = stage;
  scene.fog = new THREE.Fog(0xf5f3ef, 6.5, 12);
  if (scene.environment) scene.environmentIntensity = 0.55;
  camera.position.set(0, 0.34, 5.8);
  camera.lookAt(0, 0.02, -0.4);

  // 床: 明るい石膏の床。影と光の輪だけを受ける。
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0xeceae5, roughness: 0.92 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -FRAME_H / 2 - 0.34;
  // 床に落ちる作品の影は出さない（オーナー指示 2026-09-28 R14「図鑑の3Dは下の影を消して」）。
  // スポットライトの光の輪だけが床に残る。
  scene.add(floor);
  // 奥の壁（霧で溶ける）。
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 12),
    new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 1 }),
  );
  wall.position.set(0, 2, -3.2);
  wall.receiveShadow = true;
  scene.add(wall);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.25));
  // 天井のスポットライト: 真ん中の作品と、その前の床に光の輪を落とす。
  const spot = new THREE.SpotLight(0xfff4e6, 38, 12, 0.36, 0.75, 1.6);
  spot.position.set(0.4, 3.6, 2.2);
  spot.target.position.set(0, -0.2, 0);
  spot.castShadow = false;
  scene.add(spot, spot.target);

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.5 });
  const frameGeo = new THREE.BoxGeometry(FRAME_W, FRAME_H, FRAME_D);
  const photoSize = FRAME_W * 0.8;
  const photoGeo = new THREE.PlaneGeometry(photoSize, photoSize);
  const labelGeo = new THREE.PlaneGeometry(FRAME_W * 0.84, FRAME_W * 0.84 * 0.28);

  type Piece = {
    group: THREE.Group;
    mats: THREE.MeshStandardMaterial[];
    pose: { x: number; z: number; ry: number; lift: number; light: number };
    vel: { x: number; z: number; ry: number; lift: number; light: number };
    box: THREE.Mesh;
  };
  let pending = items.length;
  const settle = () => {
    pending--;
    if (pending <= 0) opts.onReady?.();
  };
  if (!items.length) opts.onReady?.();
  const pieces: Piece[] = items.map((it, i) => {
    const group = new THREE.Group();
    const box = new THREE.Mesh(frameGeo, frameMat);
    box.userData.index = i;
    group.add(box);
    const photoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38 });
    const photo = new THREE.Mesh(photoGeo, photoMat);
    photo.position.set(0, FRAME_H / 2 - photoSize / 2 - FRAME_W * 0.1, FRAME_D / 2 + 0.001);
    group.add(photo);
    if (it.image) {
      loader.load(
        it.image,
        (tex: THREE.Texture) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          coverFit(tex);
          photoMat.map = tex;
          photoMat.needsUpdate = true;
          settle();
        },
        undefined,
        () => {
          photoMat.map = textTexture(THREE, it.word);
          photoMat.needsUpdate = true;
          settle();
        },
      );
    } else {
      photoMat.map = textTexture(THREE, it.word);
      settle();
    }
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTexture(THREE, it.word, it.gloss),
      roughness: 0.8,
      transparent: true,
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, -FRAME_H / 2 + FRAME_W * 0.84 * 0.28 * 0.5 + 0.04, FRAME_D / 2 + 0.001);
    group.add(label);
    scene.add(group);
    const pose = galleryPose3d(i);
    return {
      group,
      mats: [photoMat, labelMat],
      pose: { ...pose },
      vel: { x: 0, z: 0, ry: 0, lift: 0, light: 0 },
      box,
    };
  });

  function coverFit(tex: THREE.Texture) {
    const img = tex.image as { width?: number; height?: number } | undefined;
    const w = img?.width ?? 1;
    const h = img?.height ?? 1;
    const r = w / h;
    if (r > 1) {
      tex.repeat.set(1 / r, 1);
      tex.offset.set((1 - 1 / r) / 2, 0);
    } else {
      tex.repeat.set(1, r);
      tex.offset.set(0, (1 - r) / 2);
    }
  }

  let offset = 0;
  const K = 260; // ばねの硬さ（姿勢が offset を追う速さ）
  const C = 2 * Math.sqrt(K) * 0.92; // ほぼ臨界減衰（行き過ぎはごくわずか）
  stage.start((_t: number, dt: number) => {
    for (let i = 0; i < pieces.length; i++) {
      const pc = pieces[i];
      const rel = i - offset;
      // 見えない遠くの作品は描かない（何百枚でも重くならない）。
      pc.group.visible = Math.abs(rel) < 5;
      if (!pc.group.visible) {
        Object.assign(pc.pose, galleryPose3d(rel));
        continue;
      }
      const goal = galleryPose3d(rel);
      for (const k of ["x", "z", "ry", "lift", "light"] as const) {
        const a = K * (goal[k] - pc.pose[k]) - C * pc.vel[k];
        pc.vel[k] += a * dt;
        pc.pose[k] += pc.vel[k] * dt;
      }
      pc.group.position.set(pc.pose.x, pc.pose.lift, pc.pose.z);
      pc.group.rotation.y = pc.pose.ry;
      const l = 0.55 + 0.45 * pc.pose.light;
      for (const m of pc.mats) m.color.setScalar(l);
    }
    // スポットライトは真ん中の作品の位置を追う（送りの途中は2枚の間を滑る）。
    const center = Math.round(offset);
    const pc = pieces[Math.max(0, Math.min(pieces.length - 1, center))];
    if (pc) {
      spot.target.position.x += (pc.pose.x - spot.target.position.x) * Math.min(1, dt * 10);
      spot.position.x = spot.target.position.x + 0.4;
    }
  });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  return {
    setOffset(o: number) {
      offset = o;
    },
    pick(x: number, y: number) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(
        pieces.filter((p) => p.group.visible).map((p) => p.box),
        false,
      )[0];
      return hit ? (hit.object.userData.index as number) : null;
    },
    dispose() {
      frameGeo.dispose();
      photoGeo.dispose();
      labelGeo.dispose();
      stage.dispose();
    },
  };
}

function textTexture(THREE: Stage["THREE"], word: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#f7f5f1";
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#1d1d1f";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const size = Math.min(180, Math.floor(420 / Math.max(1, [...word].length)));
    g.font = `600 ${size}px "PingFang TC","Noto Sans TC",system-ui,sans-serif`;
    g.fillText(word, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(THREE: Stage["THREE"], word: string, gloss?: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 144;
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, 512, 144);
    g.textAlign = "center";
    g.fillStyle = "#1d1d1f";
    g.font = `600 58px "PingFang TC","Noto Sans TC",system-ui,sans-serif`;
    g.textBaseline = "alphabetic";
    g.fillText(word, 256, gloss ? 70 : 92);
    if (gloss) {
      g.fillStyle = "#6e6e73";
      g.font = `400 34px system-ui,sans-serif`;
      g.fillText(gloss, 256, 122);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
