/**
 * 和文の書体を**自前で配る形に落とす**道具（作り直せることが要点）。
 *
 * この app はフォントを外から取りに行かない（`styles.css` の冒頭の注）。
 * オフラインで崩れる・初回描画が遅れる・端末で見た目が変わる、の3つが
 * 理由。和文もその決まりに合わせる。
 *
 *   node scripts/fetch-jp-fonts.mjs
 *
 * ## 何を取るか
 *
 * - **Zen Kurenaido**（手書き風）… ユーザが撮影時に書く1言に当てる。
 *   書かれる字は決められないので、**全部持つ**しかない。1枚にすると
 *   1.4MB になるので、Google が配っているのと同じ **122枚の切り分け**を
 *   そのまま貰う。`unicode-range` が付いているので、browser は
 *   **その画面に出ている字が入っている枚だけ**を取る（実測で数十KB）。
 * - **Shippori Mincho**（明朝）… 表紙の見出し「今日の1ページ」**だけ**に
 *   当てる。出る字が決まっているので、**その字だけに絞る**（9KB）。
 *   絞っているので、見出しの文言を変えたらここを走らせ直すこと
 *   （`language-plumbing.test.ts` に、字が増えたら落ちる門を置いてある）。
 *
 * どちらも SIL Open Font License 1.1。ライセンス本文も一緒に置く。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/fonts");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** 見出しに出る字。**ここを変えたら、絞り直しが要る。** */
const TITLE_TEXT = "今日の1ページToday's Page今天的一頁 0123456789";

async function get(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

// ── ① Zen Kurenaido（切り分けをそのまま貰う） ──────────────────────
const dir = path.join(OUT, "zen-kurenaido");
fs.mkdirSync(dir, { recursive: true });
// UA を今の browser にすると woff2 の切り分けが返る（古い UA だと ttf）。
const css = await (
  await get("https://fonts.googleapis.com/css2?family=Zen+Kurenaido&display=swap", {
    "User-Agent": UA,
  })
).text();
const faces = [...css.matchAll(/@font-face \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
if (faces.length < 100) throw new Error(`切り分けが少なすぎる(${faces.length})`);
const out = [];
for (const [i, face] of faces.entries()) {
  const url = /url\((https:\/\/[^)]+)\)/.exec(face)[1];
  const range = /unicode-range:\s*([^;]+);/.exec(face)[1].trim().replace(/\s+/g, " ");
  const base = path.basename(url);
  const n = /\.(\d+)\.woff2$/.exec(base);
  const name = n ? `zk-${n[1]}` : `zk-x${i}`;
  const buf = Buffer.from(await (await get(url)).arrayBuffer());
  fs.writeFileSync(path.join(dir, `${name}.woff2`), buf);
  out.push({ name, range });
}
fs.writeFileSync(path.join(dir, "faces.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`Zen Kurenaido: ${out.length}枚`);

// ── ② Shippori Mincho（見出しの字だけに絞る） ──────────────────────
const ttf = path.join(OUT, ".ShipporiMincho-Bold.ttf");
fs.writeFileSync(
  ttf,
  Buffer.from(
    await (
      await get(
        "https://raw.githubusercontent.com/google/fonts/main/ofl/shipporimincho/ShipporiMincho-Bold.ttf",
      )
    ).arrayBuffer(),
  ),
);
const codes = [...new Set([...TITLE_TEXT])]
  .map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
  .join(",");
execFileSync("pyftsubset", [
  ttf,
  `--unicodes=${codes}`,
  "--flavor=woff2",
  "--layout-features=*",
  `--output-file=${path.join(OUT, "ShipporiMincho-700-title.woff2")}`,
]);
fs.rmSync(ttf);
console.log("Shippori Mincho: 見出しの字だけ");

// ── ③ ライセンス ──────────────────────────────────────────────────
for (const [from, to] of [
  ["ofl/zenkurenaido/OFL.txt", path.join(dir, "OFL.txt")],
  ["ofl/shipporimincho/OFL.txt", path.join(OUT, "ShipporiMincho-OFL.txt")],
]) {
  fs.writeFileSync(
    to,
    await (await get(`https://raw.githubusercontent.com/google/fonts/main/${from}`)).text(),
  );
}
console.log("OFL を置いた");
