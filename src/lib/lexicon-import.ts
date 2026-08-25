/**
 * 英語の**種辞書**を作る所（第3段）。
 *
 * オーナー指示 2026-08-24:
 * > 「カードの解説や復習の解説や日記の解説が**ユーザーにストレスを感じさせない
 * >  速度**で実行したい。…あなたが自動的に取得できる資料やデータは**全て実行**
 * >  してほしい。」
 *
 * ## なぜ辞書を先に入れるのか
 * 英語は**層0がとても強い**。ECDICT が意味・発音・品詞・活用・頻度・検定タグを
 * 1つのデータに持っていて、ライセンスが MIT。つまり
 * **AI 呼び出しゼロで**カードの上半分が出る。街で撮った瞬間に意味と発音が出る
 * かどうかは、ここに語が入っているかで決まる。
 *
 * ## 使うデータ（すべて商用可・確認済み）
 *
 * | データ | 何が入っているか | ライセンス |
 * |---|---|---|
 * | ECDICT `ecdict.csv` | 英→中の意味・英式の発音・品詞・**活用**・BNC/COCA 頻度・Collins 星・Oxford3000・**検定タグ** 77万語 | MIT |
 * | CMUdict | **アメリカ英語**の発音 13.4万語 | BSD（商用無制限） |
 * | OpenCC | 簡体字 → **台湾正体字** | Apache 2.0 |
 *
 * 台湾の学習者に簡体字の語釈を出すわけにはいかないので、ECDICT の中文は
 * OpenCC で正体字へ変換してから入れる（変換は取り込みの道具側の仕事）。
 *
 * ## ここに入れる物・入れない物
 * **判断は全部ここ。** 取り込みの道具（`scripts/import-lexicon.mjs`）は
 * 落として・流して・書くだけにする。3〜4万語を1回流すだけの処理でも、
 * 判断が道具の中にあると**間違いに気づく手が無い**（1回きりなので、
 * おかしな級が付いた語を後から見つけるのは事実上むり）。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import { LEVEL_INDEXES, type LevelIndex } from "./level-scale";
import { CHINESE_EXPLANATION_LANGUAGE } from "./target-lang";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * 引用符つき CSV を1件ずつ返す。
 *
 * **行で切ってはいけない。** ECDICT の語釈は引用符の中に改行を持つので、
 * `split("\n")` で切ると1つの語が何件にも割れる（実際 77万件のデータが
 * 77万行にならない — 数えたら 770,612 行で 770,611 件だった）。
 */
export function* csvRecords(text: string): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        // 引用符の中の `""` は引用符そのもの。
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      yield row;
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** 見出しの並びと1件を突き合わせて、名前で引ける形にする。 */
export function rowToEntry(header: readonly string[], row: readonly string[]): EcdictRaw {
  const out: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) out[header[i]] = row[i] ?? "";
  return out as EcdictRaw;
}

/** ECDICT の1件（列名はデータの見出しそのまま）。 */
export type EcdictRaw = {
  word: string;
  phonetic: string;
  definition: string;
  translation: string;
  pos: string;
  collins: string;
  oxford: string;
  tag: string;
  bnc: string;
  frq: string;
  exchange: string;
};

// ---------------------------------------------------------------------------
// ECDICT の癖を直す
// ---------------------------------------------------------------------------

/**
 * ECDICT は改行を**文字どおりの `\n` 2文字**で持っている。
 *
 * そのまま画面に出すと「n. 水, 雨水\nvt. 給...澆水」と出る。
 * 実際そう出るまで気づけない種類の傷なので、入口で直す。
 */
export function unescapeEcdict(text: string): string {
  return (text ?? "").replace(/\\r\\n|\\n|\\r/g, "\n");
}

/**
 * 語釈を行に割って、**当てにならない行を落とす**。
 *
 * `[网络]` は web から拾った語釈で、辞書として使うには質が揃っていない
 * （"'hood" の語釈が「胡德；兜帽；引擎盖」になる）。
 * `[计]`（計算機）のような分野の印は**残す** — 分野が分かるほうが役に立つ。
 *
 * **空になったら空を返す。** 無理に1行残すと、当てにならない行が
 * 唯一の語釈として画面に出る。
 */
export function cleanGloss(raw: string): string[] {
  return unescapeEcdict(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !l.startsWith("[网络]") && !l.startsWith("[網絡]"));
}

/**
 * ECDICT の発音表記を IPA に直す。
 *
 * ECDICT の `phonetic` は IPA のようで IPA ではない:
 *
 *   - `ә` が **U+04D9（キリル文字のシュワー）**。IPA の `ə` は U+0259。
 *     見た目がほぼ同じなので目では気づけない。読み上げにも検索にも効く。
 *   - 長音が `:`（コロン）。IPA は `ː` U+02D0。
 *   - 強勢が `'` と `.`。IPA は `ˈ` U+02C8 と `ˌ` U+02CC。
 *
 * **これは英式寄りの表記。** アメリカ英語が既定（オーナー決定 2026-08-24）
 * なので、米式は CMUdict から作り、こちらは第二の読みに回す。
 */
export function normalizeIpa(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s
    .replace(/ә/g, "ə") // キリル ә → IPA ə
    .replace(/ӛ/g, "ə")
    .replace(/:/g, "ː") // : → ː
    .replace(/'/g, "ˈ") // ' → ˈ
    .replace(/’/g, "ˈ")
    .replace(/^\./, "ˌ") // 先頭の . → ˌ
    .replace(/(?<=[\sˈ])\./g, "ˌ")
    .trim();
}

// ---------------------------------------------------------------------------
// 活用
// ---------------------------------------------------------------------------

/**
 * 語形の変化。**英語にあって中国語に無い**項目（`target-profile.ts` の `forms`）。
 *
 * ECDICT の `exchange` から**AI 呼び出しゼロ**で入る。
 */
export type WordForms = {
  /** 複数形 */
  plural?: string;
  /** 過去形 */
  past?: string;
  /** 過去分詞 */
  pastParticiple?: string;
  /** 現在分詞・動名詞 */
  ing?: string;
  /** 三人称単数現在 */
  third?: string;
  /** 比較級 */
  comparative?: string;
  /** 最上級 */
  superlative?: string;
  /** 原形（この語が変化形のとき、その元） */
  lemma?: string;
};

/**
 * `s:bicycles/p:bicycled/i:bicycling/d:bicycled/3:bicycles` を解く。
 *
 * ECDICT の記号:
 *   `p` 過去 / `d` 過去分詞 / `i` 現在分詞 / `3` 三単現 / `r` 比較級 /
 *   `t` 最上級 / `s` 複数 / `0` 原形 / `1` 原形に対するこの語の役
 *
 * `1` は「この語が原形のどの変化形か」を表す**種類の記号**（`d` など）で、
 * 語形そのものではない。**取り込まない** — 取り込むと画面の
 * 「過去分詞」の欄に `d` という1文字が出る。
 */
export function parseExchange(raw: string): WordForms {
  const out: WordForms = {};
  const map: Record<string, keyof WordForms> = {
    s: "plural",
    p: "past",
    d: "pastParticiple",
    i: "ing",
    "3": "third",
    r: "comparative",
    t: "superlative",
    "0": "lemma",
  };
  for (const part of (raw ?? "").split("/")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    const key = map[part.slice(0, at)];
    const value = part.slice(at + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 検定と級
// ---------------------------------------------------------------------------

/**
 * ECDICT が持っている検定の印。
 *
 * `zk` 中考 / `gk` 高考 / `cet4` `cet6` 大学英語 / `ky` 考研 /
 * `toefl` / `ielts` / `gre`。中国の試験が混ざっているが、
 * **語の難しさの目安としては使える**（zk の語は必ずやさしい）。
 */
export const EXAM_TAGS = ["zk", "gk", "cet4", "cet6", "ky", "toefl", "ielts", "gre"] as const;
export type ExamTag = (typeof EXAM_TAGS)[number];

/** 印を読む。知らない印は落とす（データが増えても静かに壊れない）。 */
export function parseExamTags(raw: string): ExamTag[] {
  const known = new Set<string>(EXAM_TAGS);
  const seen = new Set<ExamTag>();
  for (const t of (raw ?? "").split(/\s+/)) {
    const v = t.trim().toLowerCase();
    if (known.has(v)) seen.add(v as ExamTag);
  }
  // 並びを固定する。順が揺れると、同じ語を入れ直すたびに差分が出る。
  return EXAM_TAGS.filter((t) => seen.has(t));
}

/** 順位を読む。`0` と空は「順位が無い」＝ `null`。 */
export function rankOf(raw: string | number | null | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 頻度の順位（COCA を先に、無ければ BNC）。 */
export function freqRank(e: Pick<EcdictRaw, "frq" | "bnc">): number | null {
  return rankOf(e.frq) ?? rankOf(e.bnc);
}

/**
 * CEFR の段（1〜6 = A1〜C2）を**見積もる**。
 *
 * ## これは公式の CEFR ではない
 * ECDICT に CEFR は入っていない。ここが出すのは
 * 「頻度と検定の印から見て、だいたいこのあたり」という目安。
 * **公式の対応表が手に入ったら（CEFR-J など）そちらで上書きする。**
 * だから取り込む行には出所を書いて、後から見分けられるようにしてある。
 *
 * ## 順位を主にする理由
 * 検定の印は**上限しか教えてくれない**。`toefl` が付いていても、
 * その語が B1 なのか C1 なのかは分からない。一方、頻度の順位は
 * 連続した目盛りで、語彙の習得順とよく合うことが知られている。
 * だから**順位で段を決め、印で上下に挟む**。
 *
 * ## 挟み方
 *   - `zk`（中考）… やさしい語だと分かっている → A2 まで
 *   - `gk` / `cet4` … → B1 まで
 *   - Oxford3000 … 定義上 A1〜B2 の語 → B2 まで
 *   - `gre` … 難しい語だと分かっている → C1 から
 *   - `toefl` / `ielts` / `cet6` / `ky` … → A2 から（入門の語ではない）
 *
 * **順位が無い語を最易に落とさない。** 順位が無いのは「珍しい」か
 * 「データに無い」のどちらかで、どちらにせよ A1 ではない。
 */
export function cefrStep(
  e: {
    frq?: string | number | null;
    bnc?: string | number | null;
    tag?: string;
    oxford?: string | number | null;
  },
  /**
   * CEFR-J が持っている**公式の級**。あれば見積もりより必ず優先する。
   * A1〜B2 しか無いので、C1/C2 の語はここが null のまま見積もりになる。
   */
  official?: LevelIndex | null,
): LevelIndex {
  if (official != null && (LEVEL_INDEXES as readonly number[]).includes(official)) {
    return official;
  }
  const rank = freqRank({ frq: String(e.frq ?? ""), bnc: String(e.bnc ?? "") });
  const tags = new Set(parseExamTags(e.tag ?? ""));
  const oxford = String(e.oxford ?? "") === "1";

  // 順位から素の段を出す。境目は「よく使う語ほど早く要る」形で、
  // 上に行くほど幅が広い（習得の伸びが対数に近いため）。
  let step: number;
  if (rank == null) {
    // **分からないものを最易にしない。** 見えていないだけの語を A1 に
    // 置くと、初心者の復習に固有名詞や専門語が混ざる。
    step = 5;
  } else if (rank <= 1000) step = 1;
  else if (rank <= 2000) step = 2;
  else if (rank <= 4000) step = 3;
  else if (rank <= 8000) step = 4;
  else if (rank <= 16000) step = 5;
  else step = 6;

  // 上限（これより難しくない、と分かっている印）
  if (tags.has("zk")) step = Math.min(step, 2);
  if (tags.has("gk") || tags.has("cet4")) step = Math.min(step, 3);
  if (oxford) step = Math.min(step, 4);

  // 下限（これよりやさしくない、と分かっている印）
  if (tags.has("gre")) step = Math.max(step, 5);
  if (tags.has("toefl") || tags.has("ielts") || tags.has("cet6") || tags.has("ky")) {
    step = Math.max(step, 2);
  }

  const clamped = Math.min(6, Math.max(1, Math.round(step)));
  return clamped as LevelIndex;
}

// ---------------------------------------------------------------------------
// CEFR-J Wordlist（**公式の級**）
// ---------------------------------------------------------------------------

/**
 * CEFR-J Wordlist の1行。
 *
 * オーナーが取得して渡してくれた（2026-08-24）。東京外大 投野研の成果物で、
 * **商用可・出典明記が条件**。出典は設定の「出典」の頁に出す。
 *
 * A1〜B2 の 7,988 行（見出し 7,035 語）。C1/C2 は CEFR-J の対象外なので、
 * そこは `cefrStep` の見積もりのまま。
 */
export type CefrjRow = { headword: string; pos: string; cefr: string };

/** CEFR の綴り → 段（1〜6）。知らない綴りは null。 */
export function cefrLabelToStep(label: string): LevelIndex | null {
  const m = (label ?? "")
    .trim()
    .toUpperCase()
    .match(/^([ABC])([12])$/);
  if (!m) return null;
  const band = ["A", "B", "C"].indexOf(m[1]);
  return (band * 2 + Number(m[2])) as LevelIndex;
}

/**
 * 見出し語 → 公式の級の表を作る。
 *
 * ## 同じ語に級が2つ以上あるとき、**やさしいほうを採る**
 * CEFR-J は品詞ごとに級を付けるので、`above`（前置詞 A1 / 副詞 B1）のように
 * 1つの見出しに複数の級が付く語が 578 語ある。この app は見出しごとに
 * 1つの級しか出せない（`dictionary_entries` が見出しで一意）。
 *
 * **難しいほうを採ると、その語が学習者の範囲から外れて出てこなくなる。**
 * 街で `above` を見た人が「まだ早い語」と言われるのはおかしい。
 * 出会うのは普通いちばん基本の意味なので、やさしいほうを採る。
 *
 * 見出しは小文字に揃える。CEFR-J には `A.M.` のような大文字の見出しがあり、
 * ECDICT 側は小文字なので、揃えないとほとんど当たらない。
 *
 * ## `/` は綴りの違いなので**1語ずつに分ける**
 * CEFR-J は米式と英式の綴りを1行にまとめている（**179行**ある）:
 *
 *   center/centre        A2
 *   behavior/behaviour   A2
 *   analyze/analyse      B1
 *   airplane/aeroplane   A1
 *   a.m./A.M./am/AM      A1
 *
 * まるごと鍵にすると `center` にも `centre` にも当たらず、**どちらも
 * 公式の級を失って見積もりに落ちる**。しかもここに並ぶのは
 * `center` `behavior` `apologize` のような**よく使う語**なので、
 * 落とすと効き目がいちばん大きい所を落とすことになる。
 *
 * 綴りが違うだけで同じ語・同じ級なので、全部に同じ級を配る。
 */
export function buildCefrjIndex(rows: readonly CefrjRow[]): Map<string, LevelIndex> {
  const out = new Map<string, LevelIndex>();
  for (const r of rows) {
    const step = cefrLabelToStep(r.cefr);
    if (step == null) continue;
    for (const variant of (r.headword ?? "").split("/")) {
      const key = variant.trim().toLowerCase();
      if (!key) continue;
      const prev = out.get(key);
      if (prev == null || step < prev) out.set(key, step);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 取り込むか
// ---------------------------------------------------------------------------

/** どれだけ入れるか。オーナー決定 2026-08-24「検定・頻出だけ」。 */
export type ImportPolicy = {
  /** 頻度の順位がここまでの語は入れる。 */
  freqTop: number;
};

export const DEFAULT_POLICY: ImportPolicy = { freqTop: 20_000 };

/**
 * 見出し語として通せる形か。
 *
 * ECDICT には見出しに使えない物が混ざっている: 接辞（`-ability`）、
 * アポストロフィ始まり（`'hood`）、多語の言い回し、固有名詞の地名
 * （`'s Gravenhage`）。**通すと図鑑に接辞が並ぶ。**
 *
 * 2語までの言い回し（`night market`）は通す — 街で見る語はむしろこちら。
 */
export function isImportableHeadword(word: string): boolean {
  const w = (word ?? "").trim();
  if (!w) return false;
  if (w.length > 32) return false;
  // 接辞・アポストロフィ始まり・数字混じりは落とす。
  if (!/^[A-Za-z]/.test(w)) return false;
  if (!/^[A-Za-z][A-Za-z'\- ]*$/.test(w)) return false;
  if (w.endsWith("-") || w.endsWith("'")) return false;
  return w.split(/\s+/).length <= 2;
}

/**
 * この語を種辞書に入れるか。
 *
 * オーナー決定「**検定・頻出だけ**（およそ3〜4万語）」。街で見る語は
 * ほぼ網羅でき、保存量は数十MBに収まる。ここに無い語は AI が補って
 * `word_explanations` に貯まるので、**入っていない＝使えない、ではない**。
 */
export function shouldImport(
  e: EcdictRaw,
  policy: ImportPolicy = DEFAULT_POLICY,
  /** CEFR-J が持っている公式の級（あれば必ず入れる）。 */
  official?: LevelIndex | null,
): boolean {
  if (!isImportableHeadword(e.word)) return false;
  // **中文の語釈が要る。** 入れるのは中文だけなので（上の `toLexiconRow` の
  // 注を見よ）、英英しか無い語を通すと意味が空の行になる。ここで落として
  // おかないと「入れるつもりが入らなかった語」が数に表れない。
  if (cleanGloss(e.translation).length === 0) return false;
  // **公式の級が付いている語は必ず入れる。**
  // 頻度と検定タグだけで切ると、`alarm clock`(A2) `air conditioning`(B1)
  // `babysitter`(B1) が落ちた（数えたら 435 語）。どれも街で撮る物で、
  // まさにこのアプリが要る語。一方で GRE の難語は 7,504 語まるごと通って
  // いた。**優先順位が逆さまだった。**
  if (official != null) return true;
  if (parseExamTags(e.tag).length > 0) return true;
  if (String(e.oxford ?? "") === "1") return true;
  const rank = freqRank(e);
  return rank != null && rank <= policy.freqTop;
}

// ---------------------------------------------------------------------------
// CMUdict（アメリカ英語の発音）
// ---------------------------------------------------------------------------

/** ARPABET の母音（強勢の数字が付く音）。 */
const ARPABET_VOWELS = new Set([
  "AA",
  "AE",
  "AH",
  "AO",
  "AW",
  "AY",
  "EH",
  "ER",
  "EY",
  "IH",
  "IY",
  "OW",
  "OY",
  "UH",
  "UW",
]);

/** ARPABET → IPA（アメリカ英語）。 */
const ARPABET_IPA: Record<string, string> = {
  AA: "ɑ",
  AE: "æ",
  AH: "ʌ",
  AO: "ɔ",
  AW: "aʊ",
  AY: "aɪ",
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  EH: "ɛ",
  ER: "ɝ",
  EY: "eɪ",
  F: "f",
  G: "ɡ",
  HH: "h",
  IH: "ɪ",
  IY: "i",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  OW: "oʊ",
  OY: "ɔɪ",
  P: "p",
  R: "ɹ",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  UH: "ʊ",
  UW: "u",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};

/**
 * 英語の頭に立てる子音の並び。
 *
 * 音節の切れ目を決めるのに要る。**「母音の直前で切る」では足りない** —
 * `bicycle`(B AY1 S IH0 K AH0 L) を母音の直前で切ると `baɪ.sɪ.kʌl` で
 * たまたま合うが、`extra`(EH1 K S T R AH0) は `ɛ.kstɹə` になってしまう
 * （`kstr` は英語の頭に立てない）。長く取れるだけ取って、
 * 立てられなくなったら残りは前の音節の終わりに置く。
 */
const ONSETS = new Set([
  "P L",
  "P R",
  "P Y",
  "B L",
  "B R",
  "B Y",
  "T R",
  "T W",
  "T Y",
  "D R",
  "D W",
  "D Y",
  "K L",
  "K R",
  "K W",
  "K Y",
  "G L",
  "G R",
  "G W",
  "F L",
  "F R",
  "F Y",
  "V Y",
  "TH R",
  "TH W",
  "SH R",
  "S L",
  "S P",
  "S T",
  "S K",
  "S M",
  "S N",
  "S W",
  "S F",
  "S P L",
  "S P R",
  "S T R",
  "S K R",
  "S K W",
  "S P Y",
  "S K Y",
  "HH Y",
  "M Y",
  "N Y",
  "L Y",
]);

function isLegalOnset(cluster: readonly string[]): boolean {
  if (cluster.length <= 1) return true;
  return ONSETS.has(cluster.join(" "));
}

/**
 * ARPABET の並びを音節に割る（最大限を頭に寄せる規則）。
 *
 * 母音と母音の間の子音は、**後ろの音節の頭に立てられるだけ立てる**。
 * 立てられない分だけ前の音節の終わりに残す。英語の音節の切り方として
 * 広く使われている規則で、強勢の印を正しい位置に置くのに要る。
 */
export function syllabify(phones: readonly string[]): string[][] {
  const vowelAt: number[] = [];
  for (let i = 0; i < phones.length; i++) {
    if (ARPABET_VOWELS.has(stripStress(phones[i]))) vowelAt.push(i);
  }
  // 母音が1つも無い（"'s" など）ときは割らない。
  if (vowelAt.length === 0) return phones.length ? [[...phones]] : [];

  const cuts: number[] = [0];
  for (let v = 0; v + 1 < vowelAt.length; v++) {
    const start = vowelAt[v] + 1;
    const end = vowelAt[v + 1];
    const between = phones.slice(start, end).map(stripStress);
    // 全部を頭に寄せてみて、だめなら1つずつ前へ渡す。
    let take = between.length;
    while (take > 0 && !isLegalOnset(between.slice(between.length - take))) take--;
    // 母音が続くとき（between が空）は母音の直前で切る。
    cuts.push(end - take);
  }
  cuts.push(phones.length);

  const out: string[][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piece = phones.slice(cuts[i], cuts[i + 1]);
    if (piece.length) out.push(piece);
  }
  return out;
}

/** 強勢の数字を外す（`AH0` → `AH`）。 */
export function stripStress(phone: string): string {
  return phone.replace(/[0-2]$/, "");
}

/** 強勢の強さ（0 無強勢 / 1 主 / 2 副）。母音でなければ null。 */
export function stressOf(phone: string): 0 | 1 | 2 | null {
  const m = phone.match(/([0-2])$/);
  return m ? (Number(m[1]) as 0 | 1 | 2) : null;
}

/**
 * CMUdict の音素の並びを IPA（アメリカ英語）にする。
 *
 * ## 無強勢の `AH` は `ə`
 * CMUdict は `about` を `AH0 B AW1 T` と書く。`AH` をそのまま `ʌ` にすると
 * `ʌˈbaʊt` になるが、実際は `əˈbaʊt`。**シュワーは英語の発音の要**で、
 * ここを間違えると「通じるかどうか」に直に効く（`target-profile.ts` が
 * 英語に `stress` の欄を置いているのと同じ理由）。
 * `ER0` も同じで `ɝ` ではなく `ɚ`。
 *
 * ## 強勢の印は音節の頭に置く
 * 母音の直前に置くと `bicycle` が `baɪsˈɪkəl` のようになる。
 * 音節に割ってから頭に置く。
 */
export function arpabetToIpa(phones: readonly string[]): string {
  const syllables = syllabify(phones);
  if (syllables.length === 0) return "";
  const single = syllables.length === 1;
  const parts: string[] = [];
  for (const syl of syllables) {
    let mark = "";
    let body = "";
    for (const p of syl) {
      const bare = stripStress(p);
      const stress = stressOf(p);
      if (stress === 1) mark = "ˈ";
      else if (stress === 2 && mark === "") mark = "ˌ";
      body += ipaOf(bare, stress);
    }
    // 1音節の語に強勢の印は付けない（`cat` を `ˈkæt` とは書かない）。
    parts.push(single ? body : mark + body);
  }
  return parts.join("");
}

function ipaOf(bare: string, stress: 0 | 1 | 2 | null): string {
  if (stress === 0) {
    // 無強勢のシュワー。ここを落とすと英語らしさが丸ごと消える。
    if (bare === "AH") return "ə";
    if (bare === "ER") return "ɚ";
  }
  return ARPABET_IPA[bare] ?? "";
}

/**
 * CMUdict の1行を読む。
 *
 * 形は `word  P H O N E S` か `word(2)  P H O N E S`（2つ目以降の読み）。
 * `;;;` で始まる行は説明。
 *
 * **2つ目以降の読みは取らない。** 1つの語に読みを2つ並べると、
 * どちらを覚えればいいのか分からない画面になる。
 */
export function parseCmudictLine(line: string): { word: string; ipa: string } | null {
  const s = (line ?? "").trim();
  if (!s || s.startsWith(";;;")) return null;
  const at = s.indexOf(" ");
  if (at <= 0) return null;
  const head = s.slice(0, at);
  if (/\(\d+\)$/.test(head)) return null;
  // CMUdict の行末にはコメント（`# ...`）が付くことがある。
  const rest = s.slice(at + 1).split("#")[0];
  const phones = rest.trim().split(/\s+/).filter(Boolean);
  if (phones.length === 0) return null;
  const ipa = arpabetToIpa(phones);
  if (!ipa) return null;
  return { word: head.toLowerCase(), ipa };
}

// ---------------------------------------------------------------------------
// 行を作る
// ---------------------------------------------------------------------------

/**
 * 級の出所の印。**短くする** — 語ごとに繰り返されるので、
 * 1文字が 25,595 倍になる。
 */
export const LEVEL_SOURCE = {
  /** CEFR-J Wordlist に載っていた語（公式の級）。 */
  official: "cefrj",
  /** 頻度と検定タグからの見積もり（CEFR-J に無い C1/C2 など）。 */
  estimated: "est",
} as const;

/** `dictionary_entries` に入れる形（言語中立の列を使う）。 */
export type LexiconRow = {
  headword: string;
  language: string;
  /** 既定の読み。英語はアメリカ英語の IPA。 */
  reading_primary: string | null;
  /** 第二の読み。英語はイギリス英語寄りの IPA。 */
  reading_alt: string | null;
  /** 読む人の言語ごとの意味（鍵は解説を書いた言語）。 */
  meanings: Record<string, string>;
  pos: string | null;
  level_step: number;
  freq_rank: number | null;
  exam_tags: string[];
  forms: WordForms | null;
  entry_type: "word" | "phrase";
  source: "dict";
  notes: string | null;
};

/**
 * 品詞を短く整える。
 *
 * ECDICT の `pos` は `n:56/v:44` のような**割合**で、空のことも多い。
 * 実際に品詞が読めるのは語釈の先頭（`n. 自行车`）なので、そちらから取る。
 */
export function posOf(e: EcdictRaw): string | null {
  for (const line of cleanGloss(e.translation).concat(cleanGloss(e.definition))) {
    const m = line.match(/^([a-z]{1,5}\.)/i);
    if (m) return m[1].toLowerCase();
  }
  const m = (e.pos ?? "").match(/^([a-z]+):/i);
  return m ? `${m[1].toLowerCase()}.` : null;
}

/**
 * 取り込む1行を作る。
 *
 * ## 英英の語釈は入れない
 * ECDICT の `definition` は WordNet と 1913年版 Webster の混ざりで、
 * **語義の並び順が当てにならない**。実際のデータを見て決めた:
 *
 *   phone → "an individual sound unit of speech"（音声学の「音」。電話ではない）
 *   the   → "v. i. See Thee."（古い辞書の見出し）
 *
 * 街で電話を撮った人に「音声学の音」と出るのは、速さ以前に**間違い**。
 * 古い言い回しが出る行も 3%（778行）あった。
 *
 * 中文の語釈（`translation`）のほうは学習者向けに整理されていて、
 * 並び順も素直（phone → 電話, 受話器, 耳機）。**こちらだけを入れる。**
 * 英英が要る級の学習者には、後から別の出所（語義の順位を持つ
 * Open English WordNet など）で足すか、AI に書かせるほうが正確。
 *
 * @param glossTranslate 簡体字 → 台湾正体字。**呼ぶ側が渡す** — 変換の表は
 *   外から来る物（OpenCC）なので、ここでは持たない。渡されなければ
 *   変換しない（**黙って簡体字を入れない**ように、道具の側が必ず渡す）。
 */
export function toLexiconRow(
  e: EcdictRaw,
  opts: {
    /** その語のアメリカ英語の読み（CMUdict から。無ければ null）。 */
    ipaUs?: string | null;
    /** 簡体字を台湾正体字にする。 */
    glossTranslate: (s: string) => string;
    /** CEFR-J の公式の級（あれば見積もりより優先）。 */
    officialLevel?: LevelIndex | null;
  },
): LexiconRow {
  const zh = cleanGloss(e.translation).map(opts.glossTranslate).join("\n");
  const meanings: Record<string, string> = {};
  // 鍵は**解説を書いた言語**。学習言語(en)ではない。
  if (zh) meanings[CHINESE_EXPLANATION_LANGUAGE] = zh;

  const forms = parseExchange(e.exchange);
  const rank = freqRank(e);
  const word = e.word.trim();

  return {
    headword: word,
    language: "en",
    reading_primary: opts.ipaUs?.trim() || null,
    reading_alt: normalizeIpa(e.phonetic) || null,
    meanings,
    pos: posOf(e),
    level_step: cefrStep(e, opts.officialLevel ?? null),
    freq_rank: rank,
    exam_tags: parseExamTags(e.tag),
    forms: Object.keys(forms).length > 0 ? forms : null,
    entry_type: word.includes(" ") ? "phrase" : "word",
    source: "dict",
    /**
     * **級の出所だけを、短く書く。**
     *
     * 後から公式の対応表で上書きするとき、どれが見積もりだったのか
     * 分からないと直せない。だから語ごとに要る。
     *
     * ## 長い文にしない
     * ここには出典の文（"ECDICT (MIT) + CMUdict (BSD); …"）を書いていたが、
     * **2種類しかない文を25,595回繰り返す**ことになっていて、取り込みの
     * 送信量の23%（1回あたり457KB）を占めていた。しかも `notes` は
     * どこからも読まれていない。
     *
     * 出典はデータ全体に掛かる話で、行ごとの話ではない。
     * `data-sources.ts` が持ち、設定の「出典」の頁に出ている。
     * ライセンス（MIT / BSD / CEFR-J の出典明記）はそちらで満たしている。
     */
    notes: opts.officialLevel != null ? LEVEL_SOURCE.official : LEVEL_SOURCE.estimated,
  };
}

/** 段が6つの範囲に収まっているか（入れる前の最後の関門）。 */
export function isValidRow(row: LexiconRow): boolean {
  if (!row.headword) return false;
  if (!(LEVEL_INDEXES as readonly number[]).includes(row.level_step)) return false;
  if (Object.keys(row.meanings).length === 0) return false;
  return true;
}
