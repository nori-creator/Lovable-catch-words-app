/**
 * ネットの画像の候補を**学ぶ人が思い浮かべる物の順に**並べ直す。
 *
 * ## オーナー報告 2026-10-08
 * > 「牛蒡（ゴボウ）を検索すると、自動の画像も候補も花の写真しか出ない。」
 *
 * 2つ重なっていた:
 * 1. 探す言葉が意味の欄の日本語（`ゴボウ`）そのままで、写真の出所（Unsplash・コモンズ）は
 *    英語の説明で引くので、植物としてのゴボウ（花・野草）に当たっていた。
 *    → カードを作る時に AI が**画像検索用の短い英語**（`extras.image_query`、例
 *    `burdock root`）も返すようにした（同じ呼び出しに1欄足すだけ。追加の AI 呼び出しは無い）。
 * 2. 返ってきた順に並べていたので、外れの写真が先頭（自動の1枚）になっていた。
 *    → 返ってきた説明・題・タグを見て、**探した言葉に合う物を前へ、花・図版を後ろへ**。
 *
 * ## 特定の語に合わせない
 * 「牛蒡なら花を落とす」のような語ごとの表は持たない。見るのは
 * - 探した言葉（とその語の棚 `category_key`）が説明に出てくるか
 * - 探した言葉も棚も「花・植物」と言っていないのに、花の写真か
 * - 写真でない図版（標本・挿絵・図）か
 * だけ。花を探している語（`桜` の棚 `flower`、`cauliflower`）は花を下げない。
 *
 * 外の世界に触れるものを入れない（試験から素の値で確かめる）。
 */

/** 並べ直す前の候補。`text` は題・説明・タグをつないだ物（無ければ空）。 */
export type RankableImage = { text?: string };

export type RankContext = {
  /** 実際に投げた検索語。 */
  query: string;
  /** その語の棚（`category.ts` の `CATEGORY_KEYS`）。分からなければ無し。 */
  category?: string | null;
};

/** 花・植物そのものを写していてよい棚。ここでは花の写真を下げない。 */
const PLANT_CATEGORIES = new Set(["plant", "flower", "nature", "decoration", "art", "color"]);

/** 花の写真の手がかり（英語の説明と、日本語・中国語の説明）。 */
const FLOWER_WORDS =
  /\b(flowers?|flowering|blossoms?|blooms?|blooming|inflorescences?|wildflowers?|petals?|florets?)\b|の花|花序|開花|花朵|花卉|野花/iu;

/** 写真でない図版の手がかり。札の主役に据えると何の絵か読めない。 */
const NOT_A_PHOTO_WORDS =
  /\b(herbarium|specimens?|illustrations?|engravings?|drawings?|diagrams?|lithographs?|botanical art)\b|標本|挿絵|図譜|植物画/iu;

/** 点に数えない短い語・つなぎの語。 */
const STOP = new Set(["the", "and", "with", "for", "from", "of", "a", "an", "in", "on", "photo"]);

/** 英字の語は語ごと、それ以外（漢字・かな）は検索語の塊ごとに数える。 */
function queryTerms(query: string): string[] {
  const q = query.toLowerCase();
  const latin = (q.match(/[a-z][a-z'-]+/g) ?? []).filter((w) => w.length >= 3 && !STOP.has(w));
  const other = q
    .replace(/[a-z0-9'-]+/g, " ")
    .split(/[\s、,，・/]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set([...latin, ...other])];
}

function hasWord(text: string, term: string): boolean {
  if (/^[a-z'-]+$/.test(term)) {
    // 複数形・活用の語尾までは同じ語と見る（root → roots）。
    return new RegExp(`\\b${term.replace(/[-']/g, "\\$&")}(s|es)?\\b`, "i").test(text);
  }
  return text.includes(term);
}

/**
 * 候補1つの点。高いほど前に置く。
 *
 * - 探した言葉の語が説明に出てくる: +2 ずつ
 * - 棚の名前（`vegetable` など。棚の鍵は英語）が出てくる: +1
 * - 花の写真で、探した言葉にも棚にも花・植物が無い: -3
 * - 写真でない図版: -2
 */
export function imageRelevance(text: string | undefined, ctx: RankContext): number {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return 0;
  const query = ctx.query.toLowerCase();
  let score = 0;
  for (const term of queryTerms(query)) if (hasWord(t, term)) score += 2;
  const category = (ctx.category ?? "").trim().toLowerCase();
  const categoryWord = category.replace(/_/g, " ");
  if (categoryWord && categoryWord !== "other" && hasWord(t, categoryWord)) score += 1;
  const wantsFlowers =
    PLANT_CATEGORIES.has(category) || FLOWER_WORDS.test(query) || /flower|花/u.test(query);
  if (!wantsFlowers && FLOWER_WORDS.test(t)) score -= 3;
  if (!NOT_A_PHOTO_WORDS.test(query) && NOT_A_PHOTO_WORDS.test(t)) score -= 2;
  return score;
}

/**
 * 点の高い順に並べ直す。**同じ点なら元の順**（出所は関連の高い順に返すので、それを崩さない）。
 * 説明が1つも無い出所（AI の絵）は 0 点で、元の位置の順を保つ。
 */
export function rankImageCandidates<T extends RankableImage>(
  candidates: ReadonlyArray<T>,
  ctx: RankContext,
): T[] {
  return candidates
    .map((c, i) => ({ c, i, s: imageRelevance(c.text, ctx) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}
