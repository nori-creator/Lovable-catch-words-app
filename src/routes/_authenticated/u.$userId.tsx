import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { SOCIAL_ENABLED } from "@/lib/features";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getPublicProfile } from "@/lib/userprofile.functions";
import { toggleFollow } from "@/lib/social.functions";
import { toast } from "sonner";
import { localeOf, useT } from "@/lib/i18n";
import { useUiLang } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/u/$userId")({
  // みんなの投稿まわりはまだ出さない(src/lib/features.ts に理由)。
  // どこからも辿り着けないうえ誰も投稿できず、通報もブロックも無い。
  // URLを直接打った人だけが永久に空の画面に着く状態なので、ホームへ返す。
  beforeLoad: () => {
    if (!SOCIAL_ENABLED) throw redirect({ to: "/home" });
  },
  head: ({ params }) => {
    // Strip anything that isn't a uuid character before interpolating into meta
    // URLs (defense-in-depth against a crafted url-encoded id).
    const id = String(params.userId).replace(/[^a-zA-Z0-9-]/g, "");
    return {
      meta: [
        { title: tStatic("page.userProfile", { id: id.slice(0, 8) }) },
        {
          name: "description",
          content:
            "Catchwordsユーザーのプロフィール。集めたステッカー、投稿、フォロー数を確認できます。",
        },
        { property: "og:title", content: `プロフィール — Catchwords` },
        {
          property: "og:description",
          content:
            "Catchwordsユーザーのプロフィール。集めたステッカー、投稿、フォロー数を確認できます。",
        },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: `https://word-snap-journey.lovable.app/u/${id}` },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: `https://word-snap-journey.lovable.app/u/${id}` }],
    };
  },
  component: UserProfilePage,
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-secondary/60 px-2 py-3">
      <span className="text-headline font-bold tabular-nums">{value}</span>
      <span className="text-caption text-muted-foreground">{label}</span>
    </div>
  );
}

function UserProfilePage() {
  const t = useT();
  const lang = useUiLang();
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getPublicProfile);
  const doFollow = useServerFn(toggleFollow);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-profile", userId],
    queryFn: () => fetchProfile({ data: { user_id: userId } }),
  });
  const [busy, setBusy] = useState(false);

  if (isLoading)
    return (
      <AppShell title={t("user.profile")}>
        <div className="py-8 text-center text-body text-muted-foreground">{t("user.loading")}</div>
      </AppShell>
    );

  if (isError || !data)
    return (
      <AppShell title={t("user.profile")}>
        <div className="py-10 text-center">
          <p className="text-body text-muted-foreground">{t("user.loadFailed")}</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </AppShell>
    );

  async function handleFollow() {
    if (!data) return;
    setBusy(true);
    try {
      await doFollow({ data: { target_user_id: data.id, follow: !data.is_following } });
      await qc.invalidateQueries({ queryKey: ["public-profile", userId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("err.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={data.display_name ?? t("user.profile")}>
      <div className="space-y-4">
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            {data.avatar_url ? (
              <img
                src={data.avatar_url}
                alt={t("user.avatarOf", { name: data.display_name ?? t("user.someone") })}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/20"
              />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-title font-bold text-primary-foreground">
                {(data.display_name ?? "?").slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-title font-bold">
                {data.display_name ?? t("common.anon")}
              </h2>
              <p className="text-footnote text-muted-foreground">
                {t("user.since", {
                  date: new Date(data.created_at).toLocaleDateString(localeOf(lang)),
                })}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Stat label={t("user.statDex")} value={data.stats.captured} />
            <Stat label={t("user.statPosts")} value={data.stats.posts} />
            <Stat label={t("user.statFollowers")} value={data.stats.followers} />
            <Stat label={t("user.statFollowing")} value={data.stats.following} />
          </div>

          <div className="mt-4">
            {data.is_me ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/settings" })}
              >
                {t("user.editProfile")}
              </Button>
            ) : (
              <Button
                onClick={handleFollow}
                disabled={busy}
                variant={data.is_following ? "outline" : "default"}
                className="w-full"
              >
                {data.is_following ? t("user.statFollowing") : t("user.follow")}
              </Button>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-body font-semibold text-muted-foreground">
            {t("user.recentCatches")}
          </h3>
          {data.recent_stickers.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/50 py-8 text-center text-body text-muted-foreground">
              {t("user.noCatches")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {data.recent_stickers.map((s) => (
                <Link
                  key={s.post_id ?? s.id}
                  // Own catches link to the dex card; someone else's link to the
                  // public post that shares them (their sticker rows are private).
                  {...(s.post_id
                    ? { to: "/post/$postId" as const, params: { postId: s.post_id } }
                    : { to: "/dex/$stickerId" as const, params: { stickerId: s.id } })}
                  className="lift group relative aspect-square overflow-hidden rounded-2xl bg-secondary"
                >
                  {s.cutout_url ? (
                    <img
                      src={s.cutout_url}
                      alt={t("common.stickerOf", { word: s.headword ?? "" })}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-hero">
                      {s.emoji ?? "📍"}
                    </div>
                  )}
                  {s.headword && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                      <span lang="zh-Hant" className="text-caption font-semibold text-white">
                        {s.headword}
                      </span>
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
