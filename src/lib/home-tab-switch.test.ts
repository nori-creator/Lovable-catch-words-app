import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **ホームへ戻った時にカクつかない・抜けない**（オーナー報告 2026-10-09「ホームのアイコン押すと
 * カクカクする。このようなラグはなくす。」）と、**字だけの札は字だけが浮く**（同日「ホームの文字を
 * 移動させたい時に、文字だけでなく、周りの変な箱ごと移動するのが変」）。
 *
 * 速さそのものは `scripts/home-tab-perf.mjs` が測る（CPU 4 倍遅い Chromium で、ホームへ戻る
 * たびの止まりが 3〜4 秒 → 0.2〜0.3 秒）。ここは、その作りが黙って元に戻らないかを秒で見る。
 */
const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("ホームへ戻った時", () => {
  it("組んだ 3D の棚を捨てずに次のホームへ差し戻す（WebGL・シェーダーを毎回作り直さない）", () => {
    const shelf = read("components/HomeShelf.tsx");
    expect(shelf).toMatch(/takeKeptShelf\(key\)/);
    expect(shelf).toMatch(/keepShelf\(\{ key, world: built, canvas: el, handlers \}\)/);
    // 本を開いたまま・描き終えていない棚は預けない（差し戻した棚は描き終えている）。
    expect(shelf).toMatch(
      /built && \(readyRef\.current \|\| reuse\) && !openRef\.current && !fullRef\.current/,
    );
    // WebGL が失われた棚は使わない。しばらく戻らなければ捨てる。
    expect(shelf).toMatch(/webglcontextlost/);
    expect(shelf).toMatch(/KEEP_SHELF_MS/);
    // React は canvas を持たない（持つと画面と一緒に捨てられる）。
    expect(shelf).not.toMatch(/<canvas ref=\{canvasRef\}/);
  });

  it("預けた棚の鍵に署名付きの URL を使わない（読み直すたびに組み直さない）", () => {
    // 2026-10-09「全く直ってない」: 写真の URL は一覧を読み直すたびに変わる（署名）。鍵が URL
    // だと、アプリに戻った後・撮った後のホームで毎回 3D を組み直して 1〜4 秒固まっていた。
    const shelf = read("components/HomeShelf.tsx");
    expect(shelf).toMatch(/const key = `\$\{room\}:\$\{monthSig\}:\$\{framePhoto\?\.id \?\? ""\}`/);
    // 本を開いた後も棚は捨てず、中の絵だけ次に開く時に描き直す。
    expect(shelf).toMatch(/k\.world\.markPaintStale\(\)/);
    expect(shelf).not.toMatch(/if \(k\.world\.hasPaintedBooks\(\)\) \{\s*k\.world\.dispose/);
    const engine = read("components/shelf3d/engine.ts");
    expect(engine).toMatch(/if \(b\.stale\) this\.unpaintBook\(b\)/);
  });

  it("押した瞬間の 1 コマに棚の仕事を足さない（差し戻し・組み立ては画面が出た後）", () => {
    const shelf = read("components/HomeShelf.tsx");
    expect(shelf).toMatch(
      /afterFirstPaint\(\(\) => \{\s*if \(!alive\) return;\s*wire\(reuse\.world\)/,
    );
    expect(shelf).toMatch(/afterFirstPaint\(ok, \{ idle: hasShelfSnapshot\(\) \}\)/);
    // ホームの塊を読んだ時に、端末の棚の絵を読み解いておく（最初のホームでも棚が空かない）。
    expect(shelf).toMatch(/^primeShelfSnapshot\(\);$/m);
  });

  it("棚を組む時に GPU を待たない（読む絵は CPU 側・シェーダーは並行して組む）", () => {
    expect(read("components/shelf3d/textures.ts")).toMatch(
      /height\.getContext\("2d", \{ willReadFrequently: true \}\)/,
    );
    const engine = read("components/shelf3d/engine.ts");
    expect(engine).toMatch(/await this\.renderer\.compileAsync\(this\.scene, this\.camera\)/);
    expect(engine).toMatch(/await yieldToMain\(\)/);
    // 閉じた本が棚へ戻り終えるまで待ってから外す（外さないと隠れた棚が毎コマ描き続ける）。
    expect(engine).toMatch(/window\.setTimeout\(settle, 250\)/);
  });

  it("下のバーは押した瞬間に応える（印を合成の糸で滑らせ、1 コマ出してから移る）", () => {
    const shell = read("components/AppShell.tsx");
    expect(shell).toMatch(/glideIndicator\(\s*"tabbar"/);
    expect(shell).toMatch(/setPendingTo\(to\);\s*requestAnimationFrame\(/);
    expect(read("components/SlidingIndicator.tsx")).toMatch(/export function glideIndicator/);
  });

  it("棚の絵は手元に読み解いて置き、最初のコマから出す", () => {
    const shelf = read("components/HomeShelf.tsx");
    expect(shelf).toMatch(/useState<string \| null \| undefined>\(\(\) => snapInMemory\)/);
    expect(shelf).toMatch(/await decodeImage\(url\)/);
  });

  it("過去の日は少しずつ描き足す（押した瞬間に全部の日を組まない）", () => {
    const home = read("components/screens/HomeScreen.tsx");
    expect(home).toMatch(/days\.slice\(0, limit\)\.map/);
    expect(home).toMatch(/PAST_DAYS_FIRST = \d/);
  });

  it("前に読めた写真の比で最初から組む（戻るたびに札が跳ねない）", () => {
    const home = read("components/screens/HomeScreen.tsx");
    expect(home).toMatch(/knownPhotoRatio\.set\(photoRatioKey\(s\.id, heroUrl\), r\)/);
    expect(home).toMatch(/photoRatio: ratios,/);
  });

  it("表紙が開く演出・昔の1枚の札の動きは、戻るたびには出ない", () => {
    const home = read("components/screens/HomeScreen.tsx");
    expect(home).toMatch(/opening && !homeOpeningPlayed/);
    expect(home).toMatch(/opening=\{playOpening\}/);
    const card = read("components/ResurfaceCard.tsx");
    // 札は最初の描画で決める（後から差し込んで日付と誌面を押し下げない）。
    expect(card).toMatch(/useState<ResurfacePick \| null>\(\(\) =>/);
    expect(read("styles.css")).toMatch(/\.resurface-card\[data-settled\] \{\s*animation: none;/);
  });

  it("一度読み終えた写真は、作り直された画面でもすぐ描く（空の枠を挟まない）", () => {
    const img = read("lib/image-cache.tsx");
    expect(img).toMatch(/seen \? \{ loading: "eager" as const, decoding: "sync" as const \}/);
    // 署名の無い URL は解決を待たずに描く。
    expect(img).toMatch(/if \(!p\) return src;/);
  });

  it("下のバーの画面は暇な時に先に取っておく", () => {
    expect(read("hooks/use-warm-camera.ts")).toMatch(
      /TAB_ROUTES = \["\/home", "\/dex", "\/review", "\/settings"\]/,
    );
  });
});

describe("誌面の並べ替え（2026-10-09「文字を長押しすると青く文字のコピーになる」「完了ボタンが必ず表示されるように」）", () => {
  it("誌面の上では字を選ばせない・長押しのメニューを出さない（打つ欄は選べる）", () => {
    const css = read("styles.css");
    const at = css.indexOf(".collage-board,\n.collage-board * {");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toMatch(/user-select: none/);
    expect(block).toMatch(/-webkit-touch-callout: none/);
    expect(css).toMatch(
      /\.collage-board :is\(input, textarea, \[contenteditable="true"\]\) \{\s*-webkit-user-select: text;/,
    );
    expect(read("components/screens/HomeScreen.tsx")).toMatch(
      /onContextMenu=\{\(e\) => \{\s*if \(!\(e\.target instanceof HTMLElement\)/,
    );
  });

  it("「完了」は body に置く（誌面の transform に引っ張られて画面の外へ出ない）", () => {
    const home = read("components/screens/HomeScreen.tsx");
    expect(home).toMatch(/<DoneEditingButton onClick=\{finishEditing\}/);
    expect(home).toMatch(/return createPortal\(/);
    // 表紙が開く動きは、終わった後に translate/scale を残さない。
    expect(read("styles.css")).toMatch(
      /animation: album-stamp 420ms cubic-bezier\(0\.22, 0\.9, 0\.3, 1\) backwards;/,
    );
  });
});

describe("字だけの札を動かす時", () => {
  it("札の枠には影も拡大も付けない（写真の札だけ）", () => {
    const home = read("components/screens/HomeScreen.tsx");
    expect(home).toMatch(/scale: lifted && heroUrl \?/);
    expect(home).toMatch(/lifted && heroUrl\s*\?\s*`0 \$\{LIFTED\.shadowBlurPx/);
  });

  it("浮くのは字そのもの（字の形に沿う影）", () => {
    const css = read("styles.css");
    const at = css.indexOf(".album-lifted .collage__plain {");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toMatch(/filter: drop-shadow/);
    expect(block).not.toMatch(/background|box-shadow|border/);
  });

  it("編集の印は字の角に付く（字の大きさの見えない写しの角）", () => {
    const home = read("components/screens/HomeScreen.tsx");
    expect(home).toMatch(/className="album-remove-hug"/);
    expect(home).toMatch(/className="album-remove-ghost" aria-hidden/);
    expect(read("styles.css")).toMatch(/\.album-remove-ghost > \* \{\s*visibility: hidden;/);
  });
});
