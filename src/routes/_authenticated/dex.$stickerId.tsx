import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { WordCard } from "@/components/WordCard";
import { WordTreeView } from "@/components/WordTreeView";
import { ForgettingCurveChart } from "@/components/ForgettingCurveChart";
import { getSticker } from "@/lib/stickers.functions";
import { getStickerMemoryHistory } from "@/lib/reviews.functions";
import { useState } from "react";
import { ArrowLeft, MapPin, Brain, ChevronDown, Clock } from "lucide-react";

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
              <div className="card-face absolute inset-0 grid place-items-center bg-secondary overflow-hidden">
                {s.object_url ? (
                  <img
                    src={s.object_url}
                    alt={`「${s.word.headword}」の写真`}
                    className="hero-pop h-full w-full object-cover"
                  />
                ) : s.cutout_url ? (
                  <img src={s.cutout_url} alt={s.word.headword} className="hero-pop max-h-[92%] max-w-[92%] object-contain" />
                ) : s.placeholder_url ? (
                  <>
                    <img
                      src={s.placeholder_url}
                      alt={`「${s.word.headword}」の仮画像`}
                      className="absolute inset-0 h-full w-full object-cover opacity-70 grayscale"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-semibold text-background">
                      👻 仮の画像 — 実物に出会って完成させよう
                    </span>
                    {s.placeholder_credit?.name && (
                      <a
                        href={s.placeholder_credit.link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-2 left-3 text-[9px] text-white/90 drop-shadow"
                      >
                        📷 {s.placeholder_credit.name}
                      </a>
                    )}
                  </>
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

          {/* When & Where — shown right under the photo, inside the word area */}
          <section className="mb-4 rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {new Date(s.created_at).toLocaleString("ja-JP", {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
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

          {/* Core word info — always visible (§6: 単語+発音+意味+写真) */}
          <section className="mb-4 rounded-3xl border border-border bg-card p-4 text-center shadow-sm">
            <div className="text-3xl font-bold tracking-tight">{s.word.headword}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {s.word.reading_zhuyin} {s.word.pinyin && `· ${s.word.pinyin}`}
            </div>
            <div className="mt-2 text-lg font-medium">{s.word.meaning_ja}</div>
            {s.word.part_of_speech && (
              <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900 ring-1 ring-violet-200">
                {s.word.part_of_speech}
              </span>
            )}
          </section>

          {/* §6 word tree: photo at the center, branches unlock per review */}
          <div className="mb-4">
            <WordTreeView
              headword={s.word.headword}
              photoUrl={s.cutout_url ?? s.object_url ?? s.placeholder_url}
              emoji={s.word.silhouette_emoji}
              branchPlanRaw={s.branch_plan}
              extras={s.word.extras}
              reviewCount={s.review_count ?? 0}
            />
          </div>

          {/* Full flat card kept for reference (B3) — collapsed by default */}
          <details className="group rounded-3xl border border-border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              すべての解説を見る
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-2">
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
            </div>
          </details>

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

          {s.lat != null && s.lng != null && (
            <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <a
                href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <iframe
                  title="撮影場所のマップ"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.005}%2C${s.lat - 0.003}%2C${s.lng + 0.005}%2C${s.lat + 0.003}&layer=mapnik&marker=${s.lat}%2C${s.lng}`}
                  className="pointer-events-none h-48 w-full"
                  loading="lazy"
                />
                <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {s.location_name ?? "撮影地"}</span>
                  <span className="text-primary">Google マップで開く →</span>
                </div>
              </a>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
