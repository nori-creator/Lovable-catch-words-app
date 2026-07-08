import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, MapPin, Clock, Loader2, Settings2, ChevronUp, Sparkles } from "lucide-react";
import { WordCard, WordCardSectionsEditor } from "@/components/WordCard";
import { getSticker, updateWordExtras } from "@/lib/stickers.functions";
import { generateCard } from "@/lib/ai.functions";


type Props = {
  stickerId: string | null;
  onClose: () => void;
};

export function StickerSheet({ stickerId, onClose }: Props) {
  const fetchSticker = useServerFn(getSticker);
  const enrichWord = useServerFn(generateCard);
  const saveExtras = useServerFn(updateWordExtras);
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId! } }),
    enabled: !!stickerId,
    staleTime: 5 * 60 * 1000,
  });
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const enrichedRef = useRef<Set<string>>(new Set());

  // Auto-enrich word details (collocations, synonyms, etymology, examples, etc.)
  // the first time a word without extras is opened.
  useEffect(() => {
    if (!s) return;
    const ex = s.word.extras;
    const isEmpty =
      !ex ||
      (!ex.collocations.length && !ex.synonyms.length && !ex.antonyms.length &&
       !ex.etymology && !ex.mnemonic && !ex.trivia && !ex.common_situation &&
       !ex.usage_note && !ex.examples_extra.length);
    if (!isEmpty) return;
    if (enrichedRef.current.has(s.word_id)) return;
    enrichedRef.current.add(s.word_id);
    setEnriching(true);
    (async () => {
      try {
        const card = await enrichWord({ data: { headword: s.word.headword, targetLanguage: "zh-TW" } });
        await saveExtras({
          data: {
            word_id: s.word_id,
            extras: card.extras,
            patch: {
              reading_zhuyin: card.reading_zhuyin,
              pinyin: card.pinyin,
              part_of_speech: card.part_of_speech,
              level: card.level,
              example_sentence: card.example_sentence,
              example_translation: card.example_translation,
            },
          },
        });
        await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
      } catch (e) {
        console.warn("Enrichment failed", e);
      } finally {
        setEnriching(false);
      }
    })();
  }, [s, stickerId, enrichWord, saveExtras, qc]);

  // reset flip when sticker changes
  useEffect(() => {
    setFlipped(false);
    setEditing(false);
  }, [stickerId]);

  // lock body scroll while open
  useEffect(() => {
    if (!stickerId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stickerId]);

  // ESC to close
  useEffect(() => {
    if (!stickerId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stickerId, onClose]);

  if (!stickerId) return null;

  const hasSelfie = !!s?.selfie_url;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-200">
      {/* Close bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
        <span className="pl-1 text-xs font-medium text-muted-foreground">
          {s ? s.word.headword : "..."}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label="表示項目を編集"
            className={`lift-soft inline-flex h-9 w-9 items-center justify-center rounded-full border border-border ${editing ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="lift-soft inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Settings panel — slides down from top */}
      <div
        className={`fixed left-0 right-0 top-[52px] z-20 transition-all duration-300 ease-out ${
          editing ? "translate-y-0 opacity-100" : "-translate-y-4 pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-3 mt-2 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">表示する項目と順番</p>
            <button
              onClick={() => setEditing(false)}
              className="lift-soft inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary"
              aria-label="閉じる"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
          {s && <WordCardSectionsEditor />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        {isLoading || !s ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Hero — expands with pop-in. Tap to flip selfie ↔ object */}
            <div
              className="perspective-1200 mb-4"
              onClick={() => hasSelfie && setFlipped((f) => !f)}
            >
              <div
                className={`card-flip relative aspect-[4/5] w-full ${hasSelfie ? "cursor-pointer" : ""} ${flipped ? "flipped" : ""}`}
              >
                {/* Front: original photo WITH background — fills the frame, no side gutters */}
                <div className="card-face absolute inset-0 overflow-hidden rounded-3xl shadow-xl">
                  {s.object_url ? (
                    <img
                      src={s.object_url}
                      alt={`「${s.word.headword}」の写真`}
                      className="hero-pop absolute inset-0 h-full w-full object-cover"
                    />
                  ) : s.cutout_url ? (
                    <img
                      src={s.cutout_url}
                      alt={s.word.headword}
                      className="hero-pop absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-secondary text-7xl">
                      {s.word.silhouette_emoji ?? "📦"}
                    </div>
                  )}
                  {hasSelfie && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">
                      タップで自撮りへ
                    </span>
                  )}
                </div>

                {/* Back: the selfie (you + the thing) */}
                <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl bg-secondary shadow-xl">
                  {hasSelfie ? (
                    <>
                      <img src={s.selfie_url!} alt="撮影者の自撮り" className="absolute inset-0 h-full w-full object-cover" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">
                        タップで戻る
                      </span>
                    </>
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">自撮りなし</div>
                  )}
                </div>
              </div>
            </div>

            {/* When & Where chip */}
            <section className="mb-4 rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(s.created_at).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                {(s.location_name || (s.lat != null && s.lng != null)) && (
                  <a
                    href={
                      s.lat != null && s.lng != null
                        ? `https://www.google.com/maps?q=${s.lat},${s.lng}`
                        : `https://www.google.com/maps?q=${encodeURIComponent(s.location_name ?? "")}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="lift inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {s.location_name ?? "地図で開く"}
                  </a>
                )}
              </div>
              {s.caption && <p className="mt-2 text-sm">「{s.caption}」</p>}
            </section>

            <WordCard
              word={{
                headword: s.word.headword,
                reading_zhuyin: s.word.reading_zhuyin,
                pinyin: s.word.pinyin,
                meaning_ja: s.word.meaning_ja,
                part_of_speech: s.word.part_of_speech,
                level: s.word.level,
                example_sentence: s.word.example_sentence,
                example_translation: s.word.example_translation,
                extras: s.word.extras,
              }}
            />

            {enriching && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-2 text-xs text-primary">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                詳しい解説をAIが準備中…
              </div>
            )}

            {s.lat != null && s.lng != null && (
              <a
                href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-5 block overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
              >
                <iframe
                  title="撮影場所のマップ"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.005}%2C${s.lat - 0.003}%2C${s.lng + 0.005}%2C${s.lat + 0.003}&layer=mapnik&marker=${s.lat}%2C${s.lng}`}
                  className="pointer-events-none h-48 w-full"
                  loading="lazy"
                />
                <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {s.location_name ?? "撮影地"}
                  </span>
                  <span className="text-primary">Google マップで開く →</span>
                </div>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
