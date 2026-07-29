/**
 * アプリアイコンを作る。
 *
 * ## なぜスクリプトにするのか
 * アイコンは「1枚描いて終わり」ではなく、端末の画面密度ごとに**同じ絵を
 * 6種類以上の大きさで**用意する必要がある。手で書き出すと必ずどれかが
 * 古いまま残るので、1つの元デザインから全部を生成する形にしておく。
 *
 * ## 絵の考え方
 * 街の言葉を「捕まえる」アプリなので、**カメラの照準(四隅の角括弧)の中に
 * 漢字が1つ収まっている**形にした。小さく表示されても形が潰れないよう、
 * 要素は「角括弧」と「文字」の2つだけに絞っている。
 * アイコンは16px程度まで縮むので、要素を足すほど何も読めなくなる。
 *
 * ## 差し替え方
 * 下の ICON_HTML を書き換えて、次を実行するだけ:
 *   npm i -D playwright
 *   node scripts/make-icons.mjs
 *
 * Android は「適応アイコン」(丸や角丸など端末ごとに形が変わる)に対応する
 * ため、前景と背景を分けて出力する。前景は中央66%に収める決まりがあるので、
 * 絵を小さめに描いている(端が切られても欠けないようにするため)。
 */
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = new URL("../android/app/src/main/res/", import.meta.url);

/** 端末の画面密度ごとの大きさ(px)。 */
const DENSITIES = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];

const BG = "linear-gradient(145deg, #1b4dd8 0%, #0f2a8f 55%, #3b1d9e 100%)";

/**
 * @param {number} size 出力する一辺のpx
 * @param {"full"|"fg"|"bg"} mode full=通常アイコン / fg=適応アイコンの前景 / bg=背景
 * @param {boolean} round 円形に切り抜くか
 */
function html(size, mode, round) {
  // 適応アイコンの前景は中央66%しか安全に見えないので、絵を縮めて置く。
  const scale = mode === "fg" ? 0.62 : 0.78;
  const glyph = Math.round(size * scale * 0.62);
  const bracket = Math.max(2, Math.round(size * 0.045));
  const arm = Math.round(size * scale * 0.26);
  const inset = Math.round((size * (1 - scale)) / 2);
  const showBg = mode !== "fg";
  const showArt = mode !== "bg";
  return `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&display=swap">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${size}px;height:${size}px;overflow:hidden}
  .icon{position:relative;width:${size}px;height:${size}px;
    ${showBg ? `background:${BG};` : "background:transparent;"}
    ${round ? "border-radius:50%;" : ""}
    display:grid;place-items:center;overflow:hidden}
  /* 上から差す光。単色より立体に見え、小さくしても「作られた物」に見える。 */
  .icon::before{content:"";position:absolute;inset:0;
    background:radial-gradient(70% 55% at 50% -5%, rgba(255,255,255,.30), transparent 70%);
    ${showBg ? "" : "display:none"}}
  .glyph{position:relative;color:#fff;font-family:"Noto Sans TC",sans-serif;
    font-weight:700;font-size:${glyph}px;line-height:1;
    text-shadow:0 ${Math.max(1, Math.round(size * 0.012))}px ${Math.round(size * 0.03)}px rgba(0,0,0,.35);
    ${showArt ? "" : "display:none"}}
  /* カメラの照準。四隅だけを描くと「捕まえる」意味が一目で出る。 */
  .b{position:absolute;width:${arm}px;height:${arm}px;border:${bracket}px solid rgba(255,255,255,.92);
    ${showArt ? "" : "display:none"}}
  .tl{top:${inset}px;left:${inset}px;border-right:0;border-bottom:0;border-top-left-radius:${bracket * 2}px}
  .tr{top:${inset}px;right:${inset}px;border-left:0;border-bottom:0;border-top-right-radius:${bracket * 2}px}
  .bl{bottom:${inset}px;left:${inset}px;border-right:0;border-top:0;border-bottom-left-radius:${bracket * 2}px}
  .br{bottom:${inset}px;right:${inset}px;border-left:0;border-top:0;border-bottom-right-radius:${bracket * 2}px}
</style>
<div class="icon">
  <span class="b tl"></span><span class="b tr"></span><span class="b bl"></span><span class="b br"></span>
  <span class="glyph">字</span>
</div>`;
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function shoot(size, mode, round, file) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(html(size, mode, round), { waitUntil: "networkidle" });
  await page.waitForTimeout(400); // 書体の読み込みを待つ
  const buf = await page.screenshot({ omitBackground: mode === "fg" });
  fs.writeFileSync(file, buf);
  await page.close();
}

for (const [name, size] of DENSITIES) {
  const dir = new URL(`mipmap-${name}/`, OUT);
  fs.mkdirSync(dir, { recursive: true });
  await shoot(size, "full", false, new URL("ic_launcher.png", dir));
  await shoot(size, "full", true, new URL("ic_launcher_round.png", dir));
  // 適応アイコン用。Android が端末ごとの形に切り抜くので、前景は余白多め。
  await shoot(Math.round(size * 2.2), "fg", false, new URL("ic_launcher_foreground.png", dir));
  console.log("icons", name, size);
}

// ストア掲載用の512px。Google Play の登録画面で要求される。
fs.mkdirSync(new URL("../../../../../store-assets/", OUT), { recursive: true });
await shoot(512, "full", false, new URL("../../../../../store-assets/icon-512.png", OUT));
console.log("store icon 512 done");

await browser.close();
