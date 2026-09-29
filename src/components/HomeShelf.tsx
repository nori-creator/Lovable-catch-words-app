import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { resolveCachedSrc } from "@/lib/image-cache";
import { listMyDiaryMonth, saveMyDiary } from "@/lib/journal.functions";
import { monthDays, monthKey, shelfMonths } from "@/lib/home-shelf";
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
import type { RoomId } from "@/components/shelf3d/room";
import type { PencilDiary } from "@/components/diary-pencil/engine";

/**
 * **ホームの一番上の本棚**（部屋に置いた大きな 3D の棚）。
 *
 * オーナー指示の積み重ね:
 *  - 2026-09-29「ホームのアルバムの一番上に本棚を一列作って。アルバムを開くとその月の最初の
 *    ページが開くように。見開きの片側ページをタップすると片側ページが全画面に」
 *  - R17「本棚が小さすぎる。空中に本棚がただあるデザイン不自然。3D のリアルな本棚をアプリの
 *    上部に設置して。本棚と本の間に少し隙間。撮った月の本だけ」＋参考画像 A〜D
 *  - R17「見開きを大きく。片面をタップしたらズームするように 1 ページ。片ページでもスワイプで
 *    めくれる。カバーまでめくれる。カバーはパタッと硬く。日記を書いたら鉛筆で書き込む」
 *
 * 仕組み:
 *  - 帯（画面の幅いっぱい）に部屋（壁・窓・空は CSS）と、three.js の棚・本・飾り（透明の上）。
 *    本はそのまま押せる。押すと、その月の写真と日記を揃えてから画面いっぱいに広がり、本が
 *    手元に来て開く（その月の最初の日の見開き）。
 *  - 見開きの片側を押すと、そのページが**写っている位置から**全画面へ大きくなる。片ページは
 *    指で左右に払ってめくれる（表紙まで戻れる）。
 *  - 日記を書く・書き直すと、机の上の鉛筆がその文を書く（`diary-pencil/engine.ts`）。
 *
 * 3D の道具は重いので、ホームを描いた後の手の空いた時に読み込む。棚が画面の外に出ている間は
 * 描かない。3D が使えない端末では棚ごと出さない。
 */

type Loaders = {
  diary: (month: string) => Promise<Array<{ date: string; text: string }>>;
  save: (date: string, text: string) => Promise<void>;
};

type View = "spread" | "left" | "right" | "cover";

export function HomeShelf({
  items,
  loaders,
  room = "a",
}: {
  items: ReadonlyArray<StickerWithWord>;
  /** 日記の読み書き（確認用ページでは差し替える）。 */
  loaders?: Partial<Loaders>;
  /** 部屋（参考画像 A〜D）。 */
  room?: RoomId;
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

  // 撮った月だけ（1か月しか無ければ 1 冊だけ）。
  const months = useMemo(() => shelfMonths(items), [items]);
  const monthSig = months.map((m) => `${m.key}:${m.count}`).join(",");
  /** 写真立てに飾る1枚（いちばん新しく撮った写真）。 */
  const framePhoto = useMemo(() => {
    for (const s of [...items].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    )) {
      const u = stickerPhotoUrl(s, { thumb: true });
      if (u) return u;
    }
    return null;
  }, [items]);

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
  const [state, setState] = useState<{
    open: MonthBook | null;
    page: number;
    pages: number;
    cover?: boolean;
  }>({ open: null, page: 0, pages: 0 });
  const [view, setView] = useState<View>("spread");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [font, setFont] = useState<DiaryFontId>(() => getDiaryFont());
  const fontRef = useRef(font);
  const [writing, setWriting] = useState<string | null>(null);
  /** 鉛筆が書いている文（書き終わるまで画面いっぱいの机の上）。 */
  const [pencil, setPencil] = useState<{ text: string; after: () => void } | null>(null);
  const [, bump] = useState(0);
  /** 片ページへ移る時に、ページが写っていた位置（ここから大きくなる）。 */
  const zoomFrom = useRef<DOMRect | null>(null);

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

  /** 広げる: 帯の位置から画面いっぱいへ（元の位置は閉じる時に戻る先）。 */
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
        },
      ],
      { duration: 380, easing: "cubic-bezier(.3,.7,.2,1)" },
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
        { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` },
        { top: "0px", left: "0px", width: `${innerWidth}px`, height: `${innerHeight}px` },
      ],
      { duration: 440, easing: "cubic-bezier(.2,.8,.2,1)" },
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
        .then(async ({ ShelfWorld }) => {
          if (!alive) return;
          w = new ShelfWorld(
            el,
            books,
            {
              onState: (st) => {
                setState(st);
                if (!st.open) setView("spread");
              },
              onPageTap: (side) => {
                zoomFrom.current = world.current?.pageRect(side) ?? null;
                setView(side);
              },
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
            { rows: 1, openAt: "first", room },
          );
          world.current = w;
          const world3d = w;
          ro = new ResizeObserver(() => world3d.resize());
          ro.observe(el);
          io = new IntersectionObserver(([e]) => world3d.setPaused(!e.isIntersecting));
          io.observe(el);
          // 帯の上でも本はそのまま押せる（大きくなったので背表紙を指で狙える）。縦に払えば
          // ホームが送られる（`touch-action: pan-y`、その時は押したと数えない）。
          const down = (e: PointerEvent) => {
            if (fullRef.current) el.setPointerCapture(e.pointerId);
            world3d.pointerDown(e);
          };
          const move = (e: PointerEvent) => world3d.pointerMove(e);
          const up = (e: PointerEvent) => world3d.pointerUp(e);
          const cancel = () => world3d.pointerCancel();
          el.addEventListener("pointerdown", down);
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
          el.addEventListener("pointercancel", cancel);
          off.push(() => {
            el.removeEventListener("pointerdown", down);
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
            el.removeEventListener("pointercancel", cancel);
          });
          world3d.start();
          const frame = framePhoto
            ? await resolveCachedSrc(framePhoto).catch(() => framePhoto)
            : null;
          return world3d.load(frame ? [frame] : []).then(() => alive && setReady(true));
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
    // 月の並び（と枚数）・部屋が変わった時だけ組み直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthSig, room]);

  // 片ページの絵（見開きの片側の canvas をそのまま大きく見せる）。
  useEffect(() => {
    if (view === "spread") {
      setPageUrl(null);
      return;
    }
    const c = world.current?.pageCanvas(view);
    setPageUrl(c ? c.toDataURL("image/jpeg", 0.9) : null);
  }, [view, state.page, state.cover, font, writing, pencil]);

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

  /**
   * 片ページで次・前へ: 表紙 → 右（扉）→ 左（1日目のアルバム）→ 右（1日目の日記）→ …。
   * 最初の見開きの左（見返しの無地）は飛ばす。動けたら true。
   */
  const stepSingle = (dir: 1 | -1): boolean => {
    const w = world.current;
    if (!w) return false;
    const { at, count } = w.spread;
    if (dir === 1) {
      if (view === "cover") {
        w.flip(1);
        setView("right");
      } else if (view === "left") setView("right");
      else if (at < count - 1) {
        w.flip(1);
        setView("left");
      } else return false;
      return true;
    }
    if (view === "cover") return false;
    if (view === "right" && at > 0) setView("left");
    else if (at > 0) {
      w.flip(-1);
      setView("right");
    } else {
      // 最初の見開きから戻る → 表紙（パタッと閉じる）
      w.flip(-1);
      setView("cover");
    }
    return true;
  };

  if (!months.length || failed) return null;

  const days = world.current?.openDays ?? [];
  const dayIndex = state.open && !state.cover ? state.page - 1 : -1;
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
    const text = writing;
    const date = `${monthKey(day.y, day.m)}-${String(day.d).padStart(2, "0")}`;
    try {
      await loadRef.current.save(date, text);
    } catch {
      toast.error(t("shelf.home.saveFailed"));
      return;
    }
    await loadDiaryFont(fontRef.current, text).catch(() => undefined);
    setWriting(null);
    const commit = () => {
      day.diary = text.trim();
      world.current?.repaintDiary(dayIndex);
      setPencil(null);
    };
    // **鉛筆で書き込む**（R17「日記を書いたり、書き直したら鉛筆のアニメーションで書き込む」）。
    // 動きを減らす設定の人と、空にした時はすぐページに反映する。
    if (!text.trim() || motionReducedNow()) commit();
    else setPencil({ text: text.trim(), after: commit });
  };

  return (
    <section className={`home-shelf home-shelf--room-${room}`} aria-label={t("shelf.home.label")}>
      {/* 部屋の帯（壁・窓・空は CSS。棚と本と飾りは 3D）。広げている間も場所を取っておき、
          閉じると元へ縮んで戻る。 */}
      <div ref={box} className="home-shelf__box">
        <div
          ref={stage}
          className={`home-shelf__stage home-shelf--room-${room}`}
          data-full={full || undefined}
          data-open={state.open ? "" : undefined}
        >
          <span aria-hidden className="home-shelf__room" />
          <canvas ref={canvasRef} data-home-shelf className="home-shelf__canvas" />
          {/* 3D が届くまでの仮の棚（同じ色の背）。帯が空いて見えないように。 */}
          {!ready && (
            <div className="home-shelf__proxy" aria-hidden="true">
              <div className="home-shelf__proxy-shelf">
                {months.map((m) => (
                  <span key={m.key} style={{ background: m.color }} />
                ))}
              </div>
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
                disabled={!!state.cover}
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
          {state.open && day && view === "spread" && (
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
      {state.open && view !== "spread" && (
        <SinglePage
          url={pageUrl}
          view={view}
          heading={heading}
          from={zoomFrom.current}
          fromOf={(side) => world.current?.pageRect(side) ?? null}
          onStep={stepSingle}
          onClose={() => setView("spread")}
          labels={{
            single: t("shelf.home.single"),
            spread: t("shelf.home.spread"),
            pageView: t("shelf.home.pageView"),
            back: t("shelf.home.backToSpread"),
            prev: t("shelf.home.prev"),
            next: t("shelf.home.next"),
            side:
              view === "cover"
                ? t("shelf.home.cover")
                : view === "left"
                  ? t("shelf.home.leftPage")
                  : t("shelf.home.rightPage"),
          }}
        />
      )}
      {pencil && (
        <PencilOverlay
          text={pencil.text}
          font={font}
          skipLabel={t("shelf.home.pencilSkip")}
          onDone={pencil.after}
        />
      )}
    </section>
  );
}

/**
 * **片ページ**（全画面）。ページが見開きの中で写っていた位置から大きくなって現れ（R17
 * 「片面のページをタップしたらズームするようなアニメーションとともに 1 ページが表示される」）、
 * 指で左右に払うとめくれる（「片ページでもスワイプするとページをめくれるように」）。
 * 押すと、写っていた位置へ縮んで見開きに戻る。
 */
function SinglePage({
  url,
  view,
  heading,
  from,
  fromOf,
  onStep,
  onClose,
  labels,
}: {
  url: string | null;
  view: Exclude<View, "spread">;
  heading: string;
  from: DOMRect | null;
  fromOf: (side: Exclude<View, "spread">) => DOMRect | null;
  onStep: (dir: 1 | -1) => boolean;
  onClose: () => void;
  labels: Record<"single" | "spread" | "pageView" | "back" | "prev" | "next" | "side", string>;
}) {
  const img = useRef<HTMLImageElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const zoomed = useRef(false);
  const enter = useRef<1 | -1 | 0>(0);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; v: number } | null>(null);

  /** 見開きの中の位置 ↔ 片ページの位置、を transform 1つで行き来する。 */
  const flipFrom = (r: DOMRect, el: HTMLElement) => {
    const to = el.getBoundingClientRect();
    if (!to.width || !r.width) return "none";
    const sx = r.width / to.width;
    const sy = r.height / to.height;
    return `translate(${r.left - to.left}px, ${r.top - to.top}px) scale(${sx}, ${sy})`;
  };

  // 最初に出る時: ページの位置から大きくなる（最初の1回だけ）。めくった後: 横から滑り込む。
  useLayoutEffect(() => {
    const el = img.current;
    if (!el || !url || motionReducedNow()) return;
    if (!zoomed.current) {
      zoomed.current = true;
      if (from) {
        el.animate(
          [
            { transformOrigin: "0 0", transform: flipFrom(from, el), borderRadius: "2px" },
            { transformOrigin: "0 0", transform: "none" },
          ],
          { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
        shade.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 300,
          easing: "ease-out",
        });
      }
      return;
    }
    if (enter.current) {
      el.animate(
        [
          {
            transform: `translateX(${enter.current * 38}%) rotate(${enter.current * 2}deg)`,
            opacity: 0.4,
          },
          { transform: "none", opacity: 1 },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      enter.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const close = () => {
    const el = img.current;
    const r = fromOf(view);
    if (!el || !r || motionReducedNow()) {
      onClose();
      return;
    }
    shade.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    el.animate(
      [
        { transformOrigin: "0 0", transform: "none" },
        { transformOrigin: "0 0", transform: flipFrom(r, el), borderRadius: "2px" },
      ],
      { duration: 340, easing: "cubic-bezier(.3,.7,.2,1)", fill: "forwards" },
    ).finished.then(onClose, onClose);
  };

  const go = (dir: 1 | -1) => {
    const el = img.current;
    const out = () => {
      enter.current = dir;
      if (!onStep(dir)) {
        enter.current = 0;
        el?.animate([{ transform: "none" }], { duration: 200, easing: "ease-out" });
      }
    };
    if (!el || motionReducedNow()) {
      out();
      return;
    }
    el.animate(
      [
        { transform: el.style.transform || "none" },
        { transform: `translateX(${-dir * 110}%) rotate(${-dir * 4}deg)`, opacity: 0.2 },
      ],
      { duration: 180, easing: "cubic-bezier(.4,0,.8,.6)" },
    ).finished.then(() => {
      el.style.transform = "";
      out();
    }, out);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, v: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = img.current;
    if (!d || !el) return;
    const now = performance.now();
    const dx = e.clientX - d.x;
    d.v = (dx - d.dx) / Math.max(1, now - d.t);
    d.t = now;
    d.dx = dx;
    // 指に 1:1 で付いてくる（端の先にページが無ければ少しだけ抵抗）
    el.style.transform = `translateX(${dx}px) rotate(${dx * 0.012}deg)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const el = img.current;
    if (!d || !el) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved < 10) {
      el.style.transform = "";
      close();
      return;
    }
    // 払った向き・速さでめくるか戻すかを決める
    const projected = d.dx + d.v * 180;
    if (Math.abs(projected) > 70) go(projected < 0 ? 1 : -1);
    else {
      el.animate([{ transform: el.style.transform }, { transform: "none" }], {
        duration: 260,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
      el.style.transform = "";
    }
  };

  return (
    <div role="dialog" aria-label={labels.single} className="home-shelf__single">
      <div ref={shade} aria-hidden className="home-shelf__single-shade" />
      <div className="home-shelf__single-top">
        <span className="home-shelf__single-title">{heading}</span>
        <div role="radiogroup" aria-label={labels.pageView} className="home-shelf__seg">
          <button type="button" role="radio" aria-checked={false} onClick={close}>
            {labels.spread}
          </button>
          <button type="button" role="radio" aria-checked>
            {labels.single}
          </button>
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={labels.back}
        className="home-shelf__single-page"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          if (img.current) img.current.style.transform = "";
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          else if (e.key === "ArrowLeft") go(-1);
          else if (e.key === "Enter" || e.key === " ") close();
        }}
      >
        {url && (
          <img
            ref={img}
            src={url}
            alt=""
            draggable={false}
            data-side={view}
            className="home-shelf__single-img"
          />
        )}
      </div>
      <div className="home-shelf__single-nav">
        <button type="button" onClick={() => go(-1)} className="home-shelf__btn">
          ‹ {labels.prev}
        </button>
        <span className="home-shelf__single-side">{labels.side}</span>
        <button type="button" onClick={() => go(1)} className="home-shelf__btn">
          {labels.next} ›
        </button>
      </div>
    </div>
  );
}

/**
 * **鉛筆で日記を書き込む**（R17）。机の上のページに、本人が選んだ字体で1字ずつ書く
 * （R13 で作った鉛筆の 3D）。書き終わると本へ戻り、右のページに日記が載っている。
 * 押すと残りを一度に書き上げて戻る（待たせない）。
 */
function PencilOverlay({
  text,
  font,
  skipLabel,
  onDone,
}: {
  text: string;
  font: DiaryFontId;
  skipLabel: string;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PencilDiary | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let alive = true;
    let finished = false;
    const finish = () => {
      if (finished || !alive) return;
      finished = true;
      // 書き終えた字を一息見せてから本へ戻る
      window.setTimeout(() => alive && doneRef.current(), 650);
    };
    void import("@/components/diary-pencil/engine").then(({ createPencilDiary }) => {
      if (!alive) return;
      // 本棚では少し速く書く（長い日記で待たせすぎない。1字 0.16 秒）。
      const e = createPencilDiary(el, {
        pace: { perChar: 0.16, pause: 0.22, newline: 0.45 },
        onDone: finish,
      });
      if (!e) {
        doneRef.current();
        return;
      }
      engine.current = e;
      e.write(text, font);
    });
    return () => {
      alive = false;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [text, font]);
  return (
    <div className="home-shelf__pencil" role="dialog" aria-label={skipLabel}>
      <canvas ref={canvas} className="home-shelf__pencil-canvas" />
      <button
        type="button"
        className="home-shelf__btn home-shelf__pencil-skip"
        onClick={() => engine.current?.finish()}
      >
        {skipLabel}
      </button>
    </div>
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
