/**
 * **誌面の札を指で運ぶ間、札が指に付いてくるかを測る**（オーナー報告 2026-10-09「ホームの単語を
 * 移動させようとすると飛ぶ、滑らかにスライドできない」）。
 *
 * 見本（`scripts/ui-harness` の `home-album&plain=1`。字だけの札が3枚の日）を Chromium で開き、
 * 端末の大きさ（390px・指）・CPU 4 倍遅くして、CDP の `Input.dispatchTouchEvent` で
 * 「長押し → 誌面の真ん中をまたいで左右に運ぶ → 離す」を指で行う。コマごとに測るもの:
 *
 *  - **指とのずれ**（px）: 掴んだ瞬間に指が字のどこを押さえていたか（字の幅・高さに対する割合）を
 *    覚え、各コマで「その点がいま画面のどこに在るか」と指の位置の差
 *  - **1コマの跳び**（px）: 字が前のコマから動いた量から、指が動いた量を引いたもの
 *  - コマの間隔（rAF）・長い仕事（`longtask`）
 *  - 離した後: 指を離した所から、字が落ち着くまでの1コマあたりの最大の動き
 *  - 画面の送り（`scrollY`）が動いたか
 *
 * 使い方: node scripts/home-drag-perf.mjs [--no-build] [--shots=<dir>] [--edit=1] [--end=0.85] [--label=before]
 * `--edit=1` は最初から並べ替え中の誌面（長押しせずに掴む）。既定は長押しから掴む。
 * 端末の手触りは測れない（ヘッドレスの Chromium は実機の指・GPU と違う）ので、最後は実機で確かめる。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "1"] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const HARNESS_DIR = path.resolve("scripts/ui-harness");
const OUT = path.resolve(".ui-harness");
const EDIT = args.edit === "1";
const LABEL = args.label ?? "run";
const SHOTS = args.shots ? path.resolve(args.shots) : null;

if (!args["no-build"]) {
  execFileSync("npx", ["vite", "build", "--config", path.join(HARNESS_DIR, "vite.config.ts")], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

const TYPES = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".html": "text/html",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.join(OUT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
// `--photo=1`: 写真の札を運ぶ（写真の日 `home-album`）。既定は字だけの札。
const PHOTO = args.photo === "1";
const ITEM = PHOTO ? "[data-album-sticker]:not([data-plain])" : "[data-album-sticker][data-plain]";
/** 指とのずれを測る物（字だけの札は語、写真の札は札そのもの）。 */
const SEEN = PHOTO ? "" : " .collage__plain-word";
await page.goto(
  `${base}/index.html?scene=home-album${PHOTO ? "" : "&plain=1"}&edit=${EDIT ? 1 : 0}`,
);
await page.waitForSelector(`${ITEM}${SEEN}`);
await page.waitForTimeout(1500);

const cdp = await ctx.newCDPSession(page);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });

// 掴む札: 先頭の札（字だけの札なら、真ん中をまたいで運ぶと字の寄せ方が変わる所を通る）。
const target = await page.evaluate(
  ({ ITEM, SEEN }) => {
    const els = [...document.querySelectorAll(ITEM)];
    // いちばん上の札（どれも右の列。左へ運ぶと真ん中をまたぐ）。
    const pick = els[0];
    const word = SEEN ? pick.querySelector(SEEN.trim()) : pick;
    const r = word.getBoundingClientRect();
    const board = pick.parentElement.getBoundingClientRect();
    return {
      id: pick.getAttribute("data-album-sticker"),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      boardL: board.left,
      boardW: board.width,
    };
  },
  { ITEM, SEEN },
);

await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.evaluate(
  ({ id, SEEN }) => {
    const w = window;
    const p = (w.__drag = { frames: [], longs: [], finger: null, phase: "idle", grab: null });
    window.addEventListener(
      "pointermove",
      (e) => {
        p.finger = { x: e.clientX, y: e.clientY };
      },
      { capture: true, passive: true },
    );
    window.addEventListener(
      "pointerdown",
      (e) => {
        p.finger = { x: e.clientX, y: e.clientY };
      },
      { capture: true, passive: true },
    );
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) p.longs.push({ t: e.startTime, d: e.duration });
    }).observe({ type: "longtask", buffered: false });
    // 描くのに時間の掛かったコマ（Long Animation Frames）。
    p.loafs = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) p.loafs.push({ t: e.startTime, d: e.duration });
      }).observe({ type: "long-animation-frame", buffered: false });
    } catch {
      /* 古い Chromium */
    }
    const ch = new MessageChannel();
    let pending = null;
    // コマの描かれた後に読む（rAF の中で読むと、同じコマで後から書かれる分を取りこぼす）。
    ch.port1.onmessage = () => {
      const f = pending;
      pending = null;
      if (!f) return;
      const el = document.querySelector(`[data-album-sticker="${id}"]${SEEN}`);
      const r = el?.getBoundingClientRect();
      if (r) Object.assign(f, { l: r.left, t: r.top, w: r.width, h: r.height });
      f.scrollY = window.scrollY;
      p.frames.push(f);
    };
    const tick = () => {
      pending = { t: performance.now(), phase: p.phase, finger: p.finger && { ...p.finger } };
      ch.port2.postMessage(0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  { id: target.id, SEEN },
);

const setPhase = (ph) => page.evaluate((x) => (window.__drag.phase = x), ph);

// 長押し → 指で運ぶ。左の列から右の列へ、また左へ戻し、少し下へ。
await cdp.send("Performance.enable");
const metrics = async () =>
  Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
await setPhase("press");
await touch("touchStart", [{ x: target.x, y: target.y }]);
await sleep(EDIT ? 120 : 800);
await setPhase("drag");
const m0 = await metrics();
const w0 = Date.now();
const path_ = [];
// 掴んだ所 → 誌面の左 2 割 → 右 8 割 → 真ん中少し右（真ん中を3回またぐ）。
const L = target.boardL + target.boardW * 0.2;
const R = target.boardL + target.boardW * 0.8;
const seg = (a, b, n) => {
  for (let i = 1; i <= n; i++)
    path_.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
};
seg({ x: target.x, y: target.y }, { x: L, y: target.y + 20 }, 50);
seg({ x: L, y: target.y + 20 }, { x: R, y: target.y + 60 }, 60);
// 離す所（誌面の幅に対する割合）。既定は真ん中のすぐ右（字の寄せ方が変わる所）。
const END = Number(args.end ?? 0.558);
seg({ x: R, y: target.y + 60 }, { x: target.boardL + target.boardW * END, y: target.y + 90 }, 30);
let shotN = 0;
for (const [i, pt] of path_.entries()) {
  await touch("touchMove", [pt]);
  await sleep(16);
  if (SHOTS && i % 22 === 11) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: path.join(SHOTS, `${LABEL}-move-${String(shotN++).padStart(2, "0")}.png`),
      clip: { x: 0, y: Math.max(0, target.y - 140), width: 390, height: 300 },
    });
  }
}
const m1 = await metrics();
const w1 = Date.now();
await setPhase("release");
await touch("touchEnd", []);
await sleep(900);
if (SHOTS)
  await page.screenshot({
    path: path.join(SHOTS, `${LABEL}-released.png`),
    clip: { x: 0, y: Math.max(0, target.y - 140), width: 390, height: 300 },
  });

const data = await page.evaluate(() => window.__drag);
await browser.close();
server.close();

// ── 集計 ────────────────────────────────────────────────────────────
const frames = data.frames.filter((f) => f.l !== undefined);
const pressF = frames.filter((f) => f.phase === "press").at(-1) ?? frames[0];
const drag = frames.filter((f) => f.phase === "drag" && f.finger);
// 掴んだ点（字の箱に対する割合）。長押しの終わり（運び始める直前）のコマで決める。
const g0 = drag[0] ?? pressF;
const fx = (target.x - pressF.l) / pressF.w;
const fy = (target.y - pressF.t) / pressF.h;
const errs = drag.map((f) => {
  const px = f.l + fx * f.w;
  const py = f.t + fy * f.h;
  return Math.hypot(px - f.finger.x, py - f.finger.y);
});
const jumps = [];
for (let i = 1; i < drag.length; i++) {
  const a = drag[i - 1];
  const b = drag[i];
  const moved = Math.hypot(b.l - a.l, b.t - a.t);
  const fingerMoved = Math.hypot(b.finger.x - a.finger.x, b.finger.y - a.finger.y);
  jumps.push(Math.max(0, moved - fingerMoved));
}
const gaps = [];
for (let i = 1; i < frames.length; i++)
  if (frames[i].phase === "drag" && frames[i].t - frames[i - 1].t > 0.5)
    gaps.push(frames[i].t - frames[i - 1].t);
const rel = frames.filter((f) => f.phase === "release");
const lastDrag = drag.at(-1);
const relSteps = [];
let prev = lastDrag;
for (const f of rel) {
  relSteps.push(Math.hypot(f.l - prev.l, f.t - prev.t));
  prev = f;
}
const settled = rel.at(-1);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
};
const r1 = (v) => Math.round(v * 10) / 10;
const dragStart = drag[0]?.t ?? 0;
const dragEnd = lastDrag?.t ?? 0;
const longs = data.longs.filter((l) => l.t >= dragStart && l.t <= dragEnd);
const loafs = (data.loafs ?? []).filter((l) => l.t >= dragStart && l.t <= dragEnd);
const md = (k) => Math.round((m1[k] - m0[k]) * 1000);
const report = {
  label: LABEL,
  mode: EDIT ? "edit=1（掴むだけ）" : "長押しから掴む",
  frames: drag.length,
  pickupJumpPx: r1(Math.hypot(g0.l - pressF.l, g0.t - pressF.t)),
  fingerOffsetPx: {
    mean: r1(errs.reduce((a, b) => a + b, 0) / Math.max(errs.length, 1)),
    p50: r1(pct(errs, 50)),
    p95: r1(pct(errs, 95)),
    max: r1(Math.max(0, ...errs)),
  },
  perFrameJumpPx: {
    p95: r1(pct(jumps, 95)),
    max: r1(Math.max(0, ...jumps)),
    over8px: jumps.filter((j) => j > 8).length,
  },
  // ページの中の時計（rAF の間隔）。ヘッドレスでは画面の同期が無いので参考まで。
  frameMs: {
    p50: r1(pct(gaps, 50)),
    p95: r1(pct(gaps, 95)),
    max: r1(Math.max(0, ...gaps)),
    over50: gaps.filter((g) => g > 50).length,
  },
  // 運んでいる間に main thread が使った時間（ms。CPU 4 倍遅い状態の実時間）。
  mainThreadMs: {
    dragWallMs: w1 - w0,
    moves: path_.length,
    taskPerMove: Math.round(((m1.TaskDuration - m0.TaskDuration) * 1000) / path_.length),
    task: md("TaskDuration"),
    script: md("ScriptDuration"),
    layout: md("LayoutDuration"),
    style: md("RecalcStyleDuration"),
    layoutCount: m1.LayoutCount - m0.LayoutCount,
    styleCount: m1.RecalcStyleCount - m0.RecalcStyleCount,
  },
  longFrames: { n: loafs.length, maxMs: Math.round(Math.max(0, ...loafs.map((l) => l.d))) },
  longTasks: {
    n: longs.length,
    totalMs: Math.round(longs.reduce((a, b) => a + b.d, 0)),
    maxMs: Math.round(Math.max(0, ...longs.map((l) => l.d))),
  },
  release: {
    maxStepPx: r1(Math.max(0, ...relSteps)),
    firstStepPx: r1(relSteps[0] ?? 0),
    settleFromFingerPx: r1(Math.hypot(settled.l - lastDrag.l, settled.t - lastDrag.t)),
    framesMoving: relSteps.filter((s) => s > 0.5).length,
  },
  scrollMovedPx: r1(
    Math.max(...frames.map((f) => f.scrollY)) - Math.min(...frames.map((f) => f.scrollY)),
  ),
};
console.log(JSON.stringify(report, null, 2));
if (args.json)
  fs.writeFileSync(
    path.resolve(args.json),
    JSON.stringify({ report, errs, jumps, gaps, relSteps }, null, 2),
  );
