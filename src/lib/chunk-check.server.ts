/**
 * **AI が作ったチャンク（usage_chunks）を、別の呼び出しでもう一度点検する**（オーナー報告 2026-10-14
 * 「チャンクが文法的に間違っている箇所が多くある… 一つ一つ点検して。修正またチャンクの出力の指示の精度を
 * 高めて」）。
 *
 * 作る指示（`ai.functions.ts` の `CHUNK_DEFINITION_RULE` など）を厳しくしても、返ってくる型の誤り
 * （語順・1語でない物をつないだパーツ・品詞・文になっている物・量詞の型）は 0 にならない。そこで
 * 作った後に**点検だけをする呼び出し**を1回足し、誤った型は直すか外す。新しい型は足させない。
 *
 * - 点検に失敗した時・時間切れの時は、作った物をそのまま返す（カードを止めない）。
 * - 点検が全部外した時も、作った物は使わない（空なら画面はその欄を出さず、次に開いた時に作り直す）。
 * - 学ぶ語を含まない型・学ぶ語を slot にした型は、点検の後でもここで外す。
 */
import { z } from "zod";
import { ChunkPartSchema, type UsageChunk } from "./extras";

const CHECK_TIMEOUT_MS = 12_000;

const CheckedSchema = z.object({
  usage_chunks: z.array(z.object({ parts: z.array(ChunkPartSchema), ja: z.string().catch("") })),
});

export type ChunkCheckInput = {
  headword: string;
  /** 学ぶ言語の呼び名（「台湾華語」など）。 */
  languageName: string;
  /** 解説の言語の呼び名（訳を書く言語）。 */
  readerName: string;
  levelGoal: string;
  /** その言語の品詞の記号の決まり（`targetProfile(...).chunkPrompt.posRule`）。 */
  posRule: string;
  /** その言語の文法の注意（`targetProfile(...).chunkPrompt.formulaGrammar`）。 */
  grammarRule: string;
  chunks: UsageChunk[];
};

export function chunkCheckPrompt(i: ChunkCheckInput): string {
  return (
    `あなたは${i.languageName}のネイティブの言語教師です。学習者向けの単語カードの「使い方チャンク」を点検します。\n` +
    `学ぶ語: 「${i.headword}」（学習者の目標レベル ${i.levelGoal}）\n` +
    `チャンク = ネイティブがその語を使うときに最もよく・最も自然に口にする語の塊（使い方の公式）。\n\n` +
    `次の基準で**1つずつ**確かめ、誤りは直し、直せない物は外す。**新しいチャンクは足さない。**\n` +
    `1. 語順: パーツを左から読むと、ネイティブがそのまま言う自然な句になるか（語順の誤りは直す）。\n` +
    `2. 文法: 句として文法的に正しいか（例: 形容詞の述語に程度副詞、目的語は動詞の後ろ、裝 の目的語は中身）。\n` +
    `3. パーツ: 1語でない物を1つのパーツにつないでいないか（✗ 熱水馬克杯）。ネイティブが1塊で言う語を分けていないか（○ 去冰・半糖）。\n` +
    `4. 品詞: pos がその型の中での役割に合っているか。${i.posRule}\n` +
    `5. 文になっていないか: 主語＋動詞＋目的語を全部書いた文は外す。量詞の型（一個〇〇）は外す。\n` +
    `6. 学ぶ語「${i.headword}」が必ずどれかのパーツにあり、そのパーツは slot:false で alts なし。\n` +
    `7. slot:true のパーツは、入れ替えてよく使う名詞・形容詞・程度の副詞だけ。alts はどれを入れても自然な語だけを残す。\n` +
    `8. ja: 型ぜんぶの自然な訳（${i.readerName}）になっているか。誤訳は直す（✗ 裝熱水馬克杯 を「熱湯マグカップに入れる」）。\n` +
    `9. 頻度: ネイティブが実際によく言う形か。不自然・まれな物は外す。\n` +
    `${i.grammarRule}\n\n` +
    `点検するチャンク（JSON）:\n${JSON.stringify(i.chunks)}\n\n` +
    `出力は直した後の残すチャンクだけを、同じ形の JSON で: {"usage_chunks":[{"parts":[{"text":"","pos":"","slot":false,"ja":"","alts":[{"text":"","ja":""}]}],"ja":""}]}`
  );
}

/** 学ぶ語を含み、学ぶ語を入れ替えにしていない型だけを残す。 */
export function keepHeadwordChunks(headword: string, chunks: UsageChunk[]): UsageChunk[] {
  const head = headword.trim();
  return chunks.filter((c) => {
    const parts = c.parts ?? [];
    if (parts.length === 0) return false;
    const own = parts.filter((p) => p.text?.includes(head));
    if (own.length === 0) return false;
    return own.every((p) => !p.slot);
  });
}

/**
 * 点検する。AI を呼べない・時間切れ・形の崩れた返事のときは `chunks` をそのまま返す。
 * `run` は試験で差し替える（本物は `getAiFor("card", "chunk_check")` で呼ぶ）。
 */
export async function checkUsageChunks(
  input: ChunkCheckInput,
  run?: (prompt: string, signal: AbortSignal) => Promise<unknown>,
): Promise<UsageChunk[]> {
  if (input.chunks.length === 0) return input.chunks;
  const call =
    run ??
    (async (prompt: string, signal: AbortSignal) => {
      const [{ getAiFor, parseJsonFromAiText }, { generateText }] = await Promise.all([
        import("./ai-provider.server"),
        import("ai"),
      ]);
      const ai = await getAiFor("card", "chunk_check");
      const res = await generateText({
        model: ai.gateway(ai.modelRich),
        prompt,
        abortSignal: signal,
        maxRetries: 0,
      });
      return parseJsonFromAiText(res.text);
    });
  try {
    const raw = await call(chunkCheckPrompt(input), AbortSignal.timeout(CHECK_TIMEOUT_MS));
    const parsed = CheckedSchema.safeParse(raw);
    if (!parsed.success) return input.chunks;
    return keepHeadwordChunks(input.headword, parsed.data.usage_chunks as UsageChunk[]);
  } catch (e) {
    console.warn("[chunk-check] skipped:", (e as Error)?.message?.slice(0, 120));
    return input.chunks;
  }
}
