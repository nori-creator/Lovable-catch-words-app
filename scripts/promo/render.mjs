/**
 * 宣伝動画を焼く（確認用ページの promo-film を1コマずつ描かせて撮り、音を重ねて mp4 に）。
 *
 *   1. npx vite build --config scripts/ui-harness/vite.config.ts
 *   2. npx http-server .ui-harness -p 4599 -s   （別の窓で）
 *   3. FFMPEG=ffmpeg FONT_DIR=<@fontsource の noto-sans-jp / noto-sans-tc を展開した所> \
 *        node scripts/promo/render.mjs [出力.mp4] [--frames 0,90,300]
 *
 * 書体: 端末の書体に頼らないよう、Noto Sans JP / TC（@fontsource、OFL）をページに差し込む。
 * 音: film.ts の SOUND_CUES と同じ時刻に public/sfx の音を置く。
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const out =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : join(root, "public/promo/catchwords-promo.mp4");
const onlyFrames = process.argv.includes("--frames")
  ? process.argv[process.argv.indexOf("--frames") + 1].split(",").map(Number)
  : null;
const FPS = 30;
const DURATION = 15;
const FF = process.env.FFMPEG || "ffmpeg";
const FONT_DIR = process.env.FONT_DIR;
const tmp = join(root, ".promo-frames");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});
if (FONT_DIR) {
  await page.route("**/__fonts/**", (route) => {
    const rel = decodeURIComponent(
      new URL(route.request().url()).pathname.replace(/^\/__fonts\//, ""),
    );
    route.fulfill({ body: readFileSync(join(FONT_DIR, rel)), contentType: "font/woff2" });
  });
}
await page.goto("http://127.0.0.1:4599/index.html?scene=promo-film", { waitUntil: "networkidle" });
if (FONT_DIR) {
  let css = "";
  for (const [pkg, fam] of [
    ["noto-sans-jp", "Noto Sans JP"],
    ["noto-sans-tc", "Noto Sans TC"],
  ]) {
    for (const w of [500, 700, 900]) {
      const f = join(FONT_DIR, pkg, "package", `${w}.css`);
      if (!existsSync(f)) continue;
      css += readFileSync(f, "utf8").replaceAll("./files/", `/__fonts/${pkg}/package/files/`);
    }
  }
  await page.addStyleTag({ content: css });
  // 使う字を先に読み込ませる（描く前に揃っていないと、最初の数コマが別の書体になる）
  await page.evaluate(async () => {
    const sample =
      "街はことばでできている。撮った日がアルバムになる忘れる前にそっと復習キャッチ！撮るだけで集まる台湾華語からはじめよう咖啡花窗戶貓書店CatchWords";
    for (const fam of ["Noto Sans JP", "Noto Sans TC"]) {
      for (const w of [500, 700, 900]) await document.fonts.load(`${w} 40px "${fam}"`, sample);
    }
  });
}
await page.waitForFunction(() => !!window.__promo);
const frames = onlyFrames ?? Array.from({ length: FPS * DURATION }, (_, i) => i);
for (const i of frames) {
  const url = await page.evaluate((t) => window.__promo.drawAt(t), i / FPS);
  writeFileSync(
    join(tmp, `f${String(i).padStart(4, "0")}.jpg`),
    Buffer.from(url.split(",")[1], "base64"),
  );
}
await browser.close();
if (onlyFrames) {
  console.log("frames written to", tmp);
  process.exit(0);
}

// 音: 時刻表どおりに重ねる
const film = readFileSync(join(root, "scripts/ui-harness/scenes/promo/film.ts"), "utf8");
const cues = [...film.matchAll(/\{ at: ([\d.]+), name: "(\w+)", gain: ([\d.]+) \}/g)].map((m) => ({
  at: Number(m[1]),
  name: m[2],
  gain: Number(m[3]),
}));
const files = {
  analyze: "analyze-shimmer",
  catch: "catch-snap",
  celebrate: "celebrate-harp",
  stinger: "stinger-taipei",
};
const inputs = ["-framerate", String(FPS), "-i", join(tmp, "f%04d.jpg")];
const filters = [];
cues.forEach((c, k) => {
  inputs.push("-i", join(root, "public/sfx", `${files[c.name]}.mp3`));
  const ms = Math.round(c.at * 1000);
  filters.push(`[${k + 1}:a]adelay=${ms}|${ms},volume=${c.gain}[a${k}]`);
});
filters.push(
  `${cues.map((_, k) => `[a${k}]`).join("")}amix=inputs=${cues.length}:normalize=0,alimiter=limit=0.9,apad,atrim=0:${DURATION},afade=t=out:st=${DURATION - 0.8}:d=0.8[aout]`,
);
mkdirSync(resolve(out, ".."), { recursive: true });
const r = spawnSync(
  FF,
  [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "23",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-t",
    String(DURATION),
    out,
  ],
  { stdio: "inherit" },
);
rmSync(tmp, { recursive: true, force: true });
process.exit(r.status ?? 1);
