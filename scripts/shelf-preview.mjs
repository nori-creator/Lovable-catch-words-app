/**
 * 棚(図鑑)の見た目を、実機なしで見る・機械で採点する。
 *
 * ## なぜ要るか
 * 棚は「面 + ヘアライン + 接地影」の3つだけで奥行きを出している。目視でしか
 * 詰められない性質のものに見えるが、実際は目では気づけない不具合
 * (コントラスト未達・タップ領域不足・横はみ出し)が混ざる。
 * 先に機械で落としてから目で見る。
 *
 * ## **本物のコンポーネントを描く**
 * 以前この検査は棚のHTMLを手書きで複製していた。つまり
 * **コンポーネントを直しても画像は変わらない** — 検査が合格しても、
 * 実物が同じように描かれている保証がどこにも無かった(独立監査の指摘)。
 * 実際、空の棚の実レイアウトは一度も写っていなかった。
 *
 * いまは `scripts/shelf-harness/` を Vite で組み、本物の `DexShelf` と
 * 本物の `styles.css` を読み込んだページを Playwright で開く。
 * 場面はURLの検索文字列で切り替える。
 *
 * ## 使い方
 *   node scripts/shelf-preview.mjs
 *   → /tmp/shelf-preview/shelf-*.png と、判定結果(終了コード)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";

const OUT = process.env.SHELF_OUT || "/tmp/shelf-preview";
const HARNESS_DIR = path.resolve("scripts/shelf-harness");
const HARNESS_OUT = path.resolve(".shelf-harness");

// **毎回組み直す。** 古い成果物を使うと、また「直したのに画像が変わらない」
// に戻る(それを潰すための作り替えなので、ここで手を抜くと意味がない)。
execFileSync("npx", ["vite", "build", "--config", path.join(HARNESS_DIR, "vite.config.ts")], {
  stdio: "pipe",
});
if (!fs.existsSync(path.join(HARNESS_OUT, "index.html"))) {
  console.error("ハーネスを組めなかった。");
  process.exit(1);
}
// **file:// ではなく http で出す。**
// file:// で連続して開くと、5枚目あたりから CSS が付かないまま描かれて
// トークンが空になった(--shelf-shadow が空文字で返る)。原因を追うより、
// 本物と同じ経路(http)で出すほうが確実で、実物にも近い。
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.join(HARNESS_OUT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(HARNESS_OUT) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const type = file.endsWith(".css")
    ? "text/css"
    : file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".html")
        ? "text/html"
        : "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

/** ハーネスの場面をURLの検索文字列で表す。 */
const sceneUrl = (base, { material = "none", density = "three", count = 8 } = {}) =>
  `${base}?material=${material}&density=${density}&count=${count}`;

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
  ["light", "", false, {}],
  ["dark", 'class="dark"', false, {}],
  ["darkroom", 'data-ui-theme="darkroom"', false, {}],
  ["contrast", "", true, {}],
  ["contrast-dark", 'class="dark"', true, {}],
  ["contrast-darkroom", 'data-ui-theme="darkroom"', true, {}],
  // 素材と密度。**選べるようにしたものは全部見る** — 選択肢を足しただけで
  // 見ていない組み合わせがあるなら、それは足していないのと同じ。
  ["oak", "", false, { material: "oak" }],
  ["walnut-dark", 'class="dark"', false, { material: "walnut" }],
  ["obsidian-dark", 'class="dark"', false, { material: "obsidian" }],
  ["concrete", "", false, { material: "concrete" }],
  ["glass", "", false, { material: "glass" }],
  ["den2", "", false, { density: "two" }],
  ["den4", "", false, { density: "four" }],
  ["spines", "", false, { density: "spines" }],
  ["spines-oak-dark", 'class="dark"', false, { density: "spines", material: "oak" }],
  // **何も集めていない人の図鑑。** ここを撮っていなかったせいで、
  // 「54棚が全部空で数画面ぶん流れる」に気づけなかった。
  ["empty-light", "", false, { count: 0 }],
  ["empty-dark", 'class="dark"', false, { count: 0 }],
];

/** 高コントラストのときに棚板が到達していなければならない濃さ。 */
const CONTRAST_LINE_A = 0.65;

/**
 * 棚板が背景に対して確保すべきコントラスト比。
 *
 * 意味を持つUIの図形の下限(WCAG 1.4.11 / apple-design §2)。
 * ここを**濃さの数字(0.15以上)でしか見ていなかった**のが穴だった。
 * 0.22 は「0.15以上」を満たしているが、実測は 1.55:1 で、
 * 独立監査に「棚ではなく、キャプション付きの写真の羅列に見える」と
 * 言われるまで気づかなかった。**単位の無い数字ではなく、比で見る。**
 */
const LINE_MIN_RATIO = 3;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const issues = [];

for (const [name, htmlAttrs, wantsContrast, scene] of MODES) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: htmlAttrs.includes("dark") ? "dark" : "light",
    forcedColors: "none",
    ...(wantsContrast ? { contrast: "more" } : {}),
  });
  await page.goto(sceneUrl(BASE, scene), { waitUntil: "load" });
  // `<html>` の属性(テーマ)は開いてから付ける。
  if (htmlAttrs) {
    await page.evaluate((attrs) => {
      const el = document.documentElement;
      const m = attrs.match(/(\w[\w-]*)="([^"]*)"/);
      if (m) el.setAttribute(m[1], m[2]);
    }, htmlAttrs);
  }
  await page.waitForTimeout(400);

  const found = await page.evaluate(
    ({ wantsContrast, CONTRAST_LINE_A, LINE_MIN_RATIO }) => {
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
      // 棚板の実際のコントラスト比。前景色を lineA の割合で背景に混ぜた色と
      // 背景の比を出す(`.shelf-rule` は color-mix でそう描いている)。
      const fg = parse(getComputedStyle(document.documentElement).color) ??
        parse(getComputedStyle(document.body).color) ?? { r: 0, g: 0, b: 0 };
      const pageBg = bgOf(document.body);
      const mixed = {
        r: fg.r * lineA + pageBg.r * (1 - lineA),
        g: fg.g * lineA + pageBg.g * (1 - lineA),
        b: fg.b * lineA + pageBg.b * (1 - lineA),
      };
      const lm = lum(mixed.r, mixed.g, mixed.b);
      const lb = lum(pageBg.r, pageBg.g, pageBg.b);
      const lineRatio = (Math.max(lm, lb) + 0.05) / (Math.min(lm, lb) + 0.05);
      if (lineRatio < LINE_MIN_RATIO) {
        out.push(
          `棚板のコントラストが ${lineRatio.toFixed(2)}:1 < ${LINE_MIN_RATIO} ` +
            `(--shelf-line-a=${lineA})`,
        );
      }
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
    { wantsContrast, CONTRAST_LINE_A, LINE_MIN_RATIO },
  );

  found.forEach((f) => issues.push(`[${name}] ${f}`));

  // ## 部屋見出しの止まる位置
  //
  // 見出しは `top: var(--app-header-h)` の sticky。**上のバーの高さと
  // ここが食い違うと、静かに壊れる**:
  //   ・高すぎる → まだ流れの中にいる見出しが下にずれ、自分の中身に重なる
  //     (実際に起きた。一番上の「空いている棚」が見出しの下敷きで消えた)
  //   ・低すぎる → 止まった見出しが半透明のバーの裏に潜り、上端がぼやける
  //     (実際に起きた。3.25rem 決め打ちで、バーは 3.5rem だった)
  // どちらも画像を見ても「なんとなく変」で終わる。数字で見る。
  const stick = await page.evaluate(async () => {
    const out = [];
    const bar = document.querySelector("header");
    if (!bar) return ["上のバーが無い(ハーネスが実物と違う)"];
    // バーが本当に貼り付いているか。ここが relative だと、下の
    // 「止まる位置」の話が全部意味を失う(実際そうなっていた)。
    if (getComputedStyle(bar).position !== "sticky") {
      out.push(`上のバーが sticky ではない(${getComputedStyle(bar).position})`);
    }
    const barH = bar.getBoundingClientRect().height;
    const measure = () => {
      for (const head of document.querySelectorAll(".room-head")) {
        const stickyTop = parseFloat(getComputedStyle(head).top);
        if (Math.abs(stickyTop - barH) > 0.5) {
          out.push(`部屋見出しの止まる位置 ${stickyTop}px がバーの高さ ${barH}px と違う`);
        }
        const h = head.getBoundingClientRect();
        const sec = head.parentElement.getBoundingClientRect();
        // sticky の3つの局面をまとめて1つの式で言う:
        //   ① まだ流れの中 → 部屋の上端にいる
        //   ② 止まっている → バーの下端にいる
        //   ③ 部屋が出ていく → 部屋の下端に押し上げられる
        // どれでもない位置にいるなら、中身に重なっているか裏に潜っている。
        // ③ は**マージン箱**で押し上がるので、下マージンぶん引く。
        const mb = parseFloat(getComputedStyle(head).marginBottom) || 0;
        const want = Math.min(Math.max(sec.top, stickyTop), sec.bottom - h.height - mb);
        if (Math.abs(h.top - want) > 1) {
          out.push(
            `部屋見出し「${head.textContent}」の位置がおかしい ` +
              `(${h.top.toFixed(1)} ≠ ${want.toFixed(1)}: ` +
              `部屋 ${sec.top.toFixed(1)}〜${sec.bottom.toFixed(1)} / 止まる位置 ${stickyTop})`,
          );
        }
      }
    };
    measure();
    // 止まった状態も見る。スクロール前だけだと「潜る」側を一度も踏まない。
    window.scrollTo(0, 400);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    measure();
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...new Set(out)];
  });
  stick.forEach((f) => issues.push(`[${name}] ${f}`));

  await page.screenshot({ path: path.join(OUT, `shelf-${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();
server.close();

if (issues.length) {
  console.error(`不合格 ${issues.length}件:`);
  issues.forEach((i) => console.error("  - " + i));
  process.exit(1);
}
console.log(`合格。スクリーンショット: ${OUT}`);
