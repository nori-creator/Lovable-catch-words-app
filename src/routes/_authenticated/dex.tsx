import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers } from "@/lib/stickers.functions";
import { useMemo, useState, useEffect } from "react";
import { LayoutGrid, List } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dex")({
  head: () => ({
    meta: [
      { title: "図鑑 — Catchwords" },
      {
        name: "description",
        content:
          "あなたがキャッチした言葉だけの図鑑。撮ったものから自動でカテゴリーが生まれます。",
      },
    ],
  }),
  component: DexPage,
});

type ViewMode = "gallery" | "list";

function DexPage() {
  const fetchStickers = useServerFn(listMyStickers);
  const { data: stickers } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
  });
  const captured = stickers ?? [];

  const [view, setView] = useState<ViewMode>("gallery");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("dex-view") : null;
    if (saved === "list" || saved === "gallery") setView(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dex-view", view);
  }, [view]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof captured>();
    for (const s of captured) {
      const k = (s.word.category_key ?? "other").toString();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [captured]);

  return (
    <AppShell title="図鑑">
      <section className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">あなたの図鑑</h2>
          <p className="text-xs text-muted-foreground">{captured.length} 種類</p>
        </div>
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          <button
            onClick={() => setView("gallery")}
            aria-label="ギャラリー表示"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
              view === "gallery" ? "bg-background text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            aria-label="リスト表示"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
              view === "list" ? "bg-background text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </section>

      {captured.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">まだ何もキャッチしていません。</p>
          <Link
            to="/capture"
            className="lift mt-3 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            最初の一枚を撮る
          </Link>
        </div>
      ) : (
        groups.map(([key, items]) => (
          <section key={key} className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-base font-semibold tracking-tight">{prettifyCategory(key)}</h3>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>

            {view === "gallery" ? (
              <div className="rounded-3xl border border-border bg-gradient-to-br from-white to-secondary/40 p-3 shadow-sm">
                <div className="grid grid-cols-2 gap-3">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      to="/dex/$stickerId"
                      params={{ stickerId: s.id }}
                      className="group block"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5 transition-transform group-active:scale-95">
                        {s.cutout_url ? (
                          <img
                            src={s.cutout_url}
                            alt={`「${s.word.headword}」のステッカー`}
                            className="h-full w-full object-contain p-3"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-5xl">
                            {s.word.silhouette_emoji ?? "📦"}
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <div className="text-sm font-bold text-white">{s.word.headword}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                {items.map((s, i) => (
                  <li key={s.id} className={i > 0 ? "border-t border-border" : ""}>
                    <Link
                      to="/dex/$stickerId"
                      params={{ stickerId: s.id }}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40 active:bg-accent/60"
                    >
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">
                        {s.cutout_url ? (
                          <img
                            src={s.cutout_url}
                            alt={`「${s.word.headword}」のステッカー`}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-2xl">{s.word.silhouette_emoji ?? "📦"}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-semibold">{s.word.headword}</span>
                          {s.word.reading_zhuyin && (
                            <span className="truncate text-xs text-muted-foreground">
                              {s.word.reading_zhuyin}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {s.word.meaning_ja}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </AppShell>
  );
}

function prettifyCategory(key: string): string {
  const map: Record<string, string> = {
    food: "🍜 食べ物",
    drink: "🥤 飲み物",
    animal: "🐾 動物",
    plant: "🌱 植物",
    place: "📍 場所",
    object: "📦 もの",
    transport: "🚆 乗り物",
    sign: "🪧 看板・表示",
    nature: "🌿 自然",
    clothes: "👕 服飾",
    other: "✨ その他",
  };
  return map[key] ?? `✨ ${key}`;
}
