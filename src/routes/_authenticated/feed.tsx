import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getFeed, toggleLike, type FeedPost } from "@/lib/social.functions";
import { useState } from "react";
import { Heart, MessageCircle, MapPin, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "フィード — Catchwords" }] }),
  component: FeedPage,
});

function FeedPage() {
  const [tab, setTab] = useState<"following" | "popular">("following");
  const fetchFeed = useServerFn(getFeed);
  const { data, isLoading } = useQuery({
    queryKey: ["feed", tab],
    queryFn: () => fetchFeed({ data: { tab, limit: 20 } }),
  });

  return (
    <AppShell title="フィード">
      <div className="mb-4 inline-flex rounded-full bg-secondary p-1">
        {(["following", "popular"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm transition-all ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {t === "following" ? "フォロー中" : "人気"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-3xl bg-secondary" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-4">
          {data.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      )}
    </AppShell>
  );
}

function EmptyState({ tab }: { tab: "following" | "popular" }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">{tab === "following" ? "まだ投稿がありません" : "人気の投稿はまだありません"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {tab === "following" ? "誰かをフォローするか、自分のカードをシェアしてみましょう。" : "最初の投稿者になろう！"}
      </p>
      <Link to="/dex" className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        図鑑から投稿
      </Link>
    </div>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const qc = useQueryClient();
  const like = useServerFn(toggleLike);
  const [optimistic, setOptimistic] = useState<{ liked: boolean; count: number } | null>(null);
  const liked = optimistic?.liked ?? post.liked_by_me;
  const count = optimistic?.count ?? post.like_count;

  const mut = useMutation({
    mutationFn: (next: boolean) => like({ data: { post_id: post.id, like: next } }),
    onMutate: (next) => setOptimistic({ liked: next, count: count + (next ? 1 : -1) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  const initial = (post.author.display_name ?? "?").slice(0, 1).toUpperCase();

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_8px_30px_-12px_oklch(0.62_0.21_255/0.15)]">
      <header className="flex items-center gap-3 p-3">
        {post.author.avatar_url ? (
          <img src={post.author.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initial}</div>
        )}
        <div className="flex-1">
          <div className="text-sm font-semibold">{post.author.display_name ?? "名無し"}</div>
          <div className="text-[11px] text-muted-foreground">{new Date(post.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </header>

      <Link to="/post/$postId" params={{ postId: post.id }} className="block">
        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-secondary to-accent">
          {post.sticker?.selfie_url && (
            <img src={post.sticker.selfie_url} alt="" className="h-full w-full object-cover" />
          )}
          {post.sticker?.cutout_url && (
            <img src={post.sticker.cutout_url} alt={post.sticker.word?.headword ?? ""} className="pop-in absolute right-3 top-3 h-2/3 w-2/3 object-contain drop-shadow-2xl" />
          )}
          {post.sticker?.word && (
            <div className="absolute bottom-3 left-3 rounded-2xl bg-background/90 px-3 py-1.5 backdrop-blur">
              <div className="text-lg font-bold leading-none">{post.sticker.word.headword}</div>
              <div className="text-[10px] text-muted-foreground">{post.sticker.word.reading_zhuyin} · {post.sticker.word.meaning_ja}</div>
            </div>
          )}
        </div>
      </Link>

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => mut.mutate(!liked)}
            className={`inline-flex items-center gap-1 text-sm transition-transform active:scale-95 ${liked ? "text-destructive" : "text-foreground"}`}
            aria-label="いいね"
          >
            <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
            <span className="tabular-nums">{count}</span>
          </button>
          <Link to="/post/$postId" params={{ postId: post.id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <MessageCircle className="h-5 w-5" />
            <span className="tabular-nums">{post.comment_count}</span>
          </Link>
          {post.sticker?.location_name && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> {post.sticker.location_name}
            </span>
          )}
        </div>
        {post.caption && <p className="text-sm leading-relaxed">{post.caption}</p>}
      </div>
    </article>
  );
}
