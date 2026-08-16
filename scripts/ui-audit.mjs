/**
 * 画面の見た目を、実機なしで見る・機械で採点する。
 *
 * ## なぜ要るか
 * 目視でしか詰められないように見えるものにも、目では気づけない不具合
 * (コントラスト未達・タップ領域不足・横はみ出し・焦点が見えない)が
 * 混ざる。先に機械で落としてから目で見る。
 *
 * ## **本物のコンポーネントを描く**
 * 以前この検査は棚のHTMLを手書きで複製していた。つまり
 * **コンポーネントを直しても画像は変わらない** — 検査が合格しても、
 * 実物が同じように描かれている保証がどこにも無かった(独立監査の指摘)。
 * 実際、空の棚の実レイアウトは一度も写っていなかった。
 *
 * いまは `scripts/ui-harness/` を Vite で組み、本物のコンポーネントと
 * 本物の `styles.css` を読み込んだページを Playwright で開く。
 * 場面はURLの検索文字列で切り替える。
 *
 * ## 何を見ていないか(**書いておく**)
 * ・ホーム・設定はルートに直書きのままで**未検査**。復習は `export` を足して
 *   本物を描けるようにしたので入っている(同じやり方で足せる)。
 *   手書きのHTMLを足して「見た」ことにはしない。
 * ・`WordCard` の `SECTION_THEME`(節ごとの淡い色の表、36箇所)は
 *   **明るい面の前提で固定**されている。暗いテーマに追従しないことは
 *   分かっているが、直すには「暗い面で節をどう見せるか」を決める必要が
 *   あるので、色の付け替えだけを先にやらない。ここに場面を足してから直す。
 *
 * ## 測り方の原則
 * **数字は自分で作らない。ブラウザに測らせる。**
 *  ・色は canvas に塗らせて読み返す(oklch も color-mix も正しく出る)
 *  ・板や輪郭は**撮った絵の画素**で比べる(グラデーションや影は計算値に無い)
 *  ・新しい門は、わざと壊した入力で落ちることを見るまで信用しない
 *
 * ## 使い方
 *   node scripts/ui-audit.mjs            判定だけ
 *   UI_VERBOSE=1 node scripts/ui-audit.mjs   実測値も出す
 *   → /tmp/ui-audit/ui-*.png と、判定結果(終了コード)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";

const OUT = process.env.UI_OUT || "/tmp/ui-audit";
const HARNESS_DIR = path.resolve("scripts/ui-harness");
const HARNESS_OUT = path.resolve(".ui-harness");

// **毎回組み直す。** 古い成果物を使うと、また「直したのに画像が変わらない」
// に戻る(それを潰すための作り替えなので、ここで手を抜くと意味がない)。
try {
  execFileSync("npx", ["vite", "build", "--config", path.join(HARNESS_DIR, "vite.config.ts")], {
    // 失敗した理由をそのまま出す。`pipe` で握り潰していたので、
    // 組み立てが壊れても `Command failed` としか出ず、下の親切な
    // メッセージにも到達していなかった。
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch {
  console.error("ハーネスを組めなかった(上の vite の出力を見る)。");
  process.exit(1);
}
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

/**
 * ハーネスの場面をURLの検索文字列で表す。
 *
 * `click` だけは URL に載せない — 開いたあとに押す指示なので、
 * ハーネスではなく検査の側の都合。
 */
const sceneUrl = (base, { scene = "shelf", click: _click, ...rest } = {}) => {
  const q = new URLSearchParams({ scene, ...rest });
  return `${base}?${q}`;
};

/**
 * 見る面の一覧: [名前, `<html>` に付ける属性, 高コントラストか]。
 *
 * `.dark` だけを見ていたのが穴だった。**暗い data-ui-theme は `.dark` を
 * 付けない** — `--background` を暗くするだけなので、`.dark` 前提で書いた
 * 上書きはこの5テーマに一切届かない。同じ取りこぼしを2回踏んでいる
 * (縁が白く光る件、高コントラストで棚板が濃くならない件)ので、
 * 代表として darkroom を明るい面・暗い面と同格で並べる。
 */
/**
 * 同じ場面を4通りで見る: 明るい面 / 暗い面 / 高コントラスト明 / 高コントラスト暗。
 *
 * **暗い側の高コントラストを外していたのが穴だった。** 棚の一覧には
 * `contrast-dark` が入っているのに、ここだけ明るい側しか作っていなかったので、
 * 「高コントラストを頼んだ暗い面のユーザーにだけ届かない」種類の不具合が
 * 構造的に通り抜けていた(実際、暗い高コントラストの `text-primary` は
 * 通常のテーマより悪くなっていた)。
 */
const crossThemes = (name, scene) => [
  [name, "", false, scene],
  [`${name}-dark`, 'class="dark"', false, scene],
  [`${name}-contrast`, "", true, scene],
  [`${name}-contrast-dark`, 'class="dark"', true, scene],
];

const MODES = [
  ["light", "", false, {}],
  ["dark", 'class="dark"', false, {}],
  ["darkroom", 'data-ui-theme="darkroom"', false, {}],
  ["contrast", "", true, {}],
  ["contrast-dark", 'class="dark"', true, {}],
  ["contrast-darkroom", 'data-ui-theme="darkroom"', true, {}],
  // 見え方は3つ。**選べるようにしたものは全部見る** — 選択肢を足しただけで
  // 見ていない組み合わせがあるなら、それは足していないのと同じ。
  // 明るい面と暗い面の両方で見る。片方ずつしか見ていなかったので、
  // 「暗い面のウォルナットが背景に沈む」「明るい面のガラスが消える」を
  // どちらも取りこぼしていた(実測 1.69:1 と 1.47:1)。
  ["library", "", false, { style: "library" }],
  ["library-dark", 'class="dark"', false, { style: "library" }],
  ["specimen", "", false, { style: "specimen" }],
  ["specimen-dark", 'class="dark"', false, { style: "specimen" }],
  // **何も集めていない人の図鑑。** ここを撮っていなかったせいで、
  // 「54棚が全部空で数画面ぶん流れる」に気づけなかった。
  ["empty-light", "", false, { count: 0 }],
  ["empty-dark", 'class="dark"', false, { count: 0 }],

  // ── 棚以外。**棚しか見ていなかった**のがこれまでの穴。
  //
  // 明るい面・暗い面・高コントラストの3面ずつ見る。ここに入れているのは
  // **markup がコンポーネントの中にあるもの**だけ。ルートに直書きされている
  // 画面(ホーム・復習・設定)は入れていない — 入れると手書きのHTMLを
  // 検査することになり、棚で潰したはずの「実物と違うものを見る検査」に戻る。
  // 未検査であることは README ではなく、ここの一覧が事実として示す。
  ...crossThemes("tokens", { scene: "tokens" }),
  ...crossThemes("failed", { scene: "load-failed" }),
  ["failed-retrying", "", false, { scene: "load-failed", variant: "retrying" }],
  ...crossThemes("options", { scene: "shelf-options" }),
  ["options-library", "", false, { scene: "shelf-options", style: "library" }],
  ...crossThemes("chunks", { scene: "chunks" }),
  ...crossThemes("curve", { scene: "curve" }),
  ...crossThemes("pron", { scene: "pronunciation" }),
  ...crossThemes("detail-ai", { scene: "scan-detail" }),
  ...crossThemes("detail-verified", { scene: "scan-detail", variant: "verified" }),
  // 復習 — **アプリの中心なのに、中身がルートに直書きで一度も見ていなかった**。
  ...crossThemes("review-memory", { scene: "review-memory" }),
  ...crossThemes("review-choice", { scene: "review-choice" }),
  ...crossThemes("review-explain", { scene: "review-explain" }),
  // 押したあとの面。正解と不正解でそれぞれ色が変わる。
  ...crossThemes("review-right", { scene: "review-choice", click: "ul li:nth-child(1) button" }),
  ...crossThemes("review-wrong", { scene: "review-choice", click: "ul li:nth-child(2) button" }),
  ...crossThemes("review-empty", { scene: "review-end" }),
  ...crossThemes("review-done", { scene: "review-end", variant: "done" }),
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

/**
 * 焦点の輪郭が、当てる前の絵に対して確保すべきコントラスト比。
 * 意味を持つUIの図形と同じ下限(WCAG 1.4.11 / 2.4.7)。
 */
const FOCUS_MIN_RATIO = 3;

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
  // 押したあとの面も見る。**答え合わせの色は、押さないと一度も描かれない。**
  // 正解の緑・不正解の赤は素の Tailwind の番号で書かれている所が多く、
  // そこがいちばん暗いテーマに追従しない。押さない検査では永遠に見えない。
  if (scene.click) {
    const target = page.locator(scene.click).first();
    if (await target.count()) {
      await target.click({ timeout: 2000 }).catch(() => {});
    } else {
      issues.push(`[${name}] 押す対象が見つからない: ${scene.click}`);
    }
  }
  await page.waitForTimeout(400);

  // 場面がちゃんと立ち上がったか。**空のページは指摘0で緑になる**ので、
  // 「何も出ていない」を合格と取り違えないように、先にここで確かめる。
  const mounted = await page.evaluate(() => ({
    scene: document.documentElement.dataset.scene ?? "",
    text: (document.body.innerText ?? "").trim().length,
  }));
  if (!mounted.scene) {
    issues.push(`[${name}] 場面が立ち上がっていない(名前が一覧と合っていない)`);
    await page.close();
    continue;
  }
  if (mounted.text < 4) {
    issues.push(`[${name}] 画面に文字が1つも出ていない(描けていない疑い)`);
  }

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
      // ## 色は**ブラウザに解かせる**。自分で文字列を読まない。
      //
      // ここに長く穴が空いていた。以前は `rgba?(…)` の正規表現で読んでいたが、
      // このアプリの色は全部 oklch で書いてあり、Chrome は計算値も
      // `oklch(…)` のまま返す。つまり**一致するものが一つも無かった** —
      // 文字色は毎回 null で捨てられ(=文字のコントラスト検査は17面すべてで
      // 1つも見ていない)、背景は毎回「白」の代替値に落ちていた。
      // 全部が黒文字・白背景として 21:1 で通っていた。
      //
      // canvas に実際に塗らせて読み返せば、oklch でも color-mix でも
      // 色空間に関係なく正しい RGB が出る。白の上と黒の上に塗って
      // 差から不透明度も割り出す。
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const paint = (s, base) => {
        ctx.globalCompositeOperation = "copy";
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 1, 1);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data;
      };
      const parse = (s) => {
        if (!s) return null;
        const w = paint(s, "#fff");
        const b = paint(s, "#000");
        const a = 1 - (w[0] - b[0]) / 255;
        if (a <= 0.001) return { r: 0, g: 0, b: 0, a: 0 };
        return { r: b[0] / a, g: b[1] / a, b: b[2] / a, a };
      };
      const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      });
      // 半透明を**重ねて解く**。以前は「不透明度0.85以上のものが出るまで
      // 遡る」だったので、半透明の面(バーやシート)の上の文字は
      // その下の色で採点していた。
      const bgOf = (el) => {
        const stack = [];
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (!c || c.a <= 0.001) continue;
          stack.push(c);
          if (c.a >= 0.999) break;
        }
        let acc = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
        return acc;
      };

      // 1. コントラスト
      //
      // **文字を持っている要素を全部見る。** 以前は `span, p, h3` に絞った上に
      // 「子要素があれば飛ばす」としていたので、注音のように span を入れ子に
      // して組んだ文字は一度も見ていなかった(飛ばした側にこそ、小さくて
      // 薄い文字が集まっている)。自分の直下に文字を持つ要素を対象にする。
      const hasOwnText = (el) =>
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      for (const el of document.querySelectorAll("body *")) {
        if (!hasOwnText(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.1) {
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const fg = parse(cs.color);
        const bg = bgOf(el);
        if (!fg) continue;
        // **`opacity` を掛ける。** 掛けていなかったので、`opacity-60` を
        // 当てた 9px の品詞ラベルが 8:1 として通っていた(実際は 3.1:1)。
        // 祖先の `opacity` も効くので、根まで掛け合わせる。
        let alpha = fg.a;
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          alpha *= parseFloat(getComputedStyle(n).opacity);
        }
        const shown = over({ ...fg, a: Math.max(0, Math.min(1, alpha)) }, bg);
        const L1 = lum(shown.r, shown.g, shown.b);
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
      //
      // **見た目の箱ではなく、指が当たる範囲を見る。** 44px を割るからといって
      // 見た目まで大きくしなければならないわけではない — `::before` を広げて
      // 当たり判定だけ伸ばすのは正しいやり方で、`getBoundingClientRect()` は
      // それを見ない。44px 四方の四隅と中心で `elementFromPoint` を撃って、
      // 実際にその要素(かその中身)に当たるかで判定する。
      const hitsSelf = (el, x, y) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      };
      for (const el of document.querySelectorAll("button, a[href], [role='button']")) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.width >= 44 && r.height >= 44) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const half = 22;
        const pts = [
          [cx - half + 1, cy - half + 1],
          [cx + half - 1, cy - half + 1],
          [cx - half + 1, cy + half - 1],
          [cx + half - 1, cy + half - 1],
        ].filter(([x, y]) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight);
        if (pts.length && pts.every(([x, y]) => hitsSelf(el, x, y))) continue;
        const label = (el.getAttribute("aria-label") || el.title || el.textContent || "")
          .trim()
          .slice(0, 14);
        out.push(`タップ領域 ${Math.round(r.width)}x${Math.round(r.height)} < 44 — "${label}"`);
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
      // 棚板そのもののコントラストは**撮った絵の画素で測る**(下の別の段)。
      // 板は繰り返しグラデーションで描いてあるので、計算値の色を読んでも
      // 出てこない。ここに残すのはトークンで言えることだけ。
      const root = getComputedStyle(document.documentElement);
      const lineA = parseFloat(root.getPropertyValue("--shelf-line-a"));
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

  // ## 棚板の濃さは**撮った絵の画素で測る**
  //
  // 板は `repeating-linear-gradient` と `color-mix` で描いてあり、影と
  // 内側の縁も乗る。計算値の色をいくら読んでも、**目に入る色はそこに無い**。
  // 以前ここは `--shelf-line-a` を背景に手で混ぜて比を出していた —
  // つまり CSS が実際にどう描いたかを一度も見ずに、自分の暗算を検査していた。
  // 板の少し上(背景)と板そのものを細長く撮って、画素の明るさで比を出す。
  // 比べる相手(背景)は**画素ではなく DOM から**取る。板の上には
  // たいてい品物が立っていて、板のすぐ上の画素は「背景」ではなく写真だから。
  // 知りたいのは「板が地の面から浮き上がって見えるか」なので、
  // 板の実際の色(画素)と、地の面の色(計算値)を比べるのが正しい。
  const strip = await page.evaluate(() => {
    const vis = [...document.querySelectorAll(".shelf-rule")].filter((r) => {
      const b = r.getBoundingClientRect();
      return b.width > 60 && b.top > 90 && b.bottom < window.innerHeight - 20;
    });
    if (!vis.length) return null;
    const el = vis[Math.floor(vis.length / 2)];
    const b = el.getBoundingClientRect();
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const paint = (s, base) => {
      ctx.globalCompositeOperation = "copy";
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    };
    let bg = [255, 255, 255];
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const w = paint(c, "#fff");
      const k = paint(c, "#000");
      if (1 - (w[0] - k[0]) / 255 >= 0.999) {
        bg = [w[0], w[1], w[2]];
        break;
      }
    }
    return {
      clip: {
        x: Math.round(b.x + b.width / 2) - 2,
        y: Math.round(b.y),
        width: 4,
        height: Math.max(2, Math.round(b.height)),
      },
      bg,
    };
  });
  // 何も集めていない図鑑には棚板が1本も無い(全部畳まれている)ので、
  // 「測れなかった」ではなく「測るものが無い」。DOM に在るのに測れない
  // ときだけ落とす。
  if (!strip) {
    if (await page.evaluate(() => document.querySelector(".shelf-rule") !== null)) {
      issues.push(`[${name}] 棚板が画面の中に1本も無い(測れていない)`);
    }
  } else {
    const shot = await page.screenshot({ clip: strip.clip });
    const lineRatio = await page.evaluate(
      ({ dataUrl, bg }) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const x = c.getContext("2d", { willReadFrequently: true });
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            const lumOf = (r, g, b) => {
              const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const bgLum = lumOf(bg[0], bg[1], bg[2]);
            // 板の中で**地の面からいちばん離れた行**を代表とする。
            // 板は上下にグラデーションが掛かっているので、上端だけ・
            // 平均だけを見ると「濃いところがある」ことを取りこぼす。
            let best = bgLum;
            for (let y = 0; y < c.height; y++) {
              let r = 0,
                g = 0,
                b = 0;
              for (let px = 0; px < c.width; px++) {
                const i = (y * c.width + px) * 4;
                r += d[i];
                g += d[i + 1];
                b += d[i + 2];
              }
              const l = lumOf(r / c.width, g / c.width, b / c.width);
              if (Math.abs(l - bgLum) > Math.abs(best - bgLum)) best = l;
            }
            resolve((Math.max(bgLum, best) + 0.05) / (Math.min(bgLum, best) + 0.05));
          };
          img.src = dataUrl;
        }),
      { dataUrl: "data:image/png;base64," + shot.toString("base64"), bg: strip.bg },
    );
    // 調整するときは数字が要る。`SHELF_VERBOSE=1` で全部出す。
    if (process.env.SHELF_VERBOSE) console.log(`  ${name}: 棚板 ${lineRatio.toFixed(2)}:1`);
    if (lineRatio < LINE_MIN_RATIO) {
      issues.push(
        `[${name}] 棚板のコントラストが実測 ${lineRatio.toFixed(2)}:1 < ${LINE_MIN_RATIO}`,
      );
    }
  }

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

  // ## 鍵盤で辿ったとき、いまどこに居るかが見えること(WCAG 2.4.7)
  //
  // Tab で実際に送って、焦点の輪郭を測る。**押せるものが在るかどうかを
  // 数えるだけでは足りない** — 輪郭が無い・地に沈んでいる、が普通に起きる。
  // 実際、このアプリは `.shelf-item` 以外に焦点の定義がまったく無く、
  // ブラウザ既定の黒い輪郭に任せていた(暗いテーマでは沈む)。
  // 計算値では測れない。ブラウザ既定の `outline-style: auto` は、暗い面でも
  // `outline-color: rgb(16,16,16)` / 幅 1px と返す — **「輪郭が在るか」を
  // 見る検査は、既定のままでも通ってしまう**(最初にそう書いて、CSS を
  // 消しても合格したので書き直した)。焦点を当てた前後の絵を撮って、
  // **同じ画素がどれだけ変わったか**を見る。変わらなければ見えていない。
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    const box = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4 || b.top < 0 || b.bottom > window.innerHeight) return null;
      return {
        clip: {
          x: Math.max(0, Math.round(b.x) - 6),
          y: Math.max(0, Math.round(b.y) - 6),
          width: Math.round(b.width) + 12,
          height: Math.round(b.height) + 12,
        },
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 14),
        tag: el.tagName.toLowerCase(),
      };
    });
    if (!box) break;
    const after = await page.screenshot({ clip: box.clip });
    await page.evaluate(() => document.activeElement?.blur?.());
    const before = await page.screenshot({ clip: box.clip });
    const ratio = await page.evaluate(
      ({ a, b }) =>
        new Promise((resolve) => {
          const load = (src) =>
            new Promise((r) => {
              const im = new Image();
              im.onload = () => r(im);
              im.src = src;
            });
          Promise.all([load(a), load(b)]).then(([ia, ib]) => {
            const c = document.createElement("canvas");
            c.width = ia.width;
            c.height = ia.height;
            const x = c.getContext("2d", { willReadFrequently: true });
            x.drawImage(ia, 0, 0);
            const da = x.getImageData(0, 0, c.width, c.height).data;
            x.clearRect(0, 0, c.width, c.height);
            x.drawImage(ib, 0, 0);
            const db = x.getImageData(0, 0, c.width, c.height).data;
            const lumOf = (r, g, bl) => {
              const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
            };
            let best = 1;
            for (let i = 0; i < da.length; i += 4) {
              const la = lumOf(da[i], da[i + 1], da[i + 2]);
              const lb = lumOf(db[i], db[i + 1], db[i + 2]);
              const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
              if (r > best) best = r;
            }
            resolve(best);
          });
        }),
      {
        a: "data:image/png;base64," + after.toString("base64"),
        b: "data:image/png;base64," + before.toString("base64"),
      },
    );
    if (process.env.UI_VERBOSE) {
      console.log(`  ${name}: 焦点 <${box.tag}> "${box.label}" ${ratio.toFixed(2)}:1`);
    }
    if (ratio < FOCUS_MIN_RATIO) {
      issues.push(
        `[${name}] 焦点がどこに居るか見えない: <${box.tag}> "${box.label}" ` +
          `実測 ${ratio.toFixed(2)}:1 < ${FOCUS_MIN_RATIO}`,
      );
    }
  }

  await page.screenshot({ path: path.join(OUT, `ui-${name}.png`), fullPage: true });
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
