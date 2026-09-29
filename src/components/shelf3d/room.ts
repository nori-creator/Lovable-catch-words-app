/**
 * **ホームの上の本棚の「部屋」**（オーナー指示 2026-09-29 R17「本棚が小さすぎる。また空中に
 * 本棚がただあるデザイン不自然。Blender や three.js などで 3D のリアルな本棚をアプリの上部に
 * 設置して」＋参考画像 A〜D）。
 *
 *  - A 自然光・旅の雰囲気 … 明るい昼の光。垂れる観葉植物・地球儀・自分の写真の写真立て
 *  - B 暖かい部屋 … 棚の上から暖色のスポット 2 灯。陶器の猫・植物
 *  - C シンプル・ミニマル … 柔らかい白い光。キャンドル・写真立て
 *  - D 窓と景色 … 右の窓からの昼の光。ガラスの玉・植物
 *
 * 部屋の壁・窓・空は画面側（CSS、`.home-shelf--room-*`）が描き、ここは**光と、棚の上・中に
 * 置く物**だけを three.js で作る（形はすべてここで組む。重い模型を読まない）。壁には影だけを
 * 落とす（`ShadowMaterial`）ので、CSS の部屋に 3D の棚が本当に置いてあるように見える。
 */
import * as THREE from "three";

export const ROOM_IDS = ["a", "b", "c", "d"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

/** 棚の寸法（置く場所を決めるのに使う）。単位はメートル、y＝高さ、z＝手前。 */
export type ShelfArea = {
  /** 棚の外形。 */
  box: THREE.Box3;
  /** 棚の中の床（下の板の上面）と天井（上の板の下面）の高さ。 */
  floorY: number;
  ceilY: number;
  /** 棚の中の左右の内側の端。 */
  innerL: number;
  innerR: number;
  /** 本の並びの右端（ここから右が空き）。 */
  booksEnd: number;
  /** 中に置く物の奥行きの中心。 */
  midZ: number;
  /** 写真立てに貼る写真（本人の写真。無ければ無地）。 */
  photo: HTMLImageElement | null;
};

/** 部屋ごとの光。 */
export function addRoomLights(scene: THREE.Scene, room: RoomId): THREE.Light[] {
  const lights: THREE.Light[] = [];
  const shadowed = (l: THREE.DirectionalLight | THREE.SpotLight, size = 2048) => {
    l.castShadow = true;
    l.shadow.mapSize.set(size, size);
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.0015;
    l.shadow.radius = 5;
    return l;
  };
  if (room === "a") {
    lights.push(new THREE.HemisphereLight("#eaf4ff", "#e6d8c4", 0.7));
    const sun = shadowed(new THREE.DirectionalLight("#fff4e2", 2.3));
    sun.position.set(-0.8, 1.3, 1.1);
    sun.target.position.set(0, 0.1, 0);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -0.5;
    cam.right = cam.top = 0.5;
    cam.near = 0.5;
    cam.far = 3.5;
    lights.push(sun, sun.target as unknown as THREE.Light);
  } else if (room === "b") {
    lights.push(new THREE.HemisphereLight("#ffd8ad", "#2a1a10", 0.28));
    for (const x of [-0.13, 0.13]) {
      const spot = shadowed(
        new THREE.SpotLight("#ffc98a", 5.5, 1.2, Math.PI / 4.2, 0.75, 1.4),
        1024,
      );
      spot.position.set(x, 0.3, 0.07);
      spot.target.position.set(x * 0.8, 0, 0.04);
      spot.shadow.camera.near = 0.05;
      spot.shadow.camera.far = 1.2;
      lights.push(spot, spot.target as unknown as THREE.Light);
    }
    const fill = new THREE.DirectionalLight("#ffe2c0", 0.55);
    fill.position.set(0.3, 0.4, 1.2);
    lights.push(fill);
  } else if (room === "c") {
    lights.push(new THREE.HemisphereLight("#fffaf2", "#e9dfd2", 0.95));
    const key = shadowed(new THREE.DirectionalLight("#ffffff", 1.25));
    key.position.set(0.2, 1.6, 1.0);
    key.target.position.set(0, 0.1, 0);
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -0.5;
    cam.right = cam.top = 0.5;
    lights.push(key, key.target as unknown as THREE.Light);
  } else {
    lights.push(new THREE.HemisphereLight("#e3efff", "#dccfbd", 0.65));
    const win = shadowed(new THREE.DirectionalLight("#fffaf0", 2.1));
    win.position.set(1.2, 1.0, 0.9);
    win.target.position.set(0, 0.1, 0);
    const cam = win.shadow.camera;
    cam.left = cam.bottom = -0.5;
    cam.right = cam.top = 0.5;
    cam.near = 0.5;
    cam.far = 3.5;
    lights.push(win, win.target as unknown as THREE.Light);
  }
  for (const l of lights) scene.add(l);
  return lights;
}

/** 棚の上・中に置く物（部屋ごと）。返す group は影を落とし・受ける。 */
/** 部屋ごとの棚の木（C は白い塗装の棚、B は濃い胡桃）。null はそのままの木目。 */
export function shelfFinish(room: RoomId): { color: string; paint: boolean } | null {
  if (room === "b") return { color: "#a27652", paint: false };
  if (room === "c") return { color: "#f4f0e9", paint: true };
  return null;
}

export function buildDecor(room: RoomId, a: ShelfArea): THREE.Group {
  const g = new THREE.Group();
  const size = a.box.getSize(new THREE.Vector3());
  const top = a.box.max.y;
  const free = a.innerR - a.booksEnd;
  const slot = (k: number) => a.booksEnd + free * k; // 空きの中の位置（0〜1）
  const back = a.box.min.z;

  if (room === "a") {
    // 左上から垂れる観葉植物、空きに地球儀、右下の手前に写真立て。
    g.add(
      at(
        makePlant({
          vines: 6,
          drop: size.y * 1.05,
          pot: "white",
          front: a.box.max.z - back - 0.048,
        }),
        a.box.min.x + 0.018,
        top,
        back + 0.06,
      ),
    );
    if (free > 0.07) g.add(at(makeGlobe(), slot(0.55), a.floorY, a.midZ));
    g.add(
      at(
        makeFrame(a.photo, 0.075, 0.095, -0.14),
        a.box.max.x - 0.06,
        a.box.min.y - 0.004,
        a.box.max.z + 0.012,
      ),
    );
  } else if (room === "b") {
    // 暖かい部屋: 棚の天井に小さな照明 2 つ（光る面）、空きに陶器の猫、右上に植物。
    for (const x of [-0.13, 0.13]) {
      const puck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.004, 24),
        new THREE.MeshStandardMaterial({
          color: "#2b2118",
          emissive: "#ffd79e",
          emissiveIntensity: 2.4,
        }),
      );
      puck.position.set(x, a.ceilY - 0.002, 0.07);
      g.add(puck);
    }
    if (free > 0.06) g.add(at(makeCat(), slot(0.5), a.floorY, a.midZ + 0.02));
    g.add(
      at(
        makePlant({
          vines: 5,
          drop: size.y * 0.9,
          pot: "terracotta",
          front: a.box.max.z - back - 0.048,
        }),
        a.box.min.x + 0.018,
        top,
        back + 0.06,
      ),
    );
  } else if (room === "c") {
    // ミニマル: 空きにキャンドル 2 本、棚の上に写真立て（壁に立て掛け）。
    if (free > 0.05) {
      g.add(at(makeCandle(0.055), slot(0.38), a.floorY, a.midZ));
      g.add(at(makeCandle(0.036), slot(0.72), a.floorY, a.midZ + 0.02));
    }
    g.add(at(makeFrame(a.photo, 0.07, 0.088, -0.12), a.box.min.x + 0.07, top, back + 0.03));
  } else {
    // 窓と景色: 空きにガラスの玉、左上に植物。
    if (free > 0.06) g.add(at(makeOrb(), slot(0.5), a.floorY, a.midZ));
    g.add(
      at(
        makePlant({
          vines: 4,
          drop: size.y * 0.8,
          pot: "white",
          front: a.box.max.z - back - 0.048,
        }),
        a.box.min.x + 0.018,
        top,
        back + 0.06,
      ),
    );
  }
  g.traverse((o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return g;
}

/** 壁に影だけを落とす面（壁の絵は CSS）。 */
export function shadowWall(z: number, room: RoomId): THREE.Mesh {
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShadowMaterial({ opacity: room === "b" ? 0.42 : room === "c" ? 0.16 : 0.22 }),
  );
  wall.position.set(0, 0.2, z);
  wall.receiveShadow = true;
  return wall;
}

// ---- 形 --------------------------------------------------------------------------------

function at(o: THREE.Object3D, x: number, y: number, z: number) {
  o.position.set(x, y, z);
  return o;
}

/** 決まった順の乱数（毎回同じ形になる）。 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** ハート形の葉（ポトス）。 */
function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.55, 0.15, -0.62, 0.72, 0, 1);
  s.bezierCurveTo(0.62, 0.72, 0.55, 0.15, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  // 葉は少し反る（中心の筋から両側へ下がる）
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, -Math.abs(x) * 0.35 + Math.sin(y * Math.PI) * 0.08);
  }
  geo.computeVertexNormals();
  return geo;
}

function makePlant(o: {
  vines: number;
  drop: number;
  pot: "white" | "terracotta";
  /** 鉢から棚の前の縁までの奥行き（蔓が縁を越えて前に垂れる所）。 */
  front: number;
}) {
  const g = new THREE.Group();
  const r = rng(o.vines * 97 + (o.pot === "white" ? 3 : 7));
  // 鉢（ろくろで挽いた形）
  const prof = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.022, 0),
    new THREE.Vector2(0.026, 0.004),
    new THREE.Vector2(0.03, 0.04),
    new THREE.Vector2(0.033, 0.044),
    new THREE.Vector2(0.031, 0.046),
    new THREE.Vector2(0.027, 0.042),
    new THREE.Vector2(0.0, 0.04),
  ];
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 40),
    o.pot === "white"
      ? new THREE.MeshPhysicalMaterial({ color: "#f4f1ea", roughness: 0.35, clearcoat: 0.6 })
      : new THREE.MeshStandardMaterial({ color: "#b8643e", roughness: 0.85 }),
  );
  g.add(pot);
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.027, 24),
    new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.04;
  g.add(soil);
  const leafGeo = leafGeometry();
  const greens = ["#3f7d3a", "#4c8c3f", "#5c9a45", "#356b33", "#6aa653"];
  const stemMat = new THREE.MeshStandardMaterial({ color: "#5b7d3a", roughness: 0.8 });
  // 上に立つ葉（鉢の上の茂み）
  for (let i = 0; i < 16; i++) {
    const leaf = new THREE.Mesh(
      leafGeo,
      new THREE.MeshStandardMaterial({
        color: greens[i % greens.length],
        roughness: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    const a = (i / 16) * Math.PI * 2 + r() * 0.5;
    const sc = 0.026 + r() * 0.012;
    leaf.scale.setScalar(sc);
    leaf.position.set(Math.cos(a) * 0.016, 0.045 + r() * 0.018, Math.sin(a) * 0.016);
    leaf.rotation.set(-0.9 + r() * 0.5, a + Math.PI / 2, (r() - 0.5) * 0.6);
    g.add(leaf);
  }
  // 垂れる蔓（手前と左右へ流れて、棚の横を下りる）
  for (let v = 0; v < o.vines; v++) {
    // 蔓は鉢の縁から**手前へ出て**棚の前の縁を越え、棚の前を垂れる（奥へ垂らすと棚の天板に
    // 隠れて見えない）。左右へ少しずつ散らす。
    // 左へ寄せて、棚の左の側板の前と外を垂れる（本の背を隠さない）。
    const spread = -(v / Math.max(1, o.vines - 1)) * 0.06 - 0.012 + (r() - 0.5) * 0.012;
    const len = o.drop * (0.45 + r() * 0.55);
    const pts = [
      new THREE.Vector3(spread * 0.2, 0.04, 0.012),
      new THREE.Vector3(spread * 0.6, 0.03, 0.07),
      new THREE.Vector3(spread, -0.004, o.front),
      new THREE.Vector3(spread * 1.2, -len * 0.5, o.front + 0.012 + r() * 0.01),
      new THREE.Vector3(spread * 1.3 + (r() - 0.5) * 0.02, -len, o.front + 0.018 + r() * 0.012),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0012, 5, false), stemMat));
    const n = Math.round(len / 0.016);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const leaf = new THREE.Mesh(
        leafGeo,
        new THREE.MeshStandardMaterial({
          color: greens[(k + v) % greens.length],
          roughness: 0.55,
          side: THREE.DoubleSide,
        }),
      );
      const sc = 0.022 + r() * 0.01 - t * 0.005;
      leaf.scale.setScalar(sc);
      leaf.position.copy(p);
      const side = k % 2 ? 1 : -1;
      // 葉は蔓から左右へ、下を向いて手前に開く
      leaf.rotation.set(
        -2.3 + r() * 0.5,
        side * (0.9 + r() * 0.4) + Math.atan2(tan.x, tan.z) * 0.2,
        side * 0.4,
      );
      g.add(leaf);
    }
  }
  return g;
}

/** 地球儀（木の台・真鍮の子午線・傾いた軸）。 */
function makeGlobe() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.008, 32),
    new THREE.MeshPhysicalMaterial({ color: "#6b4426", roughness: 0.45, clearcoat: 0.5 }),
  );
  base.position.y = 0.004;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0025, 0.004, 0.022, 12),
    new THREE.MeshStandardMaterial({ color: "#b08d57", metalness: 1, roughness: 0.35 }),
  );
  neck.position.y = 0.019;
  const R = 0.032;
  const tilt = new THREE.Group();
  tilt.position.y = 0.03 + R;
  tilt.rotation.z = -0.41; // 地軸 23.4°
  const map = new THREE.CanvasTexture(paintGlobe());
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 32),
    new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.4,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    }),
  );
  ball.rotation.y = 2.2;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.004, 0.0013, 8, 64, Math.PI * 1.25),
    new THREE.MeshStandardMaterial({ color: "#b08d57", metalness: 1, roughness: 0.3 }),
  );
  ring.rotation.set(0, Math.PI / 2, -Math.PI * 0.62);
  tilt.add(ball, ring);
  g.add(base, neck, tilt);
  return g;
}

function paintGlobe(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const x = c.getContext("2d")!;
  const sea = x.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, "#9cc5d8");
  sea.addColorStop(0.5, "#5f9dbf");
  sea.addColorStop(1, "#9cc5d8");
  x.fillStyle = sea;
  x.fillRect(0, 0, 1024, 512);
  // 大陸（経度・緯度の大まかな塊）。古い地球儀の色（黄土・薄緑・桃）。
  const land: Array<[number, number, number, number, string]> = [
    [-100, 48, 30, 18, "#d9c48c"],
    [-85, 30, 14, 10, "#d9c48c"],
    [-110, 62, 26, 10, "#cdd6a0"],
    [-60, -12, 14, 20, "#e2b89a"],
    [-65, -35, 8, 12, "#e2b89a"],
    [15, 50, 18, 10, "#cdd6a0"],
    [20, 8, 20, 22, "#e4cf94"],
    [30, -18, 12, 12, "#e4cf94"],
    [90, 48, 42, 16, "#d6c7a6"],
    [80, 22, 12, 10, "#e2b89a"],
    [105, 30, 16, 12, "#cdd6a0"],
    [135, -25, 16, 9, "#e4cf94"],
    [-40, 72, 10, 7, "#f2f2ee"],
    [0, -82, 180, 7, "#f2f2ee"],
  ];
  const r = rng(11);
  for (const [lon, lat, w, h, col] of land) {
    x.fillStyle = col;
    for (let k = 0; k < 14; k++) {
      const cx = ((lon + 180) / 360) * 1024 + (r() - 0.5) * w * 2.2;
      const cy = ((90 - lat) / 180) * 512 + (r() - 0.5) * h * 2.2;
      x.beginPath();
      x.ellipse(cx, cy, w * (0.6 + r() * 0.8), h * (0.6 + r() * 0.8), r() * 3, 0, Math.PI * 2);
      x.fill();
    }
  }
  // 経線・緯線
  x.strokeStyle = "rgba(60,70,80,0.25)";
  x.lineWidth = 1.2;
  for (let lo = 0; lo <= 1024; lo += 1024 / 12) {
    x.beginPath();
    x.moveTo(lo, 0);
    x.lineTo(lo, 512);
    x.stroke();
  }
  for (let la = 0; la <= 512; la += 512 / 6) {
    x.beginPath();
    x.moveTo(0, la);
    x.lineTo(1024, la);
    x.stroke();
  }
  return c;
}

/** 写真立て（木の枠・白い台紙・本人の写真。後ろへ少し倒して立て掛ける）。 */
function makeFrame(photo: HTMLImageElement | null, w: number, h: number, lean: number) {
  const g = new THREE.Group();
  const d = 0.008;
  const border = 0.007;
  const wood = new THREE.MeshPhysicalMaterial({ color: "#8a6a4a", roughness: 0.5, clearcoat: 0.4 });
  const bar = (bw: number, bh: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), wood);
    m.position.set(x, y, 0);
    return m;
  };
  g.add(
    bar(w, border, 0, h / 2 - border / 2),
    bar(w, border, 0, -h / 2 + border / 2),
    bar(border, h, -w / 2 + border / 2, 0),
    bar(border, h, w / 2 - border / 2, 0),
  );
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(w - border * 2, h - border * 2),
    new THREE.MeshStandardMaterial({ color: "#f7f4ee", roughness: 0.9 }),
  );
  mat.position.z = -0.001;
  g.add(mat);
  const pw = w - border * 2 - 0.008;
  const ph = h - border * 2 - 0.008;
  let pic: THREE.Material = new THREE.MeshStandardMaterial({ color: "#c9d6e2", roughness: 0.6 });
  if (photo) {
    const t = new THREE.Texture(photo);
    t.colorSpace = THREE.SRGBColorSpace;
    // 写真を枠の縦横に合わせて切り抜く（伸ばさない）
    const ar = photo.naturalWidth / Math.max(1, photo.naturalHeight);
    const want = pw / ph;
    if (ar > want) {
      t.repeat.set(want / ar, 1);
      t.offset.set((1 - want / ar) / 2, 0);
    } else {
      t.repeat.set(1, ar / want);
      t.offset.set(0, (1 - ar / want) / 2);
    }
    t.needsUpdate = true;
    pic = new THREE.MeshPhysicalMaterial({
      map: t,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    });
  }
  const img = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), pic);
  img.position.z = 0.0005;
  g.add(img);
  // 下端を支点に後ろへ倒す
  const pivot = new THREE.Group();
  g.position.y = h / 2;
  pivot.add(g);
  pivot.rotation.x = lean;
  return pivot;
}

/** 陶器の白い猫（丸まって眠る）。 */
function makeCat() {
  const g = new THREE.Group();
  const glaze = new THREE.MeshPhysicalMaterial({
    color: "#f7f5f0",
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), glaze);
  body.scale.set(0.034, 0.018, 0.024);
  body.position.y = 0.017;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 32, 20), glaze);
  head.scale.set(1.1, 0.9, 1);
  head.position.set(-0.03, 0.017, 0.012);
  const ear = (x: number) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.009, 12), glaze);
    e.position.set(-0.03 + x, 0.03, 0.01);
    e.rotation.z = x * 20;
    return e;
  };
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 10, 32, Math.PI * 0.9), glaze);
  tail.rotation.set(Math.PI / 2, 0, Math.PI * 0.55);
  tail.position.set(0.004, 0.005, 0.004);
  // 閉じた目（細い線）
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#6b625a", roughness: 0.6 });
  const eye = (x: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.0022, 0.0004, 4, 12, Math.PI), eyeMat);
    m.position.set(-0.034 + x, 0.018, 0.0245);
    m.rotation.z = Math.PI;
    return m;
  };
  g.add(body, head, ear(-0.006), ear(0.006), tail, eye(-0.004), eye(0.004));
  g.rotation.y = -0.25;
  return g;
}

/** 白いキャンドル（小さな炎と、周りを照らす暖かい光）。 */
function makeCandle(h: number) {
  const g = new THREE.Group();
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.013, h, 32),
    new THREE.MeshPhysicalMaterial({ color: "#f6efe2", roughness: 0.55, sheen: 0.4 }),
  );
  wax.position.y = h / 2;
  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0006, 0.0006, 0.005, 6),
    new THREE.MeshStandardMaterial({ color: "#2a211a" }),
  );
  wick.position.y = h + 0.0025;
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: "#ffd27a" }),
  );
  flame.scale.set(0.0028, 0.0065, 0.0028);
  flame.position.y = h + 0.009;
  flame.castShadow = false;
  const glow = new THREE.PointLight("#ffb866", 0.025, 0.2, 2);
  glow.position.y = h + 0.012;
  g.add(wax, wick, flame, glow);
  return g;
}

/** ガラスの玉（木の台に載る。向こうが屈折して見える）。 */
function makeOrb() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.022, 0.01, 32),
    new THREE.MeshPhysicalMaterial({ color: "#7a5636", roughness: 0.45, clearcoat: 0.4 }),
  );
  base.position.y = 0.005;
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 48, 32),
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.03,
      transmission: 1,
      thickness: 0.03,
      ior: 1.45,
      clearcoat: 1,
      attenuationColor: new THREE.Color("#dfeff7"),
      attenuationDistance: 0.2,
    }),
  );
  orb.position.y = 0.01 + 0.03;
  g.add(base, orb);
  return g;
}
