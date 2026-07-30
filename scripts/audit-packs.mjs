/**
 * 見た目パックの機械検査(デザインの合格判定)。
 *
 * ## なぜ要るか
 * デザインの良し悪しを目視だけで詰めると、必ず見落とす。実際この検査を
 * 最初に回したとき、目では1つも気づけなかった **156件** の不具合が出た
 * (全パックでタップ領域が44px未満、補助文字のコントラストが AA 未達など)。
 * 「合格するまで直す」を回すには、判定できる条件が先に要る。
 *
 * ## 判定する条件
 *   1. 文字と背景のコントラスト比 (WCAG AA: 本文4.5 / 大きい字3.0)
 *   2. タップ領域が44px以上
 *   3. 横方向のはみ出しが無い
 *   4. 潰れた要素(極端に低い絵の面)が無い
 * 1件でも残っていれば終了コード1で落ちる。
 *
 * ## 使い方
 *   npm i -D playwright          # このリポジトリの依存には入れていない
 *   node scripts/audit-packs.mjs
 *   PW_CHROME=/path/to/chrome node scripts/audit-packs.mjs   # ブラウザを指定する場合
 *
 * グラデーションの上に載る文字は画素を見ないと判定できないため、ここでは
 * 対象外にしている(その分は実物のスクリーンショットで目視する)。
 */
import { chromium } from "playwright";
import fs from "node:fs";
const CSS = fs.readFileSync(new URL("../src/pack-styles.css", import.meta.url), "utf8");
const PACKS = [
  ["origin", "album"],
  ["card", "card"],
  ["sticker", "grid"],
  ["cellar", "shelf"],
  ["watch", "grid"],
  ["garage", "rail"],
  ["museum", "grid"],
  ["artspace", "card"],
  ["photofeed", "grid"],
  ["arfield", "map"],
  ["vfeed", "feed-v"],
  ["library", "rail"],
  ["timeline", "timeline"],
  ["wall", "timeline"],
  ["streaming", "rail"],
  ["darkroom", "card"],
];
const SAMPLE = [
  ["芒果", "マンゴー", "🥭"],
  ["捷運", "地下鉄", "🚇"],
  ["珍珠奶茶", "タピオカ", "🧋"],
  ["夜市", "夜市", "🏮"],
  ["腳踏車", "自転車", "🚲"],
  ["鳳梨酥", "パイナップルケーキ", "🍍"],
  ["便當", "弁当", "🍱"],
  ["雨傘", "傘", "☂️"],
  ["紅綠燈", "信号", "🚦"],
];
const tiles = SAMPLE.map(
  ([w, s, e]) =>
    `<div class="pk-tile"><div class="pk-tile-media"><span class="pk-tile-emoji">${e}</span></div><div class="pk-tile-body"><div class="pk-tile-word">${w}</div><div class="pk-tile-sub">${s}</div></div></div>`,
).join("");
const nav = ["ホーム", "図鑑", "スキャン", "復習", "設定"]
  .map(
    (l, i) =>
      `<span class="pk-nav-item" data-active="${i === 1}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>${l}</span>`,
  )
  .join("");

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const report = [];
for (const [id, layout] of PACKS) {
  const attr = id === "origin" ? "" : ` data-ui-pack="${id}"`;
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style><style>*{box-sizing:border-box}body{margin:0;height:100vh;font-family:Inter,system-ui}</style>
  <div class="pk-app"${attr} style="height:100%">
   <div class="pk-header"><div><p class="pk-title">図鑑</p><p class="pk-sub">128個の言葉</p></div><span class="pk-chip">台北</span></div>
   <div class="pk-rings"></div><div class="pk-hero"><span class="pk-hero-word">夜市</span></div>
   <div class="pk-body"><div class="pk-collection" data-layout="${layout}">${tiles}</div></div>
   <div style="display:flex;justify-content:center;padding:12px"><button class="pk-btn">スキャンする</button></div>
   <div class="pk-nav">${nav}</div></div>`,
    { waitUntil: "load" },
  );
  await page.waitForTimeout(3000);
  const issues = await page.evaluate(() => {
    const out = [];
    const lum = (r, g, b) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    };
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return { gradient: true };
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0.85) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const texts = [
      ...document.querySelectorAll(
        ".pk-title,.pk-sub,.pk-tile-word,.pk-tile-sub,.pk-nav-item,.pk-chip,.pk-btn",
      ),
    ];
    for (const el of texts) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const fg = parse(cs.color);
      const bg = bgOf(el);
      if (!fg) continue;
      if (bg.gradient) continue; // グラデ上は画素を見ないと判定できないので別扱い
      const L1 = lum(fg.r, fg.g, fg.b),
        L2 = lum(bg.r, bg.g, bg.b);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize),
        bold = parseInt(cs.fontWeight) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3.0 : 4.5;
      if (ratio < need)
        out.push({
          kind: "contrast",
          sel: el.className.toString().slice(0, 40),
          text: el.textContent.trim().slice(0, 10),
          ratio: +ratio.toFixed(2),
          need,
          size,
        });
    }
    for (const el of document.querySelectorAll(".pk-btn,.pk-nav-item,.pk-tile")) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 44 && el.classList.contains("pk-btn"))
        out.push({ kind: "tap", sel: "pk-btn", h: Math.round(r.height) });
      if (r.height > 0 && r.height < 44 && el.classList.contains("pk-nav-item"))
        out.push({ kind: "tap", sel: "pk-nav-item", h: Math.round(r.height) });
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      out.push({ kind: "overflow-x", w: document.documentElement.scrollWidth });
    for (const el of document.querySelectorAll(".pk-tile-media")) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 28) out.push({ kind: "squashed", h: Math.round(r.height) });
    }
    return out;
  });
  report.push({ id, issues });
  console.log(
    id.padEnd(11),
    issues.length === 0 ? "OK" : `${issues.length} 件`,
    issues
      .slice(0, 4)
      .map((i) =>
        i.kind === "contrast" ? `コントラスト ${i.ratio}<${i.need} "${i.text}"` : JSON.stringify(i),
      )
      .join(" | "),
  );
}
await browser.close();
fs.writeFileSync(new URL("../.pack-audit.json", import.meta.url), JSON.stringify(report, null, 1));
process.exitCode = report.reduce((a, b) => a + b.issues.length, 0) > 0 ? 1 : 0;
const total = report.reduce((a, b) => a + b.issues.length, 0);
console.log("\n合計", total, "件");
