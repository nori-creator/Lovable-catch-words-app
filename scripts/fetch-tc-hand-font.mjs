/**
 * **繁體中文の手書き書体（芫荽 Iansui）**を自前で配る形に落とす道具。
 *
 *   node scripts/fetch-tc-hand-font.mjs
 *
 * （オーナー報告 2026-09-30「眼前的東西，要怎麼說？ の說だけフォントが異なる」）
 * 和文の手書き（Zen Kurenaido）は日本の字形の書体なので、`說` のような台湾の字形の
 * 字を持たない。持たない字だけ別の書体で描かれ、1文の中で字体が割れていた。
 * 芫荽は台湾の教育部の字形に合わせた手書き風の書体（Klee One から派生、SIL OFL 1.1）で、
 * 繁體中文の画面の手書きはこれ1つで描く。
 *
 * `fetch-jp-fonts.mjs` と同じ決まり（外から取りに行かない・Google が配っているのと
 * 同じ切り分けを `unicode-range` 付きでそのまま貰う）。`font-display: block` も
 * Zen Kurenaido と同じ理由（開くたびに字体が目の前で入れ替わらない）。
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/fonts/iansui");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function get(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const src = await (
  await get("https://fonts.googleapis.com/css2?family=Iansui&display=swap", { "User-Agent": UA })
).text();
const faces = [...src.matchAll(/@font-face \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
if (faces.length < 50) throw new Error(`Iansui: 切り分けが少なすぎる(${faces.length})`);
let css = "/* 生成物: node scripts/fetch-tc-hand-font.mjs（手で直さない）。繁體中文の手書き。 */\n";
let bytes = 0;
for (const [i, face] of faces.entries()) {
  const url = /url\((https:\/\/[^)]+)\)/.exec(face)[1];
  const range = /unicode-range:\s*([^;]+);/.exec(face)?.[1].trim().replace(/\s+/g, " ");
  const n = /\.(\d+)\.woff2$/.exec(path.basename(url));
  const name = `iansui-${n ? n[1] : `x${i}`}`;
  const buf = Buffer.from(await (await get(url)).arrayBuffer());
  bytes += buf.length;
  fs.writeFileSync(path.join(OUT, `${name}.woff2`), buf);
  css +=
    `@font-face{font-family:"Iansui";font-style:normal;font-weight:400;` +
    `font-display:block;src:url(/fonts/iansui/${name}.woff2) format("woff2");` +
    (range ? `unicode-range:${range};` : "") +
    "}\n";
}
fs.writeFileSync(
  path.join(OUT, "OFL.txt"),
  await (
    await get("https://raw.githubusercontent.com/google/fonts/main/ofl/iansui/OFL.txt")
  ).text(),
);
fs.writeFileSync(path.join(OUT, "iansui.css"), css, "utf8");
console.log(`Iansui: ${faces.length}枚 ${(bytes / 1e6).toFixed(1)}MB`);

/**
 * **最初の画面の写真の下に手で書く語だけ**の切り出し（2026-10-03 オーナー報告「海邊の字体が
 * 台湾華語の正式な文字ではないから修整して」）。上の切り分けでは「海邊」の2字が
 * 140KB の2枚に分かれるので、最初の画面に出る字だけを1枚（約4KB）にして先読みする。
 * 字を足したら `WELCOME_TEXT` も足す（`FirstCatchPages.tsx` の `welcomeWord`）。
 */
export const WELCOME_TEXT = "海邊花貓咖啡湖";
const welcomeCss = await (
  await get(
    `https://fonts.googleapis.com/css2?family=Iansui&text=${encodeURIComponent(WELCOME_TEXT)}`,
    { "User-Agent": UA },
  )
).text();
const welcomeUrl = /url\((https:\/\/[^)]+)\)/.exec(welcomeCss)[1];
fs.writeFileSync(
  path.join(OUT, "iansui-welcome.woff2"),
  Buffer.from(await (await get(welcomeUrl)).arrayBuffer()),
);
