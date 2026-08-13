/**
 * 棚(図鑑)の見た目を、実機なしで見る・機械で採点する。
 *
 * ## なぜ要るか
 * 棚は「面 + ヘアライン + 接地影」の3つだけで奥行きを出している。目視でしか
 * 詰められない性質のものに見えるが、実際は audit-packs.mjs のときと同じで、
 * 目では気づけない不具合(コントラスト未達・タップ領域不足・横はみ出し)が
 * 混ざる。先に機械で落としてから目で見る。
 *
 * ## どうやって本物のCSSを使うか
 * styles.css は Tailwind を @import しているので、生のまま読み込んでも
 * ユーティリティクラスが解決しない。**ビルド済みのCSSバンドル**を読む。
 *   npm run build   # → .output/public/assets/styles-*.css
 *
 * ## 使い方
 *   npm run build && node scripts/shelf-preview.mjs
 *   → /tmp/shelf-preview/shelf-{light,dark,darkroom,contrast,
 *      contrast-dark,contrast-darkroom}.png と、判定結果(終了コード)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.SHELF_OUT || "/tmp/shelf-preview";
const cssFile = fs
  .readdirSync(".output/public/assets")
  .find((f) => f.startsWith("styles-") && f.endsWith(".css"));
if (!cssFile) {
  console.error("ビルド済みCSSが無い。先に `npm run build` を実行すること。");
  process.exit(1);
}
const CSS = fs.readFileSync(path.join(".output/public/assets", cssFile), "utf8");

/**
 * 棚に立つモノ。**本物と同じ経路で描く**ことが肝心 —
 * `<img>` + `object-contain` + `.shelf-item img` の max-height を通す。
 * 最初これを `<span>` の高さ指定で代用したら max-height の制約を迂回して
 * しまい、実物よりずっと大きく描かれた雛形を見て「大きすぎる」と誤判断した。
 * 縦横比を変えることで、実際の切り抜きと同じ高さのばらつきが出る。
 */
const svg = (w, h, color) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="4" fill="${color}"/></svg>`,
  );

const ITEMS = [
  ["芒果", svg(100, 88, "#f5a623"), "cutout"],
  ["捷運", svg(70, 120, "#4a90d9"), "cutout"],
  ["珍珠奶茶", svg(120, 62, "#b07a4a"), "framed"],
  ["夜市", svg(96, 96, "#d0483c"), "cutout"],
  ["腳踏車", null, "none"],
  ["雨傘", null, "pending"],
];

const PER = 3;

/**
 * モノ1つ。**3つの見え方すべて**を出す — 実物には
 *   ① 切り抜き ② 切り抜きが無く写真を額に入れたもの ③ 画像がまだ無いもの
 * があるのに、以前は①しか描いておらず、②③の不具合(額の中で写真が浮く、
 * 単語が枠の上端に張り付く)を一度も見られていなかった。
 * `pending` は CachedImg が署名URLを解決する前に出す**大きさの無い span**。
 * これで高さが動かないことを確かめる。
 */
const shelfItem = ([word, src, kind = "cutout"]) => {
  const inner =
    kind === "framed"
      ? `<img class="shelf-stand shelf-framed" src="${src}" alt="">`
      : kind === "none"
        ? `<span class="shelf-fallback shelf-framed bg-secondary text-sm font-semibold text-muted-foreground">${word}</span>`
        : kind === "pending"
          ? `<span class="shelf-stand" aria-hidden="true"></span>`
          : `<img class="shelf-stand" src="${src}" alt="">`;
  return `<button class="shelf-item" aria-label="${word}" lang="zh-Hant">${inner}</button>`;
};

/** 1段 = [モノの行] → [棚板] → [題名の行]。列は棚板の上下で揃える。 */
const tier = (items) => `
  <div>
    <div class="shelf-row" style="grid-template-columns:repeat(${PER},minmax(0,1fr))">
      ${items.map(shelfItem).join("")}
    </div>
    <div class="shelf-rule"></div>
    <div class="grid gap-3 pt-1.5" style="grid-template-columns:repeat(${PER},minmax(0,1fr))">
      ${items.map(([w]) => `<span lang="zh-Hant" class="truncate text-center text-[12px] font-medium leading-tight">${w}</span>`).join("")}
    </div>
  </div>`;

/** 1棚 = 名前 + N個ずつに折り返した段。 */
const shelf = (label, emoji, items) => {
  const tiers = [];
  for (let i = 0; i < items.length; i += PER) tiers.push(items.slice(i, i + PER));
  return `
  <div>
    <div class="mb-1.5 flex items-baseline gap-1.5 px-0.5">
      <span class="text-sm leading-none">${emoji}</span>
      <span class="text-[13px] font-semibold">${label}</span>
      <span class="text-[11px] text-muted-foreground">${items.length}</span>
    </div>
    ${tiers.map((t, i) => `<div class="${i > 0 ? "mt-3" : ""}">${tier(t)}</div>`).join("")}
  </div>`;
};

const room = (name, shelves) => `
  <section>
    <h3 class="sticky top-0 z-10 -mx-4 mb-1 bg-background/85 px-4 py-1.5 text-[13px] font-semibold tracking-[0.04em] text-muted-foreground backdrop-blur-sm">${name}</h3>
    <div class="space-y-6">${shelves}</div>
  </section>`;

const BODY = `
<div class="min-h-screen bg-background px-4 py-4">
  <div class="space-y-8">
    ${room("食べる", shelf("果物", "🍎", ITEMS) + shelf("飲み物", "🥤", ITEMS.slice(0, 4)))}
    ${room("街", shelf("交通", "🚆", ITEMS.slice(1, 4)))}
    ${room("しるし", `<p class="pt-2 text-[11px] text-muted-foreground">まだ空</p>`)}
  </div>
</div>`;

/**
 * 見る面の一覧: [名前, `<html>` に付ける属性, 高コントラストか]。
 *
 * `.dark` だけを見ていたのが穴だった。**暗い data-ui-theme は `.dark` を
 * 付けない** — `--background` を暗くするだけなので、`.dark` 前提で書いた
 * 上書きはこの5テーマに一切届かない。同じ取りこぼしを2回踏んでいる
 * (縁が白く光る件、高コントラストで棚板が濃くならない件)ので、
 * 代表として darkroom を明るい面・暗い面と同格で並べる。
 */
const MODES = [
  ["light", "", false],
  ["dark", 'class="dark"', false],
  ["darkroom", 'data-ui-theme="darkroom"', false],
  ["contrast", "", true],
  ["contrast-dark", 'class="dark"', true],
  ["contrast-darkroom", 'data-ui-theme="darkroom"', true],
];

/** 高コントラストのときに棚板が到達していなければならない濃さ。 */
const CONTRAST_LINE_A = 0.5;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const issues = [];

for (const [name, htmlAttrs, wantsContrast] of MODES) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: htmlAttrs.includes("dark") ? "dark" : "light",
    forcedColors: "none",
    ...(wantsContrast ? { contrast: "more" } : {}),
  });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><html ${htmlAttrs}><style>${CSS}</style><body>${BODY}</body></html>`,
    { waitUntil: "load" },
  );
  await page.waitForTimeout(300);

  const found = await page.evaluate(
    ({ wantsContrast, CONTRAST_LINE_A }) => {
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
        const p = m[1]
          .split(/[,\s/]+/)
          .filter(Boolean)
          .map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
      };
      const bgOf = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0.85) return c;
          n = n.parentElement;
        }
        const c = parse(getComputedStyle(document.body).backgroundColor);
        return c && c.a > 0.85 ? c : { r: 255, g: 255, b: 255 };
      };

      // 1. コントラスト
      for (const el of document.querySelectorAll("span, p, h3")) {
        if (!el.textContent.trim() || el.children.length) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const fg = parse(cs.color);
        const bg = bgOf(el);
        if (!fg) continue;
        const L1 = lum(fg.r, fg.g, fg.b);
        const L2 = lum(bg.r, bg.g, bg.b);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const px = parseFloat(cs.fontSize);
        const big = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        const need = big ? 3 : 4.5;
        if (ratio < need) {
          out.push(
            `コントラスト ${ratio.toFixed(2)} < ${need} — "${el.textContent.trim().slice(0, 12)}" ${px}px`,
          );
        }
      }
      // 2. タップ領域 44px
      for (const el of document.querySelectorAll("button")) {
        const r = el.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) {
          out.push(`タップ領域 ${Math.round(r.width)}x${Math.round(r.height)} < 44 — ${el.title}`);
        }
      }
      // 3. 横のはみ出し
      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        out.push(`横にはみ出し ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
      }
      // 4. 段の高さは中身に依らないこと(画像が届いても下がずれない)。
      //    以前ここは「下端が揃っているか」を見ていたが、align-items:end が
      //    定義上それを保証するので、どんな入力でも通る検査になっていた。
      const heights = [...document.querySelectorAll(".shelf-item")].map((e) =>
        Math.round(e.getBoundingClientRect().height),
      );
      if (new Set(heights).size > 1) {
        out.push(
          `枠の高さが揃っていない(画像待ちで下がずれる): ${[...new Set(heights)].join(",")}`,
        );
      }
      // 5〜6. 棚板の濃さと、影が黒側であること。
      //
      // ここは**トークンを直接見る**。計算後の色を読もうとしたら、Chrome は
      // color-mix を oklab(…) で返し、rgba を期待した正規表現が全部素通しに
      // なった(全モードで「見えない」と誤判定した)。色空間の表現に依存しない
      // 形で、実際に踏んだ不具合そのものを条件にする:
      //   - 棚板を 8% で引いて明るい背景で消えた → 下限を決める
      //   - 影を --foreground で作ってダークで白く光った → 黒軸に固定する
      const root = getComputedStyle(document.documentElement);
      const lineA = parseFloat(root.getPropertyValue("--shelf-line-a"));
      if (!(lineA >= 0.15)) out.push(`棚板が薄すぎる: --shelf-line-a=${lineA}`);
      // 高コントラストを頼んだのに濃くならない面が無いこと。
      // `:root, .dark` にだけ書いた上書きは `:root[data-ui-theme="…"]` に
      // 詳細度で負ける = 頼んだ人にだけ届かない、という形で落ちる。
      if (wantsContrast && !(lineA >= CONTRAST_LINE_A)) {
        out.push(`高コントラストが効いていない: --shelf-line-a=${lineA} (要 ${CONTRAST_LINE_A})`);
      }
      const lipA = parseFloat(root.getPropertyValue("--shelf-lip-a"));
      const bodyBg = bgOf(document.body);
      const bodyLum = lum(bodyBg.r, bodyBg.g, bodyBg.b);
      if (bodyLum < 0.2 && lipA > 0.2) {
        out.push(`暗い面なのに縁が明るすぎる(白く光る): --shelf-lip-a=${lipA}`);
      }
      const shadow = root.getPropertyValue("--shelf-shadow").trim();
      if (!/^0\s+0%/.test(shadow)) {
        out.push(`接地影が黒軸ではない: --shelf-shadow=${shadow}`);
      }
      for (const rule of document.querySelectorAll(".shelf-rule")) {
        if (rule.getBoundingClientRect().height < 1) out.push("棚板の高さが0");
      }
      return out;
    },
    { wantsContrast, CONTRAST_LINE_A },
  );

  found.forEach((f) => issues.push(`[${name}] ${f}`));
  await page.screenshot({ path: path.join(OUT, `shelf-${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();

if (issues.length) {
  console.error(`不合格 ${issues.length}件:`);
  issues.forEach((i) => console.error("  - " + i));
  process.exit(1);
}
console.log(`合格。スクリーンショット: ${OUT}`);
