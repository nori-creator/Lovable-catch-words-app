import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers } from "@/lib/stickers.functions";
import { useMemo, useState, useEffect, useRef } from "react";
import { LayoutGrid, List, Map as MapIcon, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

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

type ViewMode = "gallery" | "list" | "map";

declare global {
  interface Window {
    initDexMap?: () => void;
    google?: unknown;
  }
}

function DexPage() {
  const fetchStickers = useServerFn(listMyStickers);
  const { data: stickers } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
  });
  const captured = stickers ?? [];

  const [view, setView] = useState<ViewMode>("gallery");
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("dex-view") : null;
    if (saved === "list" || saved === "gallery" || saved === "map") setView(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dex-view", view);
  }, [view]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return captured;
    return captured.filter((s) => {
      const w = s.word;
      return (
        w.headword?.toLowerCase().includes(q) ||
        w.reading_zhuyin?.toLowerCase().includes(q) ||
        w.pinyin?.toLowerCase().includes(q) ||
        w.meaning_ja?.toLowerCase().includes(q) ||
        w.category_key?.toLowerCase().includes(q)
      );
    });
  }, [captured, search]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const k = (s.word.category_key ?? "other").toString();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <AppShell title="図鑑">
      <section className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card p-3">
        <div className="pl-1">
          <h2 className="text-base font-semibold tracking-tight">あなたの図鑑</h2>
          <p className="text-xs text-muted-foreground">{captured.length} 種類</p>
        </div>
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {([
            ["gallery", LayoutGrid, "ギャラリー表示"],
            ["list", List, "リスト表示"],
            ["map", MapIcon, "地図表示"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-label={label}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
                view === v ? "bg-background text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </section>

      {view !== "map" && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="単語・読み・意味で検索"
            className="rounded-full pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="クリア"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {view === "map" ? (
        <DexMap stickers={captured} />
      ) : captured.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">まだ何もキャッチしていません。</p>
          <Link
            to="/capture"
            className="lift mt-3 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            最初の一枚を撮る
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">「{search}」に一致する単語はありません。</p>
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
                    <button
                      key={s.id}
                      onClick={() => setOpenId(s.id)}
                      className="group block text-left"
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
                    </button>
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

function DexMap({ stickers }: { stickers: NonNullable<Awaited<ReturnType<typeof listMyStickers>>> }) {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

  useEffect(() => {
    if (!browserKey) return;
    if (window.google) {
      initMap();
      return;
    }
    window.initDexMap = initMap;
    const existing = document.querySelector('script[data-dex-map]');
    if (existing) return;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&loading=async&callback=initDexMap${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.dataset.dexMap = "1";
    document.head.appendChild(s);

    function initMap() {
      if (!mapRef.current) return;
      const g = (window.google as { maps: { Map: new (el: HTMLElement, opts: object) => unknown } }).maps;
      mapInstance.current = new g.Map(mapRef.current, {
        center: { lat: 25.033, lng: 121.5654 },
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
      });
      renderMarkers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMarkers() {
    if (!mapInstance.current || !window.google) return;
    const g = (window.google as { maps: { Marker: new (opts: object) => unknown; LatLngBounds: new () => { extend: (l: object) => void; isEmpty: () => boolean }; Size: new (a: number, b: number) => unknown; Point: new (a: number, b: number) => unknown } }).maps;
    for (const m of markersRef.current) {
      (m as { setMap: (x: null) => void }).setMap(null);
    }
    markersRef.current = [];
    const bounds = new g.LatLngBounds();
    for (const s of stickers) {
      if (s.lat == null || s.lng == null) continue;
      const emoji = s.word.silhouette_emoji ?? "📍";
      const svg = `data:image/svg+xml;utf-8,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='60' viewBox='0 0 52 60'><path d='M26 2c11 0 20 8.8 20 20 0 14-20 36-20 36S6 36 6 22C6 10.8 15 2 26 2z' fill='white' stroke='#0ea5e9' stroke-width='2'/><text x='26' y='30' text-anchor='middle' font-size='22' dominant-baseline='middle'>${emoji}</text></svg>`
      )}`;
      const marker = new g.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: mapInstance.current,
        title: s.word.headword,
        icon: { url: svg, scaledSize: new g.Size(40, 46), anchor: new g.Point(20, 44) },
      });
      (marker as { addListener: (ev: string, cb: () => void) => void }).addListener("click", () => {
        navigate({ to: "/dex/$stickerId", params: { stickerId: s.id } });
      });
      bounds.extend({ lat: s.lat, lng: s.lng });
      markersRef.current.push(marker);
    }
    if (!bounds.isEmpty()) {
      (mapInstance.current as { fitBounds: (b: object, p: number) => void }).fitBounds(bounds, 64);
    }
  }

  useEffect(() => {
    if (mapInstance.current) renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickers]);

  const withLoc = stickers.filter((s) => s.lat != null && s.lng != null);
  const recent = withLoc.slice(0, 6);

  if (!browserKey) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        地図の連携が完了していません。
      </div>
    );
  }

  return (
    <>
      <div
        ref={mapRef}
        className="h-[55vh] w-full overflow-hidden rounded-3xl border border-border bg-secondary shadow-sm"
      />
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>場所付きの単語</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{withLoc.length} 件</span>
      </div>

      {recent.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-sm font-semibold tracking-tight">最近キャッチした場所</h3>
          <div className="grid grid-cols-3 gap-2">
            {recent.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate({ to: "/dex/$stickerId", params: { stickerId: s.id } })}
                className="lift flex flex-col items-center rounded-2xl border border-border bg-card p-3 text-center"
              >
                <span className="text-2xl">{s.word.silhouette_emoji ?? "📍"}</span>
                <span className="mt-1 text-xs font-medium">{s.word.headword}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
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
