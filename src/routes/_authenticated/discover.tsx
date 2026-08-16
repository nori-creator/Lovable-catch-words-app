import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { SOCIAL_ENABLED } from "@/lib/features";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getLeaderboard, searchUsers, searchWords } from "@/lib/discover.functions";
import { Trophy, Search, Users, BookOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/discover")({
  // みんなの投稿まわりはまだ出さない(src/lib/features.ts に理由)。
  // どこからも辿り着けないうえ誰も投稿できず、通報もブロックも無い。
  // URLを直接打った人だけが永久に空の画面に着く状態なので、ホームへ返す。
  beforeLoad: () => {
    if (!SOCIAL_ENABLED) throw redirect({ to: "/home" });
  },
  head: () => ({
    meta: [
      { title: tStatic("page.discover") },
      { name: "description", content: "ランキング、ユーザー検索、単語検索。" },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const t = useT();
  const fetchBoard = useServerFn(getLeaderboard);
  const fetchUsers = useServerFn(searchUsers);
  const fetchWords = useServerFn(searchWords);
  const [q, setQ] = useState("");
  const trimmed = q.trim();

  const { data: board } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchBoard({ data: { limit: 20 } }),
  });
  const { data: users } = useQuery({
    queryKey: ["search-users", trimmed],
    queryFn: () => fetchUsers({ data: { q: trimmed } }),
    enabled: trimmed.length >= 1,
  });
  const { data: words } = useQuery({
    queryKey: ["search-words", trimmed],
    queryFn: () => fetchWords({ data: { q: trimmed } }),
    enabled: trimmed.length >= 1,
  });

  return (
    <AppShell title={t("discover.title")}>
      <section className="mb-5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("discover.search")}
            className="w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-4 text-body outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </section>

      {trimmed.length === 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="text-headline font-semibold tracking-tight">{t("discover.ranking")}</h2>
          </div>
          {!board ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : board.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-body text-muted-foreground">
              {t("discover.rankingEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {board.map((r) => (
                <li key={r.user_id}>
                  <Link
                    to="/u/$userId"
                    params={{ userId: r.user_id }}
                    className="lift-soft flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-body font-bold ${
                        r.rank === 1
                          ? "bg-gradient-to-br from-amber-300 to-orange-500 text-white"
                          : r.rank === 2
                            ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white"
                            : r.rank === 3
                              ? "bg-gradient-to-br from-amber-700 to-amber-900 text-white"
                              : "bg-secondary text-foreground"
                      }`}
                    >
                      {r.rank}
                    </div>
                    {r.avatar_url ? (
                      <img
                        src={r.avatar_url}
                        alt={r.display_name ?? ""}
                        className="h-10 w-10 rounded-full object-cover"
                        loading="lazy"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-body font-semibold">
                        {(r.display_name ?? "?").slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-semibold">
                        {r.display_name ?? t("common.anon")}
                      </div>
                      <div className="text-footnote text-muted-foreground">
                        {t("discover.stats", { words: r.sticker_count, posts: r.post_count })}
                      </div>
                    </div>
                    <div className="text-body font-bold text-primary">{r.xp} XP</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-body font-semibold uppercase tracking-wider text-muted-foreground">
                {t("discover.users")}
              </h3>
            </div>
            {!users || users.length === 0 ? (
              <p className="text-body text-muted-foreground">{t("discover.noUsers")}</p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id}>
                    <Link
                      to="/u/$userId"
                      params={{ userId: u.id }}
                      className="lift-soft flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                          loading="lazy"
                          width={40}
                          height={40}
                        />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-body font-semibold">
                          {(u.display_name ?? "?").slice(0, 1)}
                        </div>
                      )}
                      <span className="text-body font-semibold">
                        {u.display_name ?? t("common.anon")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-body font-semibold uppercase tracking-wider text-muted-foreground">
                {t("discover.words")}
              </h3>
            </div>
            {!words || words.length === 0 ? (
              <p className="text-body text-muted-foreground">{t("discover.noWords")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {words.map((w) => (
                  <li key={w.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-baseline gap-2">
                      <span lang="zh-Hant" className="text-body font-semibold">
                        {w.headword}
                      </span>
                      <span lang="zh-Hant" className="text-caption text-muted-foreground">
                        {w.reading_zhuyin}
                      </span>
                    </div>
                    <div className="mt-0.5 text-footnote text-muted-foreground">{w.meaning_ja}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
