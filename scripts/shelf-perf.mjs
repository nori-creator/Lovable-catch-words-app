/**
 * 棚の性能を測る。**主張の前に数字を出すため**の道具。
 *
 * ## なぜ要るか
 * 図鑑は 54 個の棚を常に全部描く(棚は動かない、という設計をそのために選んだ)。
 * これは「どこに何があるか」が覚えられる代わりに、持ち物が増えるほど
 * **画面に出ていない棚**のレイアウトに時間を使う、という取引でもある。
 *
 * `content-visibility: auto` はその取引の後半だけを取り消す仕掛けだが、
 * 効いているかどうかは目では分からない。速くなったと言う前に測る。
 *
 * ## **本物の DexShelf を測る**
 * 以前このファイルは、棚のHTMLと `estimateShelfHeight` を**手で複製**していた。
 * つまり測っていたのは実物ではなく写しで、コンポーネントを直しても数字は
 * 変わらなかった(同じ間違いを見た目の検査でもやっていて、独立監査に
 * 指摘されて直した)。いまは `scripts/ui-harness` を組んで、
 * `ui-audit.mjs` と**同じページ**を開いて測る。
 *
 * ## 何を測るか
 * 同じ画面を2回描いて比べる:
 *   A. content-visibility を切った状態(以前の状態)
 *   B. そのまま(いまの状態)
 *
 * 切り替えはページ側のCSSで上書きする。**DOMは同一**なので、差は
 * 画面外の棚を描くかどうかだけになる。
 *
 * 測るのは2つ:
 *   ・最初の描画にかかる時間
 *   ・**見積もり高さのずれ** — スクロールする前の scrollHeight と、
 *     端まで送って実寸に置き換わったあとの scrollHeight の差。
 *     ここを「送ったあと同士」で比べていた時期があり、どんな出鱈目な
 *     見積もりでも差0で通っていた(149px と 58px の取り違えを見逃した)。
 *
 * スクロールのなめらかさは載せない。測ろうとしたが、ヘッドレスの Chromium では
 * スクロールが合成のみで進んでレイアウトが汚れず、どちらの版も 0ms になる。
 * **測れていないものを「差が無かった」と書くのは嘘に近い**ので、
 * 実機で確かめる項目として外に出す。
 *
 * ## 使い方
 *   node scripts/shelf-perf.mjs [件数] [素材] [並べ方]
 *   例: node scripts/shelf-perf.mjs 600
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";

const COUNT = Number(process.argv[2] || 300);
const HARNESS_DIR = path.resolve("scripts/ui-harness");
const HARNESS_OUT = path.resolve(".ui-harness");

try {
  execFileSync("npx", ["vite", "build", "--config", path.join(HARNESS_DIR, "vite.config.ts")], {
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch {
  console.error("ハーネスを組めなかった(上の vite の出力を見る)。");
  process.exit(1);
}

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
const URL_ = `http://127.0.0.1:${server.address().port}/index.html?scene=shelf&count=${COUNT}`;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/** 同じ計測を数回まわして中央値を取る(1回だけだと揺れが大きすぎる)。 */
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * 1回ぶんの計測。
 *
 * `content-visibility` を切る側は、**開く前に**上書きCSSを差し込む。
 * 描いたあとで切ると、一度描画を飛ばした結果が残ってしまう。
 */
async function measure({ cv }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  if (!cv) {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        // **属性で選ぶ。** `[data-shelf-material] > div` と書いていたが、
        // 実際に `content-visibility` が付くのは部屋(section)の中の棚で、
        // この選択子は**1つも当たっていなかった** — 切ったつもりで両方
        // 同じものを測っていた(道具が嘘をつく典型)。
        s.textContent = '[style*="content-visibility"] { content-visibility: visible !important; }';
        document.head.appendChild(s);
      });
    });
  }
  await page.goto(URL_, { waitUntil: "load" });
  const r = await page.evaluate(async () => {
    // **ブラウザ自身の時計を読む。**
    // 自分で `performance.now()` を挟む形にしていたが、その時点では
    // React の最初の描画が**もう終わっている** — 測っていたのは2回目の
    // レイアウトで、`content-visibility` を切ったほうが速いという
    // 逆の数字が出ていた。最初の描画までの時間は First Contentful Paint。
    // ハーネスが「レイアウトまで終わった」時点で打つ印。
    // `first-paint` を使っていたが、あれは束の読み込みと React の起動が
    // 支配的で、**画面外の棚を描くかどうかの差がほとんど出ない**
    // (300件で 28ms 対 36ms と、切ったほうが速いという読めない数字が出た)。
    const mark = performance.getEntriesByName("harness-painted")[0];
    const first = mark ? mark.startTime : NaN;
    // **スクロールする前**の高さ = ほぼ全部が見積もり。
    const estimated = document.documentElement.scrollHeight;
    // **1コマ待つ。** 待たずに `scrollTo` を並べていたので、`content-visibility`
    // の判定が一度も走らず、どの棚も本当には描かれなかった。結果、実寸に
    // 置き換わることがなく、**見積もりを出鱈目にしてもずれ 0%** で通っていた
    // (段の高さを 111px → 60px にして確かめた。全体の高さは変わるのに
    // ずれは 0 のまま = 見積もり同士を比べていた)。
    for (let i = 1; i <= Math.ceil(estimated / window.innerHeight) + 2; i++) {
      window.scrollTo(0, i * window.innerHeight);
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { first, estimated, actual: document.documentElement.scrollHeight };
  });
  await page.close();
  return r;
}

const runs = 5;
const off = [];
const on = [];
for (let i = 0; i < runs; i++) {
  off.push(await measure({ cv: false }));
  on.push(await measure({ cv: true }));
}
await browser.close();
server.close();

const firstOff = median(off.map((r) => r.first));
const firstOn = median(on.map((r) => r.first));
const drift = on[0].estimated - on[0].actual;
const driftPct = (Math.abs(drift) / on[0].actual) * 100;

console.log(`件数 ${COUNT}(中央値 ${runs} 回)`);
console.log(`  最初の描画  切: ${firstOff.toFixed(1)}ms → 入: ${firstOn.toFixed(1)}ms`);
console.log(`              ${(((firstOff - firstOn) / firstOff) * 100).toFixed(0)}% 減`);
console.log(
  `  見積もりのずれ  ${drift >= 0 ? "+" : ""}${drift}px / 実寸 ${on[0].actual}px (${driftPct.toFixed(1)}%)`,
);

// 見積もりが大きく外れていると、スクロールバーが暴れて指の感覚が壊れる。
// **数字を出すだけでなく、外れていたら落とす。**
if (driftPct > 12) {
  console.error(`\n見積もりが実寸から ${driftPct.toFixed(1)}% ずれている(上限 12%)。`);
  process.exit(1);
}
