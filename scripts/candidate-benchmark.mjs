/**
 * **写真の候補の精度を測る**（ROADMAP Phase 3.1 / 3.2、QA.md › AI quality benchmark、2026-10-03）。
 *
 * 決まった写真の組（`benchmarks/candidates/<学習言語>/*.jpg` と、正解を書いた `labels.json`）を
 * **本物のサーバの候補の AI**（`src/lib/ai.functions.ts` の `suggestWords` — 同じ指示文・同じ
 * 並べ直し・同じ読みの検め）に通し、Top-1 / Top-3 と待ち時間の p50 / p90 / p99 を出す。
 * モデルを替える前後で同じ組を流して比べるための道具。詳しくは
 * `docs/engineering/candidate-benchmark.md`。
 *
 * ## 使い方
 *   node scripts/candidate-benchmark.mjs                 # 写真が無ければ、何を置けばよいかを出す
 *   node scripts/candidate-benchmark.mjs --lang zh-TW    # 1つの言語だけ
 *   node scripts/candidate-benchmark.mjs --json out.json # 結果を JSON にも書く
 *   node scripts/candidate-benchmark.mjs --check          # AI を呼ばず、サーバの関数が読めるかだけ
 *
 * AI の鍵は環境変数（サーバと同じ名前。`docs/ai-keys-guide.md`）。DB には触らない
 * （`scripts/candidate-benchmark/fake-supabase.ts`）ので、上限も減らず、管理画面の
 * モデルの上書きも読まない — 環境変数で決まるモデルで測る。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCH_DIR = path.join(ROOT, "benchmarks", "candidates");
const LANGS = ["zh-TW", "en"];
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

/** 最も近い順位の方式の百分位（`beta-metrics.ts` の `percentile` と同じ）。 */
export function percentile(values, p) {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = Math.min(v.length, Math.max(1, Math.ceil((p / 100) * v.length)));
  return v[rank - 1];
}

/** 見出しを比べられる形に（前後の空白・全角空白・大文字小文字）。 */
export function normHead(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

/**
 * `labels.json` を読む。形は
 *   { "umbrella.jpg": { "accept": ["雨傘", "傘"], "note": "任意" }, ... }
 * か、短く `{ "umbrella.jpg": ["雨傘", "傘"] }`。`accept` の先頭が「いちばん欲しい語」、
 * 残りも正解として数える（同じ物の言い方の揺れ）。
 */
export function readLabels(dir) {
  const file = path.join(dir, "labels.json");
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = {};
  for (const [name, v] of Object.entries(raw)) {
    const accept = Array.isArray(v) ? v : Array.isArray(v?.accept) ? v.accept : [];
    const clean = accept.map(String).filter((s) => s.trim());
    if (clean.length) out[name] = clean;
  }
  return out;
}

/** 1枚の結果から順位を出す（候補の何番目に正解があったか。無ければ null）。 */
export function hitRank(suggestions, accept) {
  const want = new Set(accept.map(normHead));
  const i = suggestions.findIndex((s) => want.has(normHead(s.headword)));
  return i >= 0 ? i + 1 : null;
}

/** 言語ごとの写真と正解の一覧。正解の無い写真・写真の無い正解も返す（直してもらうため）。 */
export function planFor(lang) {
  const dir = path.join(BENCH_DIR, lang);
  const photos = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMAGE_EXT.test(f)) : [];
  const labels = readLabels(dir);
  return {
    lang,
    dir,
    items: photos.filter((f) => labels[f]).map((f) => ({ file: f, accept: labels[f] })),
    unlabeled: photos.filter((f) => !labels[f]),
    missing: Object.keys(labels).filter((f) => !photos.includes(f)),
  };
}

export function summarize(results) {
  const n = results.length;
  const ok = results.filter((r) => !r.error);
  const top1 = ok.filter((r) => r.rank === 1).length;
  const top3 = ok.filter((r) => r.rank != null && r.rank <= 3).length;
  const ms = results.map((r) => r.ms);
  const pctOf = (k) => (n ? Math.round((1000 * k) / n) / 10 : null);
  return {
    n,
    errors: n - ok.length,
    top1,
    top3,
    top1Pct: pctOf(top1),
    top3Pct: pctOf(top3),
    p50: percentile(ms, 50),
    p90: percentile(ms, 90),
    p99: percentile(ms, 99),
  };
}

function printHowTo(plans) {
  console.log(`
写真がまだありません。次の形で置いてください（どちらの言語からでも、1枚からでも動きます）:

  benchmarks/candidates/
    zh-TW/
      umbrella.jpg
      bubble-tea.jpg
      labels.json
    en/
      umbrella.jpg
      labels.json

labels.json（写真の名前 → 正解の見出し。先頭がいちばん欲しい語、残りも正解として数える）:

  {
    "umbrella.jpg":   { "accept": ["雨傘", "傘"], "note": "折りたたみ傘を手に持った写真" },
    "bubble-tea.jpg": ["珍珠奶茶", "波霸奶茶"]
  }

おすすめ: 言語ごとに 30〜50 枚。食べ物・身の回りの物・店先・看板・乗り物・体の部位を混ぜ、
1枚に物が1つの写真と、複数写っている写真の両方を入れる。写真の長い辺は 1024px 以下
（アプリが AI に送るのは 768px）。人の顔・住所の写る写真は入れない。
`);
  for (const p of plans) {
    if (p.unlabeled.length)
      console.log(`  ${p.lang}: 正解が無い写真 ${p.unlabeled.length} 枚 → labels.json に足す`);
    if (p.missing.length)
      console.log(`  ${p.lang}: labels.json にあるが写真が無い ${p.missing.join(", ")}`);
  }
}

/**
 * 本物のサーバ関数を読み込む。TanStack Start の組み立て無しでは `createServerFn` が解けない
 * ので、通信の所だけを UI ハーネスと同じ差し替えで外し、DB は空の物に替える。
 * 指示文・並べ直し・読みの検めは本物のまま通る。
 */
async function loadServerSuggest() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: [
        {
          find: "@tanstack/react-start/server",
          replacement: path.join(ROOT, "scripts/ui-harness/stubs/react-start-server.ts"),
        },
        {
          find: /^@tanstack\/react-start$/,
          replacement: path.join(ROOT, "scripts/ui-harness/stubs/react-start.ts"),
        },
        {
          find: /^@\/integrations\/supabase\/client(\.server)?$/,
          replacement: path.join(ROOT, "scripts/candidate-benchmark/fake-supabase.ts"),
        },
        { find: "@", replacement: path.join(ROOT, "src") },
      ],
    },
  });
  const mod = await server.ssrLoadModule("/src/lib/ai.functions.ts");
  if (typeof mod.suggestWords !== "function") {
    await server.close();
    throw new Error("suggestWords が読めません（ai.functions.ts の形が変わった？）");
  }
  return {
    suggest: (imageBase64, targetLanguage) =>
      mod.suggestWords({
        data: { imageBase64, targetLanguage },
        context: { userId: "00000000-0000-4000-8000-0000000bench", supabase: null },
      }),
    close: () => server.close(),
  };
}

function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

const fmtMs = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(2)}s`);
const fmtPct = (p) => (p == null ? "—" : `${p}%`);

async function main() {
  const only = arg("lang");
  const langs = only ? [only] : LANGS;
  const plans = langs.map(planFor);
  const total = plans.reduce((s, p) => s + p.items.length, 0);

  if (flag("check")) {
    const api = await loadServerSuggest();
    await api.close();
    console.log("✓ サーバの候補の関数（suggestWords）を読み込めました。");
    if (!total) printHowTo(plans);
    return;
  }
  if (!total) {
    printHowTo(plans);
    return;
  }

  const api = await loadServerSuggest();
  const report = { at: new Date().toISOString(), langs: {} };
  try {
    for (const plan of plans) {
      if (!plan.items.length) continue;
      console.log(`\n▶ ${plan.lang}: ${plan.items.length} 枚`);
      const results = [];
      for (const item of plan.items) {
        const t0 = performance.now();
        try {
          const res = await api.suggest(dataUrl(path.join(plan.dir, item.file)), plan.lang);
          const ms = Math.round(performance.now() - t0);
          const heads = (res?.suggestions ?? []).map((s) => s.headword);
          const rank = hitRank(res?.suggestions ?? [], item.accept);
          results.push({ file: item.file, ms, rank, heads, accept: item.accept });
          console.log(
            `  ${rank === 1 ? "◎" : rank && rank <= 3 ? "○" : "×"} ${item.file}  ${fmtMs(ms)}  ` +
              `[${heads.join(" / ")}]  正解: ${item.accept[0]}`,
          );
        } catch (e) {
          const ms = Math.round(performance.now() - t0);
          results.push({ file: item.file, ms, rank: null, error: String(e?.message ?? e) });
          console.log(`  ! ${item.file}  ${fmtMs(ms)}  失敗: ${e?.message ?? e}`);
        }
      }
      const s = summarize(results);
      report.langs[plan.lang] = { summary: s, results };
      console.log(
        `  Top-1 ${fmtPct(s.top1Pct)} (${s.top1}/${s.n})  Top-3 ${fmtPct(s.top3Pct)} (${s.top3}/${s.n})  ` +
          `p50 ${fmtMs(s.p50)}  p90 ${fmtMs(s.p90)}  p99 ${fmtMs(s.p99)}  失敗 ${s.errors}`,
      );
      if (plan.unlabeled.length)
        console.log(`  （正解の無い写真 ${plan.unlabeled.length} 枚は数えていません）`);
    }
  } finally {
    await api.close();
  }
  const out = arg("json");
  if (out) {
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\n結果を ${out} に書きました。`);
  }
}

// 試験から読み込まれた時は走らせない。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`\n✗ ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
