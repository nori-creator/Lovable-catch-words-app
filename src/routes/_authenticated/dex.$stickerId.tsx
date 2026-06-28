import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { PronunciationPanel } from "@/components/PronunciationPanel";
import { ForgettingCurveChart } from "@/components/ForgettingCurveChart";
import { getSticker } from "@/lib/stickers.functions";
import { getStickerMemoryHistory } from "@/lib/reviews.functions";
import { useState } from "react";
import { ArrowLeft, MapPin, Brain, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dex/$stickerId")({
  head: ({ params }) => ({
    meta: [
      { title: `ステッカー詳細 ${params.stickerId.slice(0, 8)} — Catchwords` },
      { name: "description", content: "あなたが街でキャッチした言葉のステッカー詳細。意味・例文・発音、撮影場所、記憶曲線をまとめて確認できます。" },
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
        <div className="aspect-[3/4] animate-pulse rounded-3xl bg-secondary" />
      ) : !s ? (
        <p className="text-sm text-muted-foreground">カードが見つかりませんでした。</p>
      ) : (
        <>
          <div className="perspective-[1200px]">
            <div
              className={`card-flip relative mx-auto aspect-[3/4] w-full max-w-sm cursor-pointer ${flipped ? "flipped" : ""}`}
              onClick={() => setFlipped((f) => !f)}
            >
              <div className="card-face absolute inset-0 rounded-3xl border border-border bg-card shadow-xl">
                <div className="grid h-full place-items-center p-6">
                  {s.cutout_url ? (
                    <img src={s.cutout_url} alt={`「${s.word.headword}」のステッカー`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-7xl">{s.word.silhouette_emoji ?? "📦"}</span>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
                  <div className="text-3xl font-bold">{s.word.headword}</div>
                  <div className="text-sm text-muted-foreground">{s.word.reading_zhuyin}</div>
                </div>
              </div>
              <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
                <div className="flex h-full flex-col">
                  <div className="relative aspect-square w-full bg-secondary">
                    {s.selfie_url ? (
                      <img src={s.selfie_url} alt="撮影者の自撮り写真" className="h-full w-full object-cover" />
                    ) : s.object_url ? (
                      <img src={s.object_url} alt="言葉が写った被写体" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted-foreground">写真なし</div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2 p-4">
                    <div className="flex items-baseline justify-between">
                      <div className="text-xl font-semibold">{s.word.headword}</div>
                      {s.word.level && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{s.word.level}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.word.reading_zhuyin} · {s.word.pinyin}</div>
                    <div className="text-sm">{s.word.meaning_ja}</div>
                    {s.word.example_sentence && (
                      <div className="mt-2 rounded-xl bg-secondary/60 p-2 text-xs">
                        <div>{s.word.example_sentence}</div>
                        <div className="mt-0.5 text-muted-foreground">{s.word.example_translation}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">タップして裏返す</p>

          <div className="mt-4">
            <PronunciationPanel
              headword={s.word.headword}
              pinyin={s.word.pinyin}
              zhuyin={s.word.reading_zhuyin}
            />
          </div>

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
            <p className="mt-1 text-[11px] text-muted-foreground">
              点：復習した瞬間（100%にリセット）。曲線：時間経過で記憶が薄れていく予測。
            </p>
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
