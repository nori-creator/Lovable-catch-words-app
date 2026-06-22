import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getPublicProfile } from "@/lib/userprofile.functions";
import { toggleFollow } from "@/lib/social.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/u/$userId")({
  head: () => ({ meta: [{ title: "プロフィール — Catchwords" }] }),
  component: UserProfilePage,
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-secondary/60 px-2 py-3">
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function UserProfilePage() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getPublicProfile);
  const doFollow = useServerFn(toggleFollow);
  const { data } = useQuery({
    queryKey: ["public-profile", userId],
    queryFn: () => fetchProfile({ data: { user_id: userId } }),
  });
  const [busy, setBusy] = useState(false);

  if (!data) return <AppShell title="プロフィール"><div className="py-8 text-center text-sm text-muted-foreground">読み込み中…</div></AppShell>;

  async function handleFollow() {
    if (!data) return;
    setBusy(true);
    try {
      await doFollow({ data: { target_user_id: data.id, follow: !data.is_following } });
      await qc.invalidateQueries({ queryKey: ["public-profile", userId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={data.display_name ?? "プロフィール"}>
      <div className="space-y-4">
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            {data.avatar_url ? (
              <img src={data.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/20" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-2xl font-bold text-primary-foreground">
                {(data.display_name ?? "?").slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold">{data.display_name ?? "名無し"}</h2>
              <p className="text-xs text-muted-foreground">
                {new Date(data.created_at).toLocaleDateString("ja-JP")} から
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Stat label="図鑑" value={data.stats.captured} />
            <Stat label="投稿" value={data.stats.posts} />
            <Stat label="フォロワー" value={data.stats.followers} />
            <Stat label="フォロー中" value={data.stats.following} />
          </div>

          <div className="mt-4">
            {data.is_me ? (
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/settings" })}>
                プロフィールを編集
              </Button>
            ) : (
              <Button onClick={handleFollow} disabled={busy} variant={data.is_following ? "outline" : "default"} className="w-full">
                {data.is_following ? "フォロー中" : "フォローする"}
              </Button>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">最近のキャッチ</h3>
          {data.recent_stickers.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/50 py-8 text-center text-sm text-muted-foreground">
              まだキャッチがありません
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {data.recent_stickers.map((s) => (
                <Link
                  key={s.id}
                  to="/dex/$stickerId"
                  params={{ stickerId: s.id }}
                  className="lift group relative aspect-square overflow-hidden rounded-2xl bg-secondary"
                >
                  {s.cutout_url ? (
                    <img src={s.cutout_url} alt={s.headword ?? ""} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-3xl">{s.emoji ?? "📍"}</div>
                  )}
                  {s.headword && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                      <span className="text-[11px] font-semibold text-white">{s.headword}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
