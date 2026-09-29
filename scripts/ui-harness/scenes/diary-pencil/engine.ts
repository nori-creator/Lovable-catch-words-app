/**
 * **鉛筆で日記を書く 3D**（オーナー指示 2026-09-28 R13「日記を書くと添付の動画のように
 * 鉛筆で日記を書くようにして。ただ添付の動画は手がないし、書くスピードも速すぎるから一から
 * クオリティの高いものを Blender、three.js などでリアルなものを作り上げて」）。
 *
 * 添付の動画（X の投稿「I asked Opus 5.5 to make its own sketchbook」）はコマ送りで読んだ:
 * 木の机・暖色の電気スタンドの光・見開きのスケッチブック・緑の鉛筆が1行ずつ書く。
 * 手は無く、1行が 1 秒ほどで書き上がる。ここでは:
 *
 *  - 鉛筆が、人が書く角度（紙から約 50°、右手前へ倒す）で動く。手の再現は見送り
 *    （オーナー指示 2026-09-28「手を再現するのは一旦やめて」）。
 *  - **ゆっくり**書く（1字 0.32 秒・読点で一息・行の終わりで鉛筆を浮かせて次の行頭へ）。
 *  - 字は日記の字体（本人が選んだ手書き風）で、**書いている字だけ左から少しずつ現れる**。
 *    鉛筆の先はその字の中を上下に細かく動く（字を書く手の動き）。
 *  - 黒鉛の粒（紙の凹凸で掠れる）と、書いた所の芯の照り返し。
 *  - 電気スタンドの暖かい光で、鉛筆の柔らかい影がページに落ちる。
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { diaryFont, wrapDiaryLines, type DiaryFontId } from "@/lib/diary-fonts";

export const PENCIL_PACE = {
  /** 1字にかける秒数（添付の動画は 1字 0.06 秒ほど。速すぎると言われた）。 */
  perChar: 0.32,
  /** 読点・句点のあとの一息。 */
  pause: 0.35,
  /** 行を変える時の、鉛筆を浮かせて運ぶ秒数。 */
  newline: 0.7,
};

// ---- 紙の大きさ（メートル。実寸で組む） ---------------------------------------------
const PAGE_W = 0.15;
const PAGE_H = 0.21;
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * PAGE_H) / PAGE_W);

type Glyph = { ch: string; x: number; y: number; w: number; line: number };

export type PencilDiary = {
  /** 書く文を差し替えて最初から書く。 */
  write(text: string, font: DiaryFontId): void;
  dispose(): void;
};

export function createPencilDiary(canvas: HTMLCanvasElement): PencilDiary | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120c08);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.25;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10);

  // ---- 机 -----------------------------------------------------------------------
  const wood = canvasTex(woodCanvas());
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(1.4, 1);
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.2),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  scene.add(desk);

  // ---- 見開きのノート（左は少し書いた前の日、右が今日） -------------------------
  const notebook = new THREE.Group();
  scene.add(notebook);
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(PAGE_W * 2 + 0.014, 0.004, PAGE_H + 0.012),
    new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.7 }),
  );
  cover.position.y = 0.002;
  cover.receiveShadow = true;
  cover.castShadow = true;
  notebook.add(cover);
  // 綴じ目へ向かって少し沈む紙（平らな板は紙に見えない）。side: 綴じ目がどちら側か。
  const pageGeo = (spine: "left" | "right") => {
    const g = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 24, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / PAGE_W + 0.5; // 0 = 左端
      const fromSpine = spine === "left" ? u : 1 - u;
      p.setZ(i, 0.006 * Math.sqrt(Math.max(0, Math.min(1, fromSpine * 1.6))));
    }
    g.computeVertexNormals();
    return g;
  };
  const leftTex = paperCanvas("left");
  const leftPage = new THREE.Mesh(
    pageGeo("right"),
    new THREE.MeshStandardMaterial({ map: canvasTex(leftTex), roughness: 0.92 }),
  );
  leftPage.rotation.x = -Math.PI / 2;
  leftPage.position.set(-PAGE_W / 2, 0.0045, 0);
  leftPage.receiveShadow = true;
  notebook.add(leftPage);

  const inkBase = paperCanvas("right");
  const ink = document.createElement("canvas");
  ink.width = TEX_W;
  ink.height = TEX_H;
  const done = document.createElement("canvas");
  done.width = TEX_W;
  done.height = TEX_H;
  const rightTex = canvasTex(ink);
  const rightPage = new THREE.Mesh(
    pageGeo("left"),
    new THREE.MeshStandardMaterial({ map: rightTex, roughness: 0.9 }),
  );
  rightPage.rotation.x = -Math.PI / 2;
  rightPage.position.set(PAGE_W / 2, 0.0045, 0);
  rightPage.receiveShadow = true;
  notebook.add(rightPage);
  notebook.rotation.y = 0.06;

  // ---- 光: 左上の電気スタンド（暖色）＋部屋のわずかな光 ---------------------------
  const lamp = new THREE.SpotLight(0xffc98a, 4.2, 3, 0.62, 0.8, 1.2);
  lamp.position.set(-0.32, 0.62, -0.18);
  lamp.target.position.set(0.05, 0, 0.02);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.radius = 5;
  lamp.shadow.bias = -0.0002;
  lamp.shadow.camera.near = 0.1;
  lamp.shadow.camera.far = 2;
  scene.add(lamp, lamp.target);
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x2a1a10, 0.35));

  // ---- 鉛筆（六角・濃い緑の塗り・削った木・黒鉛・金の口金・消しゴム） ------------------
  const pencil = makePencil();
  const rig = new THREE.Group(); // 鉛筆を動かす入れ物（原点 = 芯の先）
  scene.add(rig);
  rig.add(pencil.group);
  // 鉛筆の向き（先 → 尻）。右利きの人が書く角度: 紙から約 50°、右手前へ倒す。
  const penDir = new THREE.Vector3(0.52, 0.66, 0.54).normalize();
  // 鉛筆だけで書く（手の再現はオーナー指示 2026-09-28 で見送り）。
  pencil.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), penDir);

  // ---- 書く ------------------------------------------------------------------------
  let glyphs: Glyph[] = [];
  let fontPx = 44;
  let family = "serif";
  let timeline: Array<{ g: Glyph; t0: number; t1: number }> = [];
  let clock = 0;
  let started = 0;
  let doneUpTo = -1;
  const layout = (text: string, font: DiaryFontId) => {
    const f = diaryFont(font);
    family = f.family;
    const ctx = ink.getContext("2d")!;
    const left = 110;
    const right = TEX_W - 80;
    fontPx = 62;
    ctx.font = `400 ${fontPx}px ${family}`;
    const lines = wrapDiaryLines(text, right - left, (s) => ctx.measureText(s).width);
    const lh = Math.round(fontPx * 1.62);
    glyphs = [];
    lines.forEach((line, li) => {
      let x = left;
      const y = 262 + li * lh;
      for (const ch of [...line]) {
        const w = ctx.measureText(ch).width;
        glyphs.push({ ch, x, y, w, line: li });
        x += w;
      }
    });
    timeline = [];
    let t = 0.8;
    let prevLine = 0;
    for (const g of glyphs) {
      if (g.line !== prevLine) {
        t += PENCIL_PACE.newline;
        prevLine = g.line;
      }
      const dur = /\s/.test(g.ch) ? 0.08 : PENCIL_PACE.perChar * (0.8 + 0.4 * Math.random());
      timeline.push({ g, t0: t, t1: t + dur });
      t += dur;
      if (/[、。，．,.!?！？]/.test(g.ch)) t += PENCIL_PACE.pause;
    }
    const dctx = done.getContext("2d")!;
    dctx.clearRect(0, 0, TEX_W, TEX_H);
    doneUpTo = -1;
    started = clock;
  };
  const drawGlyph = (ctx: CanvasRenderingContext2D, g: Glyph, upTo: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x - 4, g.y - fontPx * 1.1, (g.w + 8) * upTo, fontPx * 1.5);
    ctx.clip();
    ctx.font = `400 ${fontPx}px ${family}`;
    ctx.fillStyle = "rgba(38,36,42,0.93)";
    ctx.fillText(g.ch, g.x, g.y);
    ctx.restore();
  };
  const grain = makeGrain();
  const repaint = (current: { g: Glyph; p: number } | null) => {
    const ctx = ink.getContext("2d")!;
    ctx.drawImage(inkBase, 0, 0);
    // 書いた字（黒鉛の粒で掠れさせる）
    ctx.drawImage(done, 0, 0);
    if (current) {
      const tmp = scratch;
      const tctx = tmp.getContext("2d")!;
      tctx.clearRect(0, 0, TEX_W, TEX_H);
      drawGlyph(tctx, current.g, current.p);
      tctx.globalCompositeOperation = "destination-out";
      tctx.drawImage(grain, 0, 0);
      tctx.globalCompositeOperation = "source-over";
      ctx.drawImage(tmp, 0, 0);
    }
    rightTex.needsUpdate = true;
  };
  const scratch = document.createElement("canvas");
  scratch.width = TEX_W;
  scratch.height = TEX_H;
  const commit = (g: Glyph) => {
    const tctx = scratch.getContext("2d")!;
    tctx.clearRect(0, 0, TEX_W, TEX_H);
    drawGlyph(tctx, g, 1);
    tctx.globalCompositeOperation = "destination-out";
    tctx.drawImage(grain, 0, 0);
    tctx.globalCompositeOperation = "source-over";
    done.getContext("2d")!.drawImage(scratch, 0, 0);
  };

  /** ページの画素 → 世界の点（右ページの上）。 */
  const pagePoint = (px: number, py: number, lift: number) => {
    const u = px / TEX_W - 0.5;
    const v = py / TEX_H - 0.5;
    const local = new THREE.Vector3(u * PAGE_W, -v * PAGE_H, 0.0062 + lift);
    return rightPage.localToWorld(local);
  };

  // ---- 動かす ----------------------------------------------------------------------
  const size = { w: 0, h: 0 };
  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === size.w && h === size.h) return;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では右ページが画面の幅いっぱいになるまで寄る。
    const portrait = h > w;
    camera.fov = portrait ? 40 : 30;
    camera.position.set(portrait ? 0.075 : 0.03, portrait ? 0.44 : 0.4, portrait ? 0.2 : 0.3);
    camera.lookAt(portrait ? 0.075 : 0.03, 0, portrait ? 0.0 : 0.0);
    // 確認用: `?cam=x,y,z,tx,ty,tz` で別の角度から見る。
    const cam = new URLSearchParams(location.search).get("cam")?.split(",").map(Number);
    if (cam?.length === 6) {
      camera.position.set(cam[0], cam[1], cam[2]);
      camera.lookAt(cam[3], cam[4], cam[5]);
    }
    camera.updateProjectionMatrix();
  };
  let raf = 0;
  let last = 0;
  const tipNow = new THREE.Vector3();
  const tipGoal = new THREE.Vector3();
  let hover = 0.02;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    resize();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    const t = clock - started;
    // いま書いている字
    let cur: { g: Glyph; p: number } | null = null;
    let target: { x: number; y: number; lift: number } | null = null;
    for (let i = Math.max(0, doneUpTo); i < timeline.length; i++) {
      const e = timeline[i];
      if (t >= e.t1) {
        if (i > doneUpTo) {
          commit(e.g);
          doneUpTo = i;
        }
        continue;
      }
      if (t >= e.t0) {
        const p = (t - e.t0) / (e.t1 - e.t0);
        cur = { g: e.g, p };
        // 字の中を上下に細かく動く（2〜3画ぶん）。
        const wig = Math.sin(p * Math.PI * 5 + e.g.x * 0.07) * 0.32;
        target = {
          x: e.g.x + e.g.w * (0.1 + 0.8 * p),
          y: e.g.y - fontPx * (0.38 + wig),
          lift: /\s/.test(e.g.ch) ? 0.003 : 0,
        };
      } else {
        // 次の字の前（行替え・一息）: 次の字の頭の少し上で待つ。
        target = { x: e.g.x, y: e.g.y - fontPx * 0.4, lift: 0.006 };
      }
      break;
    }
    if (!target) {
      // 書き終わった: 鉛筆を少し浮かせて、最後の字の右で休む。
      const g = glyphs[glyphs.length - 1];
      target = g ? { x: g.x + g.w + 30, y: g.y + 20, lift: 0.02 } : { x: 400, y: 400, lift: 0.03 };
    }
    repaint(cur);
    hover += (target.lift - hover) * Math.min(1, dt * 10);
    tipGoal.copy(pagePoint(target.x, target.y, hover));
    // 鉛筆は字の点を少し遅れて追う（重さのある動き）。
    tipNow.lerp(tipGoal, Math.min(1, dt * (target.lift > 0.004 ? 7 : 18)));
    if (tipNow.lengthSq() === 0) tipNow.copy(tipGoal);
    rig.position.copy(tipNow);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    write(text: string, font: DiaryFontId) {
      const go = () => layout(text, font);
      // 字体が読めてから並べる（読めていない字体で測ると字の幅がずれる）。
      const f = diaryFont(font);
      if (document.fonts?.load) {
        void document.fonts.load(`50px ${f.family}`, text.slice(0, 20)).then(go, go);
      } else go();
    },
    dispose() {
      cancelAnimationFrame(raf);
      scene.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      env.dispose();
      renderer.dispose();
    },
  };
}

// ---- 部品 -----------------------------------------------------------------------------

function makePencil() {
  const group = new THREE.Group();
  const L = 0.165;
  const R = 0.0038;
  // 芯（R14「日記の鉛筆芯が出てないから鉛筆の芯を再現して」）。前は芯の円すいが
  // 削った木の中に埋まっていて、先の 2mm だけが木と同じ太さで覗いていた — 遠目には
  // 木の先が尖っているだけに見えた。本物の削った鉛筆に合わせる:
  //  ・黒鉛の芯は直径 2mm、木から **6.5mm** 出る（削り器で削った長さ）
  //  ・削った木の円すいは 19mm、先は芯と同じ太さで終わる
  //  ・芯は鈍い金属のような光（黒鉛は光を少し返す）で、先ほど細く、書いて丸くなった先
  //  ・木の切り口には芯の黒い輪が見える（中心を通る細い円柱で表す）
  const LEAD = 0.0065; // 芯が出ている長さ
  const CONE = 0.019; // 削った木の長さ
  const RL = 0.00102; // 芯の半径
  const T = LEAD + CONE; // 塗りの胴が始まる高さ
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, L, 6),
    new THREE.MeshPhysicalMaterial({
      color: 0x1f4a3a,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    }),
  );
  body.position.y = T + L / 2;
  const wood = new THREE.Mesh(
    new THREE.CylinderGeometry(R, RL * 1.04, CONE, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xdcb88a, roughness: 0.85, side: THREE.DoubleSide }),
  );
  wood.position.y = LEAD + CONE / 2;
  // 木の中を通る芯（切り口に黒い輪として見える）。
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(RL, RL, CONE, 12),
    new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.4, metalness: 0.5 }),
  );
  core.position.y = LEAD + CONE / 2;
  // 出ている芯: 根元は芯の太さ、先は 0.25mm に丸まった円すい（書いた後の先）。
  const graphite = new THREE.MeshPhysicalMaterial({
    color: 0x45464d,
    roughness: 0.26,
    metalness: 0.55,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
  });
  const lead = new THREE.Mesh(new THREE.CylinderGeometry(RL, 0.00025, LEAD, 16), graphite);
  lead.position.y = LEAD / 2;
  const leadTip = new THREE.Mesh(new THREE.SphereGeometry(0.00025, 10, 8), graphite);
  leadTip.position.y = 0;
  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.011, 24),
    new THREE.MeshStandardMaterial({ color: 0xc9b37a, roughness: 0.3, metalness: 0.9 }),
  );
  ferrule.position.y = T + L + 0.0055;
  const eraser = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.008, 24),
    new THREE.MeshStandardMaterial({ color: 0xe78e8e, roughness: 0.9 }),
  );
  eraser.position.y = T + L + 0.015;
  for (const m of [body, wood, core, lead, leadTip, ferrule, eraser]) {
    m.castShadow = true;
    group.add(m);
  }
  return { group };
}

function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 紙: 生成りの地・繊維のむら・薄い罫線。 */
function paperCanvas(side: "left" | "right") {
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#efe4cf";
  g.fillRect(0, 0, TEX_W, TEX_H);
  const img = g.getImageData(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  // 綴じ目側の影
  const gr = g.createLinearGradient(
    side === "right" ? 0 : TEX_W,
    0,
    side === "right" ? 120 : TEX_W - 120,
    0,
  );
  gr.addColorStop(0, "rgba(90,60,30,0.28)");
  gr.addColorStop(1, "rgba(90,60,30,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.strokeStyle = "rgba(110,130,160,0.18)";
  g.lineWidth = 2;
  for (let y = 276; y < TEX_H - 60; y += 100) {
    g.beginPath();
    g.moveTo(70, y);
    g.lineTo(TEX_W - 60, y);
    g.stroke();
  }
  if (side === "right") {
    g.fillStyle = "rgba(60,58,64,0.8)";
    g.font = "500 34px Georgia, serif";
    const d = new Date();
    g.fillText(`${d.getMonth() + 1}月${d.getDate()}日`, 110, 170);
  }
  return c;
}

/** 机の木目: 細い縦の年輪の筋と、ゆるい色むら（胡桃の天板）。 */
function woodCanvas() {
  const W = 1024;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5a3a24";
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    const n =
      Math.sin(x * 0.045) * 0.5 +
      Math.sin(x * 0.013 + 1.7) * 0.8 +
      Math.sin(x * 0.31) * 0.15 +
      (Math.random() - 0.5) * 0.35;
    const l = 0.5 + n * 0.18;
    g.fillStyle = `rgba(${Math.round(120 * l)},${Math.round(78 * l)},${Math.round(46 * l)},0.55)`;
    g.fillRect(x, 0, 1, H);
  }
  // 年輪の濃い筋（少し揺れながら縦に走る）
  for (let k = 0; k < 70; k++) {
    let x = Math.random() * W;
    g.strokeStyle = `rgba(40,22,12,${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 16) {
      x += Math.sin(y * 0.01 + k) * 0.8;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

/** 黒鉛の粒（紙の凹凸で芯が乗らない所）。 */
function makeGrain() {
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(TEX_W, TEX_H);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i + 3] = Math.random() < 0.22 ? 150 + Math.random() * 100 : 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}
