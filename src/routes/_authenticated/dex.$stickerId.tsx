import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getSticker } from "@/lib/stickers.functions";
import { createPost } from "@/lib/social.functions";
import { useState } from "react";
import { ArrowLeft, MapPin, Share2, Lock, Users, Globe } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dex/$stickerId")({
  head: () => ({
    meta: [{ title: "カード詳細 — Catchwords" }],
  }),
  component: StickerDetailPage,
});

function StickerDetailPage() {
  const { stickerId } = Route.useParams();
  const navigate = useNavigate();
  const fetchSticker = useServerFn(getSticker);
  const post = useServerFn(createPost);
  const { data: s, isLoading } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId } }),
  });
  const [flipped, setFlipped] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends" | "private">("public");

  const shareMut = useMutation({
    mutationFn: () => post({ data: { sticker_id: stickerId, caption: caption.trim() || undefined, visibility } }),
    onSuccess: ({ id }) => {
      toast.success("投稿しました");
      setShareOpen(false);
      navigate({ to: "/post/$postId", params: { postId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
                    <img src={s.cutout_url} alt={s.word.headword} className="max-h-full max-w-full object-contain" />
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
                      <img src={s.selfie_url} alt="selfie" className="h-full w-full object-cover" />
                    ) : s.object_url ? (
                      <img src={s.object_url} alt="object" className="h-full w-full object-cover" />
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

          <button
            onClick={() => setShareOpen(true)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.98]"
          >
            <Share2 className="h-4 w-4" /> フィードにシェア
          </button>

          <section className="mt-6 space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
            {s.caption && <p>「{s.caption}」</p>}
            {s.location_name && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {s.location_name}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(s.created_at).toLocaleString("ja-JP")}
            </p>
          </section>

          {shareOpen && (
            <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 backdrop-blur-sm sm:place-items-center" onClick={() => setShareOpen(false)}>
              <div onClick={(e) => e.stopPropagation()} className="float-up w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl">
                <h3 className="text-base font-semibold">フィードに投稿</h3>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={500}
                  placeholder="一言コメント（任意）"
                  className="mt-3 h-24 w-full resize-none rounded-2xl border border-input bg-background p-3 text-sm outline-none focus:border-primary"
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {([
                    { v: "public", l: "公開", I: Globe },
                    { v: "friends", l: "友達のみ", I: Users },
                    { v: "private", l: "自分のみ", I: Lock },
                  ] as const).map(({ v, l, I }) => (
                    <button
                      key={v}
                      onClick={() => setVisibility(v)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border p-3 ${visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      <I className="h-4 w-4" />
                      {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => shareMut.mutate()}
                  disabled={shareMut.isPending}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {shareMut.isPending ? "投稿中…" : "投稿する"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
