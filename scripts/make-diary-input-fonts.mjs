/**
 * **日記を打つ欄のための字体の別名**を作る（手で直さない生成物を書き出す）。
 *
 *   node scripts/make-diary-input-fonts.mjs
 *
 * （オーナー報告 2026-09-30「日記を書いてる時に文字が消えたり、現れたりするバグ」）
 *
 * 手書きの書体はどれも字の切り分け（`unicode-range`）ごとに取りに行き、
 * `font-display: block` で**届くまで字を描かない**（開いた瞬間に字体が入れ替わら
 * ないため）。ところが打っている最中は、新しい字（注音の ㄏㄣˇ、まだ出ていない漢字）を
 * 打つたびに新しい切り分けを取りに行く。その間、**欄の字が全部消えて**、届くと戻る —
 * 録画のとおりの症状になる。
 *
 * 見せる所（アルバム・本棚のページ）はそのまま `block`。**打つ欄だけ**は、同じファイルを
 * `font-display: swap` で名乗る別名（`"<書体名> Input"`）で使い、届くまでは端末の字で
 * 描いておく。ファイルは同じなので、取り直しは起きない。
 */
import fs from "node:fs";
import path from "node:path";

const SOURCES = [
  { file: "src/styles.css", families: ["Zen Kurenaido"] },
  {
    file: "public/fonts/diary/diary-fonts.css",
    families: ["Klee One", "Yomogi", "LXGW WenKai TC"],
  },
  { file: "public/fonts/iansui/iansui.css", families: ["Iansui"] },
];

/** 書体名 → 置き場所の名前（`diary-fonts.ts` の `inputCssSlug` と同じ変換）。 */
const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const OUT = path.resolve("public/fonts/diary/input");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
/** 書体ごとに別のファイル — 選んだ字体の分だけ読む（全部で 500KB を超えるため）。 */
const byFamily = new Map();
for (const { file, families } of SOURCES) {
  const text = fs.readFileSync(path.resolve(file), "utf8");
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const fam = /font-family:\s*"([^"]+)"/.exec(body)?.[1];
    if (!fam || !families.includes(fam)) continue;
    const src = /src:\s*([^;]+);/.exec(body)[1].trim();
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim().replace(/\s+/g, " ");
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1] ?? "400";
    const prev =
      byFamily.get(fam) ??
      "/* 生成物: node scripts/make-diary-input-fonts.mjs（手で直さない）。日記を打つ欄だけの別名。 */\n";
    byFamily.set(
      fam,
      prev +
        `@font-face{font-family:"${fam} Input";font-style:normal;font-weight:${weight};` +
        `font-display:swap;src:${src};` +
        (range ? `unicode-range:${range};` : "") +
        "}\n",
    );
  }
}
for (const [fam, css] of byFamily) {
  fs.writeFileSync(path.join(OUT, `${slug(fam)}.css`), css, "utf8");
  console.log(`${slug(fam)}.css: ${(css.match(/@font-face/g) ?? []).length} faces`);
}
