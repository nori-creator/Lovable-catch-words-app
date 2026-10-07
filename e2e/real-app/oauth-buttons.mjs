/**
 * 公開中のログイン画面で「Googleで続ける」「Appleで続ける」が**押せて、ログインの窓口へ進むか**を
 * 確かめる（2026-10-05「Web版でログイン画面の Google・Apple のボタンが押せない」の報告）。
 *
 * - iPhone の Safari と同じ仕組み（WebKit）と Chrome（Chromium）、スマホと PC の大きさ。
 * - 初めての人・チュートリアルを終えた人（お試しの匿名のログインが残っている）の2通り。
 * - 押す所に別の物が重なっていないか（`elementFromPoint`）、押せない状態か、押した後に
 *   `/~oauth/initiate` へ進んだかを記録する。Google・Apple の本物の画面は開かない
 *   （窓口への移動を確かめたら止める）。
 *
 * 使い方: `node e2e/real-app/oauth-buttons.mjs`（BASE_URL・BROWSERS は run.mjs と同じ）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, devices } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || "https://catchwords.lovable.app").replace(/\/$/, "");
const BROWSERS = (process.env.BROWSERS || "chromium,webkit").split(",").map((s) => s.trim());
const OUT = path.resolve(process.env.OUT || "e2e-report", "oauth-buttons");
fs.mkdirSync(OUT, { recursive: true });

/** お試しの匿名のログインを作る（チュートリアルを終えた人と同じ状態）。公開の鍵だけを使う。 */
function readEnv() {
  try {
    const text = fs.readFileSync(path.join(here, "../../.env"), "utf8");
    const get = (k) => text.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m"))?.[1];
    return { url: get("VITE_SUPABASE_URL"), key: get("VITE_SUPABASE_PUBLISHABLE_KEY") };
  } catch {
    return {};
  }
}
async function anonymousSession() {
  const { url, key } = readEnv();
  if (!url || !key) return null;
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ data: {} }),
  });
  if (!res.ok) return null;
  const s = await res.json();
  const ref = new URL(url).hostname.split(".")[0];
  return {
    key: `sb-${ref}-auth-token`,
    value: JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: "bearer",
      user: s.user,
    }),
  };
}

const BUTTONS = {
  google: "button.auth-oauth:not(.auth-oauth--apple):not(.auth-oauth--mail)",
  apple: "button.auth-oauth--apple",
};
const SIZES = { phone: devices["iPhone 14"], desktop: devices["Desktop Safari"] };

const rows = [];
let failed = 0;
for (const browserName of BROWSERS) {
  const type = browserName === "webkit" ? webkit : chromium;
  const browser = await type.launch();
  for (const [sizeName, device] of Object.entries(SIZES)) {
    for (const state of ["fresh", "anonymous"]) {
      for (const [provider, selector] of Object.entries(BUTTONS)) {
        const { defaultBrowserType: _d, ...options } = device;
        if (browserName !== "chromium" && browserName !== "webkit") continue;
        const context = await browser.newContext({ ...options, locale: "ja-JP" });
        if (state === "anonymous") {
          const session = await anonymousSession();
          if (session)
            await context.addInitScript(
              ([k, v]) => {
                if (!localStorage.getItem(k)) localStorage.setItem(k, v);
              },
              [session.key, session.value],
            );
        }
        // Google・Apple の画面へは行かない（窓口へ進んだことだけ分かればよい）。
        await context.route(
          /\/~oauth\/|oauth\.lovable\.app|accounts\.google\.com|appleid\.apple\.com/,
          (r) =>
            r.fulfill({ status: 200, contentType: "text/html", body: "<title>oauth</title>oauth" }),
        );
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
        let result = "ok";
        let detail = "";
        try {
          await page.goto(`${BASE_URL}/auth?mode=signin`, { waitUntil: "load", timeout: 45_000 });
          const button = page.locator(selector).first();
          await button.waitFor({ state: "visible", timeout: 20_000 });
          // 画面の部品が動き出すまで（押しても何も起きない時間を除く）。
          await page.waitForTimeout(3000);
          await button.scrollIntoViewIfNeeded();
          const disabled = await button.isDisabled();
          const box = await button.boundingBox();
          const hit = await page.evaluate(
            ({ x, y, sel }) => {
              const el = document.elementFromPoint(x, y);
              if (!el) return "nothing";
              if (el.closest(sel)) return "button";
              return `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`;
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2, sel: selector },
          );
          detail = `disabled=${disabled} hit=${hit}`;
          if (sizeName === "phone") await button.tap({ timeout: 5000 });
          else await button.click({ timeout: 5000 });
          const moved = await page
            .waitForURL(/\/~oauth\/initiate/, { timeout: 10_000 })
            .then(() => true)
            .catch(() => false);
          // Google は毎回アカウントを選ぶ画面を出す（2026-10-07 の報告）。公開前の版では無いので記録だけ。
          if (moved && provider === "google")
            detail += /[?&]prompt=select_account/.test(page.url())
              ? " select_account=yes"
              : " select_account=NO";
          if (!moved) {
            result = "押しても窓口へ進まない";
            const toast = await page
              .locator("[data-sonner-toast]")
              .allInnerTexts()
              .catch(() => []);
            if (toast.length) detail += ` toast=${toast.join(" / ")}`;
            detail += ` url=${page.url()}`;
          }
        } catch (e) {
          result = `失敗: ${String(e).split("\n")[0].slice(0, 200)}`;
        }
        if (result !== "ok") {
          failed++;
          await page
            .screenshot({
              path: path.join(OUT, `${browserName}-${sizeName}-${state}-${provider}.png`),
            })
            .catch(() => {});
        }
        if (errors.length) detail += ` pageerror=${errors[0]}`;
        const line = `${browserName} · ${sizeName} · ${state} · ${provider}: ${result} (${detail})`;
        rows.push(line);
        console.log(line);
        await context.close();
      }
    }
  }
  await browser.close();
}
fs.writeFileSync(path.join(OUT, "result.txt"), rows.join("\n") + "\n");
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n### ログイン画面の Google・Apple のボタン\n\n${rows.map((r) => `- ${r}`).join("\n")}\n`,
  );
if (!rows.length) {
  console.error("何も試していない。");
  process.exit(1);
}
if (failed) {
  console.error(`${failed} 件、ボタンを押しても窓口へ進まなかった。`);
  process.exit(1);
}
