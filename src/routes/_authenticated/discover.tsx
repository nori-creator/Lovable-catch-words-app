import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getLeaderboard, searchUsers, searchWords } from "@/lib/discover.functions";
import { Trophy, Search, Users, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "発見 — Catchwords" },
      { name: "description", content: "ランキング、ユーザー検索、単語検索。" },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
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
    <AppShell title="発見">
      <section className="mb-5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ユーザー名 / 単語 / 意味で検索"
            className="w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </section>

      {trimmed.length === 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold tracking-tight">ランキング</h2>
          </div>
          {!board ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />
              ))}
            </div>
          ) : board.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              まだランキングデータがありません。
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
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
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
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-base font-semibold">
                        {(r.display_name ?? "?").slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.display_name ?? "名無し"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.sticker_count} 単語 · {r.post_count} 投稿
                      </div>
                    </div>
                    <div className="text-sm font-bold text-primary">{r.xp} XP</div>
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
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">ユーザー</h3>
            </div>
            {!users || users.length === 0 ? (
              <p className="text-sm text-muted-foreground">該当ユーザーなし</p>
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
                        <img src={u.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" width={40} height={40} />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-base font-semibold">
                          {(u.display_name ?? "?").slice(0, 1)}
                        </div>
                      )}
                      <span className="text-sm font-semibold">{u.display_name ?? "名無し"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">単語</h3>
            </div>
            {!words || words.length === 0 ? (
              <p className="text-sm text-muted-foreground">該当単語なし</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {words.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-2xl border border-border bg-card p-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-semibold">{w.headword}</span>
                      <span className="text-[11px] text-muted-foreground">{w.reading_zhuyin}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{w.meaning_ja}</div>
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
