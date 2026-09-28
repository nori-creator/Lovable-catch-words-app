/**
 * **本物の本棚（3D）**の中身。three.js で描く。
 *
 *  - 形は Blender で作った本と棚（`public/models/*.glb`、作り方は
 *    `scripts/blender/book_and_shelf.py`）。木目も Blender で焼いた画像。
 *  - 光は「部屋の光」（周りの映り込み）＋スポットライト1灯（柔らかい影）。
 *  - 表面は布の織り目・箔押し・空押しの枠・写真・小口の縞（`textures.ts`）。
 *
 * 動きはすべて**ばね**（Apple の Designing Fluid Interfaces と同じ考え）:
 *  - 本を押す → 棚から少し引き出し → 手元へ弧を描いて寄る
 *  - 表紙は**硬い板**として蝶番で回る（曲がらない。重さで少しだけ揺れて止まる）
 *  - 中の紙は**柔らかい**: 指で端をつまんだ所が先に上がり、紙が弧を描いてめくれる。
 *    指に 1:1 で付いてきて、離すと速さを引き継いで最後まで行く（または戻る）。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  paintAlbumDay,
  paintBlank,
  paintCover,
  paintDiary,
  paintEndpaper,
  paintPage,
  paintPageEdge,
  paintPlaster,
  paintSpine,
  paintTitlePage,
  type Canvas,
  type DaySpread,
  type Painted,
} from "./textures";
import type { DiaryFontId } from "@/lib/diary-fonts";

// Blender の寸法（book_and_shelf.py と同じ値）。three.js では y が高さ、z が手前。
const H = 0.21;
const W = 0.148;
const T = 0.04;
const BOARD = 0.0025;
const JOINT = 0.006;
const ROW_H = 0.26 + 0.018; // 1段の内寸＋板
const LEAVES = 6; // めくれる紙の枚数（12 ページ）
const LEAF_W = W - 2 * JOINT - 0.002;
const LEAF_H = H - 0.008;
const SEG = 36;

export type MonthBook = { y: number; m: number; count: number; color: string };

type Spring = { x: number; v: number; target: number; k: number; c: number };
/** 応答時間 response（秒）と減衰比 damping（1＝跳ねない）から作るばね。 */
function spring(response: number, damping: number, x = 0): Spring {
  const w = (2 * Math.PI) / response;
  return { x, v: 0, target: x, k: w * w, c: 2 * damping * w };
}
function step(s: Spring, dt: number) {
  const a = -s.k * (s.x - s.target) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
  if (Math.abs(s.x - s.target) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = s.target;
    s.v = 0;
    return false;
  }
  return true;
}

/**
 * canvas を材質の絵にする。`gltf` は Blender から来た形に貼る時: glTF の UV は
 * 上が 0（three.js の既定と上下が逆）なので、絵を上下に返さない。
 */
function tex(c: Canvas, srgb: boolean, gltf = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (gltf) t.flipY = false;
  t.anisotropy = 8;
  return t;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function mirror(c: Canvas): Canvas {
  const m = document.createElement("canvas");
  m.width = c.width;
  m.height = c.height;
  const ctx = m.getContext("2d")!;
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(c, 0, 0);
  return m;
}

type Book = {
  group: THREE.Group;
  front: THREE.Object3D;
  leaves: Array<{
    group: THREE.Group;
    geo: THREE.BufferGeometry;
    base: Float32Array;
    p: Spring;
    front: THREE.MeshStandardMaterial;
    back: THREE.MeshStandardMaterial;
  }>;
  /** その本の見開き（1日＝1見開き）。`days` が渡された時だけ。 */
  days: DaySpread[];
  data: MonthBook;
  shelfPos: THREE.Vector3;
  painted: boolean;
};

export type ShelfEvents = {
  onState?: (s: { open: MonthBook | null; page: number; pages: number }) => void;
  /**
   * その月の見開き（1日＝1見開き。左＝その日のアルバム、右＝その日の日記）。
   * 渡すと、本を開いた時に**いちばん新しい日の見開きまで**めくって見せる
   * （オーナー指示 2026-09-28「タップしたら左側に今日…右側に今日の日記」）。
   */
  days?: (b: MonthBook) => DaySpread[];
  /** 日記を描く字体（本人が選んだ物）。 */
  diaryFont?: () => DiaryFontId;
};

export class ShelfWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.02, 20);
  private books: Book[] = [];
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private last = 0;
  private active: Book | null = null;
  private pull = spring(0.35, 1);
  private present = spring(0.55, 0.92);
  private open = spring(0.8, 0.82); // 硬い表紙: ゆっくり・重く・少しだけ揺れる
  private dim = spring(0.4, 1);
  private page = 0; // めくった枚数
  private drag: {
    leaf: number;
    x0: number;
    p0: number;
    vx: number;
    t: number;
    lastX: number;
  } | null = null;
  private dirty = true;
  private reduce = false;
  private photos: Array<HTMLImageElement | null> = [];
  private dimMesh!: THREE.Mesh;
  private readingZ = 0.3;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private months: MonthBook[],
    private events: ShelfEvents = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.reduce = document.documentElement.dataset.motion === "reduce";
    this.setupScene();
  }

  private setupScene() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.scene.background = new THREE.Color("#2a241e");

    // 壁（漆喰）
    const plaster = paintPlaster();
    const wallMat = new THREE.MeshStandardMaterial({
      map: tex(plaster.color, true),
      normalMap: tex(plaster.normal, false),
      roughness: 0.96,
    });
    wallMat.map.wrapS = wallMat.map.wrapT = THREE.RepeatWrapping;
    wallMat.normalMap.wrapS = wallMat.normalMap.wrapT = THREE.RepeatWrapping;
    wallMat.map.repeat.set(3, 3);
    wallMat.normalMap.repeat.set(3, 3);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), wallMat);
    wall.position.set(0, 0.3, -0.102);
    wall.receiveShadow = true;
    this.scene.add(wall);

    // 光: 部屋の薄い光 ＋ 左上からの暖かいスポット（柔らかい影）
    this.scene.add(new THREE.HemisphereLight("#fff1dd", "#2e2218", 0.22));
    const spot = new THREE.SpotLight("#ffd9a8", 14, 3.4, Math.PI / 5.5, 0.9, 1.3);
    spot.position.set(-0.55, 1.15, 0.95);
    spot.target.position.set(0.02, 0.22, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0002;
    spot.shadow.normalBias = 0.0015;
    spot.shadow.radius = 4;
    spot.shadow.camera.near = 0.4;
    spot.shadow.camera.far = 3;
    this.scene.add(spot, spot.target);
    // 手前からの弱い補助光（本を手元に寄せた時に顔が暗くならない）
    const fill = new THREE.DirectionalLight("#fff8f0", 0.55);
    fill.position.set(0.4, 0.5, 1.2);
    this.scene.add(fill);

    // 本を手元に寄せた時、棚を少し暗くする幕（本は幕より手前）
    this.dimMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({
        color: "#0d0a08",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.dimMesh.position.set(0, 0.3, 0.16);
    this.dimMesh.renderOrder = 2;
    this.scene.add(this.dimMesh);
  }

  async load(photoUrls: string[]) {
    const loader = new GLTFLoader();
    const [bookGltf, shelfGltf, wood, ...photos] = await Promise.all([
      loader.loadAsync("/models/book.glb"),
      loader.loadAsync("/models/shelf.glb"),
      new THREE.TextureLoader().loadAsync("/models/wood.jpg"),
      ...photoUrls.map(loadImage),
    ]);
    if (this.disposed) return;
    this.photos = photos;
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.anisotropy = 8;
    const woodMat = new THREE.MeshPhysicalMaterial({
      map: wood,
      roughness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
    });
    const backWood = woodMat.clone();
    backWood.color = new THREE.Color("#8a7a6a");

    // 2段の棚
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const shelf = shelfGltf.scene.clone(true);
      shelf.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = mesh.name.includes("Back") ? backWood : woodMat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      shelf.position.y = (rows - 1 - r) * ROW_H;
      this.scene.add(shelf);
    }

    // 本（1段に6冊）
    const per = 6;
    const gap = 0.0025;
    const rowW = per * T + (per - 1) * gap;
    const edgeTex = tex(paintPageEdge(), true);
    edgeTex.wrapT = THREE.RepeatWrapping;
    const blockMat = new THREE.MeshStandardMaterial({
      map: edgeTex,
      roughness: 0.92,
      color: "#fffaf0",
    });
    const bandMat = new THREE.MeshStandardMaterial({ color: "#8f2f2f", roughness: 0.7 });
    this.months.forEach((data, i) => {
      const r = Math.floor(i / per);
      const c = i % per;
      const g = bookGltf.scene.clone(true);
      const group = new THREE.Group();
      group.add(g);
      let front: THREE.Object3D = g;
      g.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (o.name === "Front") front = o;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (o.name.startsWith("Block")) {
          // 小口の縞: u＝厚み方向、v＝長さ方向
          const geo = mesh.geometry.clone();
          const pos = geo.attributes.position;
          const uv = new Float32Array(pos.count * 2);
          for (let k = 0; k < pos.count; k++) {
            uv[k * 2] = pos.getZ(k) / (T - 2 * BOARD) + 0.5;
            uv[k * 2 + 1] = (pos.getX(k) + pos.getY(k)) * 3;
          }
          geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
          mesh.geometry = geo;
          mesh.material = blockMat;
        } else if (o.name.startsWith("Band")) {
          mesh.material = bandMat;
        }
      });
      // 背と裏表紙は棚に並んだ時から見えるので最初に描く。表紙と中身は開く時に描く。
      const spine = paintSpine({
        color: data.color,
        year: data.y,
        month: data.m,
        count: data.count,
        seed: i + 1,
      });
      const spineMat = this.clothMaterial(spine, undefined, true);
      const plainMat = this.clothMaterial(null, data.color);
      g.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (o.name.startsWith("Spine")) mesh.material = spineMat;
        else if (o.name.startsWith("Case") || o.name.startsWith("Front")) mesh.material = plainMat;
      });
      const x = -rowW / 2 + T / 2 + c * (T + gap);
      const shelfPos = new THREE.Vector3(x, (1 - r) * ROW_H + H / 2 + 0.0004, 0.1 - 0.014);
      group.position.copy(shelfPos);
      group.rotation.set(0, Math.PI / 2, 0);
      // 少しだけ傾いた本・奥に引っ込んだ本（本物の棚は揃いすぎていない）
      group.position.z -= (i * 37) % 5 === 0 ? 0.004 : 0;
      this.scene.add(group);
      this.books.push({ group, front, leaves: [], days: [], data, shelfPos, painted: false });
    });
    // 本立て（真鍮の L 字）
    const brass = new THREE.MeshStandardMaterial({
      color: "#b08d57",
      metalness: 1,
      roughness: 0.32,
    });
    for (let r = 0; r < rows; r++) {
      const y = (rows - 1 - r) * ROW_H;
      const stand = new THREE.Group();
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.15, 0.1), brass);
      upright.position.set(0, 0.075, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.1), brass);
      foot.position.set(0.03, 0.0015, 0);
      stand.add(upright, foot);
      stand.traverse((o: THREE.Object3D) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      stand.position.set(rowW / 2 + 0.004, y, 0.02);
      this.scene.add(stand);
    }
    this.resize();
    this.dirty = true;
  }

  /** 布装の材質。p があれば色・つや/金属・凹凸の絵を貼る（Blender の形の UV に合わせる）。 */
  private clothMaterial(p: Painted | null, color?: string, flipU = false) {
    if (!p) {
      // 無地の布（裏表紙など）: 色＋織り目だけ
      const c = paintSpine({ color: color ?? "#333", year: 0, month: 1, count: 0, seed: 99 });
      const m = new THREE.MeshPhysicalMaterial({
        color: color,
        roughness: 0.86,
        sheen: 1,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35),
        normalMap: tex(c.normal, false, true),
        normalScale: new THREE.Vector2(0.5, 0.5),
      });
      m.normalMap.wrapS = m.normalMap.wrapT = THREE.RepeatWrapping;
      m.normalMap.repeat.set(3, 1);
      return m;
    }
    const ormTex = tex(p.orm, false, true);
    const colorTex = tex(p.color, true, true);
    const normalTex = tex(p.normal, false, true);
    if (flipU) {
      // 背の UV は表側が 0。棚では表側が右に来るので、そのままだと字が裏返る。
      // 絵を返す（uv の向きごと返すので、凹凸の向きも正しく付く）。
      for (const t of [ormTex, colorTex, normalTex]) {
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.x = -1;
        t.offset.x = 1;
      }
    }
    return new THREE.MeshPhysicalMaterial({
      map: colorTex,
      roughnessMap: ormTex,
      metalnessMap: ormTex,
      roughness: 1,
      metalness: 1,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.6, 0.6),
      sheen: 0.8,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.25),
    });
  }

  /** 開く本にだけ、表紙・見返し・ページを描いて貼る（全冊ぶん先に描くと重い）。 */
  private paintInside(b: Book) {
    if (b.painted) return;
    b.painted = true;
    const d = b.data;
    const cover = paintCover({
      color: d.color,
      year: d.y,
      month: d.m,
      count: d.count,
      photo: this.photos[(d.m + 1) % this.photos.length] ?? null,
      seed: d.m,
    });
    const coverMat = this.clothMaterial(cover);
    b.front.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = coverMat;
    });
    // 見返し（表紙の裏に貼った紙）
    const endMat = new THREE.MeshStandardMaterial({
      map: tex(paintEndpaper(d.color), true),
      roughness: 0.9,
    });
    const end = new THREE.Mesh(new THREE.PlaneGeometry(W - JOINT - 0.004, H - 0.004), endMat);
    end.position.set((W - JOINT) / 2, 0, -BOARD / 2 - 0.0003);
    end.rotation.y = Math.PI;
    end.receiveShadow = true;
    b.front.add(end);
    // 紙（めくれる葉）
    //
    // **1日＝1見開き**（`events.days` があるとき）。表紙を開いた最初の右ページは
    // 扉（その月の題）。葉 i の裏（左）＝ i 日目のアルバム、葉 i+1 の表（右）＝
    // i 日目の日記。だから見開き k（k 枚めくった所）は「k 日目の左と右」。
    b.days = this.events.days?.(d).slice(0, LEAVES - 1) ?? [];
    const words = [
      "珍珠奶茶",
      "夜市",
      "芒果",
      "捷運",
      "雨傘",
      "咖啡",
      "便當",
      "公車",
      "書店",
      "月餅",
      "滷肉飯",
      "蘋果",
    ];
    const zTop = T / 2 - BOARD - 0.0001; // 紙の束の上面のすぐ上
    for (let i = 0; i < LEAVES; i++) {
      const geo = new THREE.PlaneGeometry(LEAF_W, LEAF_H, SEG, 1);
      geo.translate(LEAF_W / 2, 0, 0);
      const base = Float32Array.from(geo.attributes.position.array as ArrayLike<number>);
      const photo = (k: number) =>
        this.photos[(i * 2 + k) % Math.max(1, this.photos.length)] ?? null;
      const recto =
        this.paintRecto(b, i) ??
        paintPage({
          day: i * 4 + 2,
          month: d.m,
          photos: [photo(0), photo(1)],
          words: [words[(i * 2) % words.length], words[(i * 2 + 1) % words.length]],
          side: "right",
        });
      const verso =
        this.paintVerso(b, i) ??
        paintPage({
          day: i * 4 + 4,
          month: d.m,
          photos: [photo(2), photo(3)],
          words: [words[(i * 2 + 2) % words.length], words[(i * 2 + 3) % words.length]],
          side: "left",
        });
      const frontMat = new THREE.MeshStandardMaterial({
        map: tex(recto, true),
        roughness: 0.9,
        side: THREE.FrontSide,
      });
      const backMat = new THREE.MeshStandardMaterial({
        map: tex(mirror(verso), true),
        roughness: 0.9,
        side: THREE.BackSide,
      });
      const front = new THREE.Mesh(geo, frontMat);
      const back = new THREE.Mesh(geo, backMat);
      for (const m of [front, back]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      const group = new THREE.Group();
      group.add(front, back);
      group.position.set(0.0015 + JOINT - 0.0015, 0, zTop + (LEAVES - i) * 0.00035);
      b.group.children[0].add(group);
      b.leaves.push({ group, geo, base, p: spring(0.5, 0.9), front: frontMat, back: backMat });
    }
  }

  /** 1枚の紙を、めくり具合 p（0＝右に寝ている・1＝左に寝ている）と曲がり具合で形作る。 */
  private shapeLeaf(leaf: Book["leaves"][number], i: number) {
    const p = Math.max(0, Math.min(1, leaf.p.x));
    const pos = leaf.geo.attributes.position;
    // 紙の柔らかさ: めくっている途中ほど、速く動かすほど、先が先に上がる
    const bend = Math.sin(Math.PI * p) * (0.9 + Math.min(0.8, Math.abs(leaf.p.v) * 0.08));
    const root = Math.PI * p - bend * 0.5;
    const ds = LEAF_W / SEG;
    let x = 0;
    let z = 0;
    const cols: Array<[number, number]> = [[0, 0]];
    for (let s = 1; s <= SEG; s++) {
      const phi = Math.max(0, Math.min(Math.PI, root + bend * ((s - 0.5) / SEG)));
      x += Math.cos(phi) * ds;
      z += Math.sin(phi) * ds;
      cols.push([x, z]);
    }
    for (let k = 0; k < pos.count; k++) {
      const col = Math.round(leaf.base[k * 3] / ds);
      const [cx, cz] = cols[Math.max(0, Math.min(SEG, col))];
      pos.setXYZ(k, cx, leaf.base[k * 3 + 1], cz);
    }
    pos.needsUpdate = true;
    leaf.geo.computeVertexNormals();
    // 右の束の上から左の束の上へ（重なり順を保つ）
    const zTop = T / 2 - BOARD - 0.0001;
    const zRight = zTop + (LEAVES - i) * 0.00035;
    const zLeft = T / 2 + 0.0008 + i * 0.00035;
    leaf.group.position.z = zRight + (zLeft - zRight) * p;
  }

  // ---- 入力 -----------------------------------------------------------------
  private toNdc(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private down: { x: number; y: number; t: number } | null = null;
  pointerDown(e: PointerEvent) {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.active && this.open.x > 0.85) {
      const r = this.canvas.getBoundingClientRect();
      const rightSide = e.clientX > r.left + r.width / 2;
      const leaf = rightSide ? this.page : this.page - 1;
      if (leaf >= 0 && leaf < LEAVES) {
        const l = this.active.leaves[leaf];
        this.drag = {
          leaf,
          x0: e.clientX,
          p0: l.p.x,
          vx: 0,
          t: performance.now(),
          lastX: e.clientX,
        };
      }
    }
  }

  pointerMove(e: PointerEvent) {
    if (!this.drag || !this.active) return;
    const r = this.canvas.getBoundingClientRect();
    const l = this.active.leaves[this.drag.leaf];
    // 指に 1:1: 画面の幅の半分を動かすと1枚ぶん
    const p = this.drag.p0 + (this.drag.x0 - e.clientX) / (r.width * 0.5);
    const now = performance.now();
    const dt = Math.max(1, now - this.drag.t) / 1000;
    const inst = (this.drag.lastX - e.clientX) / (r.width * 0.5) / dt;
    this.drag.vx = this.drag.vx * 0.6 + inst * 0.4;
    this.drag.t = now;
    this.drag.lastX = e.clientX;
    const prev = l.p.x;
    l.p.x = Math.max(0, Math.min(1, p));
    l.p.target = l.p.x;
    l.p.v = (l.p.x - prev) / dt;
    this.dirty = true;
  }

  pointerUp(e: PointerEvent) {
    const d = this.down;
    this.down = null;
    const moved = d ? Math.hypot(e.clientX - d.x, e.clientY - d.y) : 99;
    if (this.drag && this.active) {
      const l = this.active.leaves[this.drag.leaf];
      if (moved > 8) {
        // 離した速さを引き継いで、行き先を予測して決める
        const projected = l.p.x + this.drag.vx * 0.18;
        l.p.target = projected > 0.5 ? 1 : 0;
        l.p.v = this.drag.vx;
        this.page = this.active.leaves.filter((x) => x.p.target === 1).length;
        this.drag = null;
        this.emit();
        this.kick();
        return;
      }
      this.drag = null;
    }
    if (moved > 8) return;
    this.tap(e);
  }

  private tap(e: PointerEvent) {
    if (this.active) {
      if (this.open.x < 0.5) return;
      const r = this.canvas.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) this.flip(1);
      else this.flip(-1);
      return;
    }
    this.raycaster.setFromCamera(this.toNdc(e), this.camera);
    const hits = this.raycaster.intersectObjects(
      this.books.map((b) => b.group),
      true,
    );
    if (!hits.length) return;
    let o: THREE.Object3D | null = hits[0].object;
    const book = this.books.find((b) => {
      let x: THREE.Object3D | null = o;
      while (x) {
        if (x === b.group) return true;
        x = x.parent;
      }
      return false;
    });
    o = null;
    if (book) this.openBook(book);
  }

  flip(dir: 1 | -1) {
    if (!this.active) return;
    if (dir === 1 && this.page < LEAVES) {
      this.active.leaves[this.page].p.target = 1;
      this.page++;
    } else if (dir === -1 && this.page > 0) {
      this.page--;
      this.active.leaves[this.page].p.target = 0;
    }
    this.emit();
    this.kick();
  }

  /** 葉 i の表（右ページ）。0 枚目は扉、ほかは (i-1) 日目の日記。日が無ければ null。 */
  private paintRecto(b: Book, i: number): Canvas | null {
    if (!b.days.length) return null;
    const font = this.events.diaryFont?.() ?? "hand";
    if (i === 0)
      return paintTitlePage(`${b.data.y}年${b.data.m}月`, `${b.days.length}日ぶんの見開き`);
    const day = b.days[i - 1];
    return day ? paintDiary(day, font) : paintBlank("right");
  }

  /** 葉 i の裏（左ページ）＝ i 日目のアルバム。 */
  private paintVerso(b: Book, i: number): Canvas | null {
    if (!b.days.length) return null;
    const day = b.days[i];
    return day ? paintAlbumDay(day) : paintBlank("left");
  }

  /** 日記の字体を変えた・日記を書いた → 開いている本の右ページを描き直す。 */
  repaintDiary(dayIndex?: number) {
    const b = this.active;
    if (!b || !b.days.length) return;
    b.leaves.forEach((leaf, i) => {
      if (i === 0) return;
      if (dayIndex !== undefined && i - 1 !== dayIndex) return;
      const c = this.paintRecto(b, i);
      if (!c) return;
      leaf.front.map?.dispose();
      leaf.front.map = tex(c, true);
      leaf.front.needsUpdate = true;
    });
    this.kick();
  }

  /** いま見開いている日（0 始まり）。扉なら -1。 */
  get openDay(): number {
    return this.active && this.active.days.length ? this.page - 1 : -1;
  }

  /** 開いている本の見開きの中身（書き換えは repaintDiary で反映）。 */
  get openDays(): DaySpread[] {
    return this.active?.days ?? [];
  }

  openBook(b: Book) {
    if (this.active) return;
    this.paintInside(b);
    this.active = b;
    this.page = 0;
    this.pull.target = 1;
    this.present.target = 1;
    this.dim.target = 1;
    // 手元に来てから表紙を開く（開き始めは少し遅らせる）
    window.setTimeout(
      () => {
        if (this.active === b) {
          this.open.target = 1;
          this.kick();
          // いちばん新しい日の見開きまで、1枚ずつ続けてめくる（ぱらぱら）。
          const last = b.days.length;
          for (let k = 0; k < last; k++) {
            window.setTimeout(
              () => {
                if (this.active === b && this.page === k) this.flip(1);
              },
              this.reduce ? 0 : 650 + k * 140,
            );
          }
        }
      },
      this.reduce ? 0 : 520,
    );
    this.emit();
    this.kick();
  }

  close() {
    const b = this.active;
    if (!b) return;
    for (const l of b.leaves) l.p.target = 0;
    this.page = 0;
    this.open.target = 0;
    window.setTimeout(
      () => {
        this.present.target = 0;
        this.dim.target = 0;
        this.kick();
      },
      this.reduce ? 0 : 480,
    );
    window.setTimeout(
      () => {
        this.pull.target = 0;
        this.kick();
      },
      this.reduce ? 0 : 900,
    );
    window.setTimeout(
      () => {
        if (this.active === b && this.pull.x < 0.05) this.active = null;
        this.emit();
      },
      this.reduce ? 0 : 1500,
    );
    this.kick();
  }

  private emit() {
    this.events.onState?.({
      open: this.active && this.present.target === 1 ? this.active.data : null,
      page: this.page,
      pages: LEAVES,
    });
  }

  // ---- 描く -------------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 2段の棚（高さ ≈0.6m・幅 ≈0.45m）が必ず収まる距離
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = Math.max(0.32 / Math.tan(vfov / 2), 0.25 / Math.tan(hfov / 2));
    this.camera.position.set(0.0, ROW_H * 0.55 + 0.05, dist + 0.1);
    this.camera.lookAt(0, ROW_H * 0.55, 0);
    this.camera.updateProjectionMatrix();
    // 開いた本（幅 ≈0.30m）が画面の幅に収まる手元の位置
    const need = 0.33 / 2 / Math.tan(hfov / 2);
    this.readingZ = this.camera.position.z - need;
    this.dirty = true;
  }

  private kick() {
    this.dirty = true;
  }

  start() {
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(1 / 30, this.last ? (t - this.last) / 1000 : 1 / 60);
      this.last = t;
      let moving = false;
      const springs = [this.pull, this.present, this.open, this.dim];
      for (const s of springs) {
        if (this.reduce) {
          s.x = s.target;
          s.v = 0;
        } else moving = step(s, dt) || moving;
      }
      const b = this.active;
      if (b) {
        b.leaves.forEach((l, i) => {
          if (this.drag?.leaf === i) {
            moving = true;
          } else if (this.reduce) {
            l.p.x = l.p.target;
          } else moving = step(l.p, dt) || moving;
          this.shapeLeaf(l, i);
          // 閉じている間は表紙の内側に紙がめり込むので隠す
          l.group.visible = this.open.x > 0.03;
        });
        this.pose(b);
      }
      (this.dimMesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * this.dim.x;
      if (moving || this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 棚 → 引き出し → 手元（弧）→ 開く、を今のばねの値から置く。 */
  private pose(b: Book) {
    const pull = this.pull.x;
    const pr = Math.max(0, Math.min(1.05, this.present.x));
    const shelf = b.shelfPos.clone();
    shelf.z += 0.075 * pull;
    const openX = Math.max(0, Math.min(1, this.open.x));
    const reading = new THREE.Vector3(-W / 2 + (W / 2) * openX, ROW_H * 0.52, this.readingZ);
    const p = shelf.lerp(reading, pr);
    p.y += 0.06 * Math.sin(Math.PI * Math.min(1, pr)); // 弧を描いて寄る
    b.group.position.copy(p);
    const qShelf = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const qRead = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0, 0));
    b.group.quaternion.copy(qShelf.slerp(qRead, Math.min(1, pr)));
    // 硬い表紙: 蝶番で板のまま回る（曲がらない）
    b.front.rotation.y = -Math.PI * Math.max(0, Math.min(1, this.open.x));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
