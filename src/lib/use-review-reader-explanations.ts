import { useEffect, useMemo, useRef } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useUiLang } from "./i18n";
import { getMyProfile } from "./profile.functions";
import { getWordExplanation } from "./word-explanation.functions";
import { generateCard } from "./ai.functions";
import { updateWordExtras } from "./stickers.functions";
import { readerL1 } from "./reader-language";
import { explanationKey, reviewNeedsReaderExplanation } from "./word-explanation";
import {
  claimReaderExplanation,
  readExplanationCache,
  readerExplanationSaveInput,
  releaseReaderExplanation,
  wordExplanationQuery,
} from "./reader-explanation";
import { explainOf, type ReviewExplain } from "./review-explain";
import { primeReaderMeaning } from "./reader-meanings";
import { readerMeaning } from "./note-language";
import { cardSectionsNow } from "./card-prefs";
import { reportBackgroundFailure } from "./background-failure";
import type { DueReviewCard } from "./reviews.functions";

/** 復習の札に重ねる、その人向けの解説（単語の詳細と同じ行から組む）。 */
export type ReaderReviewView = {
  /** その人向けの解説から組んだ答え合わせ。中身が無ければ null（server の物を使う）。 */
  explain: ReviewExplain | null;
  /** その人向けの解説の意味（読む人の言語。無ければ ""）。 */
  meaning: string;
};

/** 先に作っておく札の数（いまの札と次の札）。作るのに数秒かかるので、次の札の分を先に回す。 */
const LOOKAHEAD = 2;

/**
 * **復習の札にも、単語の詳細と同じ「その人向けの解説」を使う**（オーナー報告 2026-10-02、
 * 英語と繁體中文の両方「答え合わせに訳が無い・問いの意味が日本語」）。
 *
 * 1. 束の語ごとに、単語の詳細と**同じ問い合わせ**（同じ鍵・同じ端末の覚え置き）で引く
 * 2. 中身があれば、そこから答え合わせを組む（`explainOf`、読む人の言語で）
 * 3. 無く、共有の意味も読む人の言語でない語（`reviewNeedsReaderExplanation`）だけ、
 *    単語の詳細と**同じ生成の道**（`generateCard` → `updateWordExtras`）で作る。
 *    いまの札と次の札だけ、1つずつ（束を開いた瞬間に10語ぶん AI を呼ばない）
 *
 * 共有の意味が読む人の言語で書かれている語（日本語の表示で日本語の語）は 2 も 3 も
 * しない — server が組んだ物のまま、今の見え方は変わらない。
 */
export function useReviewReaderExplanations(
  cards: readonly DueReviewCard[] | undefined,
  index: number,
  enabled: boolean,
): Map<string, ReaderReviewView> {
  const uiLang = useUiLang();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchExplanation = useServerFn(getWordExplanation);
  const enrichWord = useServerFn(generateCard);
  const saveExtras = useServerFn(updateWordExtras);
  const { data: profile, isFetched: profileFetched } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    enabled,
    staleTime: 60_000,
  });
  // 鍵の決め方は単語の詳細と同じ（`StickerSheet` の `nativeLang` の注）。
  const p = profile as { native_language?: string; target_language?: string } | null | undefined;
  const l1 = readerL1({
    uiLanguage: uiLang,
    nativeLanguage: p?.native_language,
    targetLanguage: p?.target_language,
  });
  const wantKey = useMemo(() => explanationKey(uiLang, l1), [uiLang, l1]);
  // 引くのは**共有の意味が読む人の言語でない語だけ**。それ以外（日本語の表示で日本語の語）は
  // server が組んだ物のまま — 今の見え方も、問い合わせの数も変わらない。
  const list = useMemo(() => {
    const seen = new Set<string>();
    return (enabled ? (cards ?? []) : []).filter((c) => {
      if (!c.word_id || seen.has(c.word_id)) return false;
      if (readerMeaning(c.meaning_ja, uiLang).trim()) return false;
      seen.add(c.word_id);
      return true;
    });
  }, [cards, enabled, uiLang]);
  const cached = useMemo(
    () => list.map((c) => readExplanationCache(c.word_id, wantKey)),
    [list, wantKey],
  );
  const results = useQueries({
    queries: list.map((c, i) => ({
      ...wordExplanationQuery(fetchExplanation, c.word_id, wantKey, cached[i]),
      // 母語が分かってから引く（鍵がずれると別の行を見に行く）。読めなかった時は表示言語で。
      enabled: enabled && profileFetched,
    })),
  });

  const views = useMemo(() => {
    const out = new Map<string, ReaderReviewView>();
    list.forEach((c, i) => {
      const picked = results[i]?.data?.picked ?? null;
      if (!picked) return;
      out.set(c.word_id, {
        explain: explainOf(picked.extras, c.headword, c.language, uiLang),
        meaning: picked.meaning ?? "",
      });
    });
    return out;
  }, [list, results, uiLang]);

  /**
   * 足りない札だけ、単語の詳細と同じ道で作る。**1つずつ**（`chain`）。
   * 同じ語を単語の詳細が同時に作っていれば待たない（`claimReaderExplanation`）。
   */
  const chain = useRef<Promise<void>>(Promise.resolve());
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !cards?.length) return;
    for (const card of cards.slice(index, index + LOOKAHEAD)) {
      const at = list.findIndex((c) => c.word_id === card.word_id);
      if (at < 0) continue;
      const r = results[at];
      const needs = reviewNeedsReaderExplanation({
        loaded: !!r && r.isFetched,
        unavailable: !!r?.data?.unavailable,
        picked: r?.data?.picked ?? null,
        want: wantKey,
        sharedMeaning: card.meaning_ja,
      });
      if (!needs) continue;
      const guard = `${card.word_id}:${wantKey.explainLang}:${wantKey.l1}`;
      if (tried.current.has(guard)) continue;
      tried.current.add(guard);
      const picked = r?.data?.picked ?? null;
      chain.current = chain.current.then(async () => {
        if (!claimReaderExplanation(guard)) return;
        try {
          const generated = await enrichWord({
            data: {
              headword: card.headword,
              language: card.language,
              targetLanguage: card.language ?? undefined,
              sections: cardSectionsNow(),
            },
          });
          await saveExtras({
            data: readerExplanationSaveInput({
              wordId: card.word_id,
              shared: card,
              card: generated,
              // その人向けの行が既に在れば、その中身は残す（単語の詳細と同じ）。
              shownExtras:
                picked && picked.explain_lang === wantKey.explainLang && picked.l1 === wantKey.l1
                  ? (picked.extras as Record<string, unknown> | null)
                  : null,
            }),
          });
          if (generated.meaning_ja) {
            primeReaderMeaning(card.word_id, wantKey.explainLang, generated.meaning_ja);
          }
          await qc.invalidateQueries({ queryKey: ["word-explanation", card.word_id] });
        } catch (e) {
          // 作れなくても復習は続く（server が組んだ解説のまま）。記録には残す。
          reportBackgroundFailure("reader_explain", e, { word_id: card.word_id });
        } finally {
          releaseReaderExplanation(guard);
        }
      });
    }
  }, [enabled, cards, index, list, results, wantKey, enrichWord, saveExtras, qc]);

  return views;
}
