import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers } from "@/lib/stickers.functions";
import { speakZhTW } from "@/lib/speak";
import { CachedImg } from "@/lib/image-cache";
import { useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { LayoutGrid, List, Map as MapIcon, Search, X, Volume2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dex")({
  validateSearch: (search: Record<string, unknown>): { justCaught?: string } => {
    // キャッチ演出v2: /dex?justCaught=<stickerId> で該当セルがバンと着弾する
    return typeof search.justCaught === "string" && search.justCaught
      ? { justCaught: search.justCaught }
      : {};
  },
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
  const navigate = useNavigate();
  const { justCaught } = Route.useSearch();
  const { data: stickers } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
    // Keep the signed URLs stable across tab switches so the browser cache
    // can serve the images instead of re-downloading them (roadmap B1).
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  // Memoize so the reference is stable across renders — otherwise `filtered`
  // and `groups` below recompute on every render (a new `[]`/array identity
  // invalidates their useMemo deps), re-filtering the whole gallery each time.
  const captured = useMemo(() => stickers ?? [], [stickers]);

  // キャッチ演出v2の着弾: 該当セルへスクロールし、演出後にパラメータを掃除。
  useEffect(() => {
    if (!justCaught) return;
    setView("gallery"); // 着弾はギャラリーのセルで見せる
    const el = document.getElementById(`dex-cell-${justCaught}`);
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([15, 30, 70]);
    const t = setTimeout(() => {
      void navigate({ to: "/dex", search: {}, replace: true });
    }, 1600);
    return () => clearTimeout(t);
  }, [justCaught, navigate, captured.length]);

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
          {/* §5.3: found (incl. ghosts) vs captured (has a real photo) */}
          <p className="text-xs text-muted-foreground">
            見つけた <span className="font-semibold text-foreground">{captured.length}</span>
            <span className="mx-1.5">·</span>
            捕まえた <span className="font-semibold text-foreground">{captured.filter((s) => s.capture_type === "photo" || !!s.cutout_url || !!s.object_url).length}</span>
          </p>
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
              // 試作品(Capture&Converse)のアルバム: 写真がタイルいっぱいに
              // 表示される3列グリッド+下端のグラデーションに単語名。
              <div className="grid grid-cols-3 gap-2.5">
                {items.map((s) => {
                  const photo = s.object_thumb_url ?? s.object_url;
                  const slam = s.id === justCaught;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setOpenId(s.id)}
                      className="group block text-left"
                    >
                      <div
                        id={`dex-cell-${s.id}`}
                        className={`relative aspect-square overflow-hidden rounded-2xl shadow-md ring-1 transition-transform group-active:scale-95 ${
                          isGhost(s) ? "bg-secondary/70 ring-border border-2 border-dashed border-border" : "bg-white ring-black/5"
                        } ${slam ? "slam-in ring-2 ring-amber-400" : ""}`}
                      >
                        {photo ? (
                          <CachedImg
                            src={photo}
                            alt={`「${s.word.headword}」の写真`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : s.cutout_url ? (
                          <CachedImg
                            src={s.cutout_thumb_url ?? s.cutout_url}
                            alt={`「${s.word.headword}」のステッカー`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-contain p-2"
                          />
                        ) : isGhost(s) && s.placeholder_url ? (
                          <CachedImg
                            src={s.placeholder_url}
                            alt={`「${s.word.headword}」の仮画像`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover opacity-60 grayscale"
                          />
                        ) : (
                          <div className={`grid h-full place-items-center text-4xl ${isGhost(s) ? "opacity-50 grayscale" : ""}`}>
                            {s.word.silhouette_emoji ?? "📦"}
                          </div>
                        )}
                        {isGhost(s) && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground/60 px-1.5 py-0.5 text-[9px] font-semibold text-background">
                            👻 仮
                          </span>
                        )}
                        {s.encounter_count > 0 && (
                          <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 shadow">
                            ×{s.encounter_count}
                          </span>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-5">
                          <div className="truncate text-[12px] font-semibold text-white">{s.word.headword}</div>
                        </div>
                        {slam && (
                          <span className="pointer-events-none absolute inset-0 slam-flash rounded-2xl" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <ul className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                {items.map((s, i) => (
                  <li
                    key={s.id}
                    className={`flex items-center gap-1 pr-2 transition-colors hover:bg-accent/40 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <button
                      onClick={() => setOpenId(s.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left active:bg-accent/50"
                    >
                      <div className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary ${isGhost(s) ? "border border-dashed border-border" : ""}`}>
                        {s.cutout_url ? (
                          <CachedImg
                            src={s.cutout_thumb_url ?? s.cutout_url}
                            alt={`「${s.word.headword}」のステッカー`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-contain p-1"
                          />
                        ) : isGhost(s) && s.placeholder_url ? (
                          <CachedImg
                            src={s.placeholder_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover opacity-60 grayscale"
                          />
                        ) : (
                          <span className={`text-2xl ${isGhost(s) ? "opacity-50 grayscale" : ""}`}>{s.word.silhouette_emoji ?? "📦"}</span>
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
                    </button>
                    {/* 発音ボタンは右側に (縦並びリスト) */}
                    <PronounceButton text={s.word.headword} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
      <style>{`
        @keyframes slamIn {
          0%   { transform: scale(2.6) rotate(-3deg); opacity: 0; }
          35%  { transform: scale(1.18) rotate(1deg); opacity: 1; }
          60%  { transform: scale(0.93); }
          100% { transform: scale(1); }
        }
        .slam-in { animation: slamIn 720ms cubic-bezier(0.22, 1.2, 0.36, 1) 120ms both; position: relative; z-index: 10; }
        @keyframes slamFlash {
          0%   { opacity: 0; }
          40%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .slam-flash { background: radial-gradient(circle, rgba(253,230,138,0.75), rgba(253,230,138,0) 70%); animation: slamFlash 900ms ease-out 300ms both; }
      `}</style>
    </AppShell>
  );
}

/** Small pronunciation button — free on-device Taiwan-Mandarin voice. */
function PronounceButton({ text }: { text: string }) {
  function play(e: ReactMouseEvent) {
    e.stopPropagation();
    speakZhTW(text);
  }
  return (
    <button
      onClick={play}
      aria-label={`「${text}」の発音を再生`}
      className="press-in grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
    >
      <Volume2 className="h-[18px] w-[18px]" />
    </button>
  );
}

/**
 * Draw a map pin whose head is the sticker's own photo clipped in a circle
 * (roadmap B4: every pin shows what was caught there, not a generic marker).
 * Returns null when the image can't be drawn (CORS/load failure) so the
 * caller keeps the emoji fallback pin.
 */
async function photoPinIcon(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("pin image load failed"));
      img.src = url;
    });
    const W = 104, H = 120, cx = 52, cy = 46, R = 42; // 2x for retina
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    // tail
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + R - 6);
    ctx.lineTo(cx, H - 4);
    ctx.lineTo(cx + 14, cy + R - 6);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    // white ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // photo clipped in circle (cover fit)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max((R * 2) / img.width, (R * 2) / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

function DexMap({ stickers }: { stickers: NonNullable<Awaited<ReturnType<typeof listMyStickers>>> }) {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const pinIconCache = useRef<Map<string, string | null>>(new Map());
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
      // Swap in the photo pin as soon as it's drawn (emoji pin stays as fallback).
      // Thumbs first: a pin head is 52px, a 400px thumb is already 8x overkill.
      const photoUrl = s.object_thumb_url ?? s.cutout_thumb_url ?? s.object_url ?? s.cutout_url;
      if (photoUrl) {
        const cached = pinIconCache.current.get(s.id);
        const iconPromise = cached !== undefined ? Promise.resolve(cached) : photoPinIcon(photoUrl);
        void iconPromise.then((icon) => {
          pinIconCache.current.set(s.id, icon);
          if (!icon || !markersRef.current.includes(marker)) return;
          (marker as { setIcon: (i: object) => void }).setIcon({
            url: icon,
            scaledSize: new g.Size(52, 60),
            anchor: new g.Point(26, 58),
          });
        });
      }
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

/** Ghost card (§5.3): caught by text/voice, no real photo yet. */
function isGhost(s: { capture_type: string; cutout_url: string | null; object_url: string | null }): boolean {
  return s.capture_type !== "photo" && !s.cutout_url && !s.object_url;
}

function prettifyCategory(key: string): string {
  const map: Record<string, string> = {
    fruit: "🍎 果物", vegetable: "🥬 野菜", drink: "🥤 飲み物",
    food: "🍜 食べ物", dessert: "🍰 スイーツ",
    vehicle: "🚗 乗り物", transport: "🚆 交通",
    animal: "🐾 動物", plant: "🌱 植物", flower: "🌸 花",
    building: "🏛️ 建物", street: "🛣️ 街並み", sign: "🪧 看板",
    shop: "🏪 お店", home: "🏠 家", furniture: "🛋️ 家具",
    appliance: "📺 家電", kitchenware: "🍳 調理器具", tool: "🔧 道具",
    clothes: "👕 服", accessory: "🎀 アクセ", shoes: "👟 靴",
    bag: "👜 バッグ", jewelry: "💍 ジュエリー",
    stationery: "✏️ 文房具", book: "📚 本",
    tech: "💻 テック", gadget: "🖱️ ガジェット",
    toy: "🧸 おもちゃ", game: "🎮 ゲーム",
    sport: "⚽ スポーツ", instrument: "🎸 楽器",
    nature: "🌿 自然", weather: "☁️ 天気", sky: "☀️ 空",
    water: "💧 水", mountain: "⛰️ 山",
    body: "🖐️ 体の部位", face: "😊 顔", hand: "🖐️ 手",
    clothing_part: "👔 服の部分",
    person: "🧑 人", family: "👨‍👩‍👧 家族", job: "💼 仕事",
    art: "🎨 アート", decoration: "🎊 装飾",
    character: "🔤 文字", symbol: "🔣 記号",
    color: "🎨 色", shape: "🔷 形",
    money: "💰 お金", document: "📄 書類", medicine: "💊 薬",
    place: "📍 場所", object: "📦 もの",
    other: "✨ その他",
  };
  return map[key] ?? `✨ ${key}`;
}
