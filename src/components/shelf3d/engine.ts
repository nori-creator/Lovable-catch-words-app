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
import { playSfx, preloadSfx } from "@/lib/sfx-files";
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
import { SHELF_DIMS, tightShelfSize } from "@/lib/home-shelf";
import { addRoomLights, buildDecor, shadowWall, shelfFinish, type RoomId } from "./room";

// Blender の寸法（book_and_shelf.py と同じ値）。three.js では y が高さ、z が手前。
const H = SHELF_DIMS.bookH;
const W = 0.148;
const T = SHELF_DIMS.bookT;
const BOARD = 0.0025;
const JOINT = 0.006;
const ROW_H = 0.26 + 0.018; // 1段の内寸＋板
/** 日の見開きが無い本（見本）のめくれる紙の枚数（12 ページ）。 */
const LEAVES = 6;
/** 1冊に綴じる日の上限（1か月ぶん）。 */
const MAX_DAYS = 31;
/** 1段に並ぶ本の上限（棚の幅 0.40m に収まる数）。 */
export const ROW_MAX = 8;
/** 部屋に置く棚の内側の幅（8 冊＋右に飾りの空き）。 */
const ROOM_INNER_W = 0.5;
const LEAF_W = W - 2 * JOINT - 0.002;
const LEAF_H = H - 0.008;
const SEG = 36;

export type MonthBook = {
  y: number;
  m: number;
  count: number;
  color: string;
  /** 表紙に貼る写真（無ければ読み込んだ見本の写真から選ぶ）。 */
  cover?: HTMLImageElement | null;
};

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
    /** 表（右ページ）・裏（左ページ）の絵。片ページで大きく見せる時に使う。 */
    recto: Canvas | null;
    verso: Canvas | null;
  }>;
  /** 表紙の絵（表紙まで戻った時に片ページで見せる）。 */
  coverCanvas?: Canvas;
  /** 表紙の裏の見返し（最初の見開きの左）と、裏表紙の見返し（最後の見開きの右）。 */
  endFront?: Canvas;
  endBack?: Canvas;
  /** その本の見開き（1日＝1見開き）。`days` が渡された時だけ。 */
  days: DaySpread[];
  data: MonthBook;
  shelfPos: THREE.Vector3;
  painted: boolean;
};

export type ShelfEvents = {
  onState?: (s: {
    open: MonthBook | null;
    page: number;
    pages: number;
    /** 表紙を閉じて手元に持っている（表紙まで戻った）。 */
    cover?: boolean;
  }) => void;
  /**
   * 棚の本を押した。渡すと**すぐには開かない** — 呼ぶ側が中身（その月の写真・日記）を
   * 揃えてから `open()` を呼ぶ（本番のホームは写真と日記を読み込んでから開く）。
   */
  onBookTap?: (b: MonthBook, open: () => void) => void;
  /** 開いた本のページを押した（R14: 押すと片ページを大きく）。 */
  onPageTap?: (side: "left" | "right") => void;
  /**
   * 開いた本のページを**長押し**した（オーナー指示 2026-10-02「ホームのアルバムのように本棚の
   * アルバムでも長押しで配置を変換できるようにして」）。受け取る側がホームと同じ並べ替えの
   * 画面を**本の上ではなく別の面**に開く（本の上に DOM を重ねると本とページがずれる）。
   */
  onPageLongPress?: (side: "left" | "right") => void;
  /** 片ページで、指で払って隣のページ（同じ見開きの左右）へ横に移った（R20）。 */
  onFocusSide?: (side: "left" | "right") => void;
  /**
   * その月の見開き（1日＝1見開き。左＝その日のアルバム、右＝その日の日記）。
   * 渡すと、本を開いた時に**いちばん新しい日の見開きまで**めくって見せる
   * （オーナー指示 2026-09-28「タップしたら左側に今日…右側に今日の日記」）。
   */
  days?: (b: MonthBook) => DaySpread[];
  /** 日記を描く字体（本人が選んだ物）。 */
  diaryFont?: () => DiaryFontId;
  /** 扉のページの題と副題（表示の言語で）。無ければ日本語。 */
  titlePage?: (b: MonthBook, days: number) => [string, string];
};

export type ShelfOptions = {
  /**
   * 棚の段数。2 は見本の2段の棚、1 は**ホームの一番上の1段**（オーナー指示 2026-09-29
   * 「ホームのアルバムの一番上に本棚を一列作って」）。
   */
  rows?: 1 | 2;
  /**
   * 本を開いた時にどこまでめくるか。`first` は**その月の最初の日**（オーナー指示
   * 2026-09-29「アルバムを開くとその月の最初のページが開くようにして」）、`latest` は
   * いちばん新しい日（2026-09-28 の形）。
   */
  openAt?: "first" | "latest";
  /**
   * **棚を本にぴったり合わせる**（オーナー指示 2026-09-29「本棚と本の上部は空間を作らず
   * ぴったり収まるようにして」）。棚板の間を本の高さに、棚の幅を並ぶ冊数に縮め、本立ても
   * 置かない。カメラも棚の外形ちょうどに寄せる（ホームの上の帯に小さく置くため）。
   */
  tight?: boolean;
  /**
   * **部屋に置いた大きな棚**（R17「本棚が小さすぎる。空中に本棚がただあるデザイン不自然。
   * 3D のリアルな本棚をアプリの上部に設置して」、参考画像 A〜D）。部屋の壁・窓は画面側
   * （CSS）が描くので、three.js は透明の上に棚・本・飾り・光・壁への影だけを描く。
   * 棚は 8 冊と飾りが並ぶ幅、本の上に少し隙間（「本棚と本の間に少し隙間を空けて」）。
   */
  room?: RoomId;
};

/** 棚の Blender の寸法（book_and_shelf.py）。内側の高さ・内側の幅（寸法は `lib/home-shelf.ts`）。 */
const SHELF_INNER_H = SHELF_DIMS.innerH;
const SHELF_INNER_W = SHELF_DIMS.innerW;
const BOOK_GAP = SHELF_DIMS.gap;
export { tightShelfSize };

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
  /**
   * 表紙の開き具合（0＝閉じ・1＝開き）。**硬い板がパタッと倒れる**動き（R17「本のカバーを
   * めくるとは紙のように柔らかいアニメーションではなく、パタッと硬い感じにして」）:
   * 持ち上げは素早く、垂直を越えたら重さで加速して倒れ、着いた所で小さく1回跳ねて止まる。
   * ばねではなく時間で決める（ばねは終わりほど遅くなり、倒れる板に見えない）。
   */
  private open = { x: 0, v: 0, target: 0, from: 0, t: 1, dur: 0.44 };
  /** 表紙を閉じて手元に持っている（表紙まで戻った）。 */
  private coverShut = false;
  private dim = spring(0.4, 1);
  /**
   * **片ページ**（R19「片ページモードでも、めくるアニメーションは見開きと同じに」）。
   * 前は片ページを別の絵（画像）で出して横へ滑らせていたので、めくりが見開きの紙とは別物だった。
   * 今は**同じ 3D の本のまま、手前へ寄って片側のページを画面いっぱいにする**だけ。めくるのは
   * 見開きと同じ紙（同じ曲がり方・同じばね・指に付いてくる払い）。
   * `focus` は 0（見開き）〜1（片ページ）、`focusSide` はどのページに寄るか。
   */
  private focus = spring(0.5, 1);
  private focusSide: "left" | "right" | "cover" | null = null;
  /** 寄る先ページの中心（本の中の x）と幅。ページが変わる時はこの値がなめらかに動く。 */
  /** いま片ページで見ている側（見開きなら null）。 */
  private get single() {
    return this.focus.target === 1 ? this.focusSide : null;
  }
  private fcx = JOINT + LEAF_W / 2;
  private fw = LEAF_W;
  private tcx = JOINT + LEAF_W / 2;
  private tw = LEAF_W;
  private page = 0; // めくった枚数
  private drag: {
    leaf: number;
    x0: number;
    p0: number;
    vx: number;
    t: number;
    lastX: number;
  } | null = null;
  /**
   * 描き直しが要る印。**立てたら描画の輪を起こす**（輪は何も動いていない時は止まっている —
   * オーナー報告 2026-09-29「アプリ全体がカクカク」。前は何もしていない間も毎秒 60 回、
   * ホームにいる間ずっと空回りしていた）。
   */
  private _dirty = true;
  private get dirty() {
    return this._dirty;
  }
  private set dirty(v: boolean) {
    this._dirty = v;
    if (v) this.wake();
  }
  /** 描画の輪が回っているか／回す関数（`start` で作る）。 */
  private looping = false;
  private loopFn: ((t: number) => void) | null = null;
  /** 何も動かないまま過ぎたコマ数（しばらく続いたら輪を止める）。 */
  private idleFrames = 0;
  private wake() {
    this.idleFrames = 0;
    if (this.looping || this.disposed || !this.loopFn) return;
    this.looping = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.loopFn);
  }
  private reduce = false;
  private photos: Array<HTMLImageElement | null> = [];
  private dimMesh!: THREE.Mesh;
  private readingZ = 0.3;
  private readingY = ROW_H * 0.52;
  private disposed = false;

  private rows: 1 | 2;
  private openAt: "first" | "latest";
  private tight: boolean;
  private room: RoomId | null;
  /** 棚の外形（ぴったりの時だけ。カメラを寄せるのに使う）。 */
  private bounds: THREE.Box3 | null = null;
  constructor(
    private canvas: HTMLCanvasElement,
    private months: MonthBook[],
    private events: ShelfEvents = {},
    opts: ShelfOptions = {},
  ) {
    this.rows = opts.rows ?? 2;
    this.openAt = opts.openAt ?? "first";
    this.tight = opts.tight ?? false;
    this.room = opts.room ?? null;
    if (this.rows === 1) this.months = months.slice(-ROW_MAX);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!this.room });
    if (this.room) this.renderer.setClearColor(0x000000, 0);
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
    if (this.room) {
      // 部屋の壁・窓は画面側が描く。ここは光だけ（影は棚を置いた後に壁の位置へ）。
      addRoomLights(this.scene, this.room);
      this.addDim();
      return;
    }
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

    this.addDim();
  }

  /** 本を手元に寄せた時、棚を少し暗くする幕（本は幕より手前）。 */
  private addDim() {
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
    const finish = this.room ? shelfFinish(this.room) : null;
    if (finish?.paint) {
      // 白い塗装の棚（木目を消し、少しだけ艶）
      woodMat.map = null;
      woodMat.color = new THREE.Color(finish.color);
      woodMat.roughness = 0.62;
      woodMat.clearcoat = 0.15;
    } else if (finish) woodMat.color = new THREE.Color(finish.color);
    const backWood = woodMat.clone();
    backWood.color = new THREE.Color(finish?.paint ? "#e9e3da" : "#8a7a6a");

    // 棚（見本は2段、ホームは1段）
    const rows = this.rows;
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
      if (this.room) {
        // 部屋の棚: 8 冊と飾りが並ぶ幅。内側の高さは本より 12% 高い（本の上に少し隙間）。
        shelf.scale.set(ROOM_INNER_W / SHELF_INNER_W, (H * 1.12) / SHELF_INNER_H, 1);
      } else if (this.tight) {
        // 内側を本の高さ・並ぶ冊数の幅に縮める（板の厚さも同じ割合で少し薄くなる）。
        const n = Math.min(ROW_MAX, Math.max(1, this.months.length));
        const inner = n * T + (n - 1) * BOOK_GAP + 0.004;
        shelf.scale.set(inner / SHELF_INNER_W, (H + 0.002) / SHELF_INNER_H, 1);
      }
      this.scene.add(shelf);
      if (this.tight || this.room) this.bounds = new THREE.Box3().setFromObject(shelf);
    }

    // 本（見本の2段は1段に6冊、ホームの1段は最大 ROW_MAX 冊）
    const per = rows === 1 ? ROW_MAX : 6;
    const gap = BOOK_GAP;
    const perRow = Math.min(per, Math.max(1, this.months.length));
    const rowW = perRow * T + (perRow - 1) * gap;
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
      // 部屋の棚では左から詰めて並べ、右の空きに飾りを置く。
      const x = this.room
        ? -ROOM_INNER_W / 2 + 0.01 + T / 2 + c * (T + gap)
        : -rowW / 2 + T / 2 + c * (T + gap);
      const shelfPos = new THREE.Vector3(x, (rows - 1 - r) * ROW_H + H / 2 + 0.0004, 0.1 - 0.014);
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
    for (let r = 0; r < (this.tight ? 0 : rows); r++) {
      const y = (rows - 1 - r) * ROW_H;
      const standX = this.room
        ? -ROOM_INNER_W / 2 + 0.01 + perRow * T + (perRow - 1) * gap + 0.004
        : rowW / 2 + 0.004;
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
      stand.position.set(standX, y, 0.02);
      this.scene.add(stand);
    }
    if (this.room && this.bounds) {
      const box = this.bounds.clone();
      const booksEnd = -ROOM_INNER_W / 2 + 0.01 + perRow * T + (perRow - 1) * gap + 0.012;
      const decor = buildDecor(this.room, {
        box,
        floorY: 0,
        ceilY: H * 1.12,
        innerL: -ROOM_INNER_W / 2,
        innerR: ROOM_INNER_W / 2,
        booksEnd,
        midZ: 0.05,
        photo: this.photos.find(Boolean) ?? null,
      });
      this.scene.add(decor);
      this.scene.add(shadowWall(box.min.z - 0.001, this.room));
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

  /** 中を描いた（開いた）本があるか。あれば写真の選び方が変わっても古い絵のまま残る。 */
  hasPaintedBooks(): boolean {
    return this.books.some((b) => b.painted);
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
      photo:
        d.cover !== undefined
          ? d.cover
          : (this.photos[(d.m + 1) % Math.max(1, this.photos.length)] ?? null),
      seed: d.m,
    });
    b.coverCanvas = cover.color;
    const coverMat = this.clothMaterial(cover);
    b.front.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = coverMat;
    });
    // 見返し（表紙の裏に貼った紙）
    const endC = paintEndpaper(d.color);
    b.endFront = endC;
    const endMat = new THREE.MeshStandardMaterial({
      map: tex(endC, true),
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
    b.days = this.events.days?.(d).slice(0, MAX_DAYS) ?? [];
    // 日が有る本は「扉＋1日1枚」。見本（日が無い本）は 6 枚。
    const n = b.days.length ? b.days.length + 1 : LEAVES;
    const zTop = T / 2 - BOARD - 0.0001; // 紙の束の上面のすぐ上
    // **最後の見開きの右ページ**（R14「ページの最後に変なものがあるから直して」）。
    // 前は最後の紙までめくると、紙の束（Blender の Block）の上面がそのまま見え、
    // 小口の縞の絵が伸びて白い八角形のように写っていた。本物の本と同じく、束の上に
    // 最後の白いページを1枚敷く（めくれる紙のすぐ下）。
    const lastC = paintBlank("right");
    b.endBack = lastC;
    const lastPage = new THREE.Mesh(
      new THREE.PlaneGeometry(LEAF_W, LEAF_H),
      new THREE.MeshStandardMaterial({ map: tex(lastC, true), roughness: 0.9 }),
    );
    lastPage.position.set(JOINT + LEAF_W / 2, 0, zTop + 0.00012);
    lastPage.receiveShadow = true;
    b.group.children[0].add(lastPage);
    // **紙の絵は見ている辺りだけ描く**（1か月 31 日ぶん＝ 64 ページを全部描くと、
    // 1枚 720×1024 の絵が 64 枚になりスマホの記憶が足りない）。最初は白紙の絵を
    // 共有しておき、`ensurePages` が今の見開きの前後だけ描いて貼り、遠くは白紙へ戻す。
    for (let i = 0; i < n; i++) {
      const geo = new THREE.PlaneGeometry(LEAF_W, LEAF_H, SEG, 1);
      geo.translate(LEAF_W / 2, 0, 0);
      const base = Float32Array.from(geo.attributes.position.array as ArrayLike<number>);
      const frontMat = new THREE.MeshStandardMaterial({
        map: this.blankTex("right"),
        roughness: 0.9,
        side: THREE.FrontSide,
      });
      const backMat = new THREE.MeshStandardMaterial({
        map: this.blankTex("left"),
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
      group.position.set(0.0015 + JOINT - 0.0015, 0, zTop + (n - i) * 0.00035);
      b.group.children[0].add(group);
      b.leaves.push({
        group,
        geo,
        base,
        p: spring(0.5, 0.9),
        front: frontMat,
        back: backMat,
        recto: null,
        verso: null,
      });
    }
  }

  private blanks: Partial<Record<"left" | "right", THREE.Texture>> = {};
  /** 描く前の紙（共有。左は裏返して貼るので鏡にしておく）。 */
  private blankTex(side: "left" | "right") {
    const have = this.blanks[side];
    if (have) return have;
    const c = paintBlank(side);
    const t = tex(side === "left" ? mirror(c) : c, true);
    this.blanks[side] = t;
    return t;
  }

  /** 葉 i の表と裏を描いて貼る（描いてあれば何もしない）。 */
  private paintLeaf(b: Book, i: number) {
    const leaf = b.leaves[i];
    if (!leaf || leaf.recto) return;
    const d = b.data;
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
    const photo = (k: number) => this.photos[(i * 2 + k) % Math.max(1, this.photos.length)] ?? null;
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
    leaf.recto = recto;
    leaf.verso = verso;
    leaf.front.map = tex(recto, true);
    leaf.front.needsUpdate = true;
    leaf.back.map = tex(mirror(verso), true);
    leaf.back.needsUpdate = true;
  }

  /** 描いた紙を白紙へ戻す（絵の記憶を返す）。 */
  private unpaintLeaf(b: Book, i: number) {
    const leaf = b.leaves[i];
    if (!leaf || !leaf.recto) return;
    leaf.recto = null;
    leaf.verso = null;
    leaf.front.map?.dispose();
    leaf.back.map?.dispose();
    leaf.front.map = this.blankTex("right");
    leaf.back.map = this.blankTex("left");
    leaf.front.needsUpdate = true;
    leaf.back.needsUpdate = true;
  }

  /**
   * いまの見開き（page 枚めくった所）の前後だけ描く。見えるのは左＝葉 page-1 の裏、
   * 右＝葉 page の表、めくっている途中は葉 page の裏と葉 page+1 の表。1つ先・1つ前まで
   * 先に描いておき、それより遠い紙は白紙へ戻す。
   */
  private ensurePages(b: Book, page = this.page) {
    b.leaves.forEach((_, i) => {
      if (i >= page - 2 && i <= page + 2) this.paintLeaf(b, i);
      else if (i < page - 4 || i > page + 4) this.unpaintLeaf(b, i);
    });
  }

  /** 1枚の紙を、めくり具合 p（0＝右に寝ている・1＝左に寝ている）と曲がり具合で形作る。 */
  private shapeLeaf(leaf: Book["leaves"][number], i: number, n: number) {
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
    const zRight = zTop + (n - i) * 0.00035;
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
  /** 長押しの時計（ホームの札と同じ 550ms）と、成立した印（その指の「離す」は押したと数えない）。 */
  private press: ReturnType<typeof setTimeout> | null = null;
  private pressed = false;
  private static readonly LONG_PRESS_MS = 550;
  private static readonly PRESS_SLOP = 10;
  private clearPress() {
    if (this.press) clearTimeout(this.press);
    this.press = null;
  }
  /**
   * 長押しが成立した。掴んでいた紙は元の位置へ戻し（払いの途中ではない）、どちらのページを
   * 押さえているかを知らせる。片ページで見ている時はそのページ。
   */
  private firePress(x: number) {
    this.press = null;
    this.pressed = true;
    this.pending = null;
    if (this.drag && this.active) {
      const l = this.active.leaves[this.drag.leaf];
      l.p.target = l.p.x > 0.5 ? 1 : 0;
      this.kick();
    }
    this.drag = null;
    const one = this.single;
    const r = this.canvas.getBoundingClientRect();
    const side =
      one === "left" || one === "right" ? one : x > r.left + r.width / 2 ? "right" : "left";
    this.events.onPageLongPress?.(side);
  }
  /**
   * 片ページで押した所。**向きが決まるまで紙を掴まない**（R20「左ページにフォーカスすると
   * 右のページが見れない。左ページでスワイプしたら右にスライドするアニメーションで右ページに
   * 移って。逆も然り」）:
   *  - 左ページで左へ払う／右ページで右へ払う → 同じ見開きの反対のページへ**横に滑る**（`pan`）
   *  - 右ページで左へ払う／左ページで右へ払う → 見開きと同じ紙を**めくる**（`drag`）
   * 読む順（左 → 右 → めくって次の左 …）どおりに進み、どのページにも行ける。
   */
  private pending: { x: number; y: number } | null = null;
  private pan: {
    from: "left" | "right";
    to: "left" | "right";
    x0: number;
    t: number;
    lastX: number;
    v: number;
    p: number;
  } | null = null;

  private centerOf(side: "left" | "right") {
    return side === "left" ? JOINT - LEAF_W / 2 : JOINT + LEAF_W / 2;
  }

  private grabLeaf(rightSide: boolean, x0: number) {
    if (!this.active) return;
    const leaf = rightSide ? this.page : this.page - 1;
    if (leaf < 0 || leaf >= this.active.leaves.length) return;
    const l = this.active.leaves[leaf];
    this.drag = { leaf, x0, p0: l.p.x, vx: 0, t: performance.now(), lastX: x0 };
  }

  pointerDown(e: PointerEvent) {
    this.wake();
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.pending = null;
    this.pan = null;
    this.clearPress();
    this.pressed = false;
    if (this.active && this.open.x > 0.85) {
      const r = this.canvas.getBoundingClientRect();
      const one = this.single;
      // 開いたページ（表紙ではない）を押さえたままなら長押し。指が遊びを越えて動いたら取り消す。
      if (!this.coverShut && one !== "cover" && this.events.onPageLongPress) {
        const x = e.clientX;
        this.press = setTimeout(() => this.firePress(x), ShelfWorld.LONG_PRESS_MS);
      }
      if (one === "left" || one === "right") {
        this.pending = { x: e.clientX, y: e.clientY };
        return;
      }
      if (one === "cover") return;
      this.grabLeaf(e.clientX > r.left + r.width / 2, e.clientX);
    }
  }

  pointerMove(e: PointerEvent) {
    this.wake();
    if (this.pressed) return;
    if (
      this.press &&
      this.down &&
      Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > ShelfWorld.PRESS_SLOP
    )
      this.clearPress();
    if (this.pending && this.active) {
      const dx = e.clientX - this.pending.x;
      const dy = e.clientY - this.pending.y;
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      const one = this.single;
      const x0 = this.pending.x;
      this.pending = null;
      if ((one === "left" && dx < 0) || (one === "right" && dx > 0)) {
        const to = one === "left" ? "right" : "left";
        this.pan = { from: one, to, x0, t: performance.now(), lastX: x0, v: 0, p: 0 };
      } else if (one === "left" || one === "right") {
        this.grabLeaf(one === "right", x0);
      }
    }
    if (this.pan) {
      const r = this.canvas.getBoundingClientRect();
      const pn = this.pan;
      const sign = pn.to === "right" ? -1 : 1;
      const span = r.width * 0.9;
      const now = performance.now();
      const dt = Math.max(1, now - pn.t) / 1000;
      pn.v = pn.v * 0.6 + ((sign * (e.clientX - pn.lastX)) / span / dt) * 0.4;
      pn.t = now;
      pn.lastX = e.clientX;
      // 指に 1:1（行き過ぎは少しだけ抵抗）
      const raw = (sign * (e.clientX - pn.x0)) / span;
      pn.p = raw < 0 ? raw * 0.25 : raw > 1 ? 1 + (raw - 1) * 0.25 : raw;
      const a = this.centerOf(pn.from);
      this.fcx = this.tcx = a + (this.centerOf(pn.to) - a) * pn.p;
      this.dirty = true;
      return;
    }
    if (!this.drag || !this.active) return;
    const r = this.canvas.getBoundingClientRect();
    const l = this.active.leaves[this.drag.leaf];
    // 指に 1:1: 見開きは画面の幅の半分、片ページ（ページが画面いっぱい）は画面の幅ほど動かすと1枚ぶん
    const span = r.width * (this.single ? 0.95 : 0.5);
    const p = this.drag.p0 + (this.drag.x0 - e.clientX) / span;
    const now = performance.now();
    const dt = Math.max(1, now - this.drag.t) / 1000;
    const inst = (this.drag.lastX - e.clientX) / span / dt;
    this.drag.vx = this.drag.vx * 0.6 + inst * 0.4;
    this.drag.t = now;
    this.drag.lastX = e.clientX;
    const prev = l.p.x;
    l.p.x = Math.max(0, Math.min(1, p));
    l.p.target = l.p.x;
    l.p.v = (l.p.x - prev) / dt;
    this.dirty = true;
  }

  /** 画面が縦に送られて指が取られた（押した・払ったとは数えない）。 */
  pointerCancel() {
    this.wake();
    this.clearPress();
    this.pressed = false;
    this.down = null;
    this.pending = null;
    if (this.pan) {
      this.tcx = this.centerOf(this.pan.from);
      this.pan = null;
      this.kick();
    }
    if (this.drag && this.active) {
      const l = this.active.leaves[this.drag.leaf];
      l.p.target = l.p.x > 0.5 ? 1 : 0;
      this.kick();
    }
    this.drag = null;
  }

  pointerUp(e: PointerEvent) {
    this.wake();
    this.clearPress();
    const d = this.down;
    this.down = null;
    this.pending = null;
    // 長押しが成立した指を離した: 押した・払ったとは数えない（受け取る側がもう画面を開いている）。
    if (this.pressed) {
      this.pressed = false;
      return;
    }
    if (this.pan) {
      // 離した速さも見て、隣のページへ移るか元へ戻るかを決める（残りは滑らかに寄る）。
      const pn = this.pan;
      this.pan = null;
      const go = pn.p + pn.v * 0.18 > 0.4;
      this.setFocus(go ? pn.to : pn.from);
      if (go) this.events.onFocusSide?.(pn.to);
      return;
    }
    const moved = d ? Math.hypot(e.clientX - d.x, e.clientY - d.y) : 99;
    // 表紙を閉じて持っている時に左へ払う → 表紙を開く。最初の見開きで右へ払う → 表紙へ戻る。
    if (
      this.active &&
      d &&
      moved > 24 &&
      !this.coverShut &&
      this.page === 0 &&
      this.open.x > 0.85
    ) {
      // 最初のページ（扉）を右へ払う → 表紙へ戻る。扉の紙を掴んでいても（片ページの時）表紙へ。
      if (e.clientX - d.x > 0 && (!this.drag || this.drag.leaf === 0)) {
        if (this.drag) {
          this.active.leaves[0].p.target = 0;
          this.drag = null;
        }
        this.flip(-1);
        return;
      }
    }
    if (this.active && !this.drag && d && moved > 24) {
      const dx = e.clientX - d.x;
      if (this.coverShut && dx < 0) {
        this.flip(1);
        return;
      }
      if (!this.coverShut && this.page === 0 && dx > 0 && this.open.x > 0.85) {
        this.flip(-1);
        return;
      }
    }
    // **押しただけ**なら、指が少し揺れても「押した」（オーナー指示 2026-09-29「見開きの
    // 片側ページを長押しではなくタップすると片側ページが全画面に」）。指の腹は離す時に
    // 数 px ずれるので、8px では短く押しても払いに数えられ、何も起きないことがあった。
    // 短い（0.35 秒未満）押しは 16px まで、それ以外は 10px まで「押した」に数える。
    const quick = d ? performance.now() - d.t < 350 : false;
    const slop = quick ? 16 : 10;
    if (this.drag && this.active) {
      const l = this.active.leaves[this.drag.leaf];
      if (moved > slop) {
        // 離した速さを引き継いで、行き先を予測して決める
        const projected = l.p.x + this.drag.vx * 0.18;
        l.p.target = projected > 0.5 ? 1 : 0;
        l.p.v = this.drag.vx;
        this.page = this.active.leaves.filter((x) => x.p.target === 1).length;
        this.ensurePages(this.active);
        this.drag = null;
        this.emit();
        this.kick();
        return;
      }
      // 押しただけ: 指の揺れで少し動いた紙を元へ戻す。
      l.p.target = l.p.x > 0.5 ? 1 : 0;
      if (Math.abs(l.p.x - l.p.target) > 0.001) this.kick();
      this.drag = null;
    }
    if (moved > slop) return;
    this.tap(e);
  }

  private tap(e: PointerEvent) {
    if (this.active) {
      // 閉じた表紙を押した → 表紙を開く（片ページで見るのは開いてから）。
      if (this.coverShut) {
        this.flip(1);
        return;
      }
      if (this.open.x < 0.5) return;
      const r = this.canvas.getBoundingClientRect();
      const side = e.clientX > r.left + r.width / 2 ? "right" : "left";
      // **押したページを片ページで大きく**（R14）。めくるのは払う・矢印の釦で。
      // 受け取る側が無い時だけ、前と同じく押した側へめくる。
      if (this.events.onPageTap) this.events.onPageTap(side);
      else this.flip(side === "right" ? 1 : -1);
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
    if (!book) return;
    if (this.events.onBookTap) this.events.onBookTap(book.data, () => this.openBook(book));
    else this.openBook(book);
  }

  /** i 冊目（左から）を押したのと同じ（読み上げ用の釦から開く時）。 */
  openMonth(i: number) {
    this.wake();
    const book = this.books[i];
    if (!book || this.active) return;
    if (this.events.onBookTap) this.events.onBookTap(book.data, () => this.openBook(book));
    else this.openBook(book);
  }

  /** 片ページ（left / right / cover）へ寄る・見開き（spread）へ戻る。 */
  setFocus(side: "spread" | "left" | "right" | "cover") {
    this.wake();
    if (side === "spread") {
      this.focus.target = 0;
    } else {
      this.focusSide = side;
      this.tcx =
        side === "left" ? JOINT - LEAF_W / 2 : side === "cover" ? W / 2 : JOINT + LEAF_W / 2;
      this.tw = side === "cover" ? W : LEAF_W;
      if (this.focus.x < 0.001 || this.reduce) {
        this.fcx = this.tcx;
        this.fw = this.tw;
      }
      this.focus.target = 1;
    }
    if (this.reduce) {
      this.focus.x = this.focus.target;
      this.focus.v = 0;
    }
    this.kick();
  }

  flip(dir: 1 | -1) {
    this.wake();
    if (!this.active) return;
    // **表紙までめくれる**（R17「本のアルバムのカバーまでページがめくれるようにして」）。
    // 最初の見開きから戻ると表紙が閉じ、閉じた表紙から進むと表紙が開く。
    if (dir === -1 && this.page === 0 && !this.coverShut) {
      this.coverShut = true;
      this.setCover(0);
      this.emit();
      this.kick();
      return;
    }
    if (dir === 1 && this.coverShut) {
      this.coverShut = false;
      this.setCover(1);
      this.emit();
      this.kick();
      return;
    }
    if (dir === 1 && this.page < this.active.leaves.length) {
      this.active.leaves[this.page].p.target = 1;
      this.page++;
    } else if (dir === -1 && this.page > 0) {
      this.page--;
      this.active.leaves[this.page].p.target = 0;
    }
    this.ensurePages(this.active);
    this.emit();
    this.kick();
  }

  /** 葉 i の表（右ページ）。0 枚目は扉、ほかは (i-1) 日目の日記。日が無ければ null。 */
  private paintRecto(b: Book, i: number): Canvas | null {
    if (!b.days.length) return null;
    const font = this.events.diaryFont?.() ?? "hand";
    if (i === 0)
      return paintTitlePage(
        ...(this.events.titlePage?.(b.data, b.days.length) ?? [
          `${b.data.y}年${b.data.m}月`,
          `${b.days.length}日ぶんの見開き`,
        ]),
      );
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
    this.wake();
    const b = this.active;
    if (!b || !b.days.length) return;
    b.leaves.forEach((leaf, i) => {
      if (i === 0 || !leaf.recto) return;
      if (dayIndex !== undefined && i - 1 !== dayIndex) return;
      const c = this.paintRecto(b, i);
      if (!c) return;
      leaf.recto = c;
      leaf.front.map?.dispose();
      leaf.front.map = tex(c, true);
      leaf.front.needsUpdate = true;
    });
    this.kick();
  }

  /**
   * 見開きの中身（写真の置き方・一言・日記）を差し替えて、開いている本の絵を描き直す。
   * 日の数が変わった時は何もしない（紙の枚数は本を開いた時に決まるので、次に開き直した時に
   * 揃う）。変えられたら true。
   */
  refreshDays(): boolean {
    const b = this.active;
    if (!b || !b.days.length) return false;
    const next = this.events.days?.(b.data).slice(0, MAX_DAYS) ?? [];
    if (next.length !== b.days.length) return false;
    b.days = next;
    this.repaintAlbum();
    this.repaintDiary();
    return true;
  }

  /**
   * 写真の置き方・一言が変わった → 開いている本の左ページ（その日のアルバム）を描き直す。
   * 葉 i の裏が i 日目のアルバム（`paintVerso`）。
   */
  repaintAlbum(dayIndex?: number) {
    this.wake();
    const b = this.active;
    if (!b || !b.days.length) return;
    b.leaves.forEach((leaf, i) => {
      if (!leaf.verso) return;
      if (dayIndex !== undefined && i !== dayIndex) return;
      const c = this.paintVerso(b, i);
      if (!c) return;
      leaf.verso = c;
      leaf.back.map?.dispose();
      leaf.back.map = tex(mirror(c), true);
      leaf.back.needsUpdate = true;
    });
    this.kick();
  }

  /**
   * いまの見開きの片側の絵（片ページで大きく見せる用）。左は1つ前の紙の裏
   * （最初は見返し）、右はいまの紙の表（最後は最後のページ）。
   */
  pageCanvas(side: "left" | "right" | "cover"): Canvas | null {
    const b = this.active;
    if (!b) return null;
    if (side === "cover") return b.coverCanvas ?? null;
    this.ensurePages(b);
    if (side === "left")
      return this.page > 0 ? b.leaves[this.page - 1].verso : (b.endFront ?? null);
    return this.page < b.leaves.length ? b.leaves[this.page].recto : (b.endBack ?? null);
  }

  /** いまの見開きが何番目か（0＝表紙を開いた所）と、見開きの数。 */
  get spread(): { at: number; count: number } {
    return {
      at: this.coverShut ? -1 : this.page,
      count: (this.active?.leaves.length ?? LEAVES) + 1,
    };
  }

  /**
   * 開いた本の片側のページが、いま画面のどこに写っているか（CSS の px、画面の左上から）。
   * 片ページへ**ページの位置から大きくなって移る**動きの出発点（R17）。
   */
  pageRect(side: "left" | "right" | "cover"): DOMRect | null {
    const b = this.active;
    if (!b) return null;
    b.group.updateMatrixWorld(true);
    const inner = b.group.children[0];
    const z = T / 2 + 0.001;
    const x0 = side === "left" ? JOINT - LEAF_W : side === "cover" ? 0 : JOINT;
    const x1 = side === "left" ? JOINT : side === "cover" ? W : JOINT + LEAF_W;
    const r = this.canvas.getBoundingClientRect();
    let l = Infinity;
    let t = Infinity;
    let rr = -Infinity;
    let bb = -Infinity;
    for (const x of [x0, x1])
      for (const y of [-LEAF_H / 2, LEAF_H / 2]) {
        const v = inner.localToWorld(new THREE.Vector3(x, y, z)).project(this.camera);
        const px = r.left + ((v.x + 1) / 2) * r.width;
        const py = r.top + ((1 - v.y) / 2) * r.height;
        l = Math.min(l, px);
        rr = Math.max(rr, px);
        t = Math.min(t, py);
        bb = Math.max(bb, py);
      }
    return new DOMRect(l, t, rr - l, bb - t);
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
    this.wake();
    if (this.active) return;
    void preloadSfx(["book-open"]);
    this.paintInside(b);
    this.active = b;
    this.page = 0;
    this.coverShut = false;
    this.ensurePages(b, this.openAt === "first" ? 1 : b.days.length);
    this.pull.target = 1;
    this.present.target = 1;
    this.dim.target = 1;
    // 手元に来てから表紙を開く（開き始めは少し遅らせる）
    window.setTimeout(
      () => {
        if (this.active === b) {
          this.setCover(1);
          // 表紙が開く瞬間に、録った「表紙のきしみ→紙をめくる」を鳴らす。
          playSfx("book-open");
          this.kick();
          // **その月の最初の日**（`first`）なら扉を1枚めくるだけ。`latest` はいちばん
          // 新しい日の見開きまで、1枚ずつ続けてめくる（ぱらぱら）。
          const last = this.openAt === "first" ? Math.min(1, b.days.length) : b.days.length;
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
    this.wake();
    const b = this.active;
    if (!b) return;
    this.focus.target = 0;
    this.focus.x = 0;
    this.focus.v = 0;
    for (const l of b.leaves) l.p.target = 0;
    this.ensurePages(b, 0);
    this.page = 0;
    this.coverShut = false;
    this.setCover(0);
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
      pages: this.active?.leaves.length ?? LEAVES,
      cover: this.coverShut,
    });
  }

  // ---- 描く -------------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 棚が必ず収まる距離。2段（高さ ≈0.6m・幅 ≈0.45m）と、ホームの1段（高さ ≈0.28m・
    // 幅 ≈0.44m。少し上から見下ろす）。
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const one = this.rows === 1;
    if (this.bounds && this.room) {
      // 部屋の棚: 棚の幅が画面の幅いっぱい（両端に少しだけ壁）。縦長の全画面でも幅で合わせ、
      // 上下は部屋（CSS）が見える。正面から、ほんの少し上から見下ろす。
      const size = this.bounds.getSize(new THREE.Vector3());
      const c = this.bounds.getCenter(new THREE.Vector3());
      const halfW = size.x / 2 + 0.012;
      const halfH = size.y / 2 + 0.02;
      const front = this.bounds.max.z;
      const d = Math.max(halfH / Math.tan(vfov / 2), halfW / Math.tan(hfov / 2));
      this.camera.position.set(c.x, c.y + 0.02, front + d);
      this.camera.lookAt(c.x, c.y, front);
      this.readingY = c.y;
    } else if (this.bounds) {
      // ぴったりの棚: 正面から、棚の外形がちょうど収まる距離に。縦長の画面（本を選ぶ
      // 全画面）では、少ない冊数の棚が巨大にならないよう幅を 0.34m 以上として見る。
      const size = this.bounds.getSize(new THREE.Vector3());
      const c = this.bounds.getCenter(new THREE.Vector3());
      const halfW = this.camera.aspect < 1 ? Math.max(size.x / 2, 0.17) : size.x / 2;
      const halfH = size.y / 2;
      const front = this.bounds.max.z;
      const d = Math.max(halfH / Math.tan(vfov / 2), halfW / Math.tan(hfov / 2));
      this.camera.position.set(c.x, c.y, front + d);
      this.camera.lookAt(c.x, c.y, front);
      this.readingY = c.y;
    } else {
      const lookY = one ? ROW_H * 0.5 : ROW_H * 0.55;
      const dist = one
        ? Math.max(0.15 / Math.tan(vfov / 2), 0.225 / Math.tan(hfov / 2))
        : Math.max(0.32 / Math.tan(vfov / 2), 0.25 / Math.tan(hfov / 2));
      this.camera.position.set(0.0, lookY + (one ? 0.03 : 0.05), dist + 0.1);
      this.camera.lookAt(0, lookY, 0);
      this.readingY = one ? lookY : ROW_H * 0.52;
    }
    this.camera.updateProjectionMatrix();
    // 開いた本（幅 ≈0.30m）が画面の幅に収まる手元の位置
    // 部屋の棚では**見開きを大きく**（R17「本を開いたときに見開きのページを大きく表示」）:
    // 見開き（≈0.30m）が画面の幅の 9 割になる所まで寄せる（手前に傾くぶんの余白を残す）。
    const need = (this.room ? 0.34 : 0.33) / 2 / Math.tan(hfov / 2);
    this.readingZ = this.camera.position.z - need;
    // 大きさを変えると絵が消える（WebGL の描き先が作り直される）。次のコマを待たずに
    // その場で描き直す — 待つと、全画面から帯へ戻った瞬間に1コマ空の棚が見える。
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  private kick() {
    this.dirty = true;
  }

  /** 画面の外に出ている間は描かない（ホームを下へ送った時に電池を使わない）。 */
  private paused = false;
  setPaused(v: boolean) {
    this.paused = v;
    if (!v) this.dirty = true;
  }

  start() {
    const loop = (t: number) => {
      if (this.disposed) {
        this.looping = false;
        return;
      }
      const dt = Math.min(1 / 30, this.last ? (t - this.last) / 1000 : 1 / 60);
      this.last = t;
      if (this.paused && !this.active) {
        // 画面の外: 描かずに輪を止める（戻ってきたら setPaused(false) が起こす）。
        this.looping = false;
        return;
      }
      this.raf = requestAnimationFrame(loop);
      let moving = false;
      moving = this.stepCover(dt) || moving;
      const springs = [this.pull, this.present, this.dim, this.focus];
      for (const s of springs) {
        if (this.reduce) {
          s.x = s.target;
          s.v = 0;
        } else moving = step(s, dt) || moving;
      }
      // 寄る先のページの中心・幅がなめらかに動く（左→右のページへ移る時に本が滑る）。
      const ease = 1 - Math.exp(-dt * 10);
      if (Math.abs(this.tcx - this.fcx) > 1e-5 || Math.abs(this.tw - this.fw) > 1e-5) {
        this.fcx += (this.tcx - this.fcx) * ease;
        this.fw += (this.tw - this.fw) * ease;
        moving = true;
      }
      const b = this.active;
      if (b) {
        b.leaves.forEach((l, i) => {
          if (this.drag?.leaf === i) {
            moving = true;
          } else if (this.reduce) {
            l.p.x = l.p.target;
          } else moving = step(l.p, dt) || moving;
          this.shapeLeaf(l, i, b.leaves.length);
          // 閉じている間は表紙の内側に紙がめり込むので隠す
          l.group.visible = this.open.x > 0.03;
        });
        this.pose(b);
      }
      (this.dimMesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * this.dim.x;
      if (moving || this._dirty) {
        this.renderer.render(this.scene, this.camera);
        this._dirty = false;
        this.idleFrames = 0;
      } else if (!this.drag && !this.pending && ++this.idleFrames > 45) {
        // 0.75 秒ほど何も動いていない: 輪を止める（指・描き直しの印・操作で起きる）。
        cancelAnimationFrame(this.raf);
        this.looping = false;
      }
    };
    this.loopFn = loop;
    this.looping = true;
    this.raf = requestAnimationFrame(loop);
  }

  /** 棚 → 引き出し → 手元（弧）→ 開く、を今のばねの値から置く。 */
  private pose(b: Book) {
    const pull = this.pull.x;
    const pr = Math.max(0, Math.min(1.05, this.present.x));
    const shelf = b.shelfPos.clone();
    shelf.z += 0.075 * pull;
    const openX = Math.max(0, Math.min(1, this.open.x));
    const reading = new THREE.Vector3(-W / 2 + (W / 2) * openX, this.readingY, this.readingZ);
    const p = shelf.lerp(reading, pr);
    p.y += 0.06 * Math.sin(Math.PI * Math.min(1, pr)); // 弧を描いて寄る
    const qShelf = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const qRead = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.room ? -0.16 : -0.32, 0, 0),
    );
    b.group.quaternion.copy(qShelf.slerp(qRead, Math.min(1, pr)));
    const f = Math.max(0, Math.min(1.05, this.focus.x));
    if (f > 0.0005 && this.focusSide) {
      // 片ページ: 寄る先のページが画面の幅いっぱい（縦は上下の釦の間）の真ん中に来る姿勢を、
      // 画面への写り方（射影）を測りながら求め、見開きの姿勢との間を `focus` で行き来する。
      const cw = this.canvas.clientWidth || 1;
      const ch = this.canvas.clientHeight || 1;
      const vfov = (this.camera.fov * Math.PI) / 180;
      const tanH = Math.tan(vfov / 2) * (cw / ch);
      const tanV = Math.tan(vfov / 2);
      const availH = Math.max(0.5, (ch - 200) / ch);
      const wantW = Math.min(1.88, (2 * availH) / ((LEAF_H / this.fw) * (cw / ch)));
      const inner = b.group.children[0];
      const tgt = p.clone();
      const at = (x: number, y: number) =>
        inner.localToWorld(new THREE.Vector3(x, y, T / 2 + 0.001));
      const measure = () => {
        b.group.position.copy(tgt);
        b.group.updateMatrixWorld(true);
        const l = at(this.fcx - this.fw / 2, 0);
        const r = at(this.fcx + this.fw / 2, 0);
        const m = at(this.fcx, 0);
        const pl = l.clone().project(this.camera);
        const pr2 = r.clone().project(this.camera);
        const pm = m.clone().project(this.camera);
        return {
          w: Math.abs(pr2.x - pl.x),
          cx: pm.x,
          cy: pm.y,
          dist: this.camera.position.z - m.z,
        };
      };
      let m = measure();
      tgt.z += m.dist - m.dist * (m.w / wantW);
      m = measure();
      tgt.z += m.dist - m.dist * (m.w / wantW);
      m = measure();
      tgt.x -= m.cx * m.dist * tanH;
      tgt.y -= m.cy * m.dist * tanV;
      p.lerp(tgt, f);
    }
    b.group.position.copy(p);
    // 硬い表紙: 蝶番で板のまま回る（曲がらない）
    b.front.rotation.y = -Math.PI * Math.max(0, Math.min(1, this.open.x));
  }

  /** 表紙を開く（1）・閉じる（0）。硬い板として倒れる（`open` の注）。 */
  private setCover(target: 0 | 1) {
    const o = this.open;
    if (o.target === target && o.t < o.dur + 0.4) return;
    o.from = o.x;
    o.target = target;
    o.t = 0;
    // 残りの角度が少ないほど短く（途中で向きを変えた時も同じ速さで倒れる）
    o.dur = 0.44 * Math.max(0.35, Math.abs(target - o.x));
    if (this.reduce) {
      o.x = target;
      o.t = o.dur + 1;
    }
  }

  private stepCover(dt: number): boolean {
    const o = this.open;
    const end = o.dur + 0.34;
    if (o.t >= end) {
      o.x = o.target;
      return false;
    }
    o.t += dt;
    const span = o.target - o.from;
    if (o.t < o.dur) {
      // 持ち上げは素早く、垂直（半分）を越えたら重さで加速して倒れる
      const p = o.t / o.dur;
      const e = p < 0.5 ? 1 - Math.pow(1 - 2 * p, 1.6) * 1 : 1 + Math.pow(2 * p - 1, 2.2);
      o.x = o.from + (span * e) / 2;
    } else {
      // 着いた所で 1 回だけ小さく跳ねて止まる（パタッ）
      const u = o.t - o.dur;
      o.x = o.target - span * 0.035 * Math.exp(-u * 16) * Math.sin(u * 38);
    }
    return true;
  }

  /**
   * **いまの棚の絵**（R20「アプリを開いた時に早く表示したい。端末内にデータを入れとくのでもいい」）。
   * 端末に置いておき、次に開いた時は 3D の支度（three.js の読み込み・形・字の絵）を待たずに
   * この絵を先に出す。本を開いている間は撮らない。`books: false` は本を抜いた空の棚
   * （初めての人に出す同梱の絵を作る時だけ使う）。
   */
  snapshot(opts: { books?: boolean } = {}): string | null {
    if (this.active || this.disposed) return null;
    const hide = opts.books === false;
    if (hide) for (const b of this.books) b.group.visible = false;
    this.renderer.render(this.scene, this.camera);
    // 描いた直後（同じ処理の中）に読む。描画の器は次の描画で消えるため。
    const url = this.canvas.toDataURL("image/webp", 0.86);
    if (hide) for (const b of this.books) b.group.visible = true;
    this.dirty = true;
    return url;
  }

  /**
   * `snapshot` と同じ絵を、**画面を止めずに**作る（`toBlob` は絵の圧縮を裏で行う）。
   * `toDataURL` は圧縮が終わるまで画面を止め、スマホでは開くたびに 0.5 秒ほど固まっていた
   * （オーナー報告 2026-09-29「アプリ全体がカクカク」）。描いた直後に呼ぶのは同じ。
   */
  snapshotBlob(): Promise<Blob | null> {
    if (this.active || this.disposed) return Promise.resolve(null);
    this.renderer.render(this.scene, this.camera);
    this.dirty = true;
    return new Promise((ok) => this.canvas.toBlob((b) => ok(b), "image/webp", 0.86));
  }

  dispose() {
    this.disposed = true;
    this.clearPress();
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
