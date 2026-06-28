import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers } from "@/lib/stickers.functions";
import { useMemo } from "react";

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

function DexPage() {
  const fetchStickers = useServerFn(listMyStickers);
  const { data: stickers } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
  });
  const captured = stickers ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, typeof captured>();
    for (const s of captured) {
      const k = (s.word.category_key ?? "その他").toString();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [captured]);

  return (
    <AppShell title="図鑑">
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight">あなたの図鑑</h2>
          <span className="text-sm text-muted-foreground">
            {captured.length} 種類
          </span>
        </div>
      </section>

      {captured.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            まだ何もキャッチしていません。
          </p>
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
            <div className="rounded-3xl border border-border bg-gradient-to-br from-white to-secondary/40 p-4 shadow-sm">
              <div className="grid grid-cols-4 gap-3">
                {items.map((s) => (
                  <Link
                    key={s.id}
                    to="/dex/$stickerId"
                    params={{ stickerId: s.id }}
                    className="group flex flex-col items-center"
                  >
                    <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-white shadow transition-transform group-active:scale-95">
                      {s.cutout_url ? (
                        <img
                          src={s.cutout_url}
                          alt={`「${s.word.headword}」のステッカー`}
                          className="h-full w-full object-contain p-2 pop-in"
                        />
                      ) : (
                        <span className="text-2xl">{s.word.silhouette_emoji ?? "📦"}</span>
                      )}
                    </div>
                    <div className="mt-1 text-center text-[11px] font-medium">
                      {s.word.headword}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
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
