/**
 * **本物の紙でできた 3D の紙吹雪**（②キャッチ・祝福。オーナー指示 2026-09-28）。
 *
 * 2D の紙吹雪は「色の四角が回る」だけで、紙に見えない。本物の紙吹雪が紙に見えるのは:
 *   1. **面が光を受けて明滅する** — 回って光源の方を向いた一瞬だけ白く光る
 *   2. **平らな面ほどゆっくり落ちる** — 空気を受ける向きで落ちる速さが変わる
 *   3. **ひらひら横に揺れる** — 落ちながら左右に滑る（木の葉の落ち方）
 * の3つ。ここでは紙を 1 枚ずつ 3D の板にし、部屋の光（環境光）と上からの光で照らし、
 * 向きで空気の抵抗を変えて落とす。2割は金の箔（金属）にして、光った時にきらっと返す。
 *
 * 1回撃つと 4 秒ほどで全部落ち切り、自分で片付く（`onDone`）。
 *
 * **軽くした（UI 監査 2026-10-03: はがした後の「弾ける」瞬間に 4.3 秒の固まり）。**
 * 固まりの正体は、撃つ瞬間に作っていた部屋の光（`RoomEnvironment` を PMREM でぼかす）と、
 * それを読む物理ベースの材質の初回の組み立て。GPU 側の仕事が重く、主の処理がその間ずっと
 * 待たされていた（ハーネスの計測で、紙吹雪を止めると固まりが消えた）。そこで:
 * - 部屋の光は、6面の小さな絵（`roomCube`）を箔に**そのまま**映す（ぼかしの計算が要らない）。
 * - 紙は Lambert、箔は Phong（光の受け方・明滅・金のきらめきは同じ考え方で、組み立てが軽い）。
 * - 撃つ前に用意できる（`prepareConfetti3d` → `fire`）。演出は「持ち上げる」間に用意し、
 *   弾ける瞬間は動かすだけにする。
 */
import { createStage } from "./stage";

export type ConfettiShot = {
  /** 打ち上げる場所（画面の割合 0..1）。 */
  from: "corners" | { x: number; y: number };
  /** 紙の枚数。 */
  count?: number;
  /** 色（紙）。箔は金色で固定。 */
  colors?: string[];
};

const APP_COLORS = ["#0a84ff", "#58d7ff", "#ff5a6e", "#ffd23f", "#34c759", "#ffffff", "#bf5af2"];

type Piece = {
  p: [number, number, number];
  v: [number, number, number];
  axis: [number, number, number];
  w: number;
  phase: number;
  sway: number;
  q: [number, number, number, number];
  foil: boolean;
};

/**
 * 部屋の光の代わりの、6面の小さな絵（上が明るい天井、横は窓のある壁、下は暗い床）。
 * 箔はこれを映して金に光る。ぼかしの計算（PMREM）を通さないので、作るのも読むのも軽い。
 */
function roomCube(THREE: typeof import("three")) {
  const face = (top: string, bottom: string, window = false) => {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d");
    if (!g) return c;
    const grad = g.createLinearGradient(0, 0, 0, 16);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    if (window) {
      g.fillStyle = "#ffffff";
      g.fillRect(4, 3, 8, 6);
    }
    return c;
  };
  const side = (window: boolean) => face("#f4f4f4", "#6b6f78", window);
  // 並び: +x, -x, +y(天井), -y(床), +z, -z
  const cube = new THREE.CubeTexture([
    side(true),
    side(false),
    face("#ffffff", "#ffffff"),
    face("#3a3d44", "#3a3d44"),
    side(true),
    side(false),
  ]);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}

/** 撃つ前に用意した紙吹雪。`fire` で撃ち、`cancel` で（撃たずに）片付ける。 */
export type ConfettiHandle = { fire(): void; cancel(): void };

/** canvas の上で1回撃つ。止める関数（WebGL が無ければ `null`）。 */
export function runConfetti3d(
  canvas: HTMLCanvasElement,
  shot: ConfettiShot,
  onDone?: () => void,
): (() => void) | null {
  const handle = setupConfetti3d(canvas, shot, onDone);
  if (!handle) return null;
  handle.fire();
  return handle.cancel;
}

function setupConfetti3d(
  canvas: HTMLCanvasElement,
  shot: ConfettiShot,
  onDone?: () => void,
): ConfettiHandle | null {
  const stage = createStage(canvas, { fov: 40, z: 12, environment: false, tone: "neutral" });
  if (!stage) return null;
  const { THREE, scene } = stage;
  const view = stage.viewAt(0);
  const count = shot.count ?? 160;
  const colors = shot.colors ?? APP_COLORS;

  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(2, 8, 6);
  scene.add(key);
  // 部屋の光（環境光）が受け持っていた柔らかい明るさを、空と床の光で補う。
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.6));

  // 紙の大きさ: 画面の幅の 2.4% × 1.5%（スマホで 9×6px 前後、本物の紙吹雪の比）。
  const pw = view.w * 0.024;
  const ph = view.w * 0.015;
  const geo = new THREE.PlaneGeometry(pw, ph);
  const room = roomCube(THREE);
  const paper = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  // 金属の箔: 部屋を映した色に金を掛ける（Multiply）＋上からの光の鋭いきらめき。
  const foil = new THREE.MeshPhongMaterial({
    side: THREE.DoubleSide,
    color: 0xf2c867,
    specular: 0xfff1c4,
    shininess: 90,
    envMap: room,
    combine: THREE.MultiplyOperation,
    reflectivity: 1,
  });
  const nFoil = Math.round(count * 0.2);
  const nPaper = count - nFoil;
  const paperMesh = new THREE.InstancedMesh(geo, paper, nPaper);
  const foilMesh = new THREE.InstancedMesh(geo, foil, nFoil);
  const c = new THREE.Color();
  for (let i = 0; i < nPaper; i++) {
    c.set(colors[i % colors.length]);
    paperMesh.setColorAt(i, c);
  }
  scene.add(paperMesh, foilMesh);

  const pieces: Piece[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const spawn = (x: number, y: number, dirX: number, spread: number, speed: number) => {
    const ax = rnd(-1, 1);
    const ay = rnd(-1, 1);
    const az = rnd(-1, 1);
    const al = Math.hypot(ax, ay, az) || 1;
    const ang = Math.PI / 2 + dirX * 0.45 + rnd(-spread, spread);
    const sp = speed * rnd(0.65, 1.1);
    return {
      p: [x, y, rnd(-1.2, 1.2)] as [number, number, number],
      v: [Math.cos(ang) * sp, Math.sin(ang) * sp, rnd(-1, 1)] as [number, number, number],
      axis: [ax / al, ay / al, az / al] as [number, number, number],
      w: rnd(6, 16),
      phase: rnd(0, Math.PI * 2),
      sway: rnd(0.6, 1.4),
      q: [0, 0, 0, 1] as [number, number, number, number],
      foil: false,
    };
  };
  const speed = view.h * 1.55;
  for (let i = 0; i < count; i++) {
    let piece: Piece;
    if (shot.from === "corners") {
      const left = i % 2 === 0;
      piece = spawn((left ? -0.5 : 0.5) * view.w, -0.52 * view.h, left ? -1 : 1, 0.28, speed);
    } else {
      const x = (shot.from.x - 0.5) * view.w;
      const y = (0.5 - shot.from.y) * view.h;
      piece = spawn(x, y, 0, Math.PI * 0.9, speed * 0.62);
    }
    piece.foil = i >= nPaper;
    pieces.push(piece);
  }

  const g = view.h * 0.9;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const dq = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const normal = new THREE.Vector3();
  let finished = false;
  let fired = false;
  let fade = 1;
  // 撃つまでは全部の紙を大きさ 0 にしておく（用意の1枚は何も描かない）。
  m.makeScale(0, 0, 0);
  for (let i = 0; i < nPaper; i++) paperMesh.setMatrixAt(i, m);
  for (let i = 0; i < nFoil; i++) foilMesh.setMatrixAt(i, m);
  const dispose = () => {
    if (finished) return;
    finished = true;
    room.dispose();
    stage.dispose();
  };
  // 材質の組み立てを先に済ませる。並行して組み立てられる環境（KHR_parallel_shader_compile）
  // なら主の処理を待たせない。済んだら何も映らない1枚を描き、GPU 側も温めておく。
  const warm = () => {
    if (!finished && !fired) stage.renderer.render(scene, stage.camera);
  };
  try {
    void stage.renderer.compileAsync(scene, stage.camera).then(warm, warm);
  } catch {
    warm();
  }
  const run = (t: number, dt: number) => {
    let alive = 0;
    let pi = 0;
    let fi = 0;
    for (const pc of pieces) {
      q.set(pc.q[0], pc.q[1], pc.q[2], pc.q[3]);
      // 紙の面の向き: 水平に近い（空気を正面で受ける）ほど強く止められる。
      normal.set(0, 0, 1).applyQuaternion(q);
      const flat = Math.abs(normal.y);
      const drag = 0.9 + 3.4 * flat;
      const sp = Math.hypot(pc.v[0], pc.v[1], pc.v[2]);
      pc.v[1] -= g * dt;
      for (let k = 0; k < 3; k++) pc.v[k] -= pc.v[k] * Math.min(1, drag * sp * 0.012 * dt * 10);
      // ひらひら: 落ちている間だけ、横へ滑る力が周期で向きを変える。
      if (pc.v[1] < 0) pc.v[0] += Math.sin(t * 5 * pc.sway + pc.phase) * view.w * 0.9 * flat * dt;
      pc.p[0] += pc.v[0] * dt;
      pc.p[1] += pc.v[1] * dt;
      pc.p[2] += pc.v[2] * dt;
      // 回転（落ちるほど回転はゆっくりに）。
      ax.set(pc.axis[0], pc.axis[1], pc.axis[2]);
      dq.setFromAxisAngle(ax, pc.w * dt * (0.5 + Math.min(1, sp / speed)));
      q.multiply(dq);
      pc.q = [q.x, q.y, q.z, q.w];
      if (pc.p[1] > -view.h * 0.62) alive++;
      pos.set(pc.p[0], pc.p[1], pc.p[2]);
      scl.setScalar(fade);
      m.compose(pos, q, scl);
      if (pc.foil) foilMesh.setMatrixAt(fi++, m);
      else paperMesh.setMatrixAt(pi++, m);
    }
    paperMesh.instanceMatrix.needsUpdate = true;
    foilMesh.instanceMatrix.needsUpdate = true;
    // 全部落ち切った・4.2 秒を過ぎた → 小さくして片付ける。
    if ((alive === 0 || t > 4.2) && !finished) {
      fade = Math.max(0, fade - dt * 3);
      if (fade === 0) {
        dispose();
        onDone?.();
      }
    }
  };
  return {
    fire() {
      if (fired || finished) return;
      fired = true;
      stage.start(run);
    },
    cancel: dispose,
  };
}

/**
 * 画面いっぱいの透明な canvas を一時的に置いて撃つ（呼ぶ側に canvas が無い時）。
 * 片付けも自分でする。WebGL が無ければ何もしない（`false`）。
 */
export function burstConfetti3d(
  shot: ConfettiShot,
  zIndex = 90,
  /** 置く場所。演出の層の中に置けば、その層の中の重なり順（札の後ろ等）に入る。 */
  parent: HTMLElement = document.body,
): boolean {
  const handle = prepareConfetti3d(shot, zIndex, parent);
  handle?.fire();
  return !!handle;
}

/**
 * **撃つ前に用意する**（canvas を置き、WebGL と材質を組み立てておく）。弾ける瞬間に
 * `fire()` を呼ぶだけで動き出す。撃たれないまま 15 秒たつと自分で片付く。
 */
export function prepareConfetti3d(
  shot: ConfettiShot,
  zIndex = 90,
  parent: HTMLElement = document.body,
): ConfettiHandle | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100dvh",
    pointerEvents: "none",
    zIndex: String(zIndex),
  });
  parent.appendChild(canvas);
  const handle = setupConfetti3d(canvas, shot, () => canvas.remove());
  if (!handle) {
    canvas.remove();
    return null;
  }
  const expire = setTimeout(() => {
    handle.cancel();
    canvas.remove();
  }, 15_000);
  return {
    fire() {
      clearTimeout(expire);
      handle.fire();
    },
    cancel() {
      clearTimeout(expire);
      handle.cancel();
      canvas.remove();
    },
  };
}
