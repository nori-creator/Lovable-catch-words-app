import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { resolveCachedSrc } from "@/lib/image-cache";
import { listMyDiaryMonth, saveMyDiary } from "@/lib/journal.functions";
import { monthDays, monthKey, shelfMonths, tightShelfSize } from "@/lib/home-shelf";
import {
  DIARY_FONTS,
  diaryFont,
  getDiaryFont,
  loadDiaryFont,
  setDiaryFont,
  type DiaryFontId,
} from "@/lib/diary-fonts";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import type { MonthBook, ShelfWorld } from "@/components/shelf3d/engine";
import type { DaySpread } from "@/components/shelf3d/textures";

/**
 * **ホームの一番上の本棚**（オーナー指示 2026-09-29「ホームのアルバムの一番上に本棚を一列
 * 作って。またアルバムを開くとその月の最初のページが開くようにして。見開きの片側ページを
 * 長押しではなくタップすると片側ページが全画面になるようにして」）。
 *
 * - 1か月＝1冊を1段に並べる（新しい月が右。最大 8 冊）。形は Blender、描くのは three.js
 *   （`shelf3d/engine.ts` — 確認用ページの「本物の本棚」と同じ物）。
 * - 本を押すと、その月の写真と日記を揃えてから、画面いっぱいに広がって本が手元に来て開く。
 *   開くのは**その月の最初の日の見開き**（左＝その日のアルバム、右＝その日の日記）。
 * - 見開きの片側を**押すだけ**で、そのページが全画面になる（上で見開きに戻せる）。
 * - 下へ続く日ごとのアルバム（2026-08-25「下スクロールで過去が見える形」）はそのまま。
 *
 * 3D の道具は重いので、ホームを描いた後の手の空いた時に読み込む（ホームの表示を待たせない）。
 * 棚が画面の外に出ている間は描かない。3D が使えない端末では棚ごと出さない。
 */
/**
 * 帯の上の棚の高さ（px）。上の帯の行（アイコンと「CatchWords」）の中に収まり、同じ高さに
 * 並ぶ。アイコンの写真（28px）より少しだけ高くして、背表紙の色が見分けられる大きさに。
 */
const SHELF_PX = 36;

type Loaders = {
  diary: (month: string) => Promise<Array<{ date: string; text: string }>>;
  save: (date: string, text: string) => Promise<void>;
};

export function HomeShelf({
  items,
  loaders,
}: {
  items: ReadonlyArray<StickerWithWord>;
  /** 日記の読み書き（確認用ページでは差し替える）。 */
  loaders?: Partial<Loaders>;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  const listDiary = useServerFn(listMyDiaryMonth);
  const saveDiaryFn = useServerFn(saveMyDiary);
  const load: Loaders = {
    diary: loaders?.diary ?? ((month) => listDiary({ data: { month } })),
    save:
      loaders?.save ??
      (async (date, text) => {
        await saveDiaryFn({ data: { date, text } });
      }),
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const months = useMemo(() => shelfMonths(items), [items]);
  const size = tightShelfSize(months.length);
  const monthSig = months.map((m) => `${m.key}:${m.count}`).join(",");

  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<ShelfWorld | null>(null);
  const daysOf = useRef(new Map<MonthBook, DaySpread[]>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  fullRef.current = full;
  const fromRect = useRef<DOMRect | null>(null);
  const [state, setState] = useState<{ open: MonthBook | null; page: number; pages: number }>({
    open: null,
    page: 0,
    pages: 0,
  });
  const [view, setView] = useState<"spread" | "left" | "right">("spread");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [font, setFont] = useState<DiaryFontId>(() => getDiaryFont());
  const fontRef = useRef(font);
  const [writing, setWriting] = useState<string | null>(null);
  const [, bump] = useState(0);

  const monthTitle = useCallback(
    (y: number, m: number) =>
      new Date(y, m - 1, 1).toLocaleDateString(locale, { year: "numeric", month: "long" }),
    [locale],
  );
  const dayLabel = useCallback(
    (y: number, m: number, d: number) =>
      new Date(y, m - 1, d).toLocaleDateString(locale, {
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
    [locale],
  );
  const labelsRef = useRef({ monthTitle, dayLabel, t });
  labelsRef.current = { monthTitle, dayLabel, t };

  /** 広げる: 棚の枠の位置から画面いっぱいへ（元の位置は閉じる時に戻る先）。 */
  const expand = useCallback(() => {
    fromRect.current = box.current?.getBoundingClientRect() ?? null;
    setFull(true);
  }, []);
  const collapse = useCallback(() => {
    const el = stage.current;
    const to = box.current?.getBoundingClientRect();
    if (!el || !to || motionReducedNow()) {
      setFull(false);
      return;
    }
    el.animate(
      [
        { top: "0px", left: "0px", width: `${innerWidth}px`, height: `${innerHeight}px` },
        {
          top: `${to.top}px`,
          left: `${to.left}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
          borderRadius: "20px",
        },
      ],
      { duration: 360, easing: "cubic-bezier(.3,.7,.2,1)" },
    ).finished.then(
      () => setFull(false),
      () => setFull(false),
    );
  }, []);
  useLayoutEffect(() => {
    const el = stage.current;
    const r = fromRect.current;
    if (!full || !el || !r || motionReducedNow()) return;
    el.animate(
      [
        {
          top: `${r.top}px`,
          left: `${r.left}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          borderRadius: "20px",
        },
        { top: "0px", left: "0px", width: `${innerWidth}px`, height: `${innerHeight}px` },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [full]);

  /** その月の見開き（写真・一言・日記）を揃える。 */
  const prepare = useCallback(async (b: MonthBook) => {
    const key = monthKey(b.y, b.m);
    const groups = monthDays(itemsRef.current, b.y, b.m);
    const [diaries, photos] = await Promise.all([
      loadRef.current.diary(key).catch(() => [] as Array<{ date: string; text: string }>),
      Promise.all(
        groups.map((g) =>
          Promise.all(g.items.map((s) => loadImage(stickerPhotoUrl(s, { thumb: true })))),
        ),
      ),
    ]);
    const diaryByDay = new Map(diaries.map((d) => [Number(d.date.slice(8, 10)), d.text]));
    const { dayLabel: label } = labelsRef.current;
    const days: DaySpread[] = groups.map((g, i) => ({
      y: b.y,
      m: b.m,
      d: g.d,
      label: label(b.y, b.m, g.d),
      photos: g.items.map((s, j) => ({
        img: photos[i][j],
        word: s.word.headword,
        note: s.caption ?? undefined,
      })),
      diary: diaryByDay.get(g.d) ?? "",
    }));
    b.cover = photos.flat().find(Boolean) ?? null;
    daysOf.current.set(b, days);
    // canvas は字体が届く前に描くと代わりの字で焼き付くので、先に読む。
    await Promise.all([
      loadDiaryFont(fontRef.current, days.map((d) => d.diary).join("")),
      loadDiaryFont(
        "hand",
        days.map((d) => d.photos.map((p) => p.note ?? "").join("") + (d.label ?? "")).join(""),
      ),
    ]).catch(() => undefined);
  }, []);

  // ---- 3D の棚を組み立てる（ホームを描いた後の手の空いた時に） -----------------
  useEffect(() => {
    if (!months.length) return;
    const el = canvasRef.current;
    if (!el) return;
    let alive = true;
    let w: ShelfWorld | null = null;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    const off: Array<() => void> = [];
    const books: MonthBook[] = months.map((m) => ({
      y: m.y,
      m: m.m,
      count: m.count,
      color: m.color,
    }));
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    idle(() => {
      void import("@/components/shelf3d/engine")
        .then(({ ShelfWorld }) => {
          if (!alive) return;
          w = new ShelfWorld(
            el,
            books,
            {
              onState: (st) => {
                setState(st);
                // 本を棚に戻したら、全画面の棚のまま（別の月を選べる）。閉じるのは ✕ で。
                if (!st.open) setView("spread");
              },
              onPageTap: (side) => setView(side),
              onBookTap: (b, open) => {
                setBusy(true);
                void prepare(b)
                  .then(() => {
                    if (!alive) return;
                    if (!fullRef.current) expand();
                    // 広がり始めた次の描画で開く（寄ってくる本が広がる画面の中に来る）。
                    requestAnimationFrame(() => requestAnimationFrame(open));
                  })
                  .finally(() => alive && setBusy(false));
              },
              days: (b) => daysOf.current.get(b) ?? [],
              diaryFont: () => fontRef.current,
              titlePage: (b, n) => [
                labelsRef.current.monthTitle(b.y, b.m),
                labelsRef.current.t("shelf.home.titlePage").replace("{n}", String(n)),
              ],
            },
            { rows: 1, openAt: "first", tight: true },
          );
          world.current = w;
          const world3d = w;
          ro = new ResizeObserver(() => world3d.resize());
          ro.observe(el);
          io = new IntersectionObserver(([e]) => world3d.setPaused(!e.isIntersecting));
          io.observe(el);
          // 帯の上の小さな棚は、押すと全画面の棚になるだけ（指で本を選ぶのは広げてから —
          // 数 px の背表紙を狙わせない）。全画面の間だけ 3D に指を渡す。
          const down = (e: PointerEvent) => {
            if (!fullRef.current) return;
            el.setPointerCapture(e.pointerId);
            world3d.pointerDown(e);
          };
          const move = (e: PointerEvent) => fullRef.current && world3d.pointerMove(e);
          const up = (e: PointerEvent) => fullRef.current && world3d.pointerUp(e);
          el.addEventListener("pointerdown", down);
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
          el.addEventListener("pointercancel", up);
          off.push(() => {
            el.removeEventListener("pointerdown", down);
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
            el.removeEventListener("pointercancel", up);
          });
          world3d.start();
          return world3d.load([]).then(() => alive && setReady(true));
        })
        .catch(() => alive && setFailed(true));
    });
    return () => {
      alive = false;
      ro?.disconnect();
      io?.disconnect();
      off.forEach((f) => f());
      w?.dispose();
      world.current = null;
      daysOf.current.clear();
      setReady(false);
    };
    // 月の並び（と枚数）が変わった時だけ組み直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthSig]);

  // 片ページの絵（見開きの片側の canvas をそのまま大きく見せる）。
  useEffect(() => {
    if (view === "spread") {
      setPageUrl(null);
      return;
    }
    const c = world.current?.pageCanvas(view);
    setPageUrl(c ? c.toDataURL("image/jpeg", 0.9) : null);
  }, [view, state.page, font, writing]);

  // 開いている間は、Esc で片ページ → 見開き → 棚の順に戻る（キーボードの人のため）。
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view !== "spread") setView("spread");
      else world.current?.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, view]);

  /** 片ページで次・前へ: 左 → 右 → （めくって）次の左 …。 */
  const stepSingle = (dir: 1 | -1) => {
    const w = world.current;
    if (!w) return;
    const { at, count } = w.spread;
    if (dir === 1) {
      if (view === "left") setView("right");
      else if (at < count - 1) {
        w.flip(1);
        setView("left");
      }
    } else if (view === "right") setView("left");
    else if (at > 0) {
      w.flip(-1);
      setView("right");
    }
  };

  if (!months.length || failed) return null;

  const days = world.current?.openDays ?? [];
  const dayIndex = state.open ? state.page - 1 : -1;
  const day = dayIndex >= 0 ? days[dayIndex] : undefined;
  const heading = state.open
    ? day
      ? (day.label ?? "")
      : monthTitle(state.open.y, state.open.m)
    : "";

  const chooseFont = async (id: DiaryFontId) => {
    setFont(id);
    fontRef.current = id;
    setDiaryFont(id);
    await loadDiaryFont(id, days.map((d) => d.diary).join("")).catch(() => undefined);
    world.current?.repaintDiary();
    bump((n) => n + 1);
  };

  const saveDiary = async () => {
    if (!day || writing === null) return;
    const date = `${monthKey(day.y, day.m)}-${String(day.d).padStart(2, "0")}`;
    try {
      await loadRef.current.save(date, writing);
    } catch {
      toast.error(t("shelf.home.saveFailed"));
      return;
    }
    day.diary = writing.trim();
    await loadDiaryFont(fontRef.current, writing).catch(() => undefined);
    world.current?.repaintDiary(dayIndex);
    setWriting(null);
  };

  return (
    <section className="home-shelf" aria-label={t("shelf.home.label")}>
      {/* 帯の右端の小さな棚（アイコンと同じ高さ。幅は並ぶ冊数ぶん — 本にぴったりの棚）。
          広げている間も場所を取っておき、閉じると元へ縮んで戻る。 */}
      <div
        ref={box}
        className="home-shelf__box"
        style={{ width: `${(SHELF_PX * size.w) / size.h}px`, height: `${SHELF_PX}px` }}
      >
        <div ref={stage} className="home-shelf__stage" data-full={full || undefined}>
          <canvas ref={canvasRef} data-home-shelf className="home-shelf__canvas" />
          {/* 3D が届くまでの仮の棚（同じ大きさ・同じ色の背）。帯が空いて見えないように。 */}
          {!ready && !full && (
            <div className="home-shelf__proxy" aria-hidden="true">
              {months.map((m) => (
                <span key={m.key} style={{ background: m.color }} />
              ))}
            </div>
          )}
          {full && !state.open && (
            <div className="home-shelf__top">
              <button type="button" className="home-shelf__btn" onClick={collapse}>
                {t("common.close")}
              </button>
            </div>
          )}
          {busy && (
            <div className="home-shelf__status" aria-live="polite">
              <span className="home-shelf__spinner" />
            </div>
          )}
          {state.open && (
            <div className="home-shelf__top">
              <button
                type="button"
                className="home-shelf__btn"
                onClick={() => world.current?.close()}
              >
                {t("shelf.home.back")}
              </button>
              <span className="home-shelf__btn home-shelf__label">{heading}</span>
            </div>
          )}
          {state.open && view === "spread" && (
            <>
              <button
                type="button"
                aria-label={t("shelf.home.prev")}
                onClick={() => world.current?.flip(-1)}
                className="home-shelf__btn home-shelf__arrow"
                data-side="left"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={t("shelf.home.next")}
                onClick={() => world.current?.flip(1)}
                className="home-shelf__btn home-shelf__arrow"
                data-side="right"
              >
                ›
              </button>
            </>
          )}
          {state.open && day && (
            <div className="home-shelf__bottom">
              {/* 日記の字体（押すと右のページがその字体で書き直される）。 */}
              <div role="radiogroup" aria-label={t("shelf.home.diaryFont")} className="flex gap-1">
                {DIARY_FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={font === f.id}
                    onClick={() => void chooseFont(f.id)}
                    className="home-shelf__btn home-shelf__font"
                    style={{ fontFamily: f.family }}
                  >
                    {t(f.key)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setWriting(day.diary)}
                className="home-shelf__btn home-shelf__write"
              >
                {day.diary.trim() ? t("shelf.home.rewriteDiary") : t("shelf.home.writeDiary")}
              </button>
            </div>
          )}
          {writing !== null && day && (
            <div
              role="dialog"
              aria-label={t("shelf.home.writeDiary")}
              className="home-shelf__sheet"
            >
              <div className="home-shelf__sheet-card">
                <div
                  style={{ fontFamily: diaryFont("hand").family }}
                  className="home-shelf__sheet-title"
                >
                  {t("shelf.home.diaryOf").replace("{date}", day.label ?? "")}
                </div>
                <textarea
                  autoFocus
                  value={writing}
                  onChange={(e) => setWriting(e.target.value)}
                  rows={7}
                  className="home-shelf__textarea"
                  style={{ fontFamily: diaryFont(font).family }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setWriting(null)}
                    className="home-shelf__btn flex-1"
                  >
                    {t("shelf.home.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDiary()}
                    className="home-shelf__btn home-shelf__write flex-[2]"
                  >
                    {t("shelf.home.writeOnPage")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* 押す所は棚の外まで 44px（棚そのものは帯に合わせて小さい）。 */}
        {!full && (
          <button
            type="button"
            aria-label={t("shelf.home.label")}
            onClick={expand}
            className="home-shelf__open"
          />
        )}
      </div>
      {/* 読み上げ・キーボードでも開けるように（3D の棚は押す場所が見えないため）。 */}
      <ul className="sr-only">
        {months.map((m, i) => (
          <li key={m.key}>
            <button type="button" onClick={() => world.current?.openMonth(i)}>
              {monthTitle(m.y, m.m)}
            </button>
          </li>
        ))}
      </ul>
      {/* 片ページ（全画面）。押すと見開きに戻る。上で見開き／片ページを切り替え。 */}
      {state.open && view !== "spread" && (
        <div role="dialog" aria-label={t("shelf.home.single")} className="home-shelf__single">
          <div className="home-shelf__single-top">
            <span className="home-shelf__single-title">{heading}</span>
            <div
              role="radiogroup"
              aria-label={t("shelf.home.pageView")}
              className="home-shelf__seg"
            >
              <button
                type="button"
                role="radio"
                aria-checked={false}
                onClick={() => setView("spread")}
              >
                {t("shelf.home.spread")}
              </button>
              <button type="button" role="radio" aria-checked>
                {t("shelf.home.single")}
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("shelf.home.backToSpread")}
            onClick={() => setView("spread")}
            className="home-shelf__single-page"
          >
            {pageUrl && (
              <img
                key={pageUrl.length + view}
                src={pageUrl}
                alt=""
                data-side={view}
                className="home-shelf__single-img"
              />
            )}
          </button>
          <div className="home-shelf__single-nav">
            <button type="button" onClick={() => stepSingle(-1)} className="home-shelf__btn">
              ‹ {t("shelf.home.prev")}
            </button>
            <span className="home-shelf__single-side">
              {view === "left" ? t("shelf.home.leftPage") : t("shelf.home.rightPage")}
            </span>
            <button type="button" onClick={() => stepSingle(1)} className="home-shelf__btn">
              {t("shelf.home.next")} ›
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** 写真を canvas に描ける形で読む（端末に貯めた写真＝同じ出どころの URL を使う）。 */
async function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const src = await resolveCachedSrc(url).catch(() => url);
  return new Promise((ok) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

export type HomeShelfProps = React.ComponentProps<typeof HomeShelf>;
