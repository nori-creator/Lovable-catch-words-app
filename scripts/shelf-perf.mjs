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

/**
 * src/components/DexShelf.tsx の estimateShelfHeight と**同じ式**。
 * 片方だけ直すと検査が通ったまま実物がずれるので、必ず一緒に直すこと。
 */
function estimateShelfHeight(tiers, bare, spines, thickPlank) {
  const HEAD = 14;
  const plank = thickPlank ? 9 : 0;
  if (bare) return HEAD + (spines ? 38 : 44) + plank;
  return HEAD + tiers * ((spines ? 90 : 111) + plank);
}

/** 本物と同じ形の棚を組む。件数は 54 の棚へ順に配る。 */
function buildBody(count, useCv, { material = "none", spines = false, per = PER } = {}) {
  const SHELVES = 54;
  const perShelfCount = Array.from(
    { length: SHELVES },
    (_, i) => Math.floor(count / SHELVES) + (i < count % SHELVES ? 1 : 0),
  );
  const item = (i) =>
    spines
      ? `<button class="shelf-item" lang="zh-Hant" aria-label="語${i}"><span class="shelf-spine" style="background-color:hsl(${(i * 47) % 360} 42% 26%)"><span class="text-white">語${i % 100}</span></span></button>`
      : `<button class="shelf-item" lang="zh-Hant" aria-label="語${i}"><img class="shelf-stand" src="${svg(
          60 + (i % 40),
          50 + (i % 60),
          ["#f5a623", "#4a90d9", "#b07a4a", "#d0483c"][i % 4],
        )}" alt=""></button>`;
  const tier = (items) => `
    <div>
      <div class="shelf-row ${spines ? "shelf-row-tight" : ""}" style="grid-template-columns:repeat(${per},minmax(0,1fr))">${items.join("")}</div>
      <div class="shelf-rule"></div>
      ${
        spines
          ? ""
          : `<div class="grid gap-3 pt-1.5" style="grid-template-columns:repeat(${per},minmax(0,1fr))">
        ${items.map((_, i) => `<span class="truncate text-center text-[12px] font-medium leading-tight">語${i}</span>`).join("")}
      </div>`
      }
    </div>`;

  let n = 0;
  const shelves = perShelfCount.map((cnt) => {
    const tiers = [];
    for (let i = 0; i < cnt; i += per) {
      tiers.push(Array.from({ length: Math.min(per, cnt - i) }, () => item(n++)));
    }
    if (tiers.length === 0) tiers.push([]);
    const bare = cnt === 0;
    const est = estimateShelfHeight(tiers.length, bare, spines, material !== "none");
    const style = useCv
      ? ` style="content-visibility:auto;contain-intrinsic-size:auto ${est}px"`
      : "";
    return `<div${style}>
      <h4 class="mb-1.5 flex items-baseline gap-1.5 px-0.5"><span class="text-sm leading-none">🍎</span><span class="text-[13px] font-semibold">棚</span><span class="text-[11px] font-normal text-muted-foreground">${cnt}</span></h4>
      ${tiers.map((t, i) => `<div class="${i > 0 ? "mt-3" : ""}">${tier(t)}</div>`).join("")}
      ${bare ? `<p class="pt-2 text-[11px] text-muted-foreground">まだ空</p>` : ""}
    </div>`;
  });

  return `<div class="min-h-screen bg-background px-4 py-4"><div class="space-y-8" data-shelf-material="${material}">${shelves.join("")}</div></div>`;
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/** 同じ計測を数回まわして中央値を取る(1回だけだと揺れが大きすぎる)。 */
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** 1回ぶんの計測。`measureDrift` のときは見積もりと実寸の差も返す。 */
async function measure(body, { drift = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const t = await page.evaluate(
    async ({ CSS, body, drift }) => {
      document.head.innerHTML = `<style>${CSS}</style>`;
      const t0 = performance.now();
      document.body.innerHTML = body;
      void document.body.offsetHeight;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const first = performance.now() - t0;
      if (!drift) return { first };

      // **スクロールする前**の高さ = ほぼ全部が見積もり。
      // ここを測らないと意味がない — 一度端まで送ってから測ると、
      // 描かれた実寸に置き換わったあとの値になり、**どんな出鱈目な
      // 見積もりでも差0になる**(実際それで 149px と 58px の取り違えを
      // 見逃した)。
      const estimated = document.body.scrollHeight;
      for (let i = 1; i <= Math.ceil(estimated / window.innerHeight) + 2; i++) {
        window.scrollTo(0, i * window.innerHeight);
        document.body.getBoundingClientRect();
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const real = document.body.scrollHeight;
      window.scrollTo(0, 0);
      return { first, estimated, real };
    },
    { CSS, body, drift },
  );
  await page.close();
  return t;
}

/** 見積もりのずれを見る組み合わせ。**選べる見え方は全部見る。** */
const VARIANTS = [
  ["既定(3列・素材なし)", {}],
  ["2列", { per: 2 }],
  ["4列", { per: 4 }],
  ["背表紙", { spines: true, per: 6 }],
  ["オーク(板あり)", { material: "oak" }],
  ["背表紙+板", { spines: true, per: 6, material: "oak" }],
];

console.log(`件数: ${COUNT} / 棚54個 / 390x800`);

// ── 1. 速さ(既定の見え方で) ─────────────────────────────
const firsts = {};
for (const [name, useCv] of [
  ["なし", false],
  ["content-visibility", true],
]) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push((await measure(buildBody(COUNT, useCv))).first);
  firsts[name] = median(runs);
}
const pct = (x, y) => `${(((x - y) / x) * 100).toFixed(0)}%減`;
console.log(
  `  最初の描画   なし ${firsts["なし"].toFixed(1)}ms → あり ${firsts["content-visibility"].toFixed(1)}ms` +
    ` (${pct(firsts["なし"], firsts["content-visibility"])})`,
);

// ── 2. 見積もりのずれ(全変種) ───────────────────────────
// ずれると、スクロールしている最中に文書の高さが変わる = 掴んだ
// スクロールバーが手から逃げる。見え方ごとに段の高さが違うので、
// 既定だけ測っても意味がない。
//
// **件数も振る。** 54棚に COUNT 件を配ると全部の棚が埋まってしまい、
// 空の棚の見積もりが1つも試されない。始めたばかりの人の図鑑は
// **ほとんどが空の棚**で、そこがいちばんずれやすい。実際、空の棚を
// 「段1つ分」で数えていた誤りは 300件では 0.0% で素通りし、
// 12件にして初めて 13〜16% として現れた。
const COUNTS = [12, COUNT];
console.log("\n見積もりのずれ:");
const failures = [];
for (const n of COUNTS) {
  for (const [label, scene] of VARIANTS) {
    const r = await measure(buildBody(n, true, scene), { drift: true });
    const d = Math.abs(r.estimated - r.real) / Math.max(1, r.real);
    const mark = d > 0.05 ? "✗" : "✓";
    const tag = `${String(n).padStart(4)}件 ${label}`;
    console.log(
      `  ${mark} ${tag.padEnd(28)} 見積もり ${r.estimated}px / 実寸 ${r.real}px (${(d * 100).toFixed(1)}%)`,
    );
    if (d > 0.05) failures.push(`${tag}: ${(d * 100).toFixed(1)}%`);
  }
}

await browser.close();

if (failures.length) {
  console.error(`\n不合格: 見積もりが実寸から5%以上ずれている変種がある。`);
  failures.forEach((f) => console.error("  - " + f));
  console.error("DexShelf.tsx の estimateShelfHeight() を測り直すこと(この式もだ)。");
  process.exit(1);
}
console.log("\nどの見え方でも高さの見積もりは実寸の5%以内。");
console.log(
  "注: スクロール中のなめらかさはここでは測れていない。ヘッドレスの\n" +
    "    Chromium ではスクロールが合成のみで進み、レイアウトが汚れないため\n" +
    "    どちらの版も0msになる。**実機で確かめる項目**として残す。",
);
