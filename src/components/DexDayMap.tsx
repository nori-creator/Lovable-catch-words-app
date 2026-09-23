/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps の型は実行時に読み込む（型定義を入れていない） */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronUp, MapPin, X } from "lucide-react";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { photoCandidates, stickerPhotoUrl } from "@/lib/sticker-photo";
import { stickerDayKey } from "@/lib/dex-filter";
import { CachedImg } from "@/lib/image-cache";
import { Zh } from "@/components/Zh";
import { DexCalendar } from "@/components/DexCalendar";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { groupStops, neighborDay, projectStops, type Stop } from "@/lib/day-map";
import { motionReducedNow } from "@/hooks/use-reduced-motion";

type Item = {
  id: string;
  takenAt: string;
  lat: number | null;
  lng: number | null;
  place: string | null;
  s: StickerWithWord;
};

/**
 * 図鑑の**地図**（地図とカレンダーを1つにした表示）。
 *
 * （オーナー指示 2026-09-23 ①「図鑑の種類に、地図とカレンダーを統合し…」
 *  ②「地図は地図を下のバーを含む全画面に展開し、上に地図と被るように
 *  カテゴリーなどの検索できるようにし、一番下に日付のバーを追加し、タップ
 *  したら、タイムラインが見れるよう変更して。その日撮った枚数や場所、時刻の
 *  幅の情報は要らない。また日付けも全て表示するのではなく、進めたり戻る
 *  ボタンを画像のようにして。またタイムラインの写真の横に撮った時の一言を
 *  追加して。」— 参考は RONDO）
 *
 *  ・地図は**画面いっぱい**（下のバーの裏まで）。上の絞り込みと検索は図鑑の
 *    側が地図の上に重ねる。
 *  ・一番下（下のバーのすぐ上）に**日付の帯**: ⌃ ・日付 ・📅 ・‹ ›。
 *    帯を押すと**時間軸**が下から開く。日付を全部並べる横送りと、その日の数
 *    （枚・か所・時間帯）はやめた。
 *  ・時間軸の写真の横に、撮ったときの**一言**。
 *  ・時間軸を送ると、読んでいる行の立ち寄りのピンが浮き上がり、地図が寄る。
 *  ・歩いた道のりの線と距離は出さない（オーナー指示 2026-09-23）。
 */
export function DexDayMap({
  stickers,
  onOpen,
  initialDay,
  initialOpen = false,
  forceFallback = false,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
  /** 最初に開く日（見本用）。ふだんは一番新しい撮った日。 */
  initialDay?: string;
  /** 時間軸を開いた形で始める（見本用）。 */
  initialOpen?: boolean;
  /** 見本で地図を読みに行かない。 */
  forceFallback?: boolean;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());

  const byDay = useMemo(() => {
    const m = new Map<string, StickerWithWord[]>();
    for (const s of stickers) {
      const k = stickerDayKey(s.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [stickers]);
  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const [day, setDay] = useState<string | null>(initialDay ?? null);
  const current = day && byDay.has(day) ? day : (days[days.length - 1] ?? null);

  const stops = useMemo(() => {
    const items: Item[] = (current ? (byDay.get(current) ?? []) : []).map((s) => ({
      id: s.id,
      takenAt: s.taken_at,
      lat: s.lat,
      lng: s.lng,
      place: s.location_name,
      s,
    }));
    return groupStops(items);
  }, [byDay, current]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = stops.find((s) => s.id === activeId)?.id ?? stops[0]?.id ?? null;
  useEffect(() => setActiveId(null), [current]);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [open, setOpen] = useState(initialOpen);

  // ---- 時間軸を送ると、読んでいる行の立ち寄りへ -----------------------------
  const listRef = useRef<HTMLDivElement | null>(null);
  const programmatic = useRef(0);
  const onListScroll = () => {
    if (performance.now() < programmatic.current) return;
    const list = listRef.current;
    if (!list) return;
    const line = list.getBoundingClientRect().top + 40;
    let pick: string | null = null;
    for (const li of Array.from(list.querySelectorAll<HTMLElement>("[data-stop-row]"))) {
      if (li.getBoundingClientRect().top <= line) pick = li.dataset.stopRow ?? pick;
    }
    const first = list.querySelector<HTMLElement>("[data-stop-row]")?.dataset.stopRow ?? null;
    const next = pick ?? first;
    setActiveId((c) => (c === next ? c : next));
  };

  const focusStop = (id: string) => {
    setActiveId(id);
    setOpen(true);
    // 開いたあとで行へ送る（閉じていた回は、開ききってから）。
    window.setTimeout(() => {
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>(`[data-stop-row="${id}"]`);
      if (!list || !row) return;
      programmatic.current = performance.now() + 700;
      list.scrollTo({
        top: row.offsetTop - 8,
        behavior: motionReducedNow() ? "auto" : "smooth",
      });
    }, 30);
  };

  if (!current) {
    return (
      <p className="mt-6 text-center text-body text-muted-foreground">{t("dex.calendarEmpty")}</p>
    );
  }

  const date = new Date(`${current}T00:00:00`);
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const prev = neighborDay(days, current, -1);
  const next = neighborDay(days, current, 1);

  return (
    <section className="dex-daymap" aria-label={t("dex.map")}>
      {/* 地図は画面いっぱい（下のバーの裏まで）。上の操作は図鑑が重ねる。 */}
      <div className="dex-daymap__map">
        <DayMapCanvas
          stops={stops}
          activeId={active}
          onPin={focusStop}
          forceFallback={forceFallback}
        />
      </div>

      {/* 一番下の日付の帯と、押すと開く時間軸。 */}
      <div className="dex-daymap__dock" data-open={open || undefined}>
        {open && (
          <div
            ref={listRef}
            onScroll={onListScroll}
            className="dex-daymap__timeline"
            role="region"
            aria-label={t("dex.timeline")}
          >
            <ol className="relative border-l-2 border-border pl-5">
              {stops.map((st) => {
                const on = st.id === active;
                return (
                  <li
                    key={st.id}
                    data-stop-row={st.id}
                    className="relative pb-4"
                    onClick={() => setActiveId(st.id)}
                  >
                    <span
                      aria-hidden
                      className={`absolute -left-[1.72rem] top-1 h-3.5 w-3.5 rounded-full border-2 border-background transition-transform ${
                        on ? "scale-125 bg-primary" : "bg-muted-foreground/50"
                      }`}
                    />
                    <p className="flex items-baseline gap-2">
                      <span
                        className={`text-body font-bold tabular-nums ${on ? "text-primary-ink" : ""}`}
                      >
                        {hhmm(st.start)}
                        {st.end !== st.start ? `–${hhmm(st.end)}` : ""}
                      </span>
                      {st.place && (
                        <span className="flex min-w-0 items-center gap-1 truncate text-footnote text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{st.place}</span>
                        </span>
                      )}
                    </p>
                    {/* 写真の**横に一言**（オーナー指示 2026-09-23）。 */}
                    <div className="mt-2 grid gap-2">
                      {st.items.map((it) => {
                        const photo = stickerPhotoUrl(it.s, { thumb: true });
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(it.id);
                            }}
                            className="press-in flex min-h-11 items-center gap-3 text-left"
                          >
                            <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary shadow-sm">
                              {photo ? (
                                <CachedImg
                                  src={photo}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Zh className="grid h-full place-items-center text-body font-semibold">
                                  {it.s.word.headword}
                                </Zh>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <Zh className="block truncate text-body font-semibold">
                                {it.s.word.headword}
                              </Zh>
                              {it.s.caption ? (
                                <span className="handwritten-ja line-clamp-2 block text-footnote text-muted-foreground">
                                  {it.s.caption}
                                </span>
                              ) : (
                                <span className="block truncate text-footnote text-muted-foreground">
                                  {it.s.word.meaning_ja}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* 日付の帯（参考: RONDO の「⌃ 日付 ↺ ‹ ›」）。 */}
        <div className="dex-daymap__bar">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("dex.closeTimeline") : t("dex.openTimeline")}
            className="press-in flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-background">
              <ChevronUp
                className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </span>
            <span className="min-w-0 truncate text-headline font-bold">
              {date.toLocaleDateString(locale, {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </span>
          </button>
          <button
            onClick={() => setCalendarOpen(true)}
            aria-label={t("dex.calendar")}
            className="press-in grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary"
          >
            <CalendarDays className="h-5 w-5" />
          </button>
          <button
            onClick={() => prev && setDay(prev)}
            disabled={!prev}
            aria-label={t("dex.prevDay")}
            className="press-in grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => next && setDay(next)}
            disabled={!next}
            aria-label={t("dex.nextDay")}
            className="press-in grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {calendarOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/40"
          onClick={() => setCalendarOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex justify-end">
              <button
                onClick={() => setCalendarOpen(false)}
                aria-label={t("common.close")}
                className="grid h-11 w-11 place-items-center rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <DexCalendar
              stickers={stickers}
              onOpen={onOpen}
              initialMonth={current}
              onPickDay={(k) => {
                setDay(k);
                setCalendarOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 地図の面。Google の地図が読めればその上に、読めなければ簡易の面に描く。
// ---------------------------------------------------------------------------

type MapStop = Stop<Item>;

function DayMapCanvas({
  stops,
  activeId,
  onPin,
  forceFallback,
}: {
  stops: MapStop[];
  activeId: string | null;
  onPin: (id: string) => void;
  forceFallback: boolean;
}) {
  const g = useGoogleMaps(!forceFallback);
  if (g) return <GoogleDayMap g={g} stops={stops} activeId={activeId} onPin={onPin} />;
  return <FallbackDayMap stops={stops} activeId={activeId} onPin={onPin} />;
}

function StopPin({
  stop,
  active,
  onPin,
  style,
}: {
  stop: MapStop;
  active: boolean;
  onPin: (id: string) => void;
  style?: React.CSSProperties;
}) {
  /**
   * **読めなければ次を試す**（オーナー報告 2026-09-23「地図上で丸いバブルの
   * 画像が表示されてない」）。以前は縮小版の URL を素の `<img>` で1回だけ
   * 読んでいた — 縮小版が保存に無い札・署名の切れた札では白い丸のまま。
   * いまは端末の写真置き場（`CachedImg`、時間軸の写真と同じ）を通し、
   * 失敗したら原寸 → その立ち寄りの別の写真へ落ちる。
   */
  const candidates = useMemo(() => stop.items.flatMap((it) => photoCandidates(it.s)), [stop.items]);
  const [tried, setTried] = useState(0);
  const photo = candidates[tried] ?? null;
  return (
    <button
      type="button"
      data-stop-id={stop.id}
      data-active={active || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onPin(stop.id);
      }}
      aria-label={stop.items[0].s.word.headword}
      className="dex-pin"
      style={style}
    >
      <span className="dex-pin__face">
        {photo ? (
          <CachedImg
            key={photo}
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setTried((n) => n + 1)}
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-card text-caption font-bold">
            {stop.items[0].s.word.headword.slice(0, 2)}
          </span>
        )}
      </span>
      {stop.items.length > 1 && <span className="dex-pin__count">{stop.items.length}</span>}
    </button>
  );
}

function FallbackDayMap({
  stops,
  activeId,
  onPin,
}: {
  stops: MapStop[];
  activeId: string | null;
  onPin: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 360, h: 300 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const pos = projectStops(stops, box, 44);
  return (
    // 方眼は画面いっぱい。ピンを置く範囲だけ、上の操作と下の日付の帯を避ける
    // （`.dex-daymap__plane-area`）。
    <div className="dex-daymap__plane relative h-full w-full">
      <div ref={ref} className="dex-daymap__plane-area">
        {stops.map((s) => {
          const p = pos.get(s.id);
          if (!p) return null;
          return (
            <StopPin
              key={s.id}
              stop={s}
              active={s.id === activeId}
              onPin={onPin}
              style={{ left: p.x, top: p.y }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Google の地図の読み込み（図鑑の従来の地図と同じ鍵・同じ読み込み口）。 */
function useGoogleMaps(enabled: boolean): any | null {
  const key =
    import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ??
    import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const [g, setG] = useState<any | null>(() =>
    enabled && typeof window !== "undefined" ? ((window.google as any)?.maps ?? null) : null,
  );
  useEffect(() => {
    if (!enabled || !key || g) return;
    const w = window as any;
    const done = () => setG(w.google?.maps ?? null);
    if (w.google?.maps) return done();
    const prevCb = w.initDexMap;
    w.initDexMap = () => {
      prevCb?.();
      done();
    };
    if (!document.querySelector("script[data-dex-map]")) {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=initDexMap`;
      s.async = true;
      s.dataset.dexMap = "1";
      s.onerror = () => s.remove();
      document.head.appendChild(s);
    }
  }, [enabled, key, g]);
  return g;
}

function GoogleDayMap({
  g,
  stops,
  activeId,
  onPin,
}: {
  g: any;
  stops: MapStop[];
  activeId: string | null;
  onPin: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const overlay = useRef<any>(null);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = new g.Map(el.current, {
      center: { lat: 25.033, lng: 121.5654 },
      zoom: 14,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: "greedy",
    });
    // ピンは地図の上に**ふつうの HTML** として置く（写真の丸・浮き上がりを CSS で描く）。
    class PinLayer extends g.OverlayView {
      container = document.createElement("div");
      onAdd() {
        (this as any).getPanes().overlayMouseTarget.appendChild(this.container);
      }
      draw() {
        const proj = (this as any).getProjection();
        if (!proj) return;
        this.container.querySelectorAll<HTMLElement>("[data-stop-id]").forEach((pin) => {
          const s = stopsRef.current.find((x) => x.id === pin.dataset.stopId);
          if (!s || s.lat == null || s.lng == null) return;
          const p = proj.fromLatLngToDivPixel(new g.LatLng(s.lat, s.lng));
          pin.style.left = `${p.x}px`;
          pin.style.top = `${p.y}px`;
        });
      }
      onRemove() {
        this.container.remove();
      }
    }
    const o = new PinLayer();
    o.setMap(map.current);
    overlay.current = o;
    setLayer(o.container);
    return () => {
      o.setMap(null);
    };
  }, [g]);

  // その日が替わったら、その日の立ち寄りが全部収まるように寄せる。
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = stops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
    if (pts.length === 1) {
      m.setCenter(pts[0]);
      m.setZoom(16);
    } else if (pts.length > 1) {
      const b = new g.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      // 上の操作と下の日付の帯の裏にピンを置かない。
      m.fitBounds(b, { top: 150, bottom: 200, left: 48, right: 48 });
    }
  }, [g, stops]);

  // 読んでいる立ち寄りへ寄る。
  useEffect(() => {
    const s = stops.find((x) => x.id === activeId);
    if (!map.current || !s || s.lat == null || s.lng == null) return;
    map.current.panTo({ lat: s.lat, lng: s.lng });
  }, [activeId, stops]);

  // ピンを描き直したら、位置を付け直す。
  useLayoutEffect(() => {
    overlay.current?.draw();
  });

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute inset-0" />
      {layer &&
        createPortal(
          stops
            .filter((s) => s.lat != null)
            .map((s) => <StopPin key={s.id} stop={s} active={s.id === activeId} onPin={onPin} />),
          layer,
        )}
    </div>
  );
}
