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
import { groupStops, nearbyStops, neighborDay, projectStops, type Stop } from "@/lib/day-map";
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
  /** 時間軸で押した写真（浮いたピンの顔・ピンを押したときに開く札）。 */
  const [activeItem, setActiveItem] = useState<string | null>(null);
  useEffect(() => {
    setActiveId(null);
    setActiveItem(null);
  }, [current]);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [open, setOpen] = useState(initialOpen);
  /** 下の帯（と時間軸）の高さ。地図はこの上の見えている所にピンを寄せる。 */
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [dockH, setDockH] = useState(160);
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const put = () => {
      // 帯の上端から画面の下端まで（下のバーのぶんも含む）。
      const h = Math.round(window.innerHeight - el.getBoundingClientRect().top);
      setDockH((c) => (c === h ? c : h));
      el.parentElement?.style.setProperty("--dex-dock-h", `${h}px`);
    };
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    window.addEventListener("resize", put);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", put);
    };
  }, [open]);

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

  /**
   * **ピンを押したとき。**（オーナー指示 2026-09-23「単語をタップしたら地図上で
   * 丸い画像がぽんっと浮き上がり、そのバブルをタップすると単語の詳細に飛ぶ」）
   *  ・浮いていないピン → そのピンを浮かせ、時間軸をその行へ送る
   *  ・浮いているピン   → 選んでいた写真（無ければその場所の1枚目）の詳細を開く
   */
  const onPin = (id: string) => {
    const st = stops.find((x) => x.id === id);
    if (!st) return;
    if (id === active) {
      const it = st.items.find((x) => x.id === activeItem) ?? st.items[0];
      if (it) onOpen(it.id);
      return;
    }
    setActiveItem(null);
    focusStop(id);
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
          faceItemId={activeItem}
          onPin={onPin}
          forceFallback={forceFallback}
          bottomInset={dockH}
        />
      </div>

      {/* 一番下の日付の帯と、押すと開く時間軸。 */}
      <div ref={dockRef} className="dex-daymap__dock" data-open={open || undefined}>
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
                            /* **押したら地図の上でその写真のピンが浮く。** 詳細は
                               浮いたピンを押して開く（オーナー指示 2026-09-23
                               「この単語を取ったのはどこかで振り返りたい」）。 */
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveId(st.id);
                              setActiveItem(it.id);
                            }}
                            aria-pressed={on && activeItem === it.id}
                            className={`press-in flex min-h-11 items-center gap-3 rounded-2xl p-1 text-left ${
                              on && activeItem === it.id
                                ? "bg-primary/10 ring-1 ring-primary/40"
                                : ""
                            }`}
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
  faceItemId,
  onPin,
  forceFallback,
  bottomInset,
}: {
  stops: MapStop[];
  activeId: string | null;
  faceItemId: string | null;
  onPin: (id: string) => void;
  forceFallback: boolean;
  bottomInset: number;
}) {
  const g = useGoogleMaps(!forceFallback);
  if (g)
    return (
      <GoogleDayMap
        g={g}
        stops={stops}
        activeId={activeId}
        faceItemId={faceItemId}
        onPin={onPin}
        bottomInset={bottomInset}
      />
    );
  return <FallbackDayMap stops={stops} activeId={activeId} faceItemId={faceItemId} onPin={onPin} />;
}

function StopPin({
  stop,
  active,
  faceItemId = null,
  onPin,
  style,
}: {
  stop: MapStop;
  active: boolean;
  /** 時間軸で選んだ写真。浮いたピンはその写真の顔になる。 */
  faceItemId?: string | null;
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
  const candidates = useMemo(() => {
    const face = stop.items.find((it) => it.id === faceItemId);
    const order = face ? [face, ...stop.items.filter((it) => it !== face)] : stop.items;
    return order.flatMap((it) => photoCandidates(it.s));
  }, [stop.items, faceItemId]);
  const locale = localeOf(useUiLang());
  const [tried, setTried] = useState(0);
  // 顔の写真が替わったら、最初の候補から試し直す。
  useEffect(() => setTried(0), [candidates]);
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
      {/* 浮いたピンにだけ、撮った時刻を添える（どれを見ているか一目で分かる）。 */}
      {active && (
        <span className="dex-pin__time" aria-hidden>
          {new Date(stop.start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </button>
  );
}

function FallbackDayMap({
  stops,
  activeId,
  faceItemId,
  onPin,
}: {
  stops: MapStop[];
  activeId: string | null;
  faceItemId: string | null;
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
  const pos = projectStops(stops, box, 48);
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
              faceItemId={s.id === activeId ? faceItemId : null}
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

/** 上に重ねた絞り込みの板の高さ（`--dex-overlay-h`、図鑑が書き出す）。 */
/*
 * **地図の色は Google の元の配色のまま**（オーナー指示 2026-09-24「マップが
 * カラフルでなくて白黒になってるからカラフルなマップを使いたい。元の google
 * map や apple のマップなど」）。前は `styles` で地面を淡い灰に塗り、お店・駅の
 * 印も消していた — 写真を主役にするつもりが、白黒の地図に見えていた。
 */

function overlayTop(): number {
  if (typeof document === "undefined") return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--dex-overlay-h");
  return Number.parseFloat(v) || 0;
}

function GoogleDayMap({
  g,
  stops,
  activeId,
  faceItemId,
  onPin,
  bottomInset,
}: {
  g: any;
  stops: MapStop[];
  activeId: string | null;
  faceItemId: string | null;
  onPin: (id: string) => void;
  /** 下の日付の帯（と開いた時間軸）の高さ。ピンをその裏に置かない。 */
  bottomInset: number;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const overlay = useRef<any>(null);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  /**
   * **地図とピンの層は、この効果が走るたびに必ずそろえる。**（オーナー報告
   * 2026-09-23「マップ上で画像付きのバブルが表示されてない」）
   *
   * 前は「地図がもう在れば何もしない」で抜けていた。開発時の React
   * （StrictMode）は効果を**付ける → 外す → 付け直す**と2回走らせる。
   * 1回目の後始末でピンの層を外し、2回目は地図が在るので抜ける —
   * **地図は出るのにピンの層だけが無い**。Lovable のプレビューはこの
   * 開発時の形で動くので、ピンが1本も出なかった。
   */
  useEffect(() => {
    if (!el.current) return;
    map.current ??= new g.Map(el.current, {
      center: { lat: 25.033, lng: 121.5654 },
      zoom: 14,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      // 配色は Google の既定（上の注記）。`styles` を渡さない。
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
      overlay.current = null;
      setLayer(null);
    };
  }, [g]);

  const insetRef = useRef(bottomInset);
  insetRef.current = bottomInset;
  const padding = () => ({
    top: overlayTop() + 24,
    bottom: insetRef.current + 32,
    left: 48,
    right: 48,
  });
  /**
   * **選んでいる立ち寄りの近くに寄せる。**（オーナー指示 2026-09-23 の3回目
   * 「撮った場所が遠いとすごい引きのマップになるから、寄りのマップを表示して、
   * タイムラインで移動させて」）
   *
   * 前はその日の立ち寄りを**全部**収めていた。朝は台北・夕方は淡水の日だと、
   * 街の名前しか読めない引きの地図になる。いまは選んだ所から 3km 以内
   * （`nearbyStops`）だけを収め、遠い所へは時間軸で送ったときに移る。
   */
  const frame = (anchorId: string | null) => {
    const m = map.current;
    if (!m) return;
    const near = nearbyStops(stopsRef.current, anchorId);
    if (near.length === 0) return;
    if (near.length === 1) {
      m.setZoom(16);
      m.panTo({ lat: near[0].lat as number, lng: near[0].lng as number });
      m.panBy(0, Math.round((insetRef.current - overlayTop()) / 2));
      return;
    }
    const b = new g.LatLngBounds();
    near.forEach((p) => b.extend({ lat: p.lat as number, lng: p.lng as number }));
    m.fitBounds(b, padding());
    // 近い2点だけの日に、建物の中まで寄りすぎない。
    g.event.addListenerOnce(m, "idle", () => {
      if (m.getZoom() > 17) m.setZoom(17);
    });
  };

  /** その立ち寄りが、上の操作と下の帯を除いた「見えている所」に入っているか。 */
  const inView = (s: MapStop) => {
    const proj = overlay.current?.getProjection?.();
    const box = el.current;
    if (!proj || !box || s.lat == null || s.lng == null) return false;
    const p = proj.fromLatLngToContainerPixel(new g.LatLng(s.lat, s.lng));
    if (!p) return false;
    const pad = padding();
    return (
      p.x >= pad.left &&
      p.x <= box.clientWidth - pad.right &&
      p.y >= pad.top &&
      p.y <= box.clientHeight - pad.bottom
    );
  };

  // その日が替わったら、最初の立ち寄りの近くに寄せる。
  useEffect(() => {
    frame(stops.find((s) => s.lat != null)?.id ?? null);
    // 帯の高さが変わるたびに寄せ直すと、指で動かした地図が戻ってしまう。日が替わった時だけ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, stops]);

  /**
   * 選んだ立ち寄りへ。**見えている所にもう入っていれば動かさない**（地図が
   * 行ったり来たりしない）。外にあれば、その立ち寄りの近くに寄せ直す —
   * 遠い所へは、その日の全部を収める引きではなく、寄りのまま移る。
   */
  useEffect(() => {
    const s = stops.find((x) => x.id === activeId);
    if (!s || s.lat == null || s.lng == null) return;
    if (inView(s)) return;
    frame(s.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            .map((s) => (
              <StopPin
                key={s.id}
                stop={s}
                active={s.id === activeId}
                faceItemId={s.id === activeId ? faceItemId : null}
                onPin={onPin}
              />
            )),
          layer,
        )}
    </div>
  );
}
