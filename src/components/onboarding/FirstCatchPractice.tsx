import { StickerSheet } from "../StickerSheet";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { sampleStickers, FirstCatchShell } from "./FirstCatchHome";
import { DexSurface, filterDexStickers, type ViewMode } from "@/routes/_authenticated/dex";
import { NO_FILTER, categoryOptions, dayOptions } from "@/lib/dex-filter";
import {
  ReviewQuestion,
  ReviewSessionHeader,
  memWordOf,
  ForgettingCurveModal,
} from "@/routes/_authenticated/review";
import type { DueReviewCard, MemoryWord } from "@/lib/reviews.functions";
import { Spotlight } from "./Spotlight";

export function FirstCatchDex({ draft, onOpen }: { draft: FirstCatch; onOpen: () => void }) {
  const t = useT();
  const lang = useTargetLang();
  const [openedSample, setOpenedSample] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(NO_FILTER);
  const [browsed, setBrowsed] = useState(false);
  const [changed, setChanged] = useState(false);
  const memory = useMemo(() => new Map(), []);
  const items = useMemo(() => {
    const own = firstCatchSticker(draft);
    return [
      ...(own ? [own] : []),
      ...sampleStickers(draft, t, lang).filter(
        (sample) =>
          sample.word.headword !== own?.word.headword && sample.object_url !== own?.object_url,
      ),
    ];
  }, [draft, t, lang]);
  const openWord = (id: string) => {
    if (!browsed || !changed) return;
    if (id === draft.id) onOpen();
    else setOpenedSample(id);
  };
  return (
    <>
      <DexSurface
        captured={items}
        filtered={filterDexStickers(items, filter, search, t)}
        view={view}
        onView={(next) => {
          setView(next);
          // 案内は「ギャラリー表示」の釦だけを開けている（次のコマで自分の1枚を押すため）。
          if (next === "gallery") setChanged(true);
        }}
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        categories={categoryOptions(items)}
        days={dayOptions(items)}
        memory={memory}
        onBrowse={() => setBrowsed(true)}
        onOpen={openWord}
      />
      {openedSample ? (
        <StickerSheet
          stickerId={openedSample}
          local={{ sticker: items.find((item) => item.id === openedSample)! }}
          onClose={() => setOpenedSample(null)}
        />
      ) : (
        /*
         * 図鑑の3コマ（PRODUCT.md「swipe the real Collection cards, switches between cards
         * and gallery, then opens their own word detail」）。枠は毎回**押す所そのもの**を
         * 囲う — 前は図鑑の画面全体を照らし、その中に2つ目の枠を重ねていたので、
         * 枠が画面の外まで広がり、どこを触るのか二重に見えた。
         *   写真を横に払う → ギャラリー表示の釦 → 自分の1枚を押して開く。
         */
        <Spotlight
          target={
            !browsed
              ? ".dex-cf__stage"
              : !changed
                ? '[data-tour="dex-views"] [data-view="gallery"]'
                : `#dex-cell-${draft.id}`
          }
          title={t(
            !browsed ? "first.dexTitle" : !changed ? "first.dexViewsTitle" : "first.openTitle",
          )}
          text={t(!browsed ? "first.dexSwipe" : !changed ? "first.dexTypes" : "first.dexOpen")}
          interactive
          allowSelector={
            !browsed
              ? ".dex-cf__stage, .dex-cf__stage *"
              : changed
                ? `[data-dex-item="${draft.id}"]`
                : undefined
          }
          gesture={!browsed ? "swipe" : "tap"}
          step="3 / 5"
        />
      )}
    </>
  );
}

export function practiceCard(
  sticker: NonNullable<ReturnType<typeof firstCatchSticker>>,
  pool: ReadonlyArray<NonNullable<ReturnType<typeof firstCatchSticker>>>,
): DueReviewCard {
  const w = sticker.word;
  const choices = [...new Set([w.headword, ...pool.map((p) => p.word.headword)])].slice(0, 4);
  // 選択肢の**全部**に読みを付ける（本物の4択と同じ。正解だけに付けると答えが透ける）。
  const readingOf = new Map(
    [...pool, sticker].map((p) => [
      p.word.headword,
      { zhuyin: p.word.reading_zhuyin || null, pinyin: p.word.pinyin || null },
    ]),
  );
  // Stable ordering; never substitutes a sample for the learner's photographed word.
  choices.push(choices.shift()!);
  return {
    review_id: sticker.id,
    sticker_id: sticker.id,
    word_id: sticker.word_id,
    headword: w.headword,
    language: w.language,
    reading_zhuyin: w.reading_zhuyin,
    pinyin: w.pinyin,
    meaning_ja: w.meaning_ja,
    example_sentence: w.example_sentence,
    example_translation: w.example_translation,
    top_chunk: null,
    explain: null,
    category_key: w.category_key,
    entry_type: "word",
    cutout_url: null,
    object_url: sticker.object_url,
    placeholder_url: null,
    audio_url: null,
    caption: null,
    location_name: null,
    taken_at: sticker.taken_at,
    review_count: 0,
    lapses: 0,
    photo_count: 1,
    blur_seen: false,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    // 撮っただけの語はまだ覚えていない = 0%（本番の `retentionNow` と同じ。2026-10-02）。
    retention: 0,
    mode: "reverse",
    choices: [],
    headword_choices: choices,
    headword_choice_infos: choices.map((headword) => ({
      headword,
      zhuyin: readingOf.get(headword)?.zhuyin ?? null,
      pinyin: readingOf.get(headword)?.pinyin ?? null,
    })),
  };
}
export function FirstCatchReview({
  draft,
  onComplete,
}: {
  draft: FirstCatch;
  onComplete: () => void;
}) {
  const t = useT();
  const lang = useTargetLang();
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [memoryWord, setMemoryWord] = useState<MemoryWord | null>(null);
  const [introduced, setIntroduced] = useState(false);
  /**
   * 説明を読んだ後も、**押す所を他の段と同じ案内の枠（`Spotlight`）で囲う**
   * （オーナー指示 2026-09-30「次に進むためにどこタップすればいいか一目瞭然となるように」）。
   * 選択肢 → 答えの「次へ」の順。**4択の部品そのものには手を入れない**
   * （同日「チュートリアルの4択が本物と異なってる。チュートリアルだから勝手に作らないで」）。
   * 答えの面は `document.body` へ出る部品なので、出たかどうかは画面から見る。
   */
  const [answerOpen, setAnswerOpen] = useState(false);
  useEffect(() => {
    if (!introduced) return;
    const check = () => setAnswerOpen(!!document.querySelector('[data-tour="review-next"]'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [introduced]);
  const samples = sampleStickers(draft, t, lang);
  const own = firstCatchSticker(draft);
  const sample = samples.find((s) => s.word.headword !== own?.word.headword) ?? samples[0];
  const cards = [own ?? samples[0], sample];
  const memoryWords = cards.map((card) => memWordOf(practiceCard(card, samples)));
  return (
    <FirstCatchShell tab={3} fixedViewport={!expanded}>
      <ReviewSessionHeader
        compact={!expanded}
        header={{
          progress: (index / cards.length) * 100,
        }}
        memOverview={{ danger: 0, fuzzy: 0, solid: memoryWords.length, words: memoryWords }}
        memListOpen={expanded}
        onToggle={() => setExpanded((value) => !value)}
        onOpenWord={setMemoryWord}
      />
      <ReviewQuestion
        key={index}
        card={practiceCard(cards[index], samples)}
        practice
        onNext={() => {
          if (index + 1 < cards.length) setIndex(index + 1);
          else onComplete();
        }}
      />
      {/* 1つの案内で3コマ（説明 → 選択肢 → 答えの「次へ」）。枠は画面を明るく戻さずに
          次の所へ滑る。札は問題文と答えの面を隠さない所に置く。 */}
      {!memoryWord && !expanded && (
        <Spotlight
          target={
            !introduced
              ? '[data-tour="review-question"]'
              : answerOpen
                ? // 答え合わせは**面ごと**囲って明るく見せる（オーナー指示 2026-10-03「答え合わせの
                  // 部分が灰色で見えないから青い枠で囲うのは解答の解説全体にして」）。
                  '[data-tour="review-answer"] > div'
                : '[data-tour="review-choices"]'
          }
          primary={answerOpen && introduced ? '[data-tour="review-next"]' : undefined}
          allowSelector={
            answerOpen && introduced
              ? '[data-tour="review-next"], [data-tour="review-answer"] button[aria-label]'
              : undefined
          }
          title={t(
            !introduced
              ? "first.reviewTitle"
              : answerOpen
                ? "first.reviewNextTitle"
                : "first.reviewPickTitle",
          )}
          text={
            !introduced
              ? t("first.review")
              : answerOpen
                ? t("first.reviewNext", { next: t("review.next") })
                : t("first.reviewPick")
          }
          step="5 / 5"
          nextLabel={!introduced ? t("first.next") : undefined}
          onNext={!introduced ? () => setIntroduced(true) : undefined}
          interactive={introduced}
          gesture="tap"
          keepVisible={
            !introduced
              ? undefined
              : answerOpen
                ? '[data-tour="review-prompt"]'
                : '[data-tour="review-prompt"], [data-tour="review-question"] .quiz-photo'
          }
        />
      )}
      {memoryWord && (
        <ForgettingCurveModal word={memoryWord} local onClose={() => setMemoryWord(null)} />
      )}
    </FirstCatchShell>
  );
}
