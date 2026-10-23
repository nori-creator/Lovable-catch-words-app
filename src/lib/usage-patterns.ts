import {
  CHUNK_SELF_CHECK_RULE,
  chunkSenseRule,
  formulaChunkRule,
  specificChunkRule,
} from "./chunk-prompt-rules";
import { withDegreeAdverb, withoutSeparatorParts } from "./chunk-grammar";
import { gateUsageChunks, type ChunkDropReason, type ChunkGateContext } from "./chunk-quality";
import {
  SCENE_DUPLICATE_AT,
  SCENE_MAX_CHARS,
  applyExamplePatterns,
  applyFixedMainExample,
  checkExamplePattern,
  chunksMatchSentence,
  nearDuplicateExample,
  similarity,
  type CheckedMainLabel,
  type ExamplePattern,
  type ExamplePatternIssue,
  type PickedExample,
} from "./example-patterns";
import {
  MAX_USAGE_PATTERNS,
  USAGE_PROMPT_VERSION,
  type AiUsagePattern,
  type ChunkPart,
  type UsageChunk,
  type UsagePattern,
} from "./extras";
import { isWeakPartnerChunk } from "./generic-chunks";
import { readerText } from "./note-language";
import { normalizeTargetLanguage } from "./target-lang";
import { targetProfile } from "./target-profile";

/**
 * **使い方パターン = 場面 ＋ 公式 ＋ 例文**（オーナー要望 2026-10-23）。
 *
 * > 「その単語を思い浮かべたとき、日常でどんな単語と一緒に・どんな形で・どんな状況（場面・感情）で使うか」を知りたい。
 * > ①場面・感情の一言 ②ネイティブが最もよく使う形の公式 ③その公式を使った例文 の3つを**1つの塊**にして、
 * > 頻度・実用性の高い順に複数。
 *
 * ## 何が起きていたか（同日のスクリーンショットと ChatGPT/Gemini の指摘、コードで裏付け）
 * - 地瓜・蛋糕・珍珠奶茶に「〜＋很＋甜 / 好喝」、夾子に「拿＋夾子」— 指示文の見本そのものが 芒果＋很＋甜 で、
 *   汎用語の表（`generic-chunks.ts`）は 買・喜歡 の族しか見ていなかった。
 * - 馬桶の例文「請問馬桶在哪裡？」（便器を探す文）、珍珠奶茶「台灣的珍珠奶茶最有名」（説明文）— 例文の指示に
 *   「一人称の発話に限る・説明文/看板/地の文を禁じる」が無かった。
 * - チャンクと例文が別々の欄で、結び付きを確かめていなかった。
 *
 * ## 作り
 * - **指示文は1つ**（`usagePatternsRule`）。カードの生成（`generateCard`）と項目の作り直し（`runSectionRegen` の
 *   `usage_chunks`）の両方が通る。中の順序は **公式 → 場面 → 例文**（場面が例文に引きずられないため — 場面は公式から書く）。
 * - **門は AI を呼ばない**（`gateUsagePatterns`）。公式は今までの門（`chunk-quality.ts`）、例文は今までの確かめ
 *   （`example-patterns.ts` の `checkExamplePattern`）をそのまま通し、結び付き（`chunkInSentence`）・場面の自己点検・
 *   弱い相手（`isWeakPartnerChunk` — 後ろへ回す）・kind の偏りを見る。
 * - **今までの欄も書き続ける**（`legacyFieldsFromPatterns`）: `usage_chunks` と例文の欄。古い iOS・Web・復習の答えを壊さない。
 *
 * 外の世界に触れない（純粋）。読みは呼ぶ側が `chunk-readings.server.ts` で付ける。試験は `usage-patterns.test.ts`。
 */

// --- 指示文 -----------------------------------------------------------------------------------------

/** 返事の `usage_patterns` の要素の鍵（JSON の鍵の一覧用。生成と作り直しで同じ）。 */
export const USAGE_PATTERNS_KEYS =
  `usage_patterns[{kind,share,situation,scene,scene_general,` +
  `chunk:{parts:[{text,pos,slot,ja,pinyin?,zhuyin?,alts?:[{text,ja,pinyin?,zhuyin?}]}],ja,fits,why},` +
  `example:{sentence,translation,chunks:[{text,pos}],scene_fits},note}]`;

/** 作り直しの返事の形（見本の JSON）。 */
export function usagePatternsJsonExample(targetName: string, nl: string): string {
  return (
    `{"usage_patterns":[{"kind":"action","share":0,"situation":"考えた状況（画面には出ない）","scene":"短い1行(${nl})","scene_general":true,` +
    `"chunk":{"parts":[{"text":"","pos":"","slot":false,"ja":"","pinyin":"","zhuyin":"","alts":[{"text":"","ja":"","pinyin":"","zhuyin":""}]}],"ja":"訳(${nl})","fits":true,"why":""},` +
    `"example":{"sentence":"${targetName}の一文","translation":"訳(${nl})","chunks":[{"text":"","pos":""}],"scene_fits":true},"note":"ポイント(${nl})"}]}`
  );
}

/**
 * **使い方パターンの指示文**（生成と作り直しの両方がこれを通す — 片方だけ直すと作り直しで戻る）。
 *
 * 順序は **公式 → 場面 → 例文 → ポイント**。場面は公式から書く（例文の文脈・気持ちを書かない —
 * オーナー 2026-10-23「✗ 家の掃除の分担を話す時 ✗ 困って ✗ 注意・お願い — どれも例文の文脈であって公式の場面ではない」）。
 *
 * - `code` … 学習言語（公式の見本・文法の注意・長さの決まりは `target-profile.ts` の `chunkPrompt` から）
 * - `meaningHint` … このカードの意味（見出し語を「この意味の物」に固定する — `chunkSenseRule`）
 * - `levelRule` / `sourceRule` … 例文の級と作り方（`exampleLevelRule` / `worldExampleRule`。生成と同じ文）
 * - `chunkRoles` … 例文を語に分けた `chunks` の pos の候補
 * - `learnerL1` / `l1Gram` … 母語と、その母語が崩しやすい語順の注意
 */
export function usagePatternsRule(opts: {
  headword: string;
  code: string;
  targetName: string;
  nl: string;
  meaningHint: string;
  levelGoal: string;
  levelRule: string;
  sourceRule: string;
  chunkRoles: string;
  learnerL1: string;
  l1Gram?: string;
  sceneMax?: number;
  max?: number;
}): string {
  const { headword, code, targetName, nl } = opts;
  const chunk = targetProfile(code).chunkPrompt;
  const sceneMax = opts.sceneMax ?? SCENE_MAX_CHARS.ja;
  const max = Math.max(1, opts.max ?? MAX_USAGE_PATTERNS);
  const indent = (s: string) => s.replace(/\n/g, "\n     ");
  return [
    `- usage_patterns: **「${headword}」の使い方パターン** — ネイティブ（${targetName}の話し手）が「${headword}」を実際に口にする時の ` +
      `**①公式（chunk） ②その公式を使う場面の一言（scene） ③その公式を使った例文（example）** を1つの塊（パターン）にして、` +
      `頻度の高い順に配列で返す。`,
    `  1. **数**: ネイティブが「${headword}」を**実際にいちばん高い頻度で**使う形を 2〜${max} 個（自信のある物だけ。` +
      `1つしか無ければ1つでよい。**数を揃えるためにパターンを作らない**）。思いつく組み合わせを並べない — ` +
      `その語で口を開いたときに最初に出る形だけを、頻度の高い順に。share は、その語が使われる場面全体のうち、` +
      `そのパターンが占める割合の目安（0〜100 の整数）。**似たパターンは絶対に2つに分けない**` +
      `（同じ場所・同じ相手・同じ用件・同じ気持ちは1つ / 名詞を入れ替えただけの同じ形を2つ書かない）。`,
    `     各パターンに kind を付ける: action（その物でする・される動作）/ state（その物の状態・トラブル）/ ` +
      `phrase（決まった言い回し・セット表現）。**同じ kind ばかりにしない**（kind は画面には出さない — 種類が偏らないための印）。`,
    `  2. **先に公式（chunk）を決める**: その場面でネイティブが最もよく口にする塊。` +
      `{parts:[{text,pos,slot,ja,pinyin,zhuyin,alts}], ja:その公式の自然な訳だけ(${nl}。説明・注釈・括弧書きは書かない), fits, why}。`,
    `     ${indent(chunkSenseRule(headword, opts.meaningHint))}`,
    `     ${indent(formulaChunkRule(code))}`,
    `     ${indent(specificChunkRule(headword, opts.levelGoal))}`,
    `     **公式であって文ではない**: 2〜3パーツが基本（最大4パーツ）。${chunk.lengthRule} ` +
      `主語・語気助詞（喔/耶/啦/吧）・句点を入れない。文は例文（example）が受け持つ。`,
    `     ${indent(chunk.styleRule)}`,
    `     ${indent(chunk.posRule)}`,
    `     **${opts.learnerL1}が崩しやすい型を優先する**（ただし ja は訳だけ — 注意書きを混ぜない）。`,
    ...(opts.l1Gram?.trim() ? [`     ${indent(opts.l1Gram.trim())}`] : []),
    `     ${CHUNK_SELF_CHECK_RULE}`,
    `  3. **次に場面（scene）を公式から書く**（例文からではない）: その公式をネイティブが使う**一般的な状況**を` +
      `「〜の時」「〜した後」の形で、${nl}で${sceneMax}字以内の一言。**同じ公式を使うどの会話にも当てはまる抽象度**にする` +
      `（○ 馬桶＋塞住了 →「トイレが詰まった・流れない時」/ 沖＋馬桶 →「トイレを使った後」/ 刷＋馬桶 →「トイレを掃除する時」）。`,
    `     **例文の文脈・話し相手・気持ちを書かない**（✗「家の掃除の分担を話す時」✗「困って」✗「注意・お願い」— ` +
      `どれも下の例文の文脈であって、公式そのものの場面ではない）。感情を添えるのは、公式自体が感情を表す時だけ（很機車 = 面倒・意地悪）。`,
    `     situation には、そのパターンを考えた時の状況のメモ（画面には出ない。短く）。`,
    `     scene_general は自己点検: 「この scene は、下の例文以外でこの公式を言う時にも当てはまるか」。` +
      `false なら scene を書き直す。どうしても一般的に書けないパターンは配列に入れない。`,
    `  4. **最後に例文（example）**: その場面で**自分が誰かに言う一人称のセリフ**を1つ {sentence, translation, chunks, scene_fits}。` +
      `説明文・看板やアナウンス調・地の文（✗「彼は昨日公園で…」✗「台灣的珍珠奶茶最有名」）・` +
      `その語をネイティブが使わない場面の文（✗ 馬桶 で「請問馬桶在哪裡？」— 場所を聞くなら 廁所 と言う）は書かない。`,
    `     **公式の字をそのまま続けて含める**（slot の語は alts の1つに替えてよい。` +
      `✗ 公式 馬桶＋塞住了 に 例文「馬桶又不通了」— 公式の字が入っていない）。${targetName}で 12〜28 字。` +
      `語気助詞（喔/耶/啦/吧）は自然な時だけ。「${headword}」を必ず含める。` +
      `**重ね言葉にしない**（見出し語がもう量詞・名詞の字を含む時、同じ字を量詞にして重ねない: ✗「送了一束花束」→ ○「送了一個花束」）。`,
    `     translation はその文の会話調の自然な訳（${nl}）。chunks は sentence を語に分けた [{text,pos}]（pos は ${opts.chunkRoles}。` +
      `つなぐと文に戻ること）。`,
    `     scene_fits は自己点検: sentence だけを読んだネイティブが思い浮かべる状況が scene に含まれるか（true/false）。` +
      `合わなければ sentence を書き直す。`,
    `     ${indent(opts.levelRule)}`,
    `     ${indent(opts.sourceRule)}`,
    `  5. **note**: この公式のニュアンスと、slot の候補の使い分けを${nl}で1〜2文` +
      `（例: 「塞住了は詰まって動かない状態。水が流れないだけなら不通、壊れて使えないなら壞了」）。書く事が無ければ空文字。`,
    `  各要素: {kind, share, situation, scene, scene_general, chunk:{parts,ja,fits,why}, example:{sentence,translation,chunks,scene_fits}, note}`,
  ].join("\n");
}

// --- 結び付き --------------------------------------------------------------------------------------

/** 札の候補（札の字と、入れ替えの候補の字）。 */
function candidatesOf(part: ChunkPart): string[] {
  const self = (part.text ?? "").trim();
  const alts = (part.alts ?? []).map((a) => (a?.text ?? "").trim());
  return [self, ...alts].filter((t, i, arr) => t.length > 0 && arr.indexOf(t) === i);
}

/**
 * **公式の字が例文に続けて入っているか**。入っていればその範囲の文字列、無ければ null。
 *
 * - パーツを空白無しで結ぶ（英語は空白で結び、大小は見ない）
 * - 入れ替えの札（alts）は、どの候補に替えた形でもよい（馬桶＋[塞住了/不通] と「馬桶不通了」）
 * - 台湾華語の「名詞＋状態動詞」は 很 を補った形でも探す（滷味＋入味 と「滷味很入味」— iOS の `withDegree` と同じ）
 * iOS は同じ探し方で下線を引く（`ChunkRules.span`）。
 */
export function chunkInSentence(
  chunk: { parts?: ReadonlyArray<ChunkPart> | null },
  sentence: string,
  language?: string | null,
): string | null {
  const lang = normalizeTargetLanguage(language);
  const en = lang === "en";
  const text = sentence ?? "";
  const hay = en ? text.toLowerCase() : text;
  const sep = en ? " " : "";
  const find = (parts: ReadonlyArray<ChunkPart>): string | null => {
    const cands = parts.map(candidatesOf).filter((c) => c.length > 0);
    if (cands.length === 0) return null;
    const from = (i: number, pos: number): number | null => {
      if (i === cands.length) return pos;
      const lead = i === 0 ? "" : sep;
      for (const c of cands[i]) {
        const piece = lead + (en ? c.toLowerCase() : c);
        if (!hay.startsWith(piece, pos)) continue;
        const end = from(i + 1, pos + piece.length);
        if (end !== null) return end;
      }
      return null;
    };
    for (let start = 0; start < hay.length; start++) {
      const end = from(0, start);
      if (end !== null) return text.slice(start, end);
    }
    return null;
  };
  const parts = withoutSeparatorParts(chunk.parts ?? []).filter((p) => (p.text ?? "").trim());
  return find(parts) ?? find(withDegreeAdverb([...parts], lang));
}

// --- 門 --------------------------------------------------------------------------------------------

export type UsagePatternDropReason =
  | `chunk_${ChunkDropReason}`
  | `example_${ExamplePatternIssue}`
  /** 場面の自己点検（`scene_general`）が false — 例文の文脈を書いた場面。 */
  | "scene_specific"
  | "duplicate_chunk"
  | "duplicate_example"
  /** 弱い相手（吃/喝/拿＋名詞・名詞＋很＋甜）。強い公式が2つ以上あるので落とした。 */
  | "generic_partner"
  | "over_limit";

export type UsagePatternGateContext = ChunkGateContext & { language: string; readerLang: string };

export type UsagePatternGateResult = {
  kept: UsagePattern[];
  dropped: Array<{ text: string; reason: UsagePatternDropReason }>;
  /** 落とさないが記録に残す物（場面が例文の訳とそっくり — 場面を例文から書いた疑い）。 */
  warnings: Array<{ text: string; reason: "scene_like_translation" }>;
};

function chunkKey(parts: ReadonlyArray<ChunkPart>, language: string | null | undefined): string {
  const sep = normalizeTargetLanguage(language) === "en" ? " " : "";
  return parts
    .map((p) => (p.text ?? "").trim())
    .filter(Boolean)
    .join(sep)
    .toLowerCase();
}

/**
 * **門。** 返ってきたパターンを1つずつ確かめ、通った物（保存の形）と落とした物（理由つき）を返す。AI は呼ばない。
 *
 * 1. 公式は今までの門（`gateUsageChunks` — 見出し語が1つの札か・量詞・文・別の物の動作・訳の言語…）。落ちればパターンごと落ちる。
 * 2. 例文は今までの確かめ（`checkExamplePattern` — 学習言語・見出し語・重ね言葉・札・`scene_fits`）。
 * 3. 場面の自己点検 `scene_general` が false なら落とす。場面が例文の訳とそっくりなら記録に残す（落とさない）。
 * 4. 似た場面・同じ文型の2つ目（`nearDuplicateExample`）、同じ公式の2つ目は落とす。
 * 5. 結び付き: 公式の字が例文に入っていれば `chunk_in_example: true`、無くても**パターンは残す**（下線を引かないだけ）。
 * 6. 並び: share の大きい順 → 同じ kind が3つ以上なら3つ目以降を後ろへ → 弱い相手（`isWeakPartnerChunk`）は最後へ。
 *    強い公式が2つ以上あれば弱い物は落とす（2026-08-28「喝珍珠奶茶 は残す」の改正: 落とすのではなく後ろへ）。上限 `MAX_USAGE_PATTERNS`。
 * 読む人の言語でない訳・ポイントは落とす（`readerText`）。読みは付けない（呼ぶ側が `withChunkReadingsInExtras`）。
 */
export function gateUsagePatterns(
  raw: ReadonlyArray<AiUsagePattern | null | undefined> | null | undefined,
  ctx: UsagePatternGateContext,
): UsagePatternGateResult {
  const head = ctx.headword.trim();
  const lang = normalizeTargetLanguage(ctx.language);
  const dropped: UsagePatternGateResult["dropped"] = [];
  const warnings: UsagePatternGateResult["warnings"] = [];
  const seenChunk = new Set<string>();
  const kept: Array<{ p: UsagePattern; weak: boolean; i: number }> = [];

  (raw ?? []).forEach((r, i) => {
    if (!r) return;
    const rawParts = (r.chunk?.parts ?? []).filter((p) => p && typeof p.text === "string");
    const label = chunkKey(rawParts, lang) || (r.example?.sentence ?? "").trim() || `#${i + 1}`;
    const drop = (reason: UsagePatternDropReason) => dropped.push({ text: label, reason });

    const gate = gateUsageChunks([r.chunk], ctx);
    const chunk = gate.kept[0];
    if (!chunk) {
      drop(`chunk_${gate.dropped[0]?.reason ?? "shape"}`);
      return;
    }
    const key = chunkKey(chunk.parts, lang);
    if (seenChunk.has(key)) {
      drop("duplicate_chunk");
      return;
    }
    const ex = checkExamplePattern(
      {
        sentence: r.example?.sentence,
        translation: r.example?.translation,
        scene: r.scene,
        scene_fits: r.example?.scene_fits,
      },
      { headword: head, language: ctx.language, readerLang: ctx.readerLang },
    );
    if (!ex.ok) {
      drop(`example_${ex.issue}`);
      return;
    }
    if (r.scene_general === false) {
      drop("scene_specific");
      return;
    }
    const mine = { scene: ex.scene, sentence: ex.sentence };
    if (
      kept.some((k) =>
        nearDuplicateExample({ scene: k.p.scene, sentence: k.p.example.zh }, mine, head),
      )
    ) {
      drop("duplicate_example");
      return;
    }
    if (ex.translation && similarity(ex.scene, ex.translation) >= SCENE_DUPLICATE_AT) {
      warnings.push({ text: label, reason: "scene_like_translation" });
    }
    seenChunk.add(key);
    const chunks = r.example?.chunks ?? [];
    kept.push({
      i,
      weak: isWeakPartnerChunk(chunk.parts, head, lang),
      p: {
        kind: r.kind,
        scene: ex.scene,
        share: Number.isFinite(r.share) ? r.share : 0,
        chunk,
        example: {
          zh: ex.sentence,
          ja: ex.translation,
          chunk_in_example: chunkInSentence(chunk, ex.sentence, lang) !== null,
          // 語に分けた物は、その文を分けた物の時だけ（別の文・直した文を分けて返した回は使わない）。
          chunks: chunksMatchSentence(chunks, ex.sentence) ? chunks : [],
        },
        note: readerText((r.note ?? "").trim(), ctx.readerLang, ex.sentence).trim(),
      },
    });
  });

  // share の大きい順（同じなら返ってきた順）。
  kept.sort((a, b) => b.p.share - a.p.share || a.i - b.i);
  // 同じ kind が3つ以上なら、3つ目以降を share に関係なく後ろへ（種類が偏らないため）。
  const count = new Map<string, number>();
  const front: typeof kept = [];
  const back: typeof kept = [];
  for (const k of kept) {
    const n = count.get(k.p.kind) ?? 0;
    if (n >= 2) {
      back.push(k);
    } else {
      front.push(k);
      count.set(k.p.kind, n + 1);
    }
  }
  const ordered = [...front, ...back];
  // 弱い相手は最後へ。強い公式が2つ以上あれば落とす。
  const strong = ordered.filter((k) => !k.weak);
  const weak = ordered.filter((k) => k.weak);
  const chosen = strong.length >= 2 ? strong : [...strong, ...weak];
  if (strong.length >= 2) {
    for (const w of weak)
      dropped.push({ text: chunkKey(w.p.chunk.parts, lang), reason: "generic_partner" });
  }
  for (const over of chosen.slice(MAX_USAGE_PATTERNS)) {
    dropped.push({ text: chunkKey(over.p.chunk.parts, lang), reason: "over_limit" });
  }
  return { kept: chosen.slice(0, MAX_USAGE_PATTERNS).map((k) => k.p), dropped, warnings };
}

// --- 今までの欄 -------------------------------------------------------------------------------------

/** パターンの例文を、今までの例文の形（`pickExamplePatterns` の返す形）に。 */
export function examplesFromPatterns(kept: ReadonlyArray<UsagePattern>): PickedExample[] {
  return kept
    .filter((p) => (p.example?.zh ?? "").trim())
    .map((p) => ({
      sentence: p.example.zh,
      translation: p.example.ja,
      scene: p.scene,
      chunks: p.example.chunks ?? [],
    }));
}

/**
 * パターンの例文を、AI が返す例文のパターンの形（`ExamplePattern`）に。見出し語が入力と変わった回に、予備の例文
 * （`example_fallback`）と一緒に `pickExamplePatterns` へ通すため。門はもう通っているので自己点検は true。
 */
export function asExamplePatterns(kept: ReadonlyArray<UsagePattern>): ExamplePattern[] {
  return examplesFromPatterns(kept).map((e, i) => ({
    situation: "",
    share: kept[i]?.share ?? 0,
    sentence: e.sentence,
    translation: e.translation,
    scene: e.scene,
    chunks: e.chunks,
    scene_fits: true,
  }));
}

/** パターンから書く `usage_patterns` / `usage_v` / `usage_chunks`（公式の写し — 古い画面と `sectionHasContent` のため）。 */
export function usageFieldsFromPatterns(kept: ReadonlyArray<UsagePattern>): {
  usage_patterns: UsagePattern[];
  usage_v: number;
  usage_chunks: UsageChunk[];
} {
  return {
    usage_patterns: [...kept],
    usage_v: USAGE_PROMPT_VERSION,
    usage_chunks: kept.map((p) => p.chunk),
  };
}

/**
 * **今までの欄をパターンから書く**（古い iOS・Web・`sectionHasContent`・復習の答えを壊さない）。
 *
 * - `usage_chunks` = パターンの公式、`usage_patterns` / `usage_v`
 * - 例文の欄: 1つ目のパターンの例文 → `example_sentence` / `example_translation` / `example_scene(_for)` / `example_chunks` /
 *   `example_v`、2つ目から → `examples_extra`（`withExtra` の時、`scene_for` 付き）、`example_pattern_count`
 *   （`applyExamplePatterns` と同じ写し方）
 * - **決まったメインの例文**（`fixedMain` — 共有の行にもう在る文）は**変えない**: その文の札（`label`）を付け、
 *   パターンの例文は全部 `examples_extra` に（その文と同じ・似た物は落とす — `applyFixedMainExample`）
 * - パターンが1つも無ければ例文の欄は書かない（`example_sentence` は無い）
 */
export function legacyFieldsFromPatterns(
  kept: ReadonlyArray<UsagePattern>,
  opts: {
    headword: string;
    withExtra: boolean;
    fixedMain?: {
      sentence: string;
      label: CheckedMainLabel | null;
      /** その文の今の訳（札に訳が無い時に残す）。 */
      translation?: string | null;
    } | null;
  },
): { example_sentence?: string; example_translation?: string; extras: Record<string, unknown> } {
  const usage = usageFieldsFromPatterns(kept);
  const examples = examplesFromPatterns(kept);
  if (opts.fixedMain?.sentence) {
    const card = applyFixedMainExample(
      {
        example_sentence: opts.fixedMain.sentence,
        example_translation: opts.fixedMain.translation ?? "",
        extras: {} as Record<string, unknown>,
      },
      {
        sentence: opts.fixedMain.sentence,
        label: opts.fixedMain.label,
        extras: examples,
        withExtra: opts.withExtra,
        headword: opts.headword,
      },
    );
    return {
      example_sentence: card.example_sentence,
      example_translation: card.example_translation,
      extras: { ...card.extras, ...usage },
    };
  }
  const card = applyExamplePatterns(
    { example_sentence: "", example_translation: "", extras: {} as Record<string, unknown> },
    examples,
    { withExtra: opts.withExtra },
  );
  return {
    ...(card.example_sentence
      ? { example_sentence: card.example_sentence, example_translation: card.example_translation }
      : {}),
    extras: { ...card.extras, ...usage },
  };
}
