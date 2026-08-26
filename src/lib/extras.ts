import { z } from "zod";
import { normalizeTargetLanguage } from "./target-lang";

/**
 * 単語カードの extras の唯一の定義(2026-07-25 詳細カード再構成)。
 * 以前は ai.functions / ghost.functions / stickers.functions がそれぞれ
 * 同じ形を別々に持っていて、フィールドを増やすたびにどこかの zod が
 * 黙って新フィールドを落とす事故が起きていた。全員ここを import する。
 *
 * すべて .catch なので、欠けていても型が違っても落ちずに既定値になる
 * (AI出力・古いDB行のどちらにも耐える)。
 */

export const ChunkPartSchema = z.object({
  text: z.string(),
  // 役割ラベル: S/V/V1/V2/O/M/C/Ptc など(復習の添削と同じ色体系で描画)
  pos: z.string().catch(""),
});
export type ChunkPart = z.infer<typeof ChunkPartSchema>;

export const UsageChunkSchema = z.object({
  parts: z.array(ChunkPartSchema).catch([]),
  ja: z.string().catch(""),
});
export type UsageChunk = z.infer<typeof UsageChunkSchema>;

export const RelatedWordSchema = z.object({
  word: z.string(),
  kind: z.enum(["syn", "ant", "rel"]).catch("rel"),
  note: z.string().catch(""),
});
export type RelatedWord = z.infer<typeof RelatedWordSchema>;

const ExampleExtraSchema = z.object({
  zh: z.string(),
  ja: z.string().catch(""),
  /** いつ・どんな気持ちで言う一文か(例:「夜市で値段を聞くとき」)。 */
  scene: z.string().catch(""),
  chunks: z.array(ChunkPartSchema).catch([]),
});

/**
 * 語形(英語)。**AI を1回も呼ばずに埋まる**唯一の節。
 *
 * ECDICT の `exchange` 欄が `p:went/d:gone/i:going/3:goes` の形で持っていて、
 * `lexicon-import.ts` の `parseExchange` がここに写す。生成に頼らないので
 * 待ち時間もお金もかからず、しかも辞書由来なので間違えない。
 *
 * **同じ形を取り込み側とカード側の2箇所に書かない。** 取り込みの script も
 * ここを import する — 片方に欄を足して片方に足し忘れると、DB には入って
 * いるのに画面に出ない(逆も起きる)という、この app が何度もやった形になる。
 *
 * 全部 `.catch("")` にして、無い活用は空文字にする。`null` と `""` を
 * 混ぜると描く側で二重に判定する羽目になる。
 */
export const WordFormsSchema = z.object({
  /** 複数形(名詞)。"child" → "children" */
  plural: z.string().catch(""),
  /** 過去形(動詞)。"go" → "went" */
  past: z.string().catch(""),
  /** 過去分詞(動詞)。"go" → "gone" */
  pastParticiple: z.string().catch(""),
  /** 現在分詞・動名詞。"go" → "going" */
  ing: z.string().catch(""),
  /** 三人称単数現在。"go" → "goes" */
  third: z.string().catch(""),
  /** 比較級(形容詞・副詞)。"good" → "better" */
  comparative: z.string().catch(""),
  /** 最上級。"good" → "best" */
  superlative: z.string().catch(""),
  /** 原形。活用形で引いたときに元の語へ戻す("went" → "go")。 */
  lemma: z.string().catch(""),
});
export type WordForms = z.infer<typeof WordFormsSchema>;

export const ExtrasSchema = z.object({
  // --- 旧フィールド(古いカードの表示互換のため保持) ---------------------
  collocations: z.array(z.string()).catch([]),
  synonyms: z.array(z.string()).catch([]),
  antonyms: z.array(z.string()).catch([]),
  trivia: z.string().catch(""),
  common_situation: z.string().catch(""),
  usage_note: z.string().catch(""),
  register_note: z.string().catch(""),
  synonym_diff: z.string().catch(""),
  word_order: z.string().catch(""),
  study_tips: z.string().catch(""),
  // --- 現行フィールド ------------------------------------------------------
  etymology: z.string().catch(""),
  /**
   * 同じ語根・接頭辞・接尾辞を持つ**仲間の語**（オーナー指示 2026-08-26
   * 「同じ語源や接頭辞、接尾辞を持つ関連語、派生語があれば紹介して」）。
   *
   * **英語の語だけ。** 学習言語が英語のときにしか作らせない
   * (オーナー追記「上の語源の項目については、学習言語英語のときだけ」)。
   * 台湾華語の語は空のまま — 部首・声符の話は `radicals` が持つ。
   *
   * `{ word, note }`。`note` は「その部品が何を意味するか」を短く。
   */
  etymology_relatives: z
    .array(
      z.object({
        word: z.string().catch(""),
        note: z.string().catch(""),
      }),
    )
    .catch([]),
  radicals: z.string().catch(""),
  mnemonic: z.string().catch(""),
  examples_extra: z.array(ExampleExtraSchema).catch([]),
  /** 頻度・使う場面(統合): どこで見て使うか+口語/書面+頻度の説明。 */
  usage_context: z.string().catch(""),
  /** 使用頻度レベル 1〜5(5=毎日レベル)。視覚メーター用。 */
  frequency_level: z.number().int().min(1).max(5).nullable().catch(null),
  /** 「口語」「書面」「口語・書面」など。**消さない** — 古いカードの拠り所。 */
  register_tag: z.string().catch(""),
  /**
   * 話し言葉⇄書き言葉の目盛り(-2=完全に口語 / 0=中立 / +2=完全に書面)。
   * 文字列のままでは段階にできずメーターが作れないので、数でも持つ。
   * 古いカードは持っていないので **null が普通**(`lib/register-scale.ts` が
   * 文字列から写す)。0 に落とさない — 0 は「どちらでも使う」という主張。
   */
  register_scale: z.number().int().min(-2).max(2).nullable().catch(null),
  /**
   * その語に**どこで出会うか**の分布。鍵は図鑑の部屋
   * (`category.ts` の `ROOM_KEYS`: eat / town / house / wear / play /
   * nature / people / marks)。合計はおよそ1。
   *
   * **自由な場面名を作らせない。** 出会う確率は「語が出る場面」と
   * 「その人が居る場面」の内積で出す(`lib/rarity.ts` の `sceneOverlap`)。
   * その人の側は撮ったものの部屋から数えるので、**両方が同じ鍵で並んで
   * いないと内積が意味を持たない**。
   *
   * 古いカードは持っていない。無ければ場面の補正は掛からない。
   */
  scene_weights: z.record(z.string(), z.number()).nullable().catch(null),
  /** 旬の月(1〜12)。通年なら空。季節外れの補正に使う。 */
  season_months: z.array(z.number().int().min(1).max(12)).catch([]),
  /** 「台南」「台湾」など、そこでしか見ないもの。限定が無ければ空。 */
  region_scope: z.string().catch(""),
  /**
   * **その語に出会いやすい所を、具体的な札で並べる**(オーナー指摘 2026-08-20)。
   *
   * > 「頻度、使う場面の欄は、この単語に遭遇する確率が高い場所、状況、感情、
   * >  時刻、媒体、季節をラベルとして囲って複数挙げて。スーパー、ニュース、
   * >  看板、メニュー、道、駅、誕生日、夜、春みたいに」
   *
   * `scene_weights`(部屋8つ)は**数式のための分布**で、人が読む言葉では
   * ない。こちらは読む側の札で、種類ごとに色を分けて並べる。
   *
   * 種類が読めない札は `place` に落とす — 札そのものは捨てない
   * (「スーパー」が消えるより、色が1つずれるほうが害が小さい)。
   */
  encounter_labels: z
    .array(
      z.object({
        kind: z.enum(["place", "situation", "emotion", "time", "media", "season"]).catch("place"),
        label: z.string(),
      }),
    )
    .catch([]),
  /**
   * 「今週出会う見込み」の**計算結果の控え**(`encounter.functions.ts` が置く)。
   *
   * ここだけは**人が書いた物ではなく、機械が数えた物**。全利用者を数える
   * 問い合わせが要るので、カードを開くたびには数えず1日1回に留める。
   * 形が変わっても古い控えで落ちないよう、中身は緩く受けて `at` だけ見る。
   */
  encounter: z
    .object({
      /** いつ数えたか。これを見て1日1回に留める。 */
      at: z.string(),
      probability: z.number().catch(0),
      stars: z.number().int().min(1).max(5).catch(3),
      confidence: z.enum(["estimate", "blended", "measured"]).catch("estimate"),
      observed_users: z.number().int().nullable().catch(null),
      top_rooms: z.array(z.string()).catch([]),
      region_scope: z.string().nullable().catch(null),
      season_months: z.array(z.number().int()).catch([]),
    })
    .nullable()
    .catch(null),
  /** 使い方の型・チャンク(コロケーション+語順を統合、品詞色分け)。 */
  usage_chunks: z.array(UsageChunkSchema).catch([]),
  /** メイン例文のパーツ分解。 */
  example_chunks: z.array(ChunkPartSchema).catch([]),
  /** 類義語・反義語・関連語(使い分けノート付き)。 */
  related_words: z.array(RelatedWordSchema).catch([]),
  /** 量詞(名詞のみ)。複数ある場合は使い分けノート付き。 */
  measure_words: z
    .array(
      z.object({
        word: z.string(),
        zhuyin: z.string().catch(""),
        pinyin: z.string().catch(""),
        note: z.string().catch(""),
      }),
    )
    .catch([]),
  /** 日本人向けの発音のコツ(声調・有気音・そり舌・鼻音韻尾など)。 */
  /**
   * 一目で分かる要点。**表として出す**ための、短い「見出し: 中身」の並び。
   *
   * ## なぜ地の文と別に持つか
   * 解説はこれまで全部が地の文だった。描く側でどれだけ組み直しても、
   * 中身が文である以上「読む」しかない(オーナー指摘:「文章だけでなく、
   * 表のように一目で解説を理解できるように」)。表にしたいなら、
   * **表になる形で生成させる**必要がある。
   *
   * 中身は短く。value が長い文になったら、それは地の文の項目の仕事。
   */
  /**
   * 【退役】「ひと目でわかる」の表。
   *
   * 2026-08-20 にオーナー指示で**画面からも生成からも外した**。
   * ここに残してあるのは**既にDBに入っている139語の中身を消さないため**だけ。
   * スキーマから外すと `normalizeExtras` が落とし、次の保存で静かに消える。
   * 読む所も書く所も無いので、新しく増えることはない。
   */
  quick_facts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .catch([]),
  pronunciation_tips: z.string().catch(""),
  /** 台湾での一言雑学(文化・習慣・歴史・流行)+語法の注意。 */
  taiwan_note: z.string().catch(""),
  // --- 英語のカードだけの欄 ------------------------------------------------
  // 台湾華語のカードには出ない(`target-profile.ts` の `sections` が決める)。
  // 逆に `measure_words` は英語のカードには出ない — 英語に量詞は無い。
  /**
   * 語形。**辞書から入るので AI を呼ばない。**
   * `null` は「まだ引いていない」、全欄が空のオブジェクトは
   * 「引いたが活用が無い語(不変化名詞など)」で、意味が違う。
   */
  forms: WordFormsSchema.nullable().catch(null),
  /**
   * 可算/不可算と冠詞。
   *
   * **中国語話者にとって最大の誤りの元。** 中国語に冠詞は無いので、
   * "I bought furniture" と "I bought a furniture" のどちらが正しいかは
   * 母語からは分からない。台湾華語話者向けの版(指摘⑬)の中心にあたる。
   */
  countability: z
    .object({
      kind: z.enum(["countable", "uncountable", "both"]).catch("countable"),
      /** その語に付く冠詞の形("a" / "an" / "the" / "—")。 */
      article: z.string().catch(""),
      /** 使い分けの一言(both のときは、どちらの意味でどちらになるか)。 */
      note: z.string().catch(""),
    })
    .nullable()
    .catch(null),
  /**
   * どの音節を強く読むか。
   *
   * **通じるかどうかを最も左右する。** 音を全部正しく出しても強勢の位置が
   * 違うと英語話者には別の語に聞こえる(PREsent / preSENT)。中国語は
   * 声調言語で強勢が語の意味を変えないため、意識に上りにくい。
   *
   * `syllables` は音節に切った綴り、`primary`/`secondary` はその添字。
   */
  stress: z
    .object({
      syllables: z.array(z.string()).catch([]),
      primary: z.number().int().min(0).nullable().catch(null),
      secondary: z.number().int().min(0).nullable().catch(null),
      note: z.string().catch(""),
    })
    .nullable()
    .catch(null),
  /**
   * 句動詞。動詞のカードで、台湾華語なら量詞が入る枠が空く所に入る。
   * "give up" / "give in" のように、語そのものからは意味が読めない物。
   */
  phrasal_verbs: z
    .array(
      z.object({
        phrase: z.string(),
        meaning: z.string().catch(""),
        example: z.string().catch(""),
      }),
    )
    .catch([]),
  /**
   * 文化の一言。台湾華語のカードの `taiwan_note` にあたる欄。
   * 米/英の違い(elevator / lift)、その語にまつわる習慣など。
   */
  culture_note: z.string().catch(""),
  /**
   * この解説を**どの言語で書いたか**("ja" / "en")。
   * 設定の表示言語を英語に変えたとき、日本語のまま残った古い解説を
   * 自動で作り直すための目印(空=言語不明の旧データ=日本語とみなす)。
   */
  explain_lang: z.string().catch(""),
  /**
   * この解説を**どの母語の学習者向けに書いたか**(L1Code: "ja"/"en"/…)。
   *
   * 発音のコツと語順の説明は母語ごとに中身が変わる — 日本語話者には
   * 「有気音と無気音の区別が無い」、韓国語話者には「f が無い」と書く。
   * だから母語設定を変えたら、表示言語と同じように作り直す必要がある。
   * 空=旧データで、母語不明。日本語向けとみなす。
   */
  explain_l1: z.string().catch(""),
});

export type WordExtrasDTO = z.infer<typeof ExtrasSchema>;

export function emptyExtras(): WordExtrasDTO {
  return ExtrasSchema.parse({});
}

/** DBやAIから来た生の extras を安全に正規化(壊れていれば null)。 */
export function normalizeExtras(raw: unknown): WordExtrasDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const res = ExtrasSchema.safeParse(raw);
  return res.success ? res.data : null;
}

/** True when an extras object carries at least one non-empty field. */
export function hasExtrasContent(e: Partial<WordExtrasDTO> | null | undefined): boolean {
  if (!e) return false;
  // explain_lang / explain_l1 は内容ではなく目印なので「中身がある」判定から外す。
  return Object.entries(e).some(([k, v]) =>
    k === "explain_lang" || k === "explain_l1"
      ? false
      : Array.isArray(v)
        ? v.length > 0
        : typeof v === "string"
          ? v.trim().length > 0
          : v != null,
  );
}

/**
 * Merge incoming extras over existing: a non-empty incoming field wins, an
 * empty one never erases what's already saved.
 */
export function mergeExtras(
  cur: Partial<WordExtrasDTO> | null | undefined,
  inc: Partial<WordExtrasDTO> | null | undefined,
): WordExtrasDTO {
  const base: Record<string, unknown> = { ...emptyExtras(), ...(cur ?? {}) };
  for (const [k, v] of Object.entries(inc ?? {})) {
    const filled = Array.isArray(v)
      ? v.length > 0
      : typeof v === "string"
        ? v.trim().length > 0
        : v != null;
    if (filled) base[k] = v;
  }
  const res = ExtrasSchema.safeParse(base);
  return res.success ? res.data : emptyExtras();
}

/**
 * 量詞の欄と重なる「使い方」の型を落とす。
 *
 * 名詞のカードには量詞の欄(measure_words)があり、そこに「一張」が並ぶ。
 * その**すぐ上**の「使い方」に「一張 + 衛生紙」だけの型が出ると、
 * 同じ物を続けて2度読まされる(オーナー指摘 2026-08-18:
 * 「名詞の場合は量詞の欄があるから、チャンクの欄で同じものを表示しないで」)。
 *
 * **落とすのは「量詞と見出し語しか無い」型だけ。**
 * 「拿 + 一張 + 衛生紙」のように動詞や述語が付いた型は残す —
 * それは量詞の一覧には無い情報で、ネイティブの使い方そのものだから。
 * 量詞の型を丸ごと禁じると、逆に「動詞と目的語しか無い」状態に戻ってしまう
 * (オーナー指摘 2026-08-19:「品詞をすべて網羅して」)。
 */
/**
 * 型1つの長さの上限(繁体字の文字数)。これを超えると「型」ではなく文になる。
 *
 * **台湾華語の数え方**。英語には効かせない（すぐ下の注）。
 */
export const MAX_CHUNK_CHARS = 8;

/**
 * **英語の型の長さの上限（文字数）。**
 *
 * オーナー報告 2026-08-26（3度目）:
 * > 「単語のチャンク型の項目が生成されてない。」
 *
 * ## 生成はされていた。**こちらが全部落としていた。**
 * 上の 8 は「繁体字で8文字」。漢字1つが語1つぶんの中国語では
 * ちょうどよい目盛りだが、同じ数を英語に当てると
 * `put on socks`(12)も `a pair of socks`(15)も**1つ残らず落ちる**。
 * だから `refineUsageChunks` はいつも空を返し、
 * 「まだ空だ」→ 作り直す → また落とす、が延々と続いていた
 * （待ち時間もお金も払いながら、画面には一度も出ない）。
 *
 * ## 語の数で数える
 * 英語で「口に乗る型」を決めているのは文字数ではなく**語数**なので、
 * 語数のほうを見る。`MAX_CHUNK_PARTS`(4)と揃えて4語まで。
 * 文字数は「1語が異様に長い」を弾く保険として広めに置く。
 */
export const MAX_CHUNK_WORDS_EN = 4;
export const MAX_CHUNK_CHARS_EN = 28;
/** 型1つのパーツ数の上限。 */
export const MAX_CHUNK_PARTS = 4;
/** カードに並べる型の数の上限。 */
export const MAX_CHUNKS = 5;

/**
 * その型の文字列。
 *
 * **英語は空白で継ぐ。** 漢字は1字ずつが語なので継ぎ目が要らないが、
 * 英語で `["put on","socks"]` を素で継ぐと `put onsocks` になり、
 * 語数も重複の見分けも狂う。
 */
function chunkText(c: UsageChunk, sep = ""): string {
  return (c.parts ?? [])
    .map((p) => (p?.text ?? "").trim())
    .filter(Boolean)
    .join(sep);
}

/**
 * 語の数。**空白でも `chunkText` の継ぎ目でも切る** —
 * パーツが `["put on","socks"]` でも `["put","on","socks"]` でも
 * 同じ3語と数えたい（生成側がどちらの形で返すか決まっていない）。
 */
function countWords(text: string): number {
  return text.split(/[\s'’-]+/u).filter(Boolean).length;
}

/**
 * 使い方の型を**厳選する**(オーナー指摘 2026-08-21)。
 *
 * > 「チャンク、型の精度が低い、適当になってる。ネイティブが最も高い確率で
 * >  その単語をどんな言葉と一緒に使うか…厳選して、スピーキングの時に
 * >  使えるように教えて。型やチャンクは長すぎないで。」
 *
 * プロンプトでも頼むが、**返ってきた物のほうを見て落とす**。この app は
 * 「書いてあることと返ってくる物は別」を何度も踏んでいる。
 *
 * 落とすのは4つ:
 * 1. 量詞の欄と丸ごと重なる型(下の `withoutMeasureWordEcho`)
 * 2. **長すぎる型** — 8文字を超えると口に乗る「型」ではなく例文になる。
 *    例文の欄が別に在るので、ここが文になると欄の意味が重なる
 * 3. 見出し語しか無い型(情報が0)
 * 4. 同じ文字列の重複
 *
 * そのうえで**先頭5つ**に切る。生成側は「使用頻度の高い順」に並べるので、
 * 切るのは後ろから。
 */
export function refineUsageChunks(
  chunks: ReadonlyArray<UsageChunk> | null | undefined,
  measureWords: ReadonlyArray<{ word?: string } | null | undefined> | null | undefined,
  headword: string,
  /**
   * その語の学習言語。**渡さないと台湾華語の目盛りで測る** —
   * 英語の型が1つ残らず落ちる（`MAX_CHUNK_CHARS_EN` の注）。
   */
  language?: string | null,
): UsageChunk[] {
  const head = headword.trim();
  const seen = new Set<string>();
  const isEnglish = normalizeTargetLanguage(language) === "en";
  return withoutMeasureWordEcho(chunks, measureWords, headword)
    .filter((c) => {
      const parts = (c.parts ?? []).filter((p) => (p?.text ?? "").trim().length > 0);
      if (parts.length === 0 || parts.length > MAX_CHUNK_PARTS) return false;
      const text = chunkText(c, isEnglish ? " " : "");
      if (text.length === 0) return false;
      if (isEnglish) {
        // 英語は**語の数**で測る（文字数だと `put on socks` すら落ちる）。
        if (countWords(text) > MAX_CHUNK_WORDS_EN) return false;
        if (text.length > MAX_CHUNK_CHARS_EN) return false;
      } else if (text.length > MAX_CHUNK_CHARS) {
        return false;
      }
      // 見出し語だけの型は、その語を見れば分かることしか言っていない。
      if (text === head) return false;
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .slice(0, MAX_CHUNKS);
}

export function withoutMeasureWordEcho(
  chunks: ReadonlyArray<UsageChunk> | null | undefined,
  measureWords: ReadonlyArray<{ word?: string } | null | undefined> | null | undefined,
  headword: string,
): UsageChunk[] {
  const list = (chunks ?? []).filter(Boolean) as UsageChunk[];
  // 量詞が1つも無ければ重なりようがない。素通しする。
  const cores = new Set(
    (measureWords ?? []).map((m) => measureWordCore(m?.word ?? "")).filter((w) => w.length > 0),
  );
  if (cores.size === 0) return list;

  const head = headword.trim();
  return list.filter((c) => {
    const parts = (c.parts ?? []).map((p) => (p?.text ?? "").trim()).filter((t) => t.length > 0);
    if (parts.length === 0) return false;
    // 量詞と見出し語以外のパーツが1つでもあれば、その型は情報を足している。
    return parts.some((t) => !cores.has(measureWordCore(t)) && t !== head);
  });
}

/**
 * 量詞から数を落として本体だけにする(「一張」「兩張」「3張」→「張」)。
 * 生成側は数付きで出すが、チャンクでは素の「張」で現れることがあるため、
 * 見比べる前に同じ形に揃える。
 */
function measureWordCore(word: string): string {
  return word.trim().replace(/^[0-9０-９一二三四五六七八九十兩几幾半個]*(?=.)/u, "");
}
