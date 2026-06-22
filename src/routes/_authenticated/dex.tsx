import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers } from "@/lib/stickers.functions";
import { listSeedWordsWithStatus } from "@/lib/words.functions";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/dex")({
  head: () => ({
    meta: [
      { title: "図鑑 — Catchwords" },
      { name: "description", content: "あなたが街でキャッチしたステッカーをジャンル別に。未取得のものはシルエットで現れます。" },
    ],
  }),
  component: DexPage,
});

function DexPage() {
  const fetchStickers = useServerFn(listMyStickers);
  const fetchSeed = useServerFn(listSeedWordsWithStatus);
  const { data: stickers } = useQuery({ queryKey: ["stickers"], queryFn: () => fetchStickers() });
  const { data: seed } = useQuery({ queryKey: ["seedWords"], queryFn: () => fetchSeed() });

  const captured = stickers ?? [];
  const seedWords = seed?.words ?? [];
  const categories = seed?.categories ?? [];

  // Group captured by category, fallback to seed word's category
  const byCategory = useMemo(() => {
    const map = new Map<string, { captured: typeof captured; missing: typeof seedWords }>();
    for (const c of categories) map.set(c.key, { captured: [], missing: [] });
    for (const s of captured) {
      const k = s.word.category_key ?? "other";
      if (!map.has(k)) map.set(k, { captured: [], missing: [] });
      map.get(k)!.captured.push(s);
    }
    const capturedWordIds = new Set(captured.map((s) => s.word_id));
    for (const w of seedWords) {
      if (capturedWordIds.has(w.id)) continue;
      const k = w.category_key ?? "other";
      if (!map.has(k)) map.set(k, { captured: [], missing: [] });
      map.get(k)!.missing.push(w);
    }
    return map;
  }, [captured, seedWords, categories]);

  const totalSeed = seedWords.length;
  const totalCaughtSeed = seedWords.filter((w) => w.captured).length;
  const pct = totalSeed > 0 ? Math.round((totalCaughtSeed / totalSeed) * 100) : 0;

  return (
    <AppShell title="図鑑">
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight">TOCFL Level 1–2</h2>
          <span className="text-sm text-muted-foreground">
            {totalCaughtSeed} / {totalSeed}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {categories.map((cat) => {
        const bucket = byCategory.get(cat.key);
        if (!bucket) return null;
        const total = bucket.captured.length + bucket.missing.length;
        if (total === 0) return null;
        const complete = bucket.missing.length === 0 && bucket.captured.length > 0;
        const catPct = Math.round((bucket.captured.length / total) * 100);
        return (
          <section key={cat.key} className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                <span>{cat.icon_emoji}</span>
                {cat.label_ja}
                {complete && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow animate-fade-in">
                    ★ COMPLETE
                  </span>
                )}
              </h3>
              <span className="text-xs text-muted-foreground">
                {bucket.captured.length} / {total} · {catPct}%
              </span>
            </div>
            <div className="rounded-3xl border border-border bg-gradient-to-br from-white to-secondary/40 p-4 shadow-sm">
              <div className="grid grid-cols-4 gap-3">
                {bucket.captured.map((s) => (
                  <Link
                    key={s.id}
                    to="/dex/$stickerId"
                    params={{ stickerId: s.id }}
                    className="group flex flex-col items-center"
                  >
                    <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-white shadow transition-transform group-active:scale-95">
                      {s.cutout_url ? (
                        <img src={s.cutout_url} alt={s.word.headword} className="h-full w-full object-contain p-2 pop-in" />
                      ) : (
                        <span className="text-2xl">{s.word.silhouette_emoji ?? "📦"}</span>
                      )}
                    </div>
                    <div className="mt-1 text-center text-[11px] font-medium">{s.word.headword}</div>
                  </Link>
                ))}
                {bucket.missing.map((w) => (
                  <div key={w.id} className="flex flex-col items-center">
                    <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-border bg-secondary/40 text-3xl opacity-40 grayscale">
                      {w.silhouette_emoji ?? "❓"}
                    </div>
                    <div className="mt-1 text-center text-[11px] text-muted-foreground">{w.headword}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </AppShell>
  );
}
