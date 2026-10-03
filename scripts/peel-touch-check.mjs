/**
 * **シールを指ではがして図鑑に入るか**（iPhone の Safari の実機の報告 2026-10-03
 * 「シールがはがせない・図鑑に追加できない」の再発を見張る）。
 *
 * UI ハーネスのチュートリアルのカードの段（`?scene=first-catch&step=card`）を iPhone の
 * 画面・指（hasTouch / isMobile）で開き、「意味と発音」の次へ → シールを**指で**はがす →
 * 図鑑の段（`data-first-stage="added"`）に入るまでを、iPhone で起きることを混ぜて確かめる:
 *
 * - iOS と同じく、指で引き始めると `pointercancel` が来る（画面の巻き取りに回された時）
 * - 軽く押すだけ（タップ）
 * - 発音の `play()` が決まらない・Web Audio が止まったまま・演出の動きが終わらない
 * - 発音の `play()` が NotAllowedError で断られる・`navigator.vibrate` が無い
 *
 * 使い方: `node scripts/peel-touch-check.mjs`（ハーネスを組み直してから回す）。
 *   BROWSERS=chromium,webkit  回すブラウザ（既定 chromium。webkit は入っていれば）
 *   PW_CHROME                 Chromium の場所（既定 /opt/pw-browsers の版）
 */
import { chromium, webkit, devices } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { touchDrag, touchTap } from "../e2e/real-app/touch.mjs";

const HARNESS_OUT = path.resolve(".ui-harness");
try {
  execFileSync("npx", ["vite", "build", "--config", "scripts/ui-harness/vite.config.ts"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
} catch (e) {
  console.error(String(e.stderr ?? e));
  console.error("ハーネスを組めなかった。");
  process.exit(1);
}
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.join(HARNESS_OUT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(HARNESS_OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL = `http://127.0.0.1:${server.address().port}/?scene=first-catch&step=card`;

const IOS_POINTER_CANCEL = () => {
  const sent = new Set();
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "touch" || !e.isTrusted || sent.has(e.pointerId)) return;
      sent.add(e.pointerId);
      e.target.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: e.pointerId,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    true,
  );
};
const NO_VIBRATE = () => {
  try {
    delete Navigator.prototype.vibrate;
  } catch {
    /* 無い端末と同じ */
  }
};
const AUDIO_REJECTS = () => {
  HTMLMediaElement.prototype.play = () =>
    Promise.reject(new DOMException("blocked", "NotAllowedError"));
};
const AUDIO_HANGS = () => {
  HTMLMediaElement.prototype.play = () => new Promise(() => {});
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  if (window.AudioContext) AudioContext.prototype.resume = () => new Promise(() => {});
};
const ANIMATION_HANGS = () => {
  Element.prototype.animate = function () {
    return { finished: new Promise(() => {}), cancel() {}, finish() {}, onfinish: null };
  };
};

const SCENARIOS = [
  { name: "指で引く（iOS の pointercancel あり）", input: "drag", init: [IOS_POINTER_CANCEL] },
  { name: "軽く押す（タップ）", input: "tap", init: [] },
  {
    name: "発音が決まらない・振動 API が無い",
    input: "drag",
    init: [IOS_POINTER_CANCEL, AUDIO_HANGS, NO_VIBRATE],
  },
  { name: "発音が NotAllowedError", input: "drag", init: [AUDIO_REJECTS, NO_VIBRATE] },
  { name: "演出の動きが終わらない", input: "drag", init: [ANIMATION_HANGS], wait: 30_000 },
];

const BROWSERS = (process.env.BROWSERS || "chromium").split(",").map((s) => s.trim());
let failed = 0;
let ran = 0;
for (const name of BROWSERS) {
  let browser;
  try {
    browser =
      name === "webkit"
        ? await webkit.launch()
        : await chromium.launch({
            executablePath:
              process.env.PW_CHROME ||
              (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
                ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
                : undefined),
          });
  } catch (e) {
    console.log(`${name}: 起動できない（${String(e).split("\n")[0]}）— 飛ばす`);
    continue;
  }
  ran++;
  for (const scenario of SCENARIOS) {
    const context = await browser.newContext({
      ...devices["iPhone 14"],
      isMobile: name !== "firefox",
      hasTouch: true,
      locale: "ja-JP",
    });
    for (const script of scenario.init) await context.addInitScript(script);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL);
    let result = "ok";
    try {
      // 「意味と発音」の札の次へ（指で）。
      const next = page.locator(".tour-coach__next");
      await next.waitFor({ state: "visible", timeout: 15_000 });
      await next.tap();
      // シールの段の札が出る（枠がシールへ滑り終わる）まで。
      await page.waitForFunction(
        () =>
          document.querySelector(".tour-ring")?.getAttribute("data-tour-gesture") === "peel" &&
          !!document.querySelector(".tour-coach") &&
          document.querySelector(".cw-peel-touch")?.disabled === false,
        null,
        { timeout: 15_000 },
      );
      const box = await page.locator('[data-tour="peel"]').boundingBox();
      const from = { x: box.x + box.width * 0.85, y: box.y + box.height * 0.85 };
      if (scenario.input === "tap") await touchTap(page, from.x, from.y);
      else {
        const used = await touchDrag(page, from, { x: box.x + 10, y: box.y + 10 });
        if (used !== "touch") result = `指で引けなかった（${used}）`;
      }
      await page.waitForSelector('[data-first-stage="added"]', {
        timeout: scenario.wait ?? 15_000,
      });
    } catch (e) {
      const stage = await page
        .evaluate(() => document.querySelector("[data-first-stage]")?.dataset.firstStage)
        .catch(() => "?");
      result = `図鑑に入らない（段: ${stage}）: ${String(e).split("\n")[0]}`;
    }
    if (errors.length) result += ` / 画面のエラー: ${errors[0]}`;
    if (result !== "ok") failed++;
    console.log(`${name} · ${scenario.name}: ${result}`);
    await context.close();
  }
  await browser.close();
}
server.close();
if (!ran) {
  console.error("どのブラウザも起動できず、何も試していない（成功扱いにしない）。");
  process.exit(1);
}
if (failed) {
  console.error(`${failed} 件、指ではがして図鑑に入れなかった。`);
  process.exit(1);
}
console.log("すべて、指ではがして図鑑に入った。");
