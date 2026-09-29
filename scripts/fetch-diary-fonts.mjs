/**
 * **日記の字体**を自前で配る形に落とす道具（オーナー指示 2026-09-28
 * 「日記はユーザーがタイプしたものが、本物の手書きのような字体含む日記の字体
 * ユーザーが選べて、表示される」）。
 *
 *   node scripts/fetch-diary-fonts.mjs
 *
 * `fetch-jp-fonts.mjs` と同じ決まり（外から取りに行かない・Google が配って
 * いるのと同じ切り分けを `unicode-range` 付きでそのまま貰う）。違いは1つ:
 * **日記を開いた時だけ読む別の CSS**（`public/fonts/diary/diary-fonts.css`）に
 * 書き出す。本体の `styles.css` を太らせず、日記を開かない人は1バイトも取らない。
 *
 * どれも SIL Open Font License 1.1。ライセンス本文も一緒に置く。
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/fonts/diary");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** 取る書体。`dir` は置き場所と、切り分けの名前の頭。 */
const FAMILIES = [
  // 鉛筆で丁寧に書いた字（教科書体に近い手書き）。和文・漢字。
  { family: "Klee One", query: "Klee+One", dir: "klee", ofl: "ofl/kleeone/OFL.txt" },
  // 力の抜けた、ふだんの走り書き。和文・漢字。
  { family: "Yomogi", query: "Yomogi", dir: "yomogi", ofl: "ofl/yomogi/OFL.txt" },
  // 繁体字の楷書（筆で書いた字）。台湾華語で日記を書く人のため。
  {
    family: "LXGW WenKai TC",
    query: "LXGW+WenKai+TC",
    dir: "wenkai",
    ofl: "ofl/lxgwwenkaitc/OFL.txt",
  },
];

async function get(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

fs.mkdirSync(OUT, { recursive: true });
let css =
  "/* 生成物: node scripts/fetch-diary-fonts.mjs（手で直さない）。日記を開いた時だけ読む。 */\n";
for (const f of FAMILIES) {
  const dir = path.join(OUT, f.dir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const src = await (
    await get(`https://fonts.googleapis.com/css2?family=${f.query}&display=swap`, {
      "User-Agent": UA,
    })
  ).text();
  const faces = [...src.matchAll(/@font-face \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  if (faces.length < 50) throw new Error(`${f.family}: 切り分けが少なすぎる(${faces.length})`);
  let bytes = 0;
  for (const [i, face] of faces.entries()) {
    const url = /url\((https:\/\/[^)]+)\)/.exec(face)[1];
    const range = /unicode-range:\s*([^;]+);/.exec(face)?.[1].trim().replace(/\s+/g, " ");
    const weight = /font-weight:\s*(\d+);/.exec(face)?.[1] ?? "400";
    const n = /\.(\d+)\.woff2$/.exec(path.basename(url));
    const name = `${f.dir}-${weight}-${n ? n[1] : `x${i}`}`;
    const buf = Buffer.from(await (await get(url)).arrayBuffer());
    bytes += buf.length;
    fs.writeFileSync(path.join(dir, `${name}.woff2`), buf);
    css +=
      `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${weight};` +
      `font-display:block;src:url(/fonts/diary/${f.dir}/${name}.woff2) format("woff2");` +
      (range ? `unicode-range:${range};` : "") +
      "}\n";
  }
  fs.writeFileSync(
    path.join(dir, "OFL.txt"),
    await (await get(`https://raw.githubusercontent.com/google/fonts/main/${f.ofl}`)).text(),
  );
  console.log(`${f.family}: ${faces.length}枚 ${(bytes / 1e6).toFixed(1)}MB`);
}
fs.writeFileSync(path.join(OUT, "diary-fonts.css"), css, "utf8");
console.log("diary-fonts.css を書いた");
