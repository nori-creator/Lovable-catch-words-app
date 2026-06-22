import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getPost, getComments, addComment, toggleLike } from "@/lib/social.functions";
import { useState } from "react";
import { ArrowLeft, Heart, Send, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/post/$postId")({
  head: () => ({ meta: [{ title: "投稿 — Catchwords" }] }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const qc = useQueryClient();
  const fetchPost = useServerFn(getPost);
  const fetchComments = useServerFn(getComments);
  const post = useQuery({ queryKey: ["post", postId], queryFn: () => fetchPost({ data: { id: postId } }) });
  const comments = useQuery({ queryKey: ["comments", postId], queryFn: () => fetchComments({ data: { post_id: postId } }) });

  const like = useServerFn(toggleLike);
  const add = useServerFn(addComment);
  const [body, setBody] = useState("");

  const likeMut = useMutation({
    mutationFn: (next: boolean) => like({ data: { post_id: postId, like: next } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["post", postId] }),
  });
  const commentMut = useMutation({
    mutationFn: (b: string) => add({ data: { post_id: postId, body: b } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", postId] });
      qc.invalidateQueries({ queryKey: ["post", postId] });
    },
  });

  const p = post.data;

  return (
    <AppShell title="投稿">
      <Link to="/feed" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> フィードへ
      </Link>

      {post.isLoading ? (
        <div className="aspect-square animate-pulse rounded-3xl bg-secondary" />
      ) : !p ? (
        <p className="text-sm text-muted-foreground">投稿が見つかりませんでした。</p>
      ) : (
        <>
          <article className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-secondary to-accent">
              {p.sticker?.selfie_url && <img src={p.sticker.selfie_url} alt="" className="h-full w-full object-cover" />}
              {p.sticker?.cutout_url && (
                <img src={p.sticker.cutout_url} alt="" className="pop-in absolute right-3 top-3 h-2/3 w-2/3 object-contain drop-shadow-2xl" />
              )}
              {p.sticker?.word && (
                <div className="absolute bottom-3 left-3 rounded-2xl bg-background/90 px-3 py-1.5 backdrop-blur">
                  <div className="text-lg font-bold leading-none">{p.sticker.word.headword}</div>
                  <div className="text-[10px] text-muted-foreground">{p.sticker.word.reading_zhuyin} · {p.sticker.word.meaning_ja}</div>
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{p.author.display_name ?? "名無し"}</span>
                <span className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleString("ja-JP")}</span>
              </div>
              {p.caption && <p className="text-sm leading-relaxed">{p.caption}</p>}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => likeMut.mutate(!p.liked_by_me)}
                  className={`inline-flex items-center gap-1 text-sm active:scale-95 ${p.liked_by_me ? "text-destructive" : "text-foreground"}`}
                >
                  <Heart className={`h-5 w-5 ${p.liked_by_me ? "fill-current" : ""}`} />
                  <span className="tabular-nums">{p.like_count}</span>
                </button>
                {p.sticker?.location_name && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {p.sticker.location_name}
                  </span>
                )}
              </div>
            </div>
          </article>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">コメント</h2>
            <div className="space-y-3">
              {(comments.data ?? []).map((c) => (
                <div key={c.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs font-semibold">{c.author.display_name ?? "名無し"}</div>
                  <div className="mt-1 text-sm">{c.body}</div>
                </div>
              ))}
              {(comments.data ?? []).length === 0 && !comments.isLoading && (
                <p className="text-xs text-muted-foreground">最初のコメントを投稿しよう。</p>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (body.trim()) commentMut.mutate(body.trim());
              }}
              className="mt-4 flex items-center gap-2"
            >
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={500}
                placeholder="コメントを書く…"
                className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!body.trim() || commentMut.isPending}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </section>
        </>
      )}
    </AppShell>
  );
}
