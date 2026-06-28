import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { WordCard } from "@/components/WordCard";
import { ForgettingCurveChart } from "@/components/ForgettingCurveChart";
import { getSticker } from "@/lib/stickers.functions";
import { getStickerMemoryHistory } from "@/lib/reviews.functions";
import { useState } from "react";
import { ArrowLeft, MapPin, Brain, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dex/$stickerId")({
  head: ({ params }) => ({
    meta: [
      { title: `カード ${params.stickerId.slice(0, 8)} — Catchwords` },
      { name: "description", content: "あなたが街でキャッチした言葉のカード詳細。意味・例文・発音、撮影場所、記憶曲線をまとめて確認できます。" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StickerDetailPage,
});

function StickerDetailPage() {
  const { stickerId } = Route.useParams();
  const fetchSticker = useServerFn(getSticker);
  const fetchMemory = useServerFn(getStickerMemoryHistory);
  const { data: s, isLoading } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId } }),
  });
  const { data: mem } = useQuery({
    queryKey: ["memory", stickerId],
    queryFn: () => fetchMemory({ data: { sticker_id: stickerId } }),
  });
  const [flipped, setFlipped] = useState(false);

  return (
    <AppShell title="カード">
      <Link to="/dex" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 図鑑へ戻る
      </Link>

      {isLoading ? (
        <div className="aspect-square animate-pulse rounded-3xl bg-secondary" />
      ) : !s ? (
        <p className="text-sm text-muted-foreground">カードが見つかりませんでした。</p>
      ) : (
        <>
          {/* Hero image: expands with a soft pop-in. Tap to flip to selfie. */}
          <div
            className="perspective-[1200px] mb-4"
            onClick={() => setFlipped((f) => !f)}
          >
            <div
              className={`card-flip relative aspect-square w-full overflow-hidden rounded-3xl shadow-xl cursor-pointer ${flipped ? "flipped" : ""}`}
            >
              <div className="card-face absolute inset-0 grid place-items-center bg-gradient-to-br from-sky-50 via-white to-rose-50">
                {s.cutout_url ? (
                  <img
                    src={s.cutout_url}
                    alt={`「${s.word.headword}」の切り抜き`}
                    className="hero-pop max-h-[92%] max-w-[92%] object-contain"
                  />
                ) : s.object_url ? (
                  <img src={s.object_url} alt={s.word.headword} className="h-full w-full object-cover" />
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
                {s.selfie_url ? (
                  <img src={s.selfie_url} alt="撮影者の自撮り" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">自撮りなし</div>
                )}
              </div>
            </div>
          </div>

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

          <section className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">この単語の記憶曲線</h2>
              </div>
              {mem?.current?.due_at && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  次回 {new Date(mem.current.due_at).toLocaleDateString("ja-JP")}
                </div>
              )}
            </div>
            <ForgettingCurveChart
              history={mem?.history ?? []}
              currentEase={mem?.current?.ease ?? 2.5}
              currentIntervalDays={mem?.current?.interval_days ?? 1}
              lastReviewedAt={mem?.current?.last_reviewed_at ?? null}
            />
          </section>

          <section className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
            {s.caption && <p>「{s.caption}」</p>}
            {s.location_name && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {s.location_name}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(s.created_at).toLocaleString("ja-JP")}
            </p>
            {s.lat != null && s.lng != null && (
              <div className="overflow-hidden rounded-xl border border-border">
                <iframe
                  title="撮影場所のマップ"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.005}%2C${s.lat - 0.003}%2C${s.lng + 0.005}%2C${s.lat + 0.003}&layer=mapnik&marker=${s.lat}%2C${s.lng}`}
                  className="h-48 w-full"
                  loading="lazy"
                />
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
