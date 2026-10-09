/**
 * **図鑑 ⇄ ホームのタブの行き来を測る**（オーナー報告 2026-10-09「ホームのアイコン押すと
 * カクカクする。このようなラグはなくす。」）。
 *
 * 見本（`scripts/ui-harness` の `home-tab-switch`。本物の `HomeSurface`・本棚・
 * `ResurfaceCard`・`DexCoverFlow` を、本番と同じく押すたびに作り直す）を Chromium で開き、
 * CPU を 4 倍遅くして（中くらいの Android の目安）、下のバーで 図鑑 → ホーム → 図鑑 を
 * 何往復かする。押してからの 4 秒ずつについて測るもの:
 *
 *  - CLS（`layout-shift` の合計。押した直後の 500ms を除外しない — 押した後に動くのが問題）
 *  - 長い仕事（`longtask`）の数・合計・最長
 *  - コマの間隔（rAF）の最長と、50ms を超えたコマの数
 *  - **抜け**: 本棚の絵が出るまでの時間、「〇か月前…」の札が出るまでの時間、
 *    図鑑の写真（大きな札と下の列）が空のまま描かれたコマの数
 *
 * 使い方: node scripts/home-tab-perf.mjs [--no-build] [--shots=<dir>] [--rounds=3]
 * 端末の手触りは測れない（ヘッドレスの Chromium は実機の GPU・画像の読み解きと違う）ので、
 * 最後は実機で確かめる。
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
const ROUNDS = Number(args.rounds ?? 3);
/** 押してから測る長さ（ms）。前の版の止まり（4 秒近い）を窓の外へ逃がさない長さ。 */
const WINDOW = Number(args.window ?? 4000);
const HARNESS_DIR = path.resolve("scripts/ui-harness");
const OUT = path.resolve(".ui-harness");

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
  ".glb": "model/gltf-binary",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.join(OUT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "max-age=3600",
  });
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
await page.goto(
  `${base}/index.html?scene=home-tab-switch&tab=dex${args.query ? `&${args.query}` : ""}`,
);
// 1回目: ホームを開いて、本棚の 3D が描けて絵が端末に置かれるまで待つ（2回目からの状態）。
await page.click('[data-nav="/home"]');
await page.waitForTimeout(5000);
await page.click('[data-nav="/dex"]');
await page.waitForTimeout(2500);

const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.evaluate(() => {
  const w = window;
  w.__perf = { shifts: [], longs: [], frames: [] };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      if (!e.hadRecentInput)
        w.__perf.shifts.push({
          t: e.startTime,
          v: e.value,
          src: (e.sources || [])
            .map(
              (s) =>
                `${s.node?.className?.baseVal ?? s.node?.className ?? s.node?.nodeName}:${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}`,
            )
            .join(","),
        });
  }).observe({ type: "layout-shift", buffered: false });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__perf.longs.push({ t: e.startTime, d: e.duration });
  }).observe({ type: "longtask", buffered: false });
  const tick = (t) => {
    const p = w.__perf;
    const shelf = document.querySelector(".home-shelf__snap");
    const shelfShown =
      !!document.querySelector(".home-shelf") &&
      ((shelf && shelf.complete && shelf.naturalWidth > 0 && !shelf.dataset.gone) ||
        !!document.querySelector(".home-shelf__snap[data-gone]") ||
        (!shelf && !!document.querySelector(".home-shelf__stage[data-ready]")));
    const thumbs = [...document.querySelectorAll(".dex-cf__thumb")];
    const emptyThumbs = thumbs.filter((b) => {
      const img = b.querySelector("img");
      if (b.querySelector(".dex-cf__thumb-word")) return false;
      return !img || !img.complete || !img.naturalWidth;
    }).length;
    const card = document.querySelector(".dex-cf [data-dex-card] img, .dex-cf img");
    p.frames.push({
      t,
      home: !!document.querySelector(".home-scene, .collage"),
      shelfShown,
      resurface: !!document.querySelector(".resurface-card"),
      thumbs: thumbs.length,
      emptyThumbs,
      cardImg: !!card && card.complete && card.naturalWidth > 0,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

async function switchTo(tab) {
  const t0 = await page.evaluate(() => performance.now());
  await page.click(`[data-nav="/${tab}"]`);
  await page.waitForTimeout(WINDOW);
  return page.evaluate(
    ({ t0, tab, win }) => {
      const p = window.__perf;
      const t1 = t0 + win;
      const fr = p.frames.filter((f) => f.t >= t0 && f.t <= t1);
      // 押した時刻から最初のコマまで・最後のコマから窓の終わりまでも「コマの間」に数える
      // （長い仕事で 1 コマも来なければ、窓いっぱいが 1 つの止まり）。
      const ts = [t0, ...fr.map((f) => f.t), t1];
      const gaps = ts.slice(1).map((t, i) => t - ts[i]);
      const longs = p.longs.filter((l) => l.t >= t0 && l.t <= t1);
      const cls = p.shifts.filter((s) => s.t >= t0 && s.t <= t1).reduce((a, s) => a + s.v, 0);
      const firstHome = fr.find((f) => f.home);
      const shiftSrc = p.shifts
        .filter((s) => s.t >= t0 && s.t <= t1)
        .map((s) => `${Math.round(s.t - t0)}ms ${s.v.toFixed(4)} ${s.src}`);
      const out = {
        tab,
        cls: +cls.toFixed(4),
        ...(shiftSrc.length ? { shifts: shiftSrc.join(" / ").slice(0, 300) } : {}),
        longTasks: longs.length,
        longTotalMs: Math.round(longs.reduce((a, l) => a + l.d, 0)),
        longMaxMs: Math.round(Math.max(0, ...longs.map((l) => l.d))),
        frames: fr.length,
        maxFrameMs: Math.round(Math.max(0, ...gaps)),
        framesOver50: gaps.filter((g) => g > 50).length,
        bigGaps: ts
          .slice(1)
          .map((t, i) => [Math.round(ts[i] - t0), Math.round(t - ts[i])])
          .filter(([, g]) => g > 100)
          .map(([a, g]) => `${a}+${g}`)
          .join(" "),
      };
      if (tab === "home") {
        const shown = fr.find((f) => f.shelfShown);
        const res = fr.find((f) => f.resurface);
        out.firstPaintMs = firstHome ? Math.round(firstHome.t - t0) : null;
        out.shelfBlankFrames = fr.filter((f) => f.home && !f.shelfShown).length;
        out.shelfShownMs = shown ? Math.round(shown.t - t0) : null;
        out.resurfaceLateFrames = res ? fr.filter((f) => f.home && f.t < res.t).length : null;
      } else {
        const withThumbs = fr.filter((f) => f.thumbs > 0);
        out.thumbBlankFrames = withThumbs.filter((f) => f.emptyThumbs > 0).length;
        out.maxEmptyThumbs = Math.max(0, ...withThumbs.map((f) => f.emptyThumbs));
        out.cardBlankFrames = withThumbs.filter((f) => !f.cardImg).length;
      }
      return out;
    },
    { t0, tab, win: WINDOW },
  );
}

const results = [];
for (let i = 0; i < ROUNDS; i++) {
  results.push(await switchTo("home"));
  results.push(await switchTo("dex"));
}
console.table(results);

if (args.shots) {
  // 押した直後のコマ（0 / 100 / 250 / 500 / 1000ms）を撮る。撮るほど遅くなるので別の往復で。
  fs.mkdirSync(args.shots, { recursive: true });
  for (const tab of ["home", "dex"]) {
    await page.click(`[data-nav="/${tab}"]`);
    let last = 0;
    for (const at of [0, 100, 250, 500, 1000]) {
      await page.waitForTimeout(at - last);
      last = at;
      await page.screenshot({
        path: path.join(args.shots, `${args.tag ?? "run"}-${tab}-${at}ms.png`),
      });
    }
    await page.waitForTimeout(800);
  }
}

await browser.close();
server.close();
