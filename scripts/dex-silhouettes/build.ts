/**
 * **図鑑の影の形を作る**（`src/lib/dex-silhouettes.generated.ts` を書き出す）。
 *
 *   npx tsx scripts/dex-silhouettes/build.ts
 *
 * - 対応表は `src/lib/dex-glyphs.ts`（項目 id → 絵）。使う絵**だけ**を書き出す —
 *   絵の集まり（数 MB）はアプリに入れない。
 * - `fe:`（Fluent Emoji Flat）は色の付いた絵なので、Chromium で描いて**不透明な所だけ**を取り出し、
 *   imagetracerjs でなぞって1本の形にする。中の色分けは、大きな色の塊どうしの境目にだけ細い隙間を
 *   切って残す（ご飯とお椀など — `STENCIL`）。小さな飾りや陰影は影には要らないので捨てる。
 * - 座標は相対・整数の短い d に詰める（全部で約 150 KB、gzip 約 60 KB。アプリは図鑑で影を出す時だけ読む）。
 * - `mdi:` / `ms:` / `cw:` は元から1色の形なので、そのまま使う（はみ出しを測って枠だけ合わせる）。
 * - どの形も、絵の外枠にぴったりの正方形の viewBox を付ける（升目の中で大きさが揃う）。
 *
 * 要る物（開発の時だけ。package.json には入れない — 数十 MB の絵の集まりを毎回の install に
 * 載せないため。作り直す時だけ入れる）:
 *   npm i --no-save @iconify-json/fluent-emoji-flat@1.2.6 @iconify-json/mdi@1.2.3 \
 *     @iconify-json/material-symbols@1.2.94 imagetracerjs@1.2.6
 *   playwright の Chromium（`PW_CHROME` で場所を変えられる）
 * 別の場所に入れた時は `DEXSIL_DEPS=<その node_modules の親>` で指す。
 * ライセンス（MIT / Apache-2.0）と出どころは `public/licenses/dex-silhouettes.txt`（アプリと一緒に配る）。
 * 見比べたい絵は `DEXSIL_EXTRA=fe:x,mdi:y DEXSIL_OUT=/tmp/preview.ts` で、表を変えずに作れる。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEX_ITEMS } from "../../src/lib/dex-catalog";
import { DEX_GLYPHS, type DexGlyphRef } from "../../src/lib/dex-glyphs";
import { CUSTOM_GLYPHS } from "./custom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.DEXSIL_OUT ?? path.resolve(HERE, "../../src/lib/dex-silhouettes.generated.ts");
const req = createRequire(
  process.env.DEXSIL_DEPS ? path.join(process.env.DEXSIL_DEPS, "noop.js") : import.meta.url,
);

type IconSet = {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
};
const SETS: Record<string, IconSet> = {
  fe: req("@iconify-json/fluent-emoji-flat/icons.json"),
  mdi: req("@iconify-json/mdi/icons.json"),
  ms: req("@iconify-json/material-symbols/icons.json"),
};
const tracer = req("imagetracerjs");

/** なぞる時の大きさ（px）。絵文字の 32 の升目の 6 倍。 */
const RASTER = 192;

type Shape = { viewBox: string; d: string; evenodd: boolean };

function icon(set: string, name: string) {
  const s = SETS[set];
  const own = s.icons[name] ?? s.icons[s.aliases?.[name]?.parent ?? ""];
  if (!own) throw new Error(`絵がありません: ${set}:${name}`);
  return { body: own.body, w: own.width ?? s.width ?? 16, h: own.height ?? s.height ?? 16 };
}

/** 1本の path だけの1色の絵なら、その d と塗り方。 */
function singlePath(body: string): { d: string; evenodd: boolean } | null {
  const paths = [...body.matchAll(/<path\b([^>]*)\/?>/g)];
  if (paths.length !== 1 || /<(g|circle|rect|ellipse|polygon)\b[^>]*transform/.test(body))
    return null;
  if (/<(circle|rect|ellipse|polygon|polyline|line)\b/.test(body)) return null;
  const attrs = paths[0][1];
  const d = attrs.match(/\bd="([^"]+)"/)?.[1];
  if (!d || /transform=/.test(attrs)) return null;
  return { d, evenodd: /fill-rule="evenodd"/.test(body) };
}

type Seg = {
  type: "L" | "Q";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
};
type TracePath = { segments: Seg[]; isholepath: boolean; holechildren: number[] };

/**
 * なぞった形を、**相対座標・整数**の短い d にする（同じ命令は繰り返さない）。
 * 穴は逆回りに書く（nonzero で抜ける）。
 */
function pathFromTrace(layer: TracePath[]): string {
  let out = "";
  let last = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let first = true;
  const nums = (ns: number[]) =>
    ns.reduce((acc, n, i) => acc + (i > 0 && n >= 0 ? " " : "") + String(n), "");
  const put = (c: string, ns: number[]) => {
    const head = c === last && c !== "m" && c !== "M" ? (ns[0] >= 0 ? " " : "") : c;
    out += head + nums(ns);
    last = c;
  };
  const sub = (
    pts: Array<{ q?: [number, number]; p: [number, number] }>,
    start: [number, number],
  ) => {
    const [x0, y0] = start.map(Math.round);
    if (first) put("M", [x0, y0]);
    else put("m", [x0 - sx, y0 - sy]);
    first = false;
    cx = sx = x0;
    cy = sy = y0;
    for (const { q, p } of pts) {
      const [x, y] = p.map(Math.round);
      if (q) {
        const [qx, qy] = q.map(Math.round);
        put("q", [qx - cx, qy - cy, x - cx, y - cy]);
      } else {
        if (x === cx && y === cy) continue;
        put("l", [x - cx, y - cy]);
      }
      cx = x;
      cy = y;
    }
    out += "z";
    last = "z";
    cx = sx;
    cy = sy;
  };
  for (const path of layer) {
    if (path.isholepath || !path.segments.length) continue;
    const segs = path.segments;
    sub(
      segs.map((s) =>
        s.type === "Q"
          ? { q: [s.x2, s.y2] as [number, number], p: [s.x3!, s.y3!] as [number, number] }
          : { p: [s.x2, s.y2] as [number, number] },
      ),
      [segs[0].x1, segs[0].y1],
    );
    for (const h of path.holechildren) {
      const hs = layer[h].segments;
      if (!hs.length) continue;
      const lastSeg = hs[hs.length - 1];
      const start: [number, number] =
        lastSeg.type === "Q" ? [lastSeg.x3!, lastSeg.y3!] : [lastSeg.x2, lastSeg.y2];
      sub(
        [...hs]
          .reverse()
          .map((s) =>
            s.type === "Q"
              ? { q: [s.x2, s.y2] as [number, number], p: [s.x1, s.y1] as [number, number] }
              : { p: [s.x1, s.y1] as [number, number] },
          ),
        start,
      );
    }
  }
  return out;
}

function squareBox(x: number, y: number, w: number, h: number, digits: number): string {
  const s = Math.max(w, h);
  const r = (n: number) => Math.round(n * 10 ** digits) / 10 ** digits;
  return [r(x + w / 2 - s / 2), r(y + h / 2 - s / 2), r(s), r(s)].join(" ");
}

/**
 * 影の刻み（ステンシル）の強さ。大きな色の塊どうしの境目にだけ細い隙間を切る —
 * ご飯とお椀、パンの切れ目など、形だけでは同じ丸になってしまう物を見分けるため
 * （iOS の SF Symbols の塗りの記号と同じ見え方）。小さな飾り・陰影の色分けは切らない。
 */
const STENCIL = {
  /** 隙間の半分の幅（px、RASTER 上）。 */
  gap: 2.6,
  /** 切る相手になる塊の最小の広さ（形全体に対する割合）。 */
  minArea: 0.035,
  /** 色の違い（RGB の距離）がこれ以上の境目だけ切る。 */
  minDiff: 70,
};

/**
 * ブラウザの中で動く: 絵を描き（にじみ無し）、不透明な所を 255、透明・隙間を 0 にした配列を返す。
 */
async function stencil({
  svg,
  size,
  gap,
  minArea,
  minDiff,
}: { svg: string; size: number } & typeof STENCIL): Promise<number[]> {
  const load = async (s: string) => {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, size, size);
    return g.getImageData(0, 0, size, size).data;
  };
  // 輪郭はなめらかに（にじみ有りの不透明度）、色分けはにじみ無しで（境目の中間色を作らない）。
  const soft = await load(svg);
  const crisp = await load(svg.replace("<svg ", '<svg shape-rendering="crispEdges" '));
  const n = size * size;
  const on = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (soft[i * 4 + 3] < 128) continue;
    on[i] = 1;
    total++;
  }
  // 同じ色のつながった塊に番号を振る。
  const label = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const colors: number[][] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!on[i] || label[i] >= 0 || crisp[i * 4 + 3] < 128) continue;
    const id = areas.length;
    const r = crisp[i * 4],
      g = crisp[i * 4 + 1],
      b = crisp[i * 4 + 2];
    let area = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      area++;
      const x = j % size;
      for (const k of [j - 1, j + 1, j - size, j + size]) {
        if (k < 0 || k >= n || label[k] >= 0 || !on[k] || crisp[k * 4 + 3] < 128) continue;
        if ((k === j - 1 && x === 0) || (k === j + 1 && x === size - 1)) continue;
        if (crisp[k * 4] !== r || crisp[k * 4 + 1] !== g || crisp[k * 4 + 2] !== b) continue;
        label[k] = id;
        stack.push(k);
      }
    }
    areas.push(area);
    colors.push([r, g, b]);
  }
  const big = (id: number) => id >= 0 && areas[id] >= total * minArea;
  const diff = (a: number, b: number) => {
    const [r1, g1, b1] = colors[a];
    const [r2, g2, b2] = colors[b];
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  };
  // 大きな塊の色を、小さな塊にも広げる（小さな飾りは、周りの大きな塊の一部として扱う）。
  const owner = new Int32Array(n).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!big(label[i])) continue;
    owner[i] = label[i];
    queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const j = queue[q];
    const x = j % size;
    for (const k of [j - 1, j + 1, j - size, j + size]) {
      if (k < 0 || k >= n || !on[k] || owner[k] >= 0) continue;
      if ((k === j - 1 && x === 0) || (k === j + 1 && x === size - 1)) continue;
      owner[k] = owner[j];
      queue.push(k);
    }
  }
  // 色の大きく違う大きな塊どうしの境目に、隙間を切る。
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = on[i] ? 255 : 0;
  const R = Math.ceil(gap);
  for (let i = 0; i < n; i++) {
    const a = owner[i];
    if (a < 0) continue;
    const x = i % size;
    const k = i + 1;
    const d = i + size;
    const edges: number[] = [];
    if (x < size - 1 && owner[k] >= 0 && owner[k] !== a && diff(a, owner[k]) >= minDiff)
      edges.push(k);
    if (d < n && owner[d] >= 0 && owner[d] !== a && diff(a, owner[d]) >= minDiff) edges.push(d);
    if (!edges.length) continue;
    const y = Math.floor(i / size);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > gap * gap) continue;
        const xx = x + dx + 0.5,
          yy = y + dy + 0.5;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        out[Math.floor(yy) * size + Math.floor(xx)] = 0;
      }
  }
  return out;
}

async function main() {
  // DEXSIL_EXTRA: 表に入れる前に見比べたい絵（`fe:x,mdi:y`）。DEXSIL_OUT と一緒に使う。
  const extra = (process.env.DEXSIL_EXTRA ?? "").split(",").filter(Boolean);
  const refs = [
    ...new Set([...DEX_ITEMS.map((it) => DEX_GLYPHS[it.id]).filter(Boolean), ...extra]),
  ].sort();
  const missing = DEX_ITEMS.filter((it) => !DEX_GLYPHS[it.id]).map((it) => it.id);
  if (missing.length) throw new Error(`絵の無い項目: ${missing.join(", ")}`);

  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  // tsx（esbuild）が関数に付ける名前の手伝いを、ブラウザの側にも置く。
  await page.evaluate("window.__name = (f) => f");

  const out: Record<string, Shape> = {};
  for (const ref of refs as DexGlyphRef[]) {
    const [set, name] = ref.split(/:(.*)/s);
    let vector: { d: string; evenodd: boolean; w: number; h: number } | null = null;
    if (set === "cw") {
      const c = CUSTOM_GLYPHS[name];
      if (!c) throw new Error(`描いた形がありません: ${ref}`);
      vector = { d: c.d, evenodd: !!c.evenodd, w: 24, h: 24 };
    } else if (set !== "fe") {
      const ic = icon(set, name);
      const p = singlePath(ic.body);
      if (p) vector = { ...p, w: ic.w, h: ic.h };
    }

    if (vector) {
      // 1色の形: 外枠を測って正方形に合わせるだけ。
      const bb = await page.evaluate(
        ({ d, w, h }) => {
          const ns = "http://www.w3.org/2000/svg";
          const svg = document.createElementNS(ns, "svg");
          svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
          const p = document.createElementNS(ns, "path");
          p.setAttribute("d", d);
          svg.appendChild(p);
          document.body.appendChild(svg);
          const b = p.getBBox();
          svg.remove();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        },
        { d: vector.d, w: vector.w, h: vector.h },
      );
      out[ref] = {
        viewBox: squareBox(bb.x, bb.y, bb.w, bb.h, 2),
        // 元から短い形なので、そのまま（弧の旗 `011` を数と取り違えないよう、丸めない）。
        d: vector.d,
        evenodd: vector.evenodd,
      };
      continue;
    }

    // 色の付いた絵（または 1本でない絵）: 描いて、不透明な所だけをなぞる。
    const ic = icon(set, name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER}" height="${RASTER}" viewBox="0 0 ${ic.w} ${ic.h}">${ic.body}</svg>`;
    const alpha: number[] = await page.evaluate(stencil, { svg, size: RASTER, ...STENCIL });
    const rgba = new Uint8ClampedArray(RASTER * RASTER * 4);
    let x0 = RASTER,
      y0 = RASTER,
      x1 = 0,
      y1 = 0;
    for (let i = 0; i < alpha.length; i++) {
      const on = alpha[i] >= 128;
      const v = on ? 0 : 255;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
      if (on) {
        const x = i % RASTER;
        const y = Math.floor(i / RASTER);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
    const options = {
      ltres: 1.4,
      qtres: 1.2,
      pathomit: 10,
      rightangleenhance: false,
      colorsampling: 0,
      numberofcolors: 2,
      colorquantcycles: 1,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
      blurradius: 0,
      roundcoords: 1,
      linefilter: false,
    };
    const td = tracer.imagedataToTracedata(
      { width: RASTER, height: RASTER, data: rgba },
      tracer.checkoptions(options),
    );
    const black = td.palette.findIndex(
      (p: { r: number; g: number; b: number }) => p.r === 0 && p.g === 0 && p.b === 0,
    );
    const d = pathFromTrace(td.layers[black]);
    if (!d) throw new Error(`形が取れません: ${ref}`);
    out[ref] = {
      viewBox: squareBox(x0, y0, x1 - x0, y1 - y0, 0),
      d,
      evenodd: false,
    };
  }
  await browser.close();

  const lines = Object.entries(out).map(
    ([ref, s]) =>
      `  ${JSON.stringify(ref)}: [${JSON.stringify(s.viewBox)}, ${JSON.stringify(s.d)}${s.evenodd ? ", 1" : ""}],`,
  );
  const src = `/* eslint-disable */
// **自動で作った物。手で直さない。** \`npx tsx scripts/dex-silhouettes/build.ts\` が書き出す。
// 図鑑の影の形（${Object.keys(out).length} 個）: 絵の名前 → [viewBox, path の d, evenodd なら 1]。
// 出どころ: Fluent Emoji Flat (MIT, Microsoft) / Material Design Icons (Apache-2.0) /
// Material Symbols (Apache-2.0, Google) / このアプリで描いた形。public/licenses/dex-silhouettes.txt
export type DexSilShape = readonly [viewBox: string, d: string, evenodd?: 1];

// prettier-ignore
export const DEX_SIL_SHAPES: Readonly<Record<string, DexSilShape>> = {
${lines.join("\n")}
};
`;
  fs.writeFileSync(OUT, src);
  const bytes = Buffer.byteLength(src);
  console.log(
    `${Object.keys(out).length} shapes → ${path.relative(process.cwd(), OUT)} (${(bytes / 1024).toFixed(1)} KB)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
