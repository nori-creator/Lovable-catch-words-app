import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { stickerDayKey } from "@/lib/dex-filter";
import { CachedImg } from "@/lib/image-cache";
import { Zh } from "@/components/Zh";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { useSwipeBack } from "@/hooks/use-tab-swipe";
import { dayKeyOf, layoutTimeline, minutesOfDay, monthCells, weekOf } from "@/lib/day-timeline";

/**
 * 図鑑のカレンダー。**その日に撮った写真が、その日の升に入る。**
 *
 * （オーナー指示 2026-09-22「図鑑のカレンダーをタップしたら…その日の
 *  タイムラインが分かるようにして。その時間に撮った写真が少し浮き
 *  上がるように。カレンダーのデザインもこのアプリのデザイン感と添付の
 *  画像をもとにデザイン向上させて」）
 *
 *  ・月の升は写真の日だけ写真で埋め、下に薄い影を敷いて日付を白で読む。
 *    写真の無い日は数字だけ。**今日**は数字を色の丸で囲む。
 *  ・曜日の見出しを置く（以前は無く、何曜日の升か読めなかった）。
 *  ・左右に払うと月が替わる。
 *  ・写真のある日を押すと、その日の**縦の時間軸**（RONDO の形）が開く。
 *    間が空いた時刻ほど縦も空き、札は時刻の所に**少し浮いて**貼られる。
 *    上の週の帯で隣の日へ移れる。
 */
export function DexCalendar({
  stickers,
  onOpen,
  todayKey,
  initialDay = null,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
  /** 今日の鍵（見本で日付を固定するため。ふだんは端末の今日）。 */
  todayKey?: string;
  /** 最初からその日のタイムラインを開く（見本用）。 */
  initialDay?: string | null;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  const today = todayKey ?? stickerDayKey(new Date().toISOString());

  const byDay = useMemo(() => {
    const m = new Map<string, StickerWithWord[]>();
    for (const s of stickers) {
      const k = stickerDayKey(s.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [stickers]);

  // 最初に開く月は「一番新しい写真の月」。空の今月を見せても意味がない。
  const newest = useMemo(() => {
    let best: string | null = null;
    for (const k of byDay.keys()) if (!best || k > best) best = k;
    return best;
  }, [byDay]);
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const k = initialDay ?? newest;
    const d = k ? new Date(`${k}T00:00:00`) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  useEffect(() => {
    if (!newest || initialDay) return;
    const d = new Date(`${newest}T00:00:00`);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }, [newest, initialDay]);

  const [openDay, setOpenDay] = useState<string | null>(initialDay);
  useSwipeBack({ enabled: !!openDay, onBack: () => setOpenDay(null) });
  useEffect(() => {
    if (!openDay) return;
    document.documentElement.dataset.swipeSubview = "calendar-day";
    return () => {
      if (document.documentElement.dataset.swipeSubview === "calendar-day") {
        delete document.documentElement.dataset.swipeSubview;
      }
    };
  }, [openDay]);

  const shiftMonth = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // 左右に払って月を替える。縦のスクロールと取り合わないよう、横が縦の
  // 1.5倍を超えたときだけ。
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  };

  if (openDay) {
    return (
      <DayTimeline
        day={openDay}
        byDay={byDay}
        locale={locale}
        onBack={() => setOpenDay(null)}
        onDay={(k) => {
          setOpenDay(k);
          const d = new Date(`${k}T00:00:00`);
          setCursor({ y: d.getFullYear(), m: d.getMonth() });
        }}
        onOpen={onOpen}
      />
    );
  }

  const first = new Date(cursor.y, cursor.m, 1);
  const cells = monthCells(cursor.y, cursor.m);
  // 曜日の見出し。2026-09-20 は日曜。
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 8, 20 + i).toLocaleDateString(locale, { weekday: "narrow" }),
  );
  let monthPhotos = 0;
  let monthDays = 0;
  for (const d of cells) {
    if (d == null) continue;
    const n = byDay.get(dayKeyOf(cursor.y, cursor.m, d))?.length ?? 0;
    monthPhotos += n;
    if (n > 0) monthDays += 1;
  }

  return (
    <section className="dex-cal" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-3 flex items-end justify-between pt-1">
        <div>
          <p className="text-caption font-medium text-muted-foreground">
            {first.toLocaleDateString(locale, { year: "numeric" })}
          </p>
          <h2 className="text-title font-bold leading-tight">
            {first.toLocaleDateString(locale, { month: "long" })}
          </h2>
          {monthPhotos > 0 && (
            <p className="mt-0.5 text-footnote text-muted-foreground">
              {t("dex.calMonthSummary", { n: monthPhotos, d: monthDays })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label={t("dex.prevMonth")}
            className="press-in grid h-11 w-11 place-items-center rounded-full bg-secondary"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            aria-label={t("dex.nextMonth")}
            className="press-in grid h-11 w-11 place-items-center rounded-full bg-secondary"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-7 text-center text-caption font-semibold text-muted-foreground">
        {weekdays.map((w, i) => (
          <span key={i} aria-hidden>
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day == null) return <div key={`x${i}`} aria-hidden />;
          const key = dayKeyOf(cursor.y, cursor.m, day);
          const items = byDay.get(key) ?? [];
          const isToday = key === today;
          if (items.length === 0) {
            return (
              <div
                key={key}
                className="dex-cal__cell grid place-items-center rounded-2xl"
                aria-label={`${day}${t("dex.dayUnit")}`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-footnote tabular-nums ${
                    isToday
                      ? "bg-primary font-bold text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {day}
                </span>
              </div>
            );
          }
          const thumb = stickerPhotoUrl(items[0], { thumb: true });
          return (
            <button
              key={key}
              onClick={() => setOpenDay(key)}
              aria-label={`${day}${t("dex.dayUnit")} — ${t("dex.calPhotos", { n: items.length })}`}
              className={`dex-cal__cell dex-cal__cell--photo press-in relative overflow-hidden rounded-[10px] bg-secondary ${
                isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
              }`}
            >
              {thumb ? (
                <CachedImg
                  src={thumb}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <Zh className="absolute inset-0 grid place-items-center text-caption font-semibold">
                  {items[0].word.headword}
                </Zh>
              )}
              <span className="dex-cal__shade" aria-hidden />
              <span className="absolute bottom-1 left-1.5 text-footnote font-bold tabular-nums text-white">
                {day}
              </span>
              {items.length > 1 && (
                <span className="absolute right-1 top-1 rounded-full bg-black/55 px-1.5 text-caption font-bold tabular-nums text-white">
                  {items.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {byDay.size === 0 && (
        <p className="mt-6 text-center text-body text-muted-foreground">{t("dex.calendarEmpty")}</p>
      )}
    </section>
  );
}

/** 札の高さ（px）。時間軸の最小の間はこれより少し広くする。 */
const CARD_H = 96;

function DayTimeline({
  day,
  byDay,
  locale,
  onBack,
  onDay,
  onOpen,
}: {
  day: string;
  byDay: Map<string, StickerWithWord[]>;
  locale: string;
  onBack: () => void;
  onDay: (key: string) => void;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const items = useMemo(() => byDay.get(day) ?? [], [byDay, day]);
  const { rows, ticks, height } = useMemo(
    () =>
      layoutTimeline(
        items.map((s) => ({ id: s.id, minutes: minutesOfDay(s.taken_at) })),
        { minGap: CARD_H + 16, maxGap: 240 },
      ),
    [items],
  );
  const byId = new Map(items.map((s) => [s.id, s]));
  const date = new Date(`${day}T00:00:00`);
  const hhmm = (min: number) =>
    new Date(2026, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="min-h-[60dvh]" aria-label={t("dex.timelineTitle")}>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-body font-semibold text-primary-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        {t("dex.timelineBack")}
      </button>

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-title font-bold leading-tight">
          {date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "short" })}
        </h2>
        <p className="shrink-0 text-footnote text-muted-foreground">
          {t("dex.calPhotos", { n: items.length })}
        </p>
      </div>

      {/* 週の帯。隣の日へ、カレンダーに戻らずに移る。 */}
      <div className="mb-5 grid grid-cols-7 gap-1" role="tablist">
        {weekOf(day).map((k) => {
          const d = new Date(`${k}T00:00:00`);
          const n = byDay.get(k)?.length ?? 0;
          const on = k === day;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={on}
              disabled={n === 0}
              onClick={() => onDay(k)}
              aria-label={`${d.toLocaleDateString(locale, { month: "short", day: "numeric" })} — ${t("dex.calPhotos", { n })}`}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl ${
                on
                  ? "bg-primary text-primary-foreground shadow-md"
                  : n > 0
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground opacity-60"
              }`}
            >
              <span className="text-caption">
                {d.toLocaleDateString(locale, { weekday: "narrow" })}
              </span>
              <span className="text-body font-bold tabular-nums">{d.getDate()}</span>
              <span
                aria-hidden
                className={`h-1 w-1 rounded-full ${n > 0 ? (on ? "bg-primary-foreground" : "bg-primary") : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>

      {/* 縦の時間軸。左に時刻、線の上に点、右に**少し浮いた**札。 */}
      <div className="dex-day relative" style={{ height }}>
        <span className="dex-day__axis" aria-hidden />
        {ticks.map((tk) => (
          <span
            key={`tk-${tk.hour}`}
            className="dex-day__tick absolute left-0 text-caption tabular-nums text-muted-foreground"
            style={{ top: tk.y + CARD_H / 2 }}
            aria-hidden
          >
            {hhmm(tk.hour * 60)}
          </span>
        ))}
        <ol>
          {rows.map((r, i) => {
            const s = byId.get(r.id)!;
            const photo = stickerPhotoUrl(s, { thumb: true });
            return (
              <li
                key={r.id}
                className="dex-day__row absolute inset-x-0 flex items-center"
                style={{ top: r.y, height: CARD_H, "--i": i } as CSSProperties}
              >
                <span className="w-12 shrink-0 text-footnote font-semibold tabular-nums">
                  {hhmm(r.minutes)}
                </span>
                <span className="dex-day__node" aria-hidden />
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className={`dex-day__card press-in ml-5 flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-card p-2 pr-3 text-left ring-1 ring-border ${
                    i % 2 === 0 ? "dex-day__card--l" : "dex-day__card--r"
                  }`}
                >
                  <span className="dex-day__photo grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">
                    {photo ? (
                      <CachedImg src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Zh className="text-body font-semibold">{s.word.headword}</Zh>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Zh className="block truncate text-body font-semibold">{s.word.headword}</Zh>
                    <span className="block truncate text-footnote text-muted-foreground">
                      {s.word.meaning_ja}
                    </span>
                    {s.location_name && (
                      <span className="mt-0.5 flex items-center gap-1 truncate text-caption text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{s.location_name}</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
