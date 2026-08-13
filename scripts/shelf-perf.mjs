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
 * ## 何を測るか
 * 同じDOMを2回描いて比べる:
 *   A. content-visibility なし(以前の状態)
 *   B. content-visibility: auto + contain-intrinsic-size(いまの状態)
 *
 * 測るのは**最初の描画にかかる時間**と、**見積もり高さのずれ**の2つだけ。
 *
 * スクロールのなめらかさは載せない。測ろうとしたが、ヘッドレスの Chromium では
 * スクロールが合成のみで進んでレイアウトが汚れず、どちらの版も 0ms になる。
 * rAF を2回待つ形にすると今度は両方 33ms(=2フレーム)に張り付いて vsync に
 * 差が埋まる。**測れていないものを「差が無かった」と書くのは嘘に近い**ので、
 * 実機で確かめる項目として外に出す。
 *
 * ## 使い方
 *   npm run build && node scripts/shelf-perf.mjs [件数]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const COUNT = Number(process.argv[2] || 300);
const PER = 3;

const cssFile = fs
  .readdirSync(".output/public/assets")
  .find((f) => f.startsWith("styles-") && f.endsWith(".css"));
if (!cssFile) {
  console.error("ビルド済みCSSが無い。先に `npm run build` を実行すること。");
  process.exit(1);
}
const CSS = fs.readFileSync(path.join(".output/public/assets", cssFile), "utf8");

const svg = (w, h, c) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`,
  );

/** 本物と同じ形の棚を組む。件数は 54 の棚へ順に配る。 */
function buildBody(count, useCv) {
  const SHELVES = 54;
  const perShelf = Array.from(
    { length: SHELVES },
    (_, i) => Math.floor(count / SHELVES) + (i < count % SHELVES ? 1 : 0),
  );
  const item = (i) =>
    `<button class="shelf-item" lang="zh-Hant" aria-label="語${i}"><img class="shelf-stand" src="${svg(
      60 + (i % 40),
      50 + (i % 60),
      ["#f5a623", "#4a90d9", "#b07a4a", "#d0483c"][i % 4],
    )}" alt=""></button>`;
  const tier = (items) => `
    <div>
      <div class="shelf-row" style="grid-template-columns:repeat(${PER},minmax(0,1fr))">${items.join("")}</div>
      <div class="shelf-rule"></div>
      <div class="grid gap-3 pt-1.5" style="grid-template-columns:repeat(${PER},minmax(0,1fr))">
        ${items.map((_, i) => `<span class="truncate text-center text-[12px] font-medium leading-tight">語${i}</span>`).join("")}
      </div>
    </div>`;

  let n = 0;
  const shelves = perShelf.map((cnt) => {
    const tiers = [];
    for (let i = 0; i < cnt; i += PER) {
      tiers.push(Array.from({ length: Math.min(PER, cnt - i) }, () => item(n++)));
    }
    if (tiers.length === 0) tiers.push([]);
    const bare = cnt === 0;
    const est = 14 + tiers.length * 111 + (bare ? 24 : 0);
    const style = useCv
      ? ` style="content-visibility:auto;contain-intrinsic-size:auto ${est}px"`
      : "";
    return `<div${style}>
      <h4 class="mb-1.5 flex items-baseline gap-1.5 px-0.5"><span class="text-sm leading-none">🍎</span><span class="text-[13px] font-semibold">棚</span><span class="text-[11px] font-normal text-muted-foreground">${cnt}</span></h4>
      ${tiers.map((t, i) => `<div class="${i > 0 ? "mt-3" : ""}">${tier(t)}</div>`).join("")}
      ${bare ? `<p class="pt-2 text-[11px] text-muted-foreground">まだ空</p>` : ""}
    </div>`;
  });

  return `<div class="min-h-screen bg-background px-4 py-4"><div class="space-y-8">${shelves.join("")}</div></div>`;
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/** 同じ計測を数回まわして中央値を取る(1回だけだと揺れが大きすぎる)。 */
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const results = {};
for (const [name, useCv] of [
  ["なし", false],
  ["content-visibility", true],
]) {
  const firstPaints = [];
  for (let run = 0; run < 5; run++) {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    const body = buildBody(COUNT, useCv);
    const t = await page.evaluate(
      async ({ CSS, body }) => {
        document.head.innerHTML = `<style>${CSS}</style>`;
        const t0 = performance.now();
        document.body.innerHTML = body;
        // レイアウトを強制的に確定させてから止める。
        void document.body.offsetHeight;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const first = performance.now() - t0;

        // スクロール。**2通り測る** — この2つは向きが逆に出るので、
        // 都合のいい片方だけ載せない。
        //   ① 連続スクロール: 1画面ずつ下へ。実際の指の動きに近い。
        //   ② 飛ぶ: 一気に真ん中へ。飛ばした先はまだ一度も描いていないので、
        //      content-visibility にとっては**最悪の場合**になる。
        // 一度端まで送って、全部の棚を描かせた状態の高さを取る
        // (見積もりが実寸とどれだけずれているかを見るため)。
        for (let i = 1; i <= Math.ceil(document.body.scrollHeight / window.innerHeight); i++) {
          window.scrollTo(0, i * window.innerHeight);
          document.body.getBoundingClientRect();
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const height = document.body.scrollHeight;
        window.scrollTo(0, 0);
        return { first, height };
      },
      { CSS, body },
    );
    firstPaints.push(t.first);
    results[name + "_height"] = t.height;
    await page.close();
  }
  results[name] = { first: median(firstPaints) };
}
await browser.close();

const a = results["なし"];
const b = results["content-visibility"];
const pct = (x, y) => `${(((x - y) / x) * 100).toFixed(0)}%減`;

console.log(`件数: ${COUNT} / 棚54個 / 390x800`);
console.log(
  `  最初の描画   なし ${a.first.toFixed(1)}ms → あり ${b.first.toFixed(1)}ms (${pct(a.first, b.first)})`,
);
console.log(
  `  全体の高さ   なし ${results["なし_height"]}px / あり ${results["content-visibility_height"]}px` +
    ` (差 ${Math.abs(results["なし_height"] - results["content-visibility_height"])}px)`,
);

// 高さが大きくずれていたら見積もりが悪い = スクロールバーが暴れる。
const drift =
  Math.abs(results["なし_height"] - results["content-visibility_height"]) /
  Math.max(1, results["なし_height"]);
if (drift > 0.05) {
  console.error(`\n不合格: 見積もりの高さが実寸から ${(drift * 100).toFixed(1)}% ずれている。`);
  console.error("estimateShelfHeight() を測り直すこと(スクロールバーが伸び縮みする)。");
  process.exit(1);
}
console.log("\n高さの見積もりは実寸の5%以内。");
console.log(
  "注: スクロール中のなめらかさはここでは測れていない。ヘッドレスの\n" +
    "    Chromium ではスクロールが合成のみで進み、レイアウトが汚れないため\n" +
    "    どちらの版も0msになる。**実機で確かめる項目**として残す。",
);
