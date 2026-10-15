import { z } from "zod";
import { ChunkPartSchema } from "./extras";
import { readerText } from "./note-language";
import { looksLikeTargetLanguage } from "./text-language";
import { targetProfile } from "./target-profile";

/**
 * **例文は「その語が使われる場面のパターン」から作る**（オーナー報告 2026-10-15）。
 *
 * > 眼鏡の例文「我戴眼鏡。」の上に「友達が眼鏡をしていないことに気づいたとき」と出た — 場面と文が全く合わない。
 * > ネイティブがその語をよく使う状況・場面・気持ちをパターンに分け、パターンごとにその場面で実際に言う一番自然な
 * > 一文を書く。1つの状況でしか使わない語なら例文は1つでいい。場面の札はその文を言う状況そのものにする。
 * > 文の語彙・文法は設定したレベルに合わせる。
 *
 * ## 食い違いが起きていた2つの道
 * 1. **作る時**: 例文（`example_sentence`）と場面（`extras.example_scene`）を別の欄として頼んでいたので、
 *    モデルが場面を文とは別に考えることがあった。今は1つのパターンの中で「状況 → 文 → その文のための札 →
 *    確かめ」の順に書かせ、札と文を同じ要素に置く（`example_patterns`）。
 * 2. **保存する時**: 共有の行（`words` / `word_explanations`）は**空の欄だけ**埋める。前から在った例文
 *    （「我戴眼鏡。」）の横に、2026-10-14 に足した場面の欄（空だった）だけが**別の生成の札**で埋まっていた。
 *    今は札に「どの文のために書いたか」（`example_scene_for`）を付け、文が違う所には札・パーツ・訳を入れない
 *    （`alignExampleExtras` / `exampleMatchesSentence`）。
 *
 * 確かめのために **AI をもう1回呼ばない**（オーナー 2026-10-14「カードの表示が遅くなるからやめて」）。
 * 同じ呼び出しの中で自己点検させ（`scene_fits`）、サーバは形だけを機械的に確かめる（`pickExamplePatterns`）。
 */

/** この版の例文の作り方（`extras.example_v`）。古いカードは持っていない（= 1）。 */
export const EXAMPLE_PROMPT_VERSION = 3;
/** パターンの上限（メインの例文を含む）。 */
export const MAX_EXAMPLE_PATTERNS = 4;

/** モデルが返すパターン1つ（`example_patterns` の要素）。型違いは落とさず空にする。 */
export const ExamplePatternSchema = z.object({
  situation: z.string().catch(""),
  share: z.coerce.number().catch(0),
  sentence: z.string().catch(""),
  translation: z.string().catch(""),
  scene: z.string().catch(""),
  chunks: z.array(ChunkPartSchema).catch([]),
  /** 自己点検の結果。**無ければ確かめていないだけ**なので落とさない（`false` だけ落とす）。 */
  scene_fits: z
    .union([z.boolean(), z.string().transform((s) => !/^(false|no|いいえ|否)$/i.test(s.trim()))])
    .optional()
    .catch(undefined),
});
export type ExamplePattern = z.infer<typeof ExamplePatternSchema>;

/**
 * **場面の札の長さの上限**（読む人の言語ごと、2026-10-15 オーナー「場面の説明は短く1行で」）。
 * 超えた札は区切り（読点・空白）で短くする（`shortScene`）。
 */
export const SCENE_MAX_CHARS = { ja: 24, zh: 18, en: 60 } as const;

export function sceneMaxChars(readerLang: string | null | undefined): number {
  const l = (readerLang ?? "").toLowerCase();
  if (l.startsWith("zh")) return SCENE_MAX_CHARS.zh;
  if (l.startsWith("en")) return SCENE_MAX_CHARS.en;
  return SCENE_MAX_CHARS.ja;
}

/**
 * 札を上限まで短くする。上限の中に区切り（、，,・空白）があればそこで切り、無ければ上限で切る。
 * 末尾の読点・句点は落とす。
 */
export function shortScene(scene: string, readerLang: string | null | undefined): string {
  const max = sceneMaxChars(readerLang);
  const s = scene
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[。.、，,]+$/u, "");
  if ([...s].length <= max) return s;
  const head = [...s].slice(0, max).join("");
  const cut = Math.max(
    head.lastIndexOf("、"),
    head.lastIndexOf("，"),
    head.lastIndexOf(","),
    head.lastIndexOf(" "),
  );
  return (cut >= Math.floor(max / 2) ? head.slice(0, cut) : head).trim();
}

/** 文字の2つ組（漢字・かなの言語）か語の2つ組（欧文）。似ているかを測る材料。 */
function grams(text: string): string[] {
  const t = text
    .toLowerCase()
    .replace(/[。．.!！?？、,，「」"'“”()（）]/g, " ")
    .trim();
  if (/[a-z]/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(t)) {
    const w = t.split(/\s+/).filter(Boolean);
    return w.length < 2 ? w : w.slice(1).map((x, i) => `${w[i]} ${x}`);
  }
  const c = [...t.replace(/\s+/g, "")];
  return c.length < 2 ? c : c.slice(1).map((x, i) => `${c[i]}${x}`);
}

/** 2つの文の似ている度合い（Dice 係数、0〜1）。 */
export function similarity(a: string, b: string): number {
  const x = grams(a);
  const y = grams(b);
  if (x.length === 0 || y.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

/** 札がこれ以上似ていたら同じ場面とみなす。 */
export const SCENE_DUPLICATE_AT = 0.6;
/** 文がこれ以上似ていたら同じ文型とみなす（名詞を入れ替えただけの文）。 */
export const SENTENCE_DUPLICATE_AT = 0.7;

/**
 * **似た場面を2つに分けない**（2026-10-15 オーナー「似たようなパターンは絶対に2つに分けない」）。
 * 札がよく似ている、または文の形がよく似ている（見出し語以外を入れ替えただけ）なら、同じパターン。
 */
export function nearDuplicateExample(
  a: { scene: string; sentence: string },
  b: { scene: string; sentence: string },
  headword = "",
): boolean {
  if (similarity(a.scene, b.scene) >= SCENE_DUPLICATE_AT) return true;
  const strip = (s: string) => (headword ? s.split(headword).join("＿") : s);
  const x = strip(a.sentence);
  const y = strip(b.sentence);
  if (similarity(x, y) >= SENTENCE_DUPLICATE_AT) return true;
  // 短い文は2つ組が少なく、1字（数・量詞・人称）を入れ替えただけでも似ていると出ない（我要一杯＿／我要兩杯＿）。
  // 見出し語の外で違うのが2割以下なら同じ文型。
  const ux = units(x);
  const uy = units(y);
  const longest = Math.max(ux.length, uy.length);
  return longest > 0 && editDistance(ux, uy) <= Math.max(1, Math.floor(longest * 0.2));
}

/** 比べる単位（欧文は語、それ以外は字。句読点・空白は落とす）。 */
function units(text: string): string[] {
  const t = text
    .toLowerCase()
    .replace(/[。．.!！?？、,，「」"'“”()（）]/g, " ")
    .trim();
  if (/[a-z]/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(t))
    return t.split(/\s+/).filter(Boolean);
  return [...t.replace(/\s+/g, "")];
}

function editDistance(a: readonly string[], b: readonly string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 例文1つ（画面に出す形）。 */
export type PickedExample = {
  sentence: string;
  translation: string;
  scene: string;
  chunks: z.infer<typeof ChunkPartSchema>[];
};

const norm = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, "").replace(/[。．.!！?？、,，「」"'“”]/g, "");

/** 2つの例文が同じ文か（空白・句読点の違いは同じとみなす）。 */
export function sameSentence(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

/**
 * 返ってきたパターンを**機械的に**確かめて、よく使う順に並べる（AI は呼ばない）。
 *
 * 落とす物: 文が空・学習言語でない・（台湾華語）見出し語を含まない／札が空・読む人の言語でない／
 * 自己点検が `false`／同じ文の2つ目。残りを `share` の大きい順（同じなら返ってきた順）に並べ、
 * **似た場面・同じ文型の2つ目を落とし**（`nearDuplicateExample` — よく使う方を残す）、`max` 個まで。
 * 札は読む人の言語ごとの上限まで短くする（`shortScene`）。
 */
export function pickExamplePatterns(
  patterns: readonly ExamplePattern[] | null | undefined,
  opts: { headword: string; language: string; readerLang: string; max?: number },
): PickedExample[] {
  const max = Math.max(1, opts.max ?? MAX_EXAMPLE_PATTERNS);
  // 漢字の言語（台湾華語）は語形が変わらないので、見出し語がそのまま文に入っているはず。
  const literalHeadword = targetProfile(opts.language).scriptLang === "zh-Hant";
  const head = (opts.headword ?? "").trim();
  const seen = new Set<string>();
  const ok: Array<PickedExample & { share: number; i: number }> = [];
  (patterns ?? []).forEach((p, i) => {
    const sentence = (p.sentence ?? "").trim();
    if (!sentence || sentence.length > 160) return;
    if (!looksLikeTargetLanguage(sentence, opts.language)) return;
    // 入っていない文は別の語の例文。英語・日本語は活用で形が変わるので、ここでは見ない。
    if (literalHeadword && head && !sentence.includes(head)) return;
    const scene = shortScene(
      readerText((p.scene ?? "").trim(), opts.readerLang, sentence).trim(),
      opts.readerLang,
    );
    if (!scene) return;
    if (p.scene_fits === false) return;
    const key = norm(sentence);
    if (seen.has(key)) return;
    seen.add(key);
    ok.push({
      sentence,
      translation: readerText((p.translation ?? "").trim(), opts.readerLang, sentence).trim(),
      scene,
      chunks: p.chunks ?? [],
      share: Number.isFinite(p.share) ? p.share : 0,
      i,
    });
  });
  const kept: typeof ok = [];
  for (const e of ok.sort((a, b) => b.share - a.share || a.i - b.i)) {
    if (kept.some((k) => nearDuplicateExample(k, e, head))) continue;
    kept.push(e);
  }
  return kept
    .slice(0, max)
    .map(({ sentence, translation, scene, chunks }) => ({ sentence, translation, scene, chunks }));
}

/** 追加の例文の1つ（保存の形）。札には書いた文の目印（`scene_for`）を付ける — メインの例文と同じ確かめ方。 */
export function toExtraExample(e: PickedExample) {
  return {
    zh: e.sentence,
    ja: e.translation,
    scene: e.scene,
    scene_for: e.sentence,
    chunks: e.chunks,
  };
}

/**
 * 追加の例文の札を、その文と組で確かめる。`scene_for` が付いていて文と違う札は空にする（目印も外す）。
 * 目印の無い古い物はそのまま。
 */
export function alignExtraExamples<E extends { zh?: string; scene?: string; scene_for?: string }>(
  list: readonly E[] | null | undefined,
): E[] {
  return (list ?? []).map((e) =>
    e && typeof e.scene_for === "string" && e.scene_for.trim() && !sameSentence(e.scene_for, e.zh)
      ? { ...e, scene: "", scene_for: "" }
      : e,
  );
}

type CardLike = {
  example_sentence?: string;
  example_translation?: string;
  extras?: Record<string, unknown> | null;
};

/**
 * 確かめたパターンをカードの今までの欄に写す（保存の形・画面は変えない）。
 *
 * - 1つ目（いちばんよく使う場面）→ `example_sentence` / `example_translation` / `extras.example_scene` /
 *   `extras.example_chunks`。札には `example_scene_for`（その札を書いた文）を付ける。
 * - 2つ目から → `extras.examples_extra`（`withExtra` のとき）。`example_pattern_count` は見つかった数
 *   （1 なら「この語は1つの場面でしか使わない」— 追加の例文の節を作り直しに行かない）。
 * - 1つも残らなければ、カードは**そのまま**返す（例文の欄は空か、モデルが別に返した物のまま）。
 */
export function applyExamplePatterns<T extends CardLike>(
  card: T,
  picked: readonly PickedExample[],
  opts: { withExtra: boolean },
): T {
  if (picked.length === 0) return card;
  const [main, ...rest] = picked;
  const extras: Record<string, unknown> = {
    ...(card.extras ?? {}),
    example_scene: main.scene,
    example_chunks: main.chunks,
    example_scene_for: main.sentence,
    example_v: EXAMPLE_PROMPT_VERSION,
  };
  if (opts.withExtra) {
    extras.examples_extra = rest.map(toExtraExample);
    extras.example_pattern_count = picked.length;
  }
  return {
    ...card,
    example_sentence: main.sentence,
    example_translation: main.translation,
    extras,
  };
}

/** メインの例文に付く欄（文と一緒でなければ意味を持たない物）。 */
const PAIRED_EXTRAS = [
  "example_scene",
  "example_chunks",
  "example_scene_for",
  "example_v",
] as const;

/**
 * **文と札を組で扱う**。`extras` の札が別の文のために書かれていたら（`example_scene_for` が `sentence` と違う）、
 * 札・パーツ・目印を外した写しを返す。目印の無い古い extras はそのまま（確かめようがない）。
 *
 * 共有の行は「空の欄だけ埋める」ので、ここを通さないと、前から在った文の横に新しい生成の札だけが入る
 * （2026-10-15 眼鏡）。
 */
export function alignExampleExtras<E extends Record<string, unknown> | null | undefined>(
  extras: E,
  sentence: string | null | undefined,
): E {
  if (!extras || typeof extras !== "object") return extras;
  const forSentence = (extras as Record<string, unknown>).example_scene_for;
  if (typeof forSentence !== "string" || !forSentence.trim()) return extras;
  if (sameSentence(forSentence, sentence)) return extras;
  const out: Record<string, unknown> = { ...extras };
  for (const k of PAIRED_EXTRAS) delete out[k];
  return out as E;
}

/**
 * 生成したカードの例文が、いま表示に使う文（`sentence`）と同じか。違えばそのカードの訳を使わない。
 * 文が空（まだ例文が無い）なら、カードの文がそのまま入るので「同じ」とみなす。
 */
export function exampleMatchesSentence(
  cardSentence: string | null | undefined,
  sentence: string | null | undefined,
): boolean {
  if (!norm(sentence)) return true;
  return sameSentence(cardSentence, sentence);
}

/**
 * 共有の列を埋める時、**訳だけ**が別の文のために書かれた物で埋まらないようにする。
 * 例文の列を一緒に埋めない回で、カードの文がいまの文と違えば、訳の列は書かない。
 */
export function guardExampleColumns<U extends Record<string, unknown>>(
  update: U,
  current: { example_sentence?: string | null },
  card: { example_sentence?: string | null } | null | undefined,
): U {
  if (!("example_translation" in update) || "example_sentence" in update) return update;
  if (exampleMatchesSentence(card?.example_sentence, current.example_sentence)) return update;
  const out: Record<string, unknown> = { ...update };
  delete out.example_translation;
  return out as U;
}

/**
 * 例文の作り方の指示（カード生成と例文の作り直しの `example_patterns`）。
 *
 * `max` = 返すパターンの上限。追加の例文の節を頼まない呼び出し（Web の既定）では 1（いちばんよく使う場面だけ）。
 * `sceneMax` = 札の字数の上限（読む人の言語ごと、`sceneMaxChars`）。
 */
export function examplePatternsRule(opts: {
  headword: string;
  targetName: string;
  nl: string;
  max: number;
  levelRule: string;
  sourceRule: string;
  chunkRoles: string;
  sceneMax?: number;
}): string {
  const { headword, targetName, nl, max, levelRule, sourceRule, chunkRoles } = opts;
  const sceneMax = opts.sceneMax ?? SCENE_MAX_CHARS.ja;
  const howMany =
    max <= 1
      ? `パターンを考えたうえで、**いちばんよく使うパターン1つだけ**を配列に入れて返す。`
      : `パターンは**よく使う順に1〜${max}個**。本当に別々の状況でよく使う時だけ複数にする。` +
        `その語がふだん1つの状況でしか使われないなら1個でよい。**数を合わせるために場面を作らない。**`;
  return [
    `- example_patterns: **例文は「ネイティブがその語をいちばんよく使う場面のパターン」から作る。** 次の順に考えて、配列で返す。`,
    `  1. ネイティブ（${targetName}の話し手）が「${headword}」を実際に口にする状況・場面・気持ちのうち、**いちばんよく使うもの**を思い浮かべ、パターンに分ける。`,
    `  2. **似たパターンは絶対に2つに分けない。** 同じ場所・同じ相手・同じ用件・同じ気持ちの状況は1つにまとめる` +
      `（✗「店で注文するとき」と「屋台で頼むとき」を別にする / ✗ 主語や名詞を入れ替えただけの同じ形の文を2つ書く）。`,
    `  3. ${howMany}`,
    `     share は、その語が使われる場面全体のうち、そのパターンが占める割合の目安（0〜100 の整数）。`,
    `  4. パターンごとに、**その場面でネイティブが実際にいちばん自然に言う一文**を1つだけ書く（sentence、${targetName}）。` +
      `教科書の作文・説明文にしない。「${headword}」を必ず含める。`,
    `  5. その一文の**ために** scene を書く: その文がまさに口にされる状況の**短い1行**（${nl}で${sceneMax}字以内。` +
      `誰が・どこで・何が起きて・どんな気持ちか が分かる言葉だけ）。画面で例文のすぐ上に出る。`,
    `     **scene と sentence は食い違ってはいけない。** ✗ sentence「我有鑰匙。」に scene「鍵をなくして困ったとき」` +
      `（その場面なら「我的鑰匙不見了！」と言う）→ ○ scene「家族に鍵を持ったか聞かれて」。`,
    `  6. 返す前に1つずつ確かめる: sentence だけを読んだネイティブが思い浮かべる場面と scene が同じか。` +
      `違えば scene（または sentence）を書き直す。scene_fits はこの確認の結果（直して合っていれば true）。` +
      `合わせられないパターン・ほかのパターンと似たパターンは配列に入れない。`,
    `  各要素: {share, sentence: ${targetName}の一文, translation: その文の自然な訳(${nl}), scene: 上の短い1行(${nl}), ` +
      `chunks: sentence をパーツ分解した [{text,pos}]（pos は ${chunkRoles}）, scene_fits: true/false}`,
    `  ${levelRule}`,
    `  ${sourceRule.replace(/\n/g, "\n  ")}`,
  ].join("\n");
}
