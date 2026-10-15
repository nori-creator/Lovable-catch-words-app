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
export const EXAMPLE_PROMPT_VERSION = 2;
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
 * 自己点検が `false`／同じ文の2つ目。残りを `share` の大きい順（同じなら返ってきた順）に `max` 個まで。
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
    const scene = readerText((p.scene ?? "").trim(), opts.readerLang, sentence).trim();
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
  return ok
    .sort((a, b) => b.share - a.share || a.i - b.i)
    .slice(0, max)
    .map(({ sentence, translation, scene, chunks }) => ({ sentence, translation, scene, chunks }));
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
    extras.examples_extra = rest.map((e) => ({
      zh: e.sentence,
      ja: e.translation,
      scene: e.scene,
      chunks: e.chunks,
    }));
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
 * 例文の作り方の指示（カード生成の `example_patterns`）。
 *
 * `max` = 返すパターンの上限。追加の例文の節を頼まない呼び出しでは 1（いちばんよく使う場面だけ）。
 */
export function examplePatternsRule(opts: {
  headword: string;
  targetName: string;
  nl: string;
  max: number;
  levelRule: string;
  sourceRule: string;
  chunkRoles: string;
}): string {
  const { headword, targetName, nl, max, levelRule, sourceRule, chunkRoles } = opts;
  const howMany =
    max <= 1
      ? `パターンを考えたうえで、**いちばんよく使うパターン1つだけ**を配列に入れて返す。`
      : `パターンは**よく使う順に1〜${max}個**。その語がふだん1つの状況でしか使われないなら1個でよい。` +
        `**数を合わせるために場面を作らない。** 似た場面・同じ気持ちのパターンを2つに分けない。`;
  return [
    `- example_patterns: **例文は「その語が使われる場面のパターン」から作る。** 次の順に考えて、配列で返す。`,
    `  1. ネイティブ（${targetName}の話し手）が「${headword}」を実際に口にする状況・場面・気持ちを思い浮かべ、似たものをまとめてパターンに分ける。`,
    `  2. ${howMany}`,
    `     share は、その語が使われる場面全体のうち、そのパターンが占める割合の目安（0〜100 の整数）。`,
    `  3. パターンごとに、**その場面でネイティブが実際にいちばん自然に言う一文**を1つだけ書く（sentence、${targetName}）。`,
    `     教科書の作文・説明文にしない。「${headword}」を必ず含める。`,
    `  4. その一文の**ために** scene を書く（画面で例文のすぐ上に出す札）。**その文がまさに口にされる瞬間**を、` +
      `誰が（誰に）・どこで・何が起きて・どんな気持ちか が分かるように、${nl}で12〜25字。`,
    `     **scene と sentence は食い違ってはいけない。** ✗ sentence「我有鑰匙。」に scene「鍵をなくして困ったとき」` +
      `（その場面なら「我的鑰匙不見了！」と言う）→ ○ scene「家族に鍵を持ったか聞かれて答えるとき」。`,
    `  5. 返す前に1つずつ確かめる: sentence だけを読んだネイティブが思い浮かべる場面と scene が同じか。` +
      `違えば scene（または sentence）を書き直す。scene_fits はこの確認の結果（直して合っていれば true）。` +
      `合わせられないパターンは配列に入れない。`,
    `  各要素: {situation: そのパターンの説明(${nl}。誰が・誰に・どこで・どんな気持ちで), share, ` +
      `sentence: ${targetName}の一文, translation: その文の自然な訳(${nl}), scene: 上の札(${nl}), ` +
      `chunks: sentence をパーツ分解した [{text,pos}]（pos は ${chunkRoles}）, scene_fits: true/false}`,
    `  ${levelRule}`,
    `  ${sourceRule.replace(/\n/g, "\n  ")}`,
  ].join("\n");
}
