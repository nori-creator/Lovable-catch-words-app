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
/**
 * 埋まっていることを求める言語。
 * `src/lib/i18n.tsx` の `UI_LANGS` と**必ず同じにすること**。
 */
const LANGS = ["ja", "en", "zh-TW"];

/**
 * 定義済みのキーを集める。`"a.b": {` の形だけを見る。
 * 同じキーが2回書かれていたら、その場で問題として返す
 * (2つ目が勝つので、直したつもりの文言が出ない)。
 */
function definedKeys(problems) {
  const s = fs.readFileSync(DICT_FILE, "utf8");
  const set = new Set();
  for (const m of s.matchAll(/^\s{2}"([\w.]+)":\s*\{/gm)) {
    if (set.has(m[1])) {
      const line = s.slice(0, m.index).split("\n").length;
      problems.push(`${DICT_FILE}:${line}  同じキーが2回: ${m[1]}`);
    }
    set.add(m[1]);
  }
  return set;
}

/**
 * ja と en と zh-TW が**全部**埋まっているかを見る。
 *
 * ## なぜ要るか
 * 片方が抜けていても `t()` は落ちない。`DICT[key]?.[lang] ?? DICT[key]?.ja`
 * と書いてあるので、**en が無ければ黙って日本語が出る**。英語で使っている
 * 人には、アプリのどこかで急に日本語が現れる。
 *
 * 実際そうなっていた: 既定の待ち画面(v0_cutout)の文言が日本語で直書き
 * されていて、英語のユーザーはアプリの見せ場で日本語を見ていた。
 * 直書きは目で気づけたが、辞書に ja だけ入れる形だと目でも気づけない。
 */
function incompleteEntries() {
  const s = fs.readFileSync(DICT_FILE, "utf8");
  const out = [];
  // `"key": { ... }` の1エントリぶんを、対応する閉じ括弧まで拾う。
  for (const m of s.matchAll(/^\s{2}"([\w.]+)":\s*\{/gm)) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = s.slice(start, end + 1);
    const line = s.slice(0, m.index).split("\n").length;
    // 2026-08-25: 繁體中文を足した。**ここを広げないと**、訳し忘れた項目が
    // 日本語のまま台湾の人の画面に出て、誰も気づかない(下の en の事故と同じ形)。
    for (const lang of LANGS) {
      // **引用符は3種類ある。** 最初これを二重引用符だけで見ていて、
      // `en: 'Photo of "{word}"'` の形(中に二重引用符があるので単引用符で
      // 書いてある)を9件まとめて「en が無い」と誤って報告した。
      // 検査が嘘をつくと、直す必要のないものを直しに行くことになる。
      // `zh-TW` は識別子にできないので `"zh-TW":` と引用符つきで書く。
      // `\b` は引用符の前では効かないので、鍵の書き方ごと組み立てる。
      const key = /^[a-z]+$/.test(lang) ? `\\b${lang}:` : `"${lang}":`;
      const has = new RegExp(`${key}\\s*("|'|\`)`).test(body);
      if (!has) out.push(`${DICT_FILE}:${line}  ${m[1]} に ${lang} が無い`);
      // 空文字(`en: ""`)は**わざと**であることがある(単位の接尾辞など、
      // 英語では何も付けないもの)。書いてあるなら選択とみなして通す。
      // 見るのは「鍵ごと無い」= 足し忘れだけ。
    }
  }
  return out;
}

/** 仮名・漢字。約物や英数字は含めない。 */
const JA = "\\u3041-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9fff\\u3005\\u30fc";

/**
 * 和文の中の**半角の約物**を見る。
 *
 * ## なぜ要るか
 * 和文の「?」「!」は全角が正しい。半角だと字面が上に浮き、前の字と
 * ベタに詰まる — 「正解!」と「正解！」を並べれば分かる。純正の日本語UIに
 * 半角の疑問符・感嘆符は出てこない。独立監査(書体)がこれを指摘し、
 * 実際に撮った絵で確認できた。
 *
 * 括弧は**中身で決める**。`(zh-TW)` `(例 openai:gpt-5)` `({env} 未設定)` の
 * ように英数字が入るものは半角のままが正しいので、
 * **中身が全部和文のときだけ**全角にする。一律に置換すると、
 * 英字を全角括弧で囲んだ見苦しい形が増える。
 *
 * コロンは見ない。「シーン: {s}」の形は和文UIでも広く使われていて、
 * 全角にすると却って間延びする。規則にできないものを規則にしない。
 *
 * en は対象外 — 英語は半角が正しい。
 */
function halfWidthPunctuation() {
  const s = fs.readFileSync(DICT_FILE, "utf8");
  const out = [];
  for (const m of s.matchAll(/^\s{2}"([\w.]+)":\s*\{/gm)) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = s.slice(start, end + 1);
    const line = s.slice(0, m.index).split("\n").length;
    const ja = body.match(/\bja:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!ja) continue;
    if (new RegExp(`[${JA}][?!]`).test(ja)) {
      out.push(`${DICT_FILE}:${line}  ${m[1]} 和文のあとに半角の ? / ! : ${ja}`);
    }
    // 中身が全部和文(と読点・中黒)の括弧だけを見る。
    if (new RegExp(`\\([${JA}、。・…]+\\)`).test(ja)) {
      out.push(`${DICT_FILE}:${line}  ${m[1]} 和文だけの括弧が半角: ${ja}`);
    }
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const problems = [];
const defined = definedKeys(problems);
problems.push(...incompleteEntries());
problems.push(...halfWidthPunctuation());
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
  console.error(`翻訳の問題 ${problems.length}件:`);
  for (const p of problems) console.error("  - " + p);
  console.error(
    "\n未定義のキーは画面にキー名がそのまま出る。" +
      "en が抜けていると、英語のユーザーにそこだけ日本語が出る。",
  );
  process.exit(1);
}
console.log(`翻訳キー: 問題なし(定義 ${defined.size}件)`);
