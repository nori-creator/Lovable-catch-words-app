import {
  explanationCacheKey,
  keepShownFields,
  readCachedExplanation,
  writeCachedExplanation,
} from "./explanation-cache";
import { shouldWriteSharedColumns, type ExplanationKey } from "./word-explanation";
import type { WordExplanationResult } from "./word-explanation.functions";

/**
 * **その人向けの解説（`word_explanations`）を引く・作る道を1つにする**
 * （オーナー報告 2026-10-02、英語と繁體中文の両方「復習の答え合わせに訳が出ない。日本語の
 * 表示なら出る」）。
 *
 * 単語の詳細（`StickerSheet`）は前から、その人向けの解説を引き、無ければ作っていた。
 * 復習は共有の `words.extras`（最初に作った人の言語）だけを見ていたので、日本語で作った語を
 * 英語・繁體中文で読む人には、訳が全部落ちていた。復習も**同じ問い合わせ・同じ鍵・同じ
 * 保存の形**を使う — 別々に書くと、片方だけ鍵がずれて「開くたびに作り直す」に戻る
 * （`word-explanation.ts` の注）。
 */

/** 解説の問い合わせ（単語の詳細と復習で同じ鍵 — どちらで引いても、もう一方は読み直さない）。 */
export function wordExplanationQuery(
  fetchExplanation: (args: {
    data: { word_id: string; explain_lang: string; l1: string };
  }) => Promise<WordExplanationResult>,
  wordId: string | null | undefined,
  key: ExplanationKey,
  /** 端末に覚えた返事（`readExplanationCache`。描くたびに読まないよう、呼ぶ側で覚えておく）。 */
  cached: WordExplanationResult | undefined,
) {
  const cacheKey = wordId ? explanationCacheKey(wordId, key.explainLang, key.l1) : null;
  return {
    queryKey: ["word-explanation", wordId ?? null, key.explainLang, key.l1] as const,
    queryFn: async () => {
      const r = await fetchExplanation({
        data: { word_id: wordId!, explain_lang: key.explainLang, l1: key.l1 },
      });
      if (cacheKey && !r.unavailable && r.picked) writeCachedExplanation(cacheKey, r);
      return r;
    },
    initialData: cached,
    // 覚えた物は「少し古い」扱いにして、開くたびに裏で確かめ直す。
    initialDataUpdatedAt: cached ? 0 : undefined,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  };
}

/** 端末に覚えたその語の解説（無ければ undefined）。 */
export function readExplanationCache(
  wordId: string | null | undefined,
  key: ExplanationKey,
): WordExplanationResult | undefined {
  return wordId
    ? readCachedExplanation<WordExplanationResult>(
        explanationCacheKey(wordId, key.explainLang, key.l1),
      )
    : undefined;
}

/** `generateCard` が返す物のうち、保存に使う所。 */
export type GeneratedCardLike<E> = {
  extras: E;
  meaning_ja?: string | null;
  reading_zhuyin?: string | null;
  pinyin?: string | null;
  part_of_speech?: string | null;
  level?: string | null;
  example_sentence?: string | null;
  example_translation?: string | null;
};

/**
 * 作った解説を `updateWordExtras` に渡す形にする（単語の詳細と復習で同じ）。
 *
 * - いま画面に出ている項目は残し、空だった項目だけ埋める（`keepShownFields`）
 * - **その人の言語で作った意味**は `reader_meaning` で送る（その人向けの行の意味になる。
 *   前は共有の意味 = 別の言語が写っていた）
 * - 共有の列（`patch`）は**実際に欠けているときだけ**（`shouldWriteSharedColumns`）
 */
export function readerExplanationSaveInput<E>(input: {
  wordId: string;
  shared: {
    meaning_ja?: string | null;
    reading_zhuyin?: string | null;
    pinyin?: string | null;
    example_sentence?: string | null;
  };
  card: GeneratedCardLike<E>;
  shownExtras: Record<string, unknown> | null;
}) {
  const { card, shared } = input;
  const sharedMissing = shouldWriteSharedColumns({
    meaning: shared.meaning_ja,
    reading: shared.reading_zhuyin || shared.pinyin,
    example: shared.example_sentence,
  });
  const opt = (v: string | null | undefined) => v ?? undefined;
  return {
    word_id: input.wordId,
    extras: keepShownFields(
      input.shownExtras,
      card.extras as unknown as Record<string, unknown>,
    ) as unknown as E,
    reader_meaning: card.meaning_ja || undefined,
    patch: !sharedMissing
      ? undefined
      : {
          reading_zhuyin: opt(card.reading_zhuyin),
          pinyin: opt(card.pinyin),
          part_of_speech: opt(card.part_of_speech),
          level: opt(card.level),
          example_sentence: opt(card.example_sentence),
          example_translation: opt(card.example_translation),
          meaning_ja: opt(card.meaning_ja),
        },
  };
}

/**
 * いま作っている語（`語:言語:母語`）。**同じ語を2か所で同時に作らない**
 * （復習の札と、そこから開いた単語の詳細）。
 */
const inFlight = new Set<string>();

export function claimReaderExplanation(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export function releaseReaderExplanation(key: string): void {
  inFlight.delete(key);
}
