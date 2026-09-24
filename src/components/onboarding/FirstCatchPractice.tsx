import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { sampleStickers } from "./FirstCatchHome";
import { DexCoverFlow } from "../DexCoverFlow";
import { DexAlbumGrid, DexHeader } from "@/routes/_authenticated/dex";
import { LightModeCard } from "@/routes/_authenticated/review";
import type { DueReviewCard } from "@/lib/reviews.functions";
import { Spotlight } from "./Spotlight";

export function FirstCatchDex({ draft, onOpen }: { draft: FirstCatch; onOpen: () => void }) {
  const t = useT();
  const lang = useTargetLang();
  const [view, setView] = useState<"cards" | "gallery">("cards");
  const [browsed, setBrowsed] = useState(false);
  const [changed, setChanged] = useState(false);
  const memory = useMemo(() => new Map(), []);
  const items = useMemo(() => {
    const own = firstCatchSticker(draft);
    return [...(own ? [own] : []), ...sampleStickers(draft, t, lang)];
  }, [draft, t, lang]);
  return (
    <div className="first-dex-stage">
      <section data-tour="dex">
        <DexHeader
          found={items.length}
          caught={items.length}
          view={view}
          onView={(v) => {
            if (v === "cards" || v === "gallery") {
              setView(v);
              if (v === "gallery") setChanged(true);
            }
          }}
          allowedViews={["gallery", "cards"]}
          filter={{ category: null, day: null }}
          onFilter={() => {}}
          categories={[]}
          days={[]}
        />
        {view === "cards" ? (
          <DexCoverFlow
            stickers={items}
            memory={memory}
            onBrowse={() => setBrowsed(true)}
            onOpen={(id) => {
              if (id === draft.id && browsed && changed) onOpen();
            }}
          />
        ) : (
          <DexAlbumGrid
            items={items}
            memory={memory}
            onOpen={(id) => {
              if (id === draft.id && browsed && changed) onOpen();
            }}
          />
        )}
      </section>
      <Spotlight
        target='[data-tour="dex"]'
        title={t("first.dexTitle")}
        text={t(!browsed ? "first.dexSwipe" : !changed ? "first.dexTypes" : "first.dexOpen")}
        interactive
        step="3 / 5"
        nextLabel={t("first.openWord")}
        onNext={browsed && changed ? onOpen : undefined}
      />
    </div>
  );
}

export function practiceCard(
  sticker: NonNullable<ReturnType<typeof firstCatchSticker>>,
  alternatives: string[],
): DueReviewCard {
  const w = sticker.word;
  const choices = [...new Set([w.headword, ...alternatives])].slice(0, 4);
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
    prompt_pattern: null,
    blur_seen: false,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    retention: 100,
    mode: "reverse",
    choices: [],
    headword_choices: choices,
    headword_choice_infos: choices.map((headword) => ({
      headword,
      zhuyin: headword === w.headword ? w.reading_zhuyin : null,
      pinyin: headword === w.headword ? w.pinyin : null,
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
  const samples = sampleStickers(draft, t, lang);
  const own = firstCatchSticker(draft);
  const sample = samples.find((s) => s.word.headword !== own?.word.headword) ?? samples[0];
  const cards = [own ?? samples[0], sample];
  return (
    <>
      <h1 className="text-title font-bold">
        {t("nav.review")}{" "}
        <span className="text-footnote text-muted-foreground">
          {index + 1} / {cards.length}
        </span>
      </h1>
      <p className="first-tour-copy">{t("first.review")}</p>
      <div className="first-review-exercise" data-tour="review">
        <LightModeCard
          key={index}
          card={practiceCard(
            cards[index],
            samples.map((s) => s.word.headword),
          )}
          practice
          onNext={() => {
            if (index + 1 < cards.length) setIndex(index + 1);
            else onComplete();
          }}
        />
      </div>
    </>
  );
}
