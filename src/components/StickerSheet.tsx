import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, MapPin, Clock, Loader2, Settings2 } from "lucide-react";
import { WordCard, type WordCardHandle } from "@/components/WordCard";
import { getSticker } from "@/lib/stickers.functions";


type Props = {
  stickerId: string | null;
  onClose: () => void;
};

export function StickerSheet({ stickerId, onClose }: Props) {
  const fetchSticker = useServerFn(getSticker);
  const { data: s, isLoading } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId! } }),
    enabled: !!stickerId,
  });
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef<WordCardHandle>(null);
  const [editing, setEditing] = useState(false);


  // reset flip when sticker changes
  useEffect(() => {
    setFlipped(false);
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-200">
      {/* Close bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
        <span className="pl-1 text-xs font-medium text-muted-foreground">
          {s ? s.word.headword : "..."}
        </span>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="lift-soft inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        {isLoading || !s ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Hero — expands with pop-in. Tap to flip selfie ↔ cutout */}
            <div
              className="perspective-[1200px] mb-4"
              onClick={() => setFlipped((f) => !f)}
            >
              <div
                className={`card-flip relative aspect-square w-full overflow-hidden rounded-3xl shadow-xl cursor-pointer ${flipped ? "flipped" : ""}`}
              >
                <div className="card-face absolute inset-0 grid place-items-center bg-secondary overflow-hidden">
                  {/* Front: original photo WITH background */}
                  {s.object_url ? (
                    <img
                      src={s.object_url}
                      alt={`「${s.word.headword}」の写真`}
                      className="hero-pop h-full w-full object-cover"
                    />
                  ) : s.cutout_url ? (
                    <img src={s.cutout_url} alt={s.word.headword} className="hero-pop max-h-[92%] max-w-[92%] object-contain" />
                  ) : (
                    <span className="text-7xl">{s.word.silhouette_emoji ?? "📦"}</span>
                  )}
                  {s.selfie_url && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">
                      タップで自撮りへ
                    </span>
                  )}
                </div>
                <div className="card-face card-back absolute inset-0 overflow-hidden bg-secondary">
                  {/* Back: the selfie (you + the thing) */}
                  {s.selfie_url ? (
                    <img src={s.selfie_url} alt="撮影者の自撮り" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      自撮りなし
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* When & Where chip — tap location to open in maps */}
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

            {/* The full word card — same component shown on capture */}
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
