/**
 * **本物のアプリを、本物のサーバと AI で動かして確かめる。**
 *
 * UI ハーネス（`scripts/ui-harness`）は見本のデータで部品を描く。見た目の比較には
 * 向くが、本物のサーバ・本物の AI・本物の音・本物の画像の読み込みは通らない。
 * ここは公開中のアプリ（既定は https://catchwords.lovable.app）をそのまま開き、
 * スマホの画面で最初から操作して、次を残す:
 *
 * - 動画（操作の全部。アニメーションもそのまま写る）
 * - 段ごとのスクリーンショット
 * - 鳴った音の一覧と、Web Audio の出力の録音（`instrument.js`）
 * - 1秒ごとのコマ数（カクつき）
 * - 自動で見つけた問題: 壊れた画像・通信の失敗・画面のエラー・別の言語の混入・
 *   生の翻訳キー・横のはみ出し
 *
 * 結果は `e2e-report/index.html` にまとまる。
 *
 * ## 使い方（詳しくは docs/real-app-check.md）
 *   node e2e/real-app/run.mjs
 * 環境変数:
 *   BASE_URL     確かめるアプリ（既定 https://catchwords.lovable.app）
 *   LANGS        表示言語（既定 ja,en,zh-TW）
 *   TARGETS      学習言語（既定 zh-TW,en。表示言語ごとに順に当てる）
 *   BROWSERS     chromium,webkit（webkit = iPhone の Safari と同じ描画の仕組み）
 *   E2E_EMAIL / E2E_PASSWORD  試験用アカウント。あればログイン後の画面も回る
 *   OUT          出力先（既定 e2e-report）
 *   CHROMIUM_PATH  Chromium の場所を明示するとき
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, devices } from "playwright";
import { writeReport } from "./report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || "https://catchwords.lovable.app").replace(/\/$/, "");
const LANGS = (process.env.LANGS || "ja,en,zh-TW").split(",").map((s) => s.trim());
const TARGETS = (process.env.TARGETS || "zh-TW,en").split(",").map((s) => s.trim());
const BROWSERS = (process.env.BROWSERS || "chromium").split(",").map((s) => s.trim());
const OUT = path.resolve(process.env.OUT || "e2e-report");
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";
const STEP_LIMIT = Number(process.env.STEP_LIMIT || 70);

const INSTRUMENT = fs.readFileSync(path.join(here, "instrument.js"), "utf8");
const PHOTO = `data:image/webp;base64,${fs
  .readFileSync(path.join(here, "../../public/first-catch-cafe.webp"))
  .toString("base64")}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 1回分（ブラウザ × 表示言語 × 学習言語）の記録。 */
function newRun(browserName, lang, target, scenario) {
  const id = `${scenario}__${browserName}__${lang}__${target}`;
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  return {
    id,
    dir,
    browser: browserName,
    lang,
    target,
    scenario,
    steps: [],
    console: [],
    network: [],
    sounds: [],
    fps: [],
    video: null,
    audio: null,
    result: "running",
    note: "",
  };
}

/** 画面を調べて、段として残す。 */
async function snap(page, run, label) {
  const n = String(run.steps.length + 1).padStart(2, "0");
  const file = `step-${n}.png`;
  await page.screenshot({ path: path.join(run.dir, file) }).catch(() => {});
  const info = await page
    .evaluate((lang) => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== "hidden" &&
          s.display !== "none" &&
          r.bottom > 0 &&
          r.top < innerHeight
        );
      };
      // **目に見えている文字だけ**を集める（読み上げ用の隠し文字や、下に隠れた
      // 画面の文字を「混ざっている」と数えない）。
      window.__qaKanaWhere = [];
      const seen = [];
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT,
      );
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const v = n.nodeValue.trim();
        if (!v || !n.parentElement) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (
          r.width < 2 ||
          r.height < 2 ||
          r.bottom <= 0 ||
          r.top >= innerHeight ||
          r.right <= 0 ||
          r.left >= innerWidth
        )
          continue;
        const el = document.elementFromPoint(
          Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)),
          Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)),
        );
        if (el && !n.parentElement.contains(el) && !el.contains(n.parentElement)) continue; // 上に別の物が重なっている
        if (!vis(n.parentElement)) continue;
        // 透明・読み上げ対象外・操作不可の層の中（覆いの下に残った画面など）は数えない。
        let hidden = false;
        let opacity = 1;
        for (let a = n.parentElement; a; a = a.parentElement) {
          if (a.getAttribute("aria-hidden") === "true" || a.hasAttribute("inert")) hidden = true;
          opacity *= Number(getComputedStyle(a).opacity || 1);
        }
        if (hidden || opacity < 0.15) continue;
        // 全面を覆う層（`pointer-events: none` の読み込み表示など）の下に隠れている。
        // `elementsFromPoint` は上に在る物から順に返すので、文字の要素より前に
        // 画面いっぱいの不透明な層があれば、見えていない。
        const stack = document.elementsFromPoint(
          Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)),
          Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)),
        );
        const own = stack.findIndex(
          (x) =>
            x === n.parentElement || n.parentElement.contains(x) || x.contains(n.parentElement),
        );
        const covered = stack.slice(0, own < 0 ? stack.length : own).some((cover) => {
          const cs = getComputedStyle(cover);
          const cr = cover.getBoundingClientRect();
          const full = cr.width >= innerWidth * 0.9 && cr.height >= innerHeight * 0.6;
          const opaqueColor =
            !/rgba\(.*,\s*0(\.\d+)?\)|transparent/.test(cs.backgroundColor) ||
            /rgba\(.*,\s*0\.[5-9]\d*\)/.test(cs.backgroundColor);
          const tag = cover.tagName;
          const paints =
            opaqueColor ||
            cs.backgroundImage !== "none" ||
            tag === "CANVAS" ||
            tag === "IMG" ||
            tag === "VIDEO";
          return full && paints && Number(cs.opacity) > 0.5;
        });
        if (covered) continue;
        seen.push(v);
        if (/[\u3040-\u30ff]/.test(v)) {
          const pathOf = (el) => {
            const parts = [];
            for (let a = el; a && a !== document.body && parts.length < 4; a = a.parentElement) {
              const cls =
                typeof a.className === "string" ? a.className.split(/\s+/).filter(Boolean)[0] : "";
              parts.unshift(a.tagName.toLowerCase() + (cls ? "." + cls : ""));
            }
            return parts.join(" > ");
          };
          (window.__qaKanaWhere ||= []).push(`${v.slice(0, 16)} @ ${pathOf(n.parentElement)}`);
        }
      }
      const text = seen.join("\n");
      const issues = [];
      for (const img of Array.from(document.images)) {
        if (img.complete && img.naturalWidth === 0 && img.currentSrc && vis(img)) {
          issues.push({ kind: "壊れた画像", detail: img.currentSrc.slice(0, 160) });
        }
      }
      // 翻訳キーがそのまま出ている（`dex.shelfEmpty` のような形）。ドメイン名は除く。
      const keys = (
        text.match(/(?<![\w./@-])[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]+(?![\w/@-])/g) || []
      ).filter((k) => !/\.(app|com|jp|tw|io|net|org|dev|ai|html|png|webp|jpg)$/.test(k));
      if (keys.length)
        issues.push({ kind: "生の翻訳キー", detail: [...new Set(keys)].slice(0, 6).join(", ") });
      // 学習言語は中国語と英語だけなので、英語・繁體中文の画面にかなが出たら日本語の混入。
      if (lang !== "ja") {
        const kana = text.match(/[^\n]{0,12}[぀-ヿ][^\n]{0,12}/g);
        if (kana) {
          const where = (window.__qaKanaWhere || []).slice(0, 3).join(" ; ");
          issues.push({
            kind: "別の言語（日本語）",
            detail:
              [...new Set(kana)].slice(0, 4).join(" / ") + (where ? `  [場所: ${where}]` : ""),
          });
        }
        window.__qaKanaWhere = [];
      }
      const sw = document.documentElement.scrollWidth;
      if (sw > innerWidth + 1)
        issues.push({ kind: "横はみ出し", detail: `${sw}px > ${innerWidth}px` });
      return {
        path: location.pathname + location.search,
        issues,
        animations: document.getAnimations ? document.getAnimations().length : 0,
      };
    }, run.lang)
    .catch((e) => ({
      path: "?",
      issues: [{ kind: "調べられない", detail: String(e).slice(0, 120) }],
      animations: 0,
    }));
  run.steps.push({ label, file, ...info, at: Date.now() });
  return info;
}

/** 案内の動き・読み込みが落ち着くまで待つ（最大 ms）。 */
async function settle(page, ms = 9000) {
  const until = Date.now() + ms;
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  while (Date.now() < until) {
    const busy = await page
      .evaluate(
        () =>
          !!document.querySelector(".tour-preview-lock, .tour-animation-lock") ||
          !!document.querySelector('[aria-busy="true"]'),
      )
      .catch(() => false);
    if (!busy) break;
    await sleep(250);
  }
  await sleep(500);
}

/**
 * **いまの画面で「次に押すもの」を決めて押す。** 手順を固定で書かない —
 * 案内の枠（`.tour-ring`）と各画面の主ボタンを見るので、文言や並びが
 * 変わっても動き続ける。押したものの名前を返す（押せなければ null）。
 */
async function step(page, run) {
  // 1) 案内の札の「次へ」。
  const next = page.locator(".tour-coach__next");
  if (await next.isVisible().catch(() => false)) {
    await next.click();
    return "案内の次へ";
  }
  // 2) 最初の質問（表示言語・学習言語・時間・目的・興味）。
  const choices = page.locator(".first-choice");
  if ((await choices.count()) > 0) {
    const radio = await page.locator('.first-choices[role="radiogroup"]').count();
    if (radio) {
      const heading =
        (await page
          .locator(".first-question-heading h1")
          .textContent()
          .catch(() => "")) || "";
      // 「1 / 7」= 表示言語、「2 / 7」= 学習言語。
      const count =
        (await page
          .locator(".first-count")
          .textContent()
          .catch(() => "")) || "";
      const want = /^\s*1\s*\//.test(count) ? run.lang : run.target;
      const opt = page.locator(`.first-choice:has(.first-glyph[lang="${want}"])`);
      if ((await opt.count()) && (await opt.getAttribute("aria-checked")) !== "true") {
        await opt.click();
        return `質問: ${heading.trim()} → ${want}`;
      }
    } else if (
      (await page
        .locator('.first-choice[aria-pressed="true"], .first-choice[aria-checked="true"]')
        .count()) === 0
    ) {
      await choices.first().click();
      return "質問: 1つ目を選ぶ";
    }
  }
  const reminder = page.locator(".first-reminder");
  if (
    (await reminder.count()) &&
    !(await page.locator('.first-reminder[aria-checked="true"]').count())
  ) {
    await reminder.first().click();
    return "通知: 1つ目を選ぶ";
  }
  // 3) 案内の枠が指しているもの。
  const ring = await page
    .evaluate(() => {
      const r = document.querySelector(".tour-ring");
      if (!r) return null;
      const b = r.getBoundingClientRect();
      const inside = (el) => {
        const e = el.getBoundingClientRect();
        return (
          e.left >= b.left - 2 &&
          e.right <= b.right + 2 &&
          e.top >= b.top - 2 &&
          e.bottom <= b.bottom + 2 &&
          e.width > 0
        );
      };
      const tap = document.querySelector(".tour-tap");
      const swipe =
        !!document.querySelector(".dex-cf__stage") &&
        !!tap &&
        tap.getBoundingClientRect().width > 0 &&
        document.querySelector(".dex-cf__stage").getBoundingClientRect().top <=
          tap.getBoundingClientRect().top;
      const peel =
        !!document.querySelector('[data-tour="peel"]') &&
        inside(document.querySelector('[data-tour="peel"]'));
      const btn = Array.from(
        document.querySelectorAll("button, a[href], [role=button], [role=radio]"),
      ).filter((el) => !el.closest(".tour-layer") && inside(el))[0];
      const bb = btn ? btn.getBoundingClientRect() : null;
      return {
        x: b.left + b.width / 2,
        y: b.top + b.height / 2,
        w: b.width,
        h: b.height,
        swipe,
        peel,
        btn: bb
          ? {
              x: bb.left + bb.width / 2,
              y: bb.top + bb.height / 2,
              name: (btn.getAttribute("aria-label") || btn.textContent || "").trim().slice(0, 30),
            }
          : null,
      };
    })
    .catch(() => null);
  if (ring) {
    if (ring.peel) {
      // シールをはがす: 右下の角から左上へ引く。
      await page.mouse.move(ring.x + ring.w * 0.4, ring.y + ring.h * 0.4);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(
          ring.x + ring.w * (0.4 - i * 0.07),
          ring.y + ring.h * (0.4 - i * 0.07),
        );
        await sleep(30);
      }
      await page.mouse.up();
      return "シールをはがす";
    }
    if (ring.swipe) {
      await page.mouse.move(ring.x + ring.w * 0.3, ring.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(ring.x + ring.w * (0.3 - i * 0.06), ring.y);
        await sleep(25);
      }
      await page.mouse.up();
      return "カードを横にめくる";
    }
    const at = ring.btn ?? ring;
    await page.mouse.click(at.x, at.y);
    return `案内の枠を押す${ring.btn?.name ? `（${ring.btn.name}）` : ""}`;
  }
  // 4) 撮影の画面（案内が外れているとき）: シャッター。
  const shutter = page.locator(".camera-shutter");
  if (await shutter.isVisible().catch(() => false)) {
    await shutter.click();
    return "シャッター";
  }
  // 5) 各画面の主ボタン。
  const primary = page.locator(".first-primary:not([disabled])");
  if (
    await primary
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const name = ((await primary.first().textContent()) || "").trim().slice(0, 30);
    await primary.first().click();
    return `主ボタン（${name}）`;
  }
  return null;
}

/** 初めての人の流れ: 最初の画面 → 質問 → チュートリアル → 登録の画面。 */
async function firstRun(page, run) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // 最初はログイン状態の確認で待つ。押せるものが出るまで（最大 30 秒）。
  await page
    .locator(".first-primary, .first-choice, .tour-coach__next, input[type=email]")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {});
  await settle(page);
  await snap(page, run, "最初の画面");
  let stuck = 0;
  for (let i = 0; i < STEP_LIMIT; i++) {
    if (new URL(page.url()).pathname.startsWith("/auth")) {
      await settle(page);
      await snap(page, run, "登録の画面（到達）");
      run.result = "passed";
      return;
    }
    let did = null;
    try {
      did = await step(page, run);
    } catch (e) {
      did = null;
      run.console.push({ type: "操作の失敗", text: String(e).slice(0, 200) });
    }
    // AI・撮影のあとは時間がかかる。
    await settle(page, did && /シャッター|案内の枠/.test(did) ? 20000 : 9000);
    await snap(page, run, did ?? "押せるものが無い");
    // 押せない、または同じ操作を何度も繰り返している（例: 「もう一度試す」が効かない）。
    const repeats = run.steps.slice(-5).filter((x) => x.label === did).length;
    if (!did || repeats >= 5) stuck++;
    else stuck = 0;
    if (stuck >= 3) {
      run.result = "stuck";
      run.note = "同じ画面で進めなくなった（最後のスクリーンショットを参照）";
      return;
    }
  }
  run.result = "stuck";
  run.note = `${STEP_LIMIT} 段で終わらなかった`;
}

/** ログイン後の画面をひと回り（試験用アカウントがあるときだけ）。 */
async function signedIn(page, run) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  const email = page.locator('input[type="email"]');
  if (!(await email.count())) {
    // 登録の画面が先に出る作りのとき、ログインへ切り替える。
    await page
      .getByRole("button", { name: /ログイン|Log in|Sign in|登入/ })
      .first()
      .click()
      .catch(() => {});
  }
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await snap(page, run, "ログイン入力");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(home|welcome|review|dex)/, { timeout: 30_000 }).catch(() => {});
  await settle(page);
  await snap(page, run, "ログイン後");
  // 表示言語と学習言語を、この回の組み合わせに合わせる（端末の写しに入れて読み直す）。
  await page.evaluate(
    ([ui, target]) => {
      localStorage.setItem("ui-lang-v1", ui);
      localStorage.setItem("target-lang-v1", target);
    },
    [run.lang, run.target],
  );
  for (const [p, label] of [
    ["/home", "ホーム"],
    ["/dex", "図鑑"],
    ["/review", "復習"],
    ["/settings", "設定"],
  ]) {
    await page.goto(`${BASE_URL}${p}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page, 12000);
    await snap(page, run, label);
    if (p === "/dex") {
      const card = page.locator(".dex-cf__stage, [data-sticker-id], a[href*='/dex/']").first();
      if (await card.isVisible().catch(() => false)) {
        await card.click().catch(() => {});
        await settle(page, 12000);
        await snap(page, run, "単語の詳細");
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
    if (p === "/review") {
      const choice = page.locator('[data-tour="review-choices"] button').first();
      if (await choice.isVisible().catch(() => false)) {
        await choice.click();
        await settle(page);
        await snap(page, run, "復習の答え合わせ");
      }
    }
  }
  // 撮影: 本物の写真を映したカメラで撮って、AI の候補が出るまで（保存はしない）。
  await page.goto(`${BASE_URL}/capture`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, 12000);
  await snap(page, run, "カメラ");
  const shutter = page.locator(".camera-shutter");
  if (await shutter.isVisible().catch(() => false)) {
    await shutter.click();
    await settle(page, 30000);
    await sleep(8000);
    await snap(page, run, "AI の候補");
  }
  run.result = "passed";
}

async function runOne(browserType, browserName, lang, target, scenario) {
  const run = newRun(browserName, lang, target, scenario);
  const device = devices["iPhone 13"];
  const launchOpts =
    browserName === "chromium"
      ? {
          executablePath: process.env.CHROMIUM_PATH || undefined,
          args: ["--autoplay-policy=no-user-gesture-required"],
        }
      : {};
  const browser = await browserType.launch(launchOpts);
  const context = await browser.newContext({
    ...device,
    // Chromium は iPhone の名乗りをしても isMobile が効かない版があるので、画面の形だけ借りる。
    ...(browserName === "chromium" ? { isMobile: true, hasTouch: true } : {}),
    locale: { ja: "ja-JP", en: "en-US", "zh-TW": "zh-TW" }[lang] ?? "ja-JP",
    timezoneId: "Asia/Taipei",
    permissions: browserName === "chromium" ? ["camera", "microphone"] : [],
    recordVideo: {
      dir: run.dir,
      size: { width: device.viewport.width, height: device.viewport.height },
    },
  });
  await context.addInitScript(`window.__QA_CAMERA_IMAGE__ = ${JSON.stringify(PHOTO)};`);
  // 初めての人の流れでは言語を先に入れない（本物の初回と同じ状態で始める）。
  if (scenario === "signed-in") {
    await context.addInitScript(
      `try{localStorage.setItem("ui-lang-v1", ${JSON.stringify(lang)});localStorage.setItem("target-lang-v1", ${JSON.stringify(target)});}catch(e){}`,
    );
  }
  await context.addInitScript(INSTRUMENT);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      run.console.push({ type: m.type(), text: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) =>
    run.console.push({ type: "pageerror", text: String(e).slice(0, 300) }),
  );
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED|cancelled/i.test(err)) return; // 画面遷移で打ち切っただけ
    run.network.push({ status: "失敗", url: r.url().slice(0, 200), detail: err });
  });
  page.on("response", (r) => {
    if (r.status() >= 400)
      run.network.push({
        status: r.status(),
        url: r.url().slice(0, 200),
        detail: r.request().resourceType(),
      });
  });
  const started = Date.now();
  try {
    if (scenario === "first-run") await firstRun(page, run);
    else await signedIn(page, run);
  } catch (e) {
    run.result = "error";
    run.note = String(e).slice(0, 300);
    await snap(page, run, "エラーの時点").catch(() => {});
  }
  run.seconds = Math.round((Date.now() - started) / 1000);
  // 音と動きの記録を回収する。
  const qa = await page
    .evaluate(async () => {
      const q = window.__qa;
      if (!q) return null;
      for (const r of q.recorders) {
        try {
          if (r.state !== "inactive") {
            await new Promise((res) => {
              r.addEventListener("stop", res, { once: true });
              r.stop();
            });
          }
        } catch {
          /* 止められなくても集めたぶんは出す */
        }
      }
      let audio = null;
      if (q.audioChunks.length) {
        const blob = new Blob(q.audioChunks, { type: q.audioMime || "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000)
          s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        audio = { mime: blob.type, b64: btoa(s) };
      }
      return { events: q.events, fps: q.fps, audio };
    })
    .catch(() => null);
  if (qa) {
    run.sounds = qa.events;
    run.fps = qa.fps;
    if (qa.audio) {
      const ext = qa.audio.mime.includes("mp4") ? "m4a" : "webm";
      fs.writeFileSync(path.join(run.dir, `sound.${ext}`), Buffer.from(qa.audio.b64, "base64"));
      run.audio = `sound.${ext}`;
    }
  }
  const video = page.video();
  await context.close();
  if (video) {
    const p = await video.path().catch(() => null);
    if (p) {
      const dest = path.join(run.dir, "video.webm");
      fs.renameSync(p, dest);
      run.video = "video.webm";
    }
  }
  await browser.close();
  console.log(
    `${run.id}: ${run.result} (${run.steps.length} 段, ${run.seconds} 秒)${run.note ? " — " + run.note : ""}`,
  );
  return run;
}

const runs = [];
fs.mkdirSync(OUT, { recursive: true });
for (const name of BROWSERS) {
  const type = name === "webkit" ? webkit : chromium;
  for (let i = 0; i < LANGS.length; i++) {
    const lang = LANGS[i];
    const target = TARGETS[i % TARGETS.length];
    runs.push(await runOne(type, name, lang, target, "first-run"));
    if (EMAIL && PASSWORD) runs.push(await runOne(type, name, lang, target, "signed-in"));
  }
}
const summary = writeReport(OUT, runs, { baseUrl: BASE_URL, signedIn: !!(EMAIL && PASSWORD) });
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(`\nレポート: ${path.join(OUT, "index.html")}`);
