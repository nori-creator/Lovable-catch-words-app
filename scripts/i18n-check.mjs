/**
 * 使っている翻訳キーが全部定義されているかを見る。
 *
 * ## なぜ要るか
 * `t()` は未定義のキーを渡されると**キー名そのものを返す**
 * (i18n.tsx: `DICT[key]?.[lang] ?? DICT[key]?.ja ?? key`)。
 * 画面は壊れず、赤くもならず、ただ `dex.shelfEmpty` という文字列が出る。
 * 型でも lint でもビルドでも捕まらない。
 *
 * 実際これで事故った: 棚を作ったとき3つのキーを足したつもりが、整形後の
 * 文字列を置換しようとして失敗しており、**既定の図鑑画面にキー名が出た**まま
 * push した。目視でも気づけなかった(空の棚を見ていなかった)。
 * 人間の注意力ではなく、機械で止める。
 *
 * ## 使い方
 *   node scripts/i18n-check.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
const DICT_FILE = "src/lib/i18n.tsx";

/** 定義済みのキーを集める。`"a.b": {` の形だけを見る。 */
function definedKeys() {
  const s = fs.readFileSync(DICT_FILE, "utf8");
  return new Set([...s.matchAll(/^\s{2}"([\w.]+)":\s*\{/gm)].map((m) => m[1]));
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const defined = definedKeys();
const problems = [];
/** 動的に組み立てるキー(`t(\`cat.${x}\`)`)は前置きだけ見て、接頭辞の存在を確かめる。 */
const prefixes = new Set([...defined].map((k) => k.split(".")[0]));

for (const file of walk(SRC)) {
  if (file === DICT_FILE) continue;
  const src = fs.readFileSync(file, "utf8");

  // 1. 素のキー: t("a.b") / tStatic("a.b")
  for (const m of src.matchAll(/\bt(?:Static)?\(\s*"([\w.]+)"/g)) {
    if (!defined.has(m[1])) {
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(`${file}:${line}  未定義のキー: ${m[1]}`);
    }
  }
  // 2. 組み立てるキー: t(`a.${x}`) — 接頭辞が辞書に無ければ確実に間違い
  for (const m of src.matchAll(/\bt(?:Static)?\(\s*`([\w.]*?)\$\{/g)) {
    const prefix = m[1].replace(/\.$/, "");
    if (prefix && !prefixes.has(prefix.split(".")[0])) {
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(`${file}:${line}  未定義の接頭辞: ${prefix}.*`);
    }
  }
}

if (problems.length) {
  console.error(`翻訳キーの不足 ${problems.length}件:`);
  for (const p of problems) console.error("  - " + p);
  console.error("\n未定義のキーは画面にキー名がそのまま出る。src/lib/i18n.tsx に足すこと。");
  process.exit(1);
}
console.log(`翻訳キー: 問題なし(定義 ${defined.size}件)`);
