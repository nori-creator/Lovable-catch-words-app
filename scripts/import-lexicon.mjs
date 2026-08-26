/**
 * 英語の種辞書を作る道具。
 *
 * ## この道具は判断しない
 * どの語を入れるか・級をいくつにするか・発音をどう書くかは、全部
 * `src/lib/lexicon-import.ts` にある（試験付き）。ここは**落として・流して・
 * 書くだけ**。1回流すだけの処理なので、判断がこちら側にあると
 * 間違いに気づく手が無い。
 *
 * ## 使い方
 *
 * **`node` ではなく `vite-node` で動かす。** 判断は TypeScript の
 * `src/lib/lexicon-import.ts` に置いてあり、素の node はそれを読めない。
 *
 *   V=node_modules/.bin/vite-node
 *
 *   # 1. 材料を落とす（1回だけ。66MB あるので少し待つ）
 *   $V scripts/import-lexicon.mjs -- fetch
 *
 *   # 2. 中身を見る（何語入るか・級の散らばり・変な行が無いか）
 *   $V scripts/import-lexicon.mjs -- build --cefrj <CEFR-J から作った json>
 *
 *   # 3. 入れる SQL を書き出す
 *   $V scripts/import-lexicon.mjs -- sql --cefrj <…> --out /tmp/lexicon.sql
 *
 * `--limit N` を付けると N 語で止まる（試すとき用）。
 * `--freq-top N` で頻度の境目を動かせる（既定 20000）。
 *
 * ## 材料（すべて商用可・出典は設定の「出典」の頁に出す）
 *   ECDICT   … MIT              https://github.com/skywind3000/ECDICT
 *   CMUdict  … BSD(商用無制限)   https://github.com/cmusphinx/cmudict
 *   OpenCC   … Apache 2.0       簡体字 → 台湾正体字
 *   CEFR-J Wordlist … 商用可(出典明記) 東京外大 投野研
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CACHE = process.env.LEXICON_CACHE || "/tmp/lex";
const SOURCES = {
  ecdict: {
    url: "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
    file: "ecdict.csv",
  },
  cmudict: {
    url: "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict",
    file: "cmudict.dict",
  },
};

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function fetchSources() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const [name, s] of Object.entries(SOURCES)) {
    const dest = path.join(CACHE, s.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`· ${name} は既にある (${fs.statSync(dest).size} bytes)`);
      continue;
    }
    console.log(`↓ ${name} …`);
    const res = await fetch(s.url);
    if (!res.ok) die(`${name} を落とせない: ${res.status} ${res.statusText}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`✓ ${name} (${fs.statSync(dest).size} bytes)`);
  }
}

function readCache(file) {
  const p = path.join(CACHE, file);
  if (!fs.existsSync(p)) die(`${p} が無い。先に \`node scripts/import-lexicon.mjs fetch\` を実行`);
  return fs.readFileSync(p, "utf8");
}

/**
 * 簡体字 → 台湾正体字。
 *
 * **無ければ止まる。** 黙って簡体字のまま入れると、台湾の学習者の画面に
 * 簡体字の語釈が 3〜4万語ぶん並ぶ。後から気づいて直すのは非常に高くつく。
 */
async function loadConverter() {
  let OpenCC;
  try {
    OpenCC = await import("opencc-js");
  } catch {
    die("opencc-js が入っていない。`npm i -D opencc-js` を先に実行");
  }
  // cn（簡体）→ twp（台湾正体・台湾の言い回しも直す）
  const convert = OpenCC.Converter({ from: "cn", to: "twp" });
  // **通ることを先に確かめる。** 変換器が黙って素通しでも気づけない。
  const probe = convert("自行车");
  if (probe === "自行车") die("OpenCC が変換していない（簡体字のまま返ってきた）");
  return convert;
}

/** CEFR-J の json（`[[headword, pos, cefr], …]`）を読む。無ければ空。 */
function loadCefrj(lib) {
  const p = arg("cefrj");
  if (!p) {
    console.warn(
      "! CEFR-J を渡していない。**全部の語が級外になる**。\n" +
        "  公式の級を使うなら --cefrj <json> を付ける。",
    );
    return new Map();
  }
  if (!fs.existsSync(p)) die(`${p} が無い`);
  const rows = JSON.parse(fs.readFileSync(p, "utf8")).map((r) =>
    Array.isArray(r) ? { headword: r[0], pos: r[1], cefr: r[2] } : r,
  );
  const idx = lib.buildCefrjIndex(rows);
  console.log(`· CEFR-J: ${rows.length} 行 → 見出し ${idx.size} 語ぶんの公式の級`);
  return idx;
}

/** CMUdict を「語 → 米式 IPA」の表にする。 */
function loadCmudict(lib) {
  const text = readCache(SOURCES.cmudict.file);
  const map = new Map();
  for (const line of text.split("\n")) {
    const got = lib.parseCmudictLine(line);
    if (got && !map.has(got.word)) map.set(got.word, got.ipa);
  }
  console.log(`· CMUdict: ${map.size} 語の米式発音`);
  return map;
}

async function build() {
  // 純粋な判断は全部あちら側。ここは呼ぶだけ。
  const lib = await import("../src/lib/lexicon-import.ts");
  const convert = await loadConverter();
  const cefrj = loadCefrj(lib);
  const ipaUsMap = loadCmudict(lib);

  const text = readCache(SOURCES.ecdict.file);
  const limit = Number(arg("limit", "0")) || Infinity;
  const policy = { freqTop: Number(arg("freq-top", "20000")) };

  let header = null;
  let seen = 0;
  let kept = 0;
  const rows = [];
  const stats = {
    // `null`(級外)も鍵として数える。数えないと「級外がいくつ出たか」が
    // 見えないまま流すことになる。
    byLevel: new Map(),
    official: 0,
    none: 0,
    withIpaUs: 0,
    withForms: 0,
    phrases: 0,
    dropped: { headword: 0, gloss: 0, policy: 0, invalid: 0 },
  };

  for (const row of lib.csvRecords(text)) {
    if (!header) {
      header = row;
      continue;
    }
    seen++;
    const e = lib.rowToEntry(header, row);

    if (!lib.isImportableHeadword(e.word)) {
      stats.dropped.headword++;
      continue;
    }
    if (lib.cleanGloss(e.translation).length === 0) {
      stats.dropped.gloss++;
      continue;
    }
    const key = e.word.trim().toLowerCase();
    const official = cefrj.get(key) ?? null;
    if (!lib.shouldImport(e, policy, official)) {
      stats.dropped.policy++;
      continue;
    }

    const built = lib.toLexiconRow(e, {
      ipaUs: ipaUsMap.get(key) ?? null,
      glossTranslate: convert,
      officialLevel: official,
    });
    if (!lib.isValidRow(built)) {
      stats.dropped.invalid++;
      continue;
    }

    rows.push(built);
    kept++;
    stats.byLevel.set(built.level_step, (stats.byLevel.get(built.level_step) ?? 0) + 1);
    if (official != null) stats.official++;
    else stats.none++;
    if (built.reading_primary) stats.withIpaUs++;
    if (built.forms) stats.withForms++;
    if (built.entry_type === "phrase") stats.phrases++;
    if (kept >= limit) break;
  }

  console.log(`\n読んだ ${seen} 件 → 入れる ${kept} 語`);
  console.log("落とした:", stats.dropped);
  console.log(
    "級の散らばり:",
    [...stats.byLevel]
      .sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99))
      .map(([k, v]) => `${k == null ? "級外" : ["A1", "A2", "B1", "B2", "C1", "C2"][k - 1]}=${v}`)
      .join(" "),
  );
  console.log(
    `公式の級 ${stats.official} / 級外 ${stats.none}` +
      ` · 米式発音あり ${stats.withIpaUs} · 活用あり ${stats.withForms} · 言い回し ${stats.phrases}`,
  );
  return rows;
}

/** SQL の文字列にする。`'` を2つにするだけ。 */
function q(v) {
  if (v == null) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function toSql(rows) {
  const out = [];
  out.push("-- 英語の種辞書。scripts/import-lexicon.mjs が書き出した。");
  out.push(
    "-- ECDICT (MIT) / CMUdict (BSD) / OpenCC (Apache 2.0) / CEFR-J Wordlist (東京外大 投野研)",
  );
  out.push("begin;");
  // **一度に投げない。** 3〜4万行を1文にすると、途中で落ちたとき
  // どこまで入ったのか分からなくなる。
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows
      .slice(i, i + CHUNK)
      .map(
        (r) =>
          `(${[
            q(r.headword),
            q(r.language),
            q(r.reading_primary),
            q(r.reading_alt),
            q(JSON.stringify(r.meanings)),
            q(r.pos),
            r.level_step,
            r.freq_rank ?? "null",
            r.exam_tags.length ? `array[${r.exam_tags.map(q).join(",")}]::text[]` : "null",
            r.forms ? q(JSON.stringify(r.forms)) : "null",
            q(r.entry_type),
            q(r.source),
            q(r.notes),
          ].join(",")})`,
      );
    out.push(
      "insert into public.dictionary_entries " +
        "(headword, language, reading_primary, reading_alt, meanings, pos, level_step, " +
        "freq_rank, exam_tags, forms, entry_type, source, notes) values",
      values.join(",\n"),
      // **入れ直しても壊さない。** 同じ語を二度流しても、後から人が
      // 直した行(source='verified')は上書きしない。
      "on conflict (language, headword, entry_type) do update set",
      "  reading_primary = coalesce(excluded.reading_primary, dictionary_entries.reading_primary),",
      "  reading_alt     = coalesce(excluded.reading_alt,     dictionary_entries.reading_alt),",
      "  meanings        = dictionary_entries.meanings || excluded.meanings,",
      "  pos             = coalesce(dictionary_entries.pos, excluded.pos),",
      "  level_step      = excluded.level_step,",
      "  freq_rank       = excluded.freq_rank,",
      "  exam_tags       = excluded.exam_tags,",
      "  forms           = coalesce(excluded.forms, dictionary_entries.forms),",
      "  notes           = excluded.notes",
      "where dictionary_entries.source <> 'verified';",
    );
  }
  out.push("commit;");
  return out.join("\n");
}

/**
 * 設定の「辞書管理」の欄に貼る CSV。
 *
 * ## なぜ SQL ではなく CSV なのか
 * オーナーは Supabase に直接触れない（何度も言われている）。辞書は
 * **アプリの中の取り込み欄**から入れる。だから欄が読める形で出す。
 *
 * ## 5,000行ずつに割る
 * server の上限が1回 5,000行。25,595語なら6つに割れる。
 * 1つのファイルを1回ぶんにして、貼る側が数えなくて済むようにする。
 */
function toCsv(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // カンマ・引用符・改行を含む値は必ず括る。中文の語釈は改行を含む。
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "headword",
    "reading_primary",
    "reading_alt",
    "meanings",
    "pos",
    "level_step",
    "freq_rank",
    "exam_tags",
    "forms",
    "entry_type",
    "source",
    "notes",
  ];
  const body = rows.map((r) =>
    [
      r.headword,
      r.reading_primary,
      r.reading_alt,
      // JSON の欄。空なら空文字（`{}` を書くと「意味がある」に見える）。
      r.meanings && Object.keys(r.meanings).length > 0 ? JSON.stringify(r.meanings) : "",
      r.pos,
      r.level_step,
      r.freq_rank,
      r.exam_tags && r.exam_tags.length > 0 ? r.exam_tags.join("|") : "",
      r.forms && Object.keys(r.forms).length > 0 ? JSON.stringify(r.forms) : "",
      r.entry_type,
      r.source,
      r.notes,
    ]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...body].join("\n") + "\n";
}

/**
 * **級を書き出す道は CEFR-J が要る。**
 *
 * オーナー指示 2026-08-26 で頻度からの見積もりをやめたので、CEFR-J を
 * 渡さずに流すと**全部の語が級外**になる。それを黙って書き出すと、
 * 既に入っている公式の級を級外で上書きしてしまう
 * (`toSql` の `level_step = excluded.level_step`)。
 *
 * 中身を見るだけの `build` は通す — 材料が揃っているかを確かめる道を
 * 塞ぐと、何が足りないのかを調べる手立てが無くなる。
 */
function requireCefrj(cmd) {
  if (arg("cefrj")) return;
  die(
    [
      `${cmd} は --cefrj が要る。`,
      "",
      "  頻度からの級の見積もりはやめた(オーナー指示 2026-08-26)。",
      "  CEFR-J を渡さないと全部の語が級外になり、いま入っている",
      "  公式の級を級外で上書きしてしまう。",
      "",
      "  CEFR-J Wordlist から作った json を渡す:",
      `    ${cmd} --cefrj /path/to/cefrj.json`,
      "",
      "  形: [{ headword, pos, cefr }] (cefr は A1〜B2)",
    ].join("\n"),
  );
}

const cmd = process.argv[2];
if (cmd === "fetch") {
  await fetchSources();
} else if (cmd === "build") {
  await build();
} else if (cmd === "sql") {
  requireCefrj("sql");
  const rows = await build();
  const dest = arg("out");
  const sql = toSql(rows);
  if (dest) {
    fs.writeFileSync(dest, sql);
    console.error(`\n✓ ${dest} に書いた (${rows.length} 行, ${sql.length} bytes)`);
  } else {
    process.stdout.write(sql);
  }
} else if (cmd === "csv") {
  requireCefrj("csv");
  const rows = await build();
  const dest = arg("out") || path.join(CACHE, "lexicon");
  // 1回に貼れるのは 5,000行まで（server の上限）。
  const per = Number(arg("per", "5000"));
  const parts = [];
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const file = `${dest}-${String(parts.length + 1).padStart(2, "0")}.csv`;
    fs.writeFileSync(file, toCsv(chunk));
    parts.push({ file, n: chunk.length });
  }
  console.error(`\n✓ ${parts.length} 個に分けて書いた（1つ ${per} 行まで）:`);
  for (const p of parts) console.error(`   ${p.file}  ${p.n} 行`);
  console.error(`\n  設定 → 辞書管理 → 言語に「英語」を選んでから、順に貼る。`);
} else if (cmd === "json") {
  requireCefrj("json");
  const rows = await build();
  const dest = arg("out") || path.join(CACHE, "lexicon.ndjson");
  fs.writeFileSync(dest, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.error(`\n✓ ${dest} に書いた (${rows.length} 行)`);
} else {
  console.error(
    [
      "使い方（node ではなく vite-node で動かす）:",
      "  V=node_modules/.bin/vite-node",
      "  $V scripts/import-lexicon.mjs -- fetch                 材料を落とす",
      "  $V scripts/import-lexicon.mjs -- build [--cefrj x.json]  中身を見る",
      "  $V scripts/import-lexicon.mjs -- sql   --cefrj x.json [--out x.sql]  入れる SQL",
      "  $V scripts/import-lexicon.mjs -- csv   --cefrj x.json [--out x]      取り込み欄に貼る CSV",
      "  $V scripts/import-lexicon.mjs -- json  --cefrj x.json [--out x.ndjson]  1行1件",
      "",
      "  級は CEFR-J だけが決める(頻度からの見積もりはやめた)。",
      "  書き出す3つは --cefrj が要る — 渡さないと全部級外になり、",
      "  いま入っている公式の級を上書きしてしまう。",
      "",
      "  --limit N      N 語で止める（試すとき）",
      "  --freq-top N   頻度の境目（既定 20000）",
    ].join("\n"),
  );
  process.exit(1);
}
