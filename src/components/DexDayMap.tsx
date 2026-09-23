/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps の型は実行時に読み込む（型定義を入れていない） */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
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
 * （オーナー指示 2026-09-23「図鑑の種類に、地図とカレンダーを統合し、画面を
 *  開いたら地図が表示され、下で日付を横にスクロールでき、カレンダーを開いて
 *  特定の日付をタップすることもできる。ある日付を指定したらその日何時に
 *  どこで何を撮ったかがタイムラインで辿れて、時間を移動するとその都度その時
 *  撮った画像が地図上でポンと少しほかのポップより浮き上がる」— 参考は RONDO）
 *
 *  ・上に地図（画面に貼り付く）。その日の立ち寄りを丸い写真のピンで置く。
 *    **歩いた道のりの線と距離は出さない**（オーナー指示 2026-09-23「GPS を
 *    ずっと ON にしないといけないから付けなくていい」— 撮った所しか
 *    分からないので、線を引くと歩いていない直線を描くことになる）。
 *  ・下に日付（‹ › で前後の撮った日へ・📅 で月の暦から選ぶ）、日付の横送り、
 *    その日の数（枚・場所・時間帯）、そして時間軸。
 *  ・時間軸を送ると、**読んでいる行の立ち寄り**のピンが大きく浮き上がり、
 *    地図がそこへ寄る。行やピンを押しても同じ。写真を押すと詳細。
 *  ・地図が読めないとき（鍵が無い・圏外・見本）は、同じピンを簡易の面に
 *    描く — 押したときの動きは同じ。
 */
export function DexDayMap({
  stickers,
  onOpen,
  initialDay,
  forceFallback = false,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
  /** 最初に開く日（見本用）。ふだんは一番新しい撮った日。 */
  initialDay?: string;
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

  // ---- 時間軸を送ると、読んでいる行の立ち寄りへ -----------------------------
  const mapBoxRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const programmatic = useRef(0);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (performance.now() < programmatic.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const list = listRef.current;
        const box = mapBoxRef.current;
        if (!list || !box) return;
        const line = box.getBoundingClientRect().bottom + 56;
        let pick: string | null = null;
        for (const li of Array.from(list.querySelectorAll<HTMLElement>("[data-stop-row]"))) {
          if (li.getBoundingClientRect().top <= line) pick = li.dataset.stopRow ?? pick;
        }
        const first = list.querySelector<HTMLElement>("[data-stop-row]")?.dataset.stopRow ?? null;
        setActiveId(pick ?? first);
      });
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, []);

  const focusStop = (id: string) => {
    setActiveId(id);
    const row = listRef.current?.querySelector<HTMLElement>(`[data-stop-row="${id}"]`);
    const box = mapBoxRef.current;
    if (!row || !box) return;
    const target =
      window.scrollY + row.getBoundingClientRect().top - box.getBoundingClientRect().bottom - 16;
    programmatic.current = performance.now() + 700;
    window.scrollTo({ top: target, behavior: motionReducedNow() ? "auto" : "smooth" });
  };

  // ---- 日付の横送り: 選んだ日を見える所へ -----------------------------------
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-day="${current}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [current]);

  if (!current) {
    return (
      <p className="mt-6 text-center text-body text-muted-foreground">{t("dex.calendarEmpty")}</p>
    );
  }

  const date = new Date(`${current}T00:00:00`);
  const photos = byDay.get(current)?.length ?? 0;
  const places = stops.filter((s) => s.lat != null).length;
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const prev = neighborDay(days, current, -1);
  const next = neighborDay(days, current, 1);

  return (
    <section className="dex-daymap" aria-label={t("dex.map")}>
      <div
        ref={mapBoxRef}
        className="dex-daymap__map sticky z-20 -mx-4 overflow-hidden"
        style={{ top: "calc(var(--app-header-h) + env(safe-area-inset-top))" }}
      >
        <DayMapCanvas
          stops={stops}
          activeId={active}
          onPin={focusStop}
          forceFallback={forceFallback}
        />
      </div>

      <div className="relative z-10 bg-background px-1 pt-4">
        {/* 日付。‹ › で前後の撮った日、📅 で月の暦から選ぶ。 */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">
              {date.toLocaleDateString(locale, { year: "numeric" })}
            </p>
            <h2 className="text-title font-bold leading-tight">
              {date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "short" })}
            </h2>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => setCalendarOpen(true)}
              aria-label={t("dex.calendar")}
              className="press-in grid h-11 w-11 place-items-center rounded-full bg-secondary"
            >
              <CalendarDays className="h-5 w-5" />
            </button>
            <button
              onClick={() => prev && setDay(prev)}
              disabled={!prev}
              aria-label={t("dex.prevDay")}
              className="press-in grid h-11 w-11 place-items-center rounded-full bg-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => next && setDay(next)}
              disabled={!next}
              aria-label={t("dex.nextDay")}
              className="press-in grid h-11 w-11 place-items-center rounded-full bg-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 撮った日の横送り。 */}
        <div
          ref={stripRef}
          className="dex-daymap__days -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="tablist"
        >
          {days.map((k) => {
            const d = new Date(`${k}T00:00:00`);
            const on = k === current;
            return (
              <button
                key={k}
                data-day={k}
                role="tab"
                aria-selected={on}
                onClick={() => setDay(k)}
                className={`flex min-h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl ${
                  on ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary"
                }`}
              >
                <span className="text-caption">
                  {d.toLocaleDateString(locale, { month: "numeric" })}
                </span>
                <span className="text-body font-bold tabular-nums">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* その日の数。 */}
        <dl className="mt-3 grid grid-cols-[1fr_1fr_1.7fr] gap-1 text-center">
          {[
            [photos, t("dex.dayPhotos")],
            [places, t("dex.dayPlaces")],
            [
              stops.length ? `${hhmm(stops[0].start)}–${hhmm(stops[stops.length - 1].end)}` : "—",
              t("dex.dayHours"),
            ],
          ].map(([v, label], i) => (
            <div key={i} className="rounded-xl bg-secondary/60 px-1 py-1.5">
              <dd className="truncate text-body font-bold tabular-nums">{v}</dd>
              <dt className="text-caption text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>

        {/* 時間軸。読んでいる行の立ち寄りが地図で浮く。 */}
        <ol ref={listRef} className="relative mt-4 border-l-2 border-border pb-[40vh] pl-5">
          {stops.map((st) => {
            const on = st.id === active;
            return (
              <li
                key={st.id}
                data-stop-row={st.id}
                className="relative pb-5"
                onClick={() => focusStop(st.id)}
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
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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
                        className="press-in w-24 shrink-0 text-left"
                      >
                        <span className="block aspect-square overflow-hidden rounded-xl bg-secondary shadow-sm">
                          {photo ? (
                            <CachedImg src={photo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Zh className="grid h-full place-items-center text-body font-semibold">
                              {it.s.word.headword}
                            </Zh>
                          )}
                        </span>
                        <Zh className="mt-1 block truncate text-footnote font-semibold">
                          {it.s.word.headword}
                        </Zh>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
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
  const photo = stickerPhotoUrl(stop.items[0].s, { thumb: true });
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
          <img src={photo} alt="" className="h-full w-full object-cover" draggable={false} />
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
    <div ref={ref} className="dex-daymap__plane relative h-full w-full">
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
      m.fitBounds(b, 56);
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
