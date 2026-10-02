import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { flushSync } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { usePhotoPref } from "@/lib/photo-pref";
import { useSurfaceRoleMap } from "@/lib/photo-surface";
import { albumHeroUrl, layoutDayAlbum, type DayLayoutItem } from "@/lib/album-day-layout";
import { resolveCachedSrc } from "@/lib/image-cache";
import { listMyDiaryMonth, saveMyDiary } from "@/lib/journal.functions";
import { monthDays, monthKey, shelfMonths } from "@/lib/home-shelf";
import {
  DIARY_FONTS,
  diaryFont,
  diaryInputFamily,
  ensureDiaryInputFontCss,
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
import { prewarmShelf } from "@/components/shelf3d/prewarm";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import {
  SHELF_PLACEHOLDER,
  hasShelfSnapshot,
  readShelfSnapshot,
  saveShelfSnapshot,
  shelfSnapshotSig,
} from "@/components/shelf3d/snapshot";

// ホームの塊を読んだ瞬間に、3D の塊と棚の 3 ファイルを並べて取りに行く（`prewarm.ts`）。
prewarmShelf();

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

/** 置き方を計算する時の台紙の幅（CSS px）。ふつうのスマホの誌面の幅。 */
const LAYOUT_BOARD_W = 340;

export function HomeShelf({
  items,
  loaders,
  room = "a",
  hiddenIds,
  autoOpen,
  onAlbumLongPress,
}: {
  /**
   * 開いた本の**左ページ（その日のアルバム）を長押し**した（オーナー指示 2026-10-02「本棚の
   * アルバムでも長押しで配置を変換できるようにして」）。受け取る側（ホーム）がその日の
   * ホームと同じ並べ替えの面を開く。ここでは本の上に何も重ねない（本とページがずれる）。
   */
  onAlbumLongPress?: (day: { y: number; m: number; d: number }) => void;
  items: ReadonlyArray<StickerWithWord>;
  /**
   * ホームのアルバムから外した写真（`useAlbumHidden`）。**本の左ページにも貼らない**
   * （ホームと同じ誌面にするため）。本の数・枚数（棚の見た目）は変えない。
   */
  hiddenIds?: ReadonlySet<string>;
  /**
   * 描けたらすぐ最初の本を開き、そのページ（見開き / 左 / 右）を見せる。**確認用ページ用**
   * （オーナーが本を探して押さなくても、直した画面がそのまま出る。本番は渡さない）。
   */
  autoOpen?: View;
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
  const hiddenRef = useRef(hiddenIds);
  hiddenRef.current = hiddenIds;
  const longPressRef = useRef(onAlbumLongPress);
  longPressRef.current = onAlbumLongPress;
  /** いま見開きで見ている日（長押しした時にどの日かを知るため）。 */
  const dayRef = useRef<DaySpread | undefined>(undefined);
  // アルバムに貼る絵の選び方（設定と、長押しで選んだ絵）。ホームと同じ答えを使う。
  const photoPref = usePhotoPref();
  const surfaceRoles = useSurfaceRoleMap();
  const heroCtx = useRef({ photoPref, surfaceRoles });
  heroCtx.current = { photoPref, surfaceRoles };

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
  /** 端末に置いた棚の絵（undefined = まだ読んでいる、null = 無い）。 */
  const [snap, setSnap] = useState<string | null | undefined>(undefined);
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
  const [font, setFont] = useState<DiaryFontId>(() => getDiaryFont());
  const fontRef = useRef(font);
  const [writing, setWriting] = useState<string | null>(null);
  const viewport = useVisualViewport(writing !== null);
  const writingOpen = writing !== null;
  useEffect(() => {
    if (writingOpen) ensureDiaryInputFontCss(font);
  }, [writingOpen, font]);
  /** 鉛筆が書いている文（書き終わるまで画面いっぱいの机の上）。 */
  const [pencil, setPencil] = useState<{ text: string; after: () => void } | null>(null);
  const [, bump] = useState(0);
  const viewRef = useRef<View>("spread");
  viewRef.current = view;
  /** 直前に見た「めくった枚数」（払ってめくれた時に、見ているページを追いかける）。 */
  const prevPage = useRef(0);

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
  const labelsRef = useRef({ monthTitle, dayLabel, t, locale });
  labelsRef.current = { monthTitle, dayLabel, t, locale };

  /** 広げる: 帯の位置から画面いっぱいへ（元の位置は閉じる時に戻る先）。 */
  const expand = useCallback(() => {
    fromRect.current = box.current?.getBoundingClientRect() ?? null;
    setFull(true);
  }, []);
  /** 閉じている最中（「閉じる」を押した瞬間に釦を消す）。 */
  const [closing, setClosing] = useState(false);
  /**
   * **閉じる: 全画面の棚が、そのまま帯の中へ収まる**（オーナー報告 2026-09-29「本のアルバムを
   * 閉じて、ホーム画面に戻るときのアニメーションにバグがある」）。
   *
   * 前は舞台の幅と高さを毎コマ変えていた。すると 3D の canvas も毎コマ作り直しになり、
   * **途中で棚が消えて空だけが縮む**。さらに動きが終わった瞬間、React が帯へ戻すより先に
   * 舞台が**全画面へ一瞬戻って**いた（録画で空が画面いっぱいに1コマ出ていた）。
   *
   * 今は canvas の大きさを変えない。全画面の絵のまま「帯の大きさの窓」で切り抜き
   * （clip-path）、窓ごと帯の位置へ滑らせる。棚は画面の幅いっぱい・縦の真ん中に描かれて
   * いるので、窓の中身は帯の中の棚とほぼ同じ絵になる。終わりの姿は保ったまま
   * （fill: forwards）帯へ戻し、戻し終えてから動きを外す。
   */
  const collapse = useCallback(() => {
    const el = stage.current;
    const to = box.current?.getBoundingClientRect();
    setClosing(true);
    const done = () => {
      flushSync(() => {
        setFull(false);
        setClosing(false);
      });
    };
    if (!el || !to || motionReducedNow()) {
      done();
      return;
    }
    const W = el.clientWidth || innerWidth;
    const H = el.clientHeight || innerHeight;
    const top = Math.max(0, H / 2 - to.height / 2);
    const dy = to.top + to.height / 2 - H / 2;
    const right = Math.max(0, W - to.left - to.width);
    const anim = el.animate(
      [
        { clipPath: "inset(0px 0px 0px 0px round 0px)", transform: "translateY(0px)" },
        {
          clipPath: `inset(${top}px ${right}px ${top}px ${Math.max(0, to.left)}px round 0px 0px 28px 28px)`,
          transform: `translateY(${dy}px)`,
        },
      ],
      { duration: 420, easing: "cubic-bezier(.3,.7,.2,1)", fill: "forwards" },
    );
    const finish = () => {
      done();
      anim.cancel();
    };
    anim.finished.then(finish, finish);
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
    const hidden = hiddenRef.current;
    const shown = hidden ? itemsRef.current.filter((s) => !hidden.has(s.id)) : itemsRef.current;
    // 1日に貼る写真の数は絞らない（ホームのアルバムと同じ全部。上限は安全のためだけ）。
    const groups = monthDays(shown, b.y, b.m, 60);
    const { photoPref: pref, surfaceRoles: roles } = heroCtx.current;
    const urls = groups.map((g) =>
      g.items.map((s) => albumHeroUrl(s, { surfaceRoles: roles, photoPref: pref, thumb: true })),
    );
    const [diaries, photos] = await Promise.all([
      loadRef.current.diary(key).catch(() => [] as Array<{ date: string; text: string }>),
      Promise.all(urls.map((row) => Promise.all(row.map((u) => loadImage(u))))),
    ]);
    const diaryByDay = new Map(diaries.map((d) => [Number(d.date.slice(8, 10)), d.text]));
    const { dayLabel: label } = labelsRef.current;
    const days: DaySpread[] = groups.map((g, i) => {
      // 写真の縦横比（読めた物）から、ホームと同じ置き方を計算する。
      const ratios: Record<string, number> = {};
      const heroIds = new Set<string>();
      g.items.forEach((s, j) => {
        const img = photos[i][j];
        if (urls[i][j]) heroIds.add(s.id);
        const iw = img?.naturalWidth || img?.width || 0;
        const ih = img?.naturalHeight || img?.height || 0;
        if (iw && ih) ratios[s.id] = ih / iw;
      });
      const layout = layoutDayAlbum({
        stickers: g.items,
        hasHero: (id) => heroIds.has(id),
        photoRatio: ratios,
        boardW: LAYOUT_BOARD_W,
      });
      const at = new Map<string, DayLayoutItem>(layout.items.map((it) => [it.id, it]));
      return {
        y: b.y,
        m: b.m,
        d: g.d,
        label: label(b.y, b.m, g.d),
        photos: g.items.map((s, j) => {
          const it = at.get(s.id);
          return {
            id: s.id,
            img: photos[i][j],
            word: s.word.headword,
            note: s.caption ?? undefined,
            place: it?.place,
            ratio: it?.ratio,
            z: it?.z,
            plain: !urls[i][j],
          };
        }),
        boardH: layout.boardH,
        diary: diaryByDay.get(g.d) ?? "",
      };
    });
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

  /**
   * 写真の置き方・一言・外した写真が変わったら、**開いている本の絵を描き直す**（ホームや
   * 片ページのアルバムで直した内容が、見開きの絵にも出る）。開いていなければ何もしない
   * （次に開く時に最新を読む）。
   */
  const layoutSig = useMemo(
    () =>
      items
        .map((s) =>
          [
            s.id,
            s.caption ?? "",
            s.album_order ?? "",
            s.album_x ?? "",
            s.album_y ?? "",
            s.album_scale ?? "",
            s.album_rot ?? "",
            s.hero_role ?? "",
          ].join(":"),
        )
        .join("|") +
      "#" +
      [...(hiddenIds ?? [])].sort().join(","),
    [items, hiddenIds],
  );
  useEffect(() => {
    const b = state.open;
    if (!b || !world.current) return;
    let alive = true;
    void prepare(b).then(() => {
      if (alive && world.current?.refreshDays()) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
    // 開いている本は `state.open`。合図にするのは置き方の署名だけ（開いた瞬間に走らせない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSig]);

  // 端末に置いた棚の絵を読む（ふつう数十ミリ秒）。
  useLayoutEffect(() => {
    let alive = true;
    // 絵が無い人は同梱の絵をすぐ。ある人は読み終えるまで待つ（遅い端末でも 400ms まで）。
    const fallback = window.setTimeout(
      () => alive && setSnap((v) => (v === undefined ? null : v)),
      hasShelfSnapshot() ? 400 : 0,
    );
    void readShelfSnapshot().then((url) => {
      if (!alive) return;
      window.clearTimeout(fallback);
      setSnap((v) => (v === undefined || url ? url : v));
    });
    return () => {
      alive = false;
      window.clearTimeout(fallback);
    };
  }, []);

  // 3D が描けたら、今の棚を撮って端末に置く（次に開いた時に先に出す）。本の数が変わった時も撮り直す。
  // **中身が前に撮った時と同じなら撮らない**（オーナー報告 2026-09-29「アプリ全体がカクカク」—
  // 開くたびに撮って圧縮し、画面が 0.5 秒ほど止まっていた）。撮る時も画面を止めない（toBlob）。
  useEffect(() => {
    if (!ready) return;
    if (hasShelfSnapshot() && shelfSnapshotSig() === `${room}:${monthSig}`) return;
    const id = window.setTimeout(() => {
      void world.current
        ?.snapshotBlob()
        .then((blob) => blob && saveShelfSnapshot(blob, `${room}:${monthSig}`));
    }, 1200);
    return () => window.clearTimeout(id);
  }, [ready, monthSig, room]);

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
    /** 写真立ての写真。遅ければ待たずに空の額で先に組む（棚が出るほうを優先）。 */
    const frameSrc = async (): Promise<string | null> => {
      if (!framePhoto) return null;
      const slow = new Promise<null>((ok) => window.setTimeout(() => ok(null), 500));
      return Promise.race([resolveCachedSrc(framePhoto).catch(() => framePhoto), slow]);
    };
    void Promise.all([import("@/components/shelf3d/engine"), frameSrc()])
      .then(async ([{ ShelfWorld }, frame]) => {
        if (!alive) return;
        w = new ShelfWorld(
          el,
          books,
          {
            onState: (st) => {
              setState(st);
              if (!st.open) setView("spread");
            },
            // 見開きで押した側のページへ寄る。寄っている時に押したら見開きへ戻る。
            onPageTap: (side) => setView(viewRef.current === "spread" ? side : "spread"),
            // 左ページ（その日のアルバム）の長押し → ホームと同じ並べ替えの面（右の日記は対象外）。
            onPageLongPress: (side) => {
              const d = dayRef.current;
              if (side !== "left" || !d || !longPressRef.current) return;
              longPressRef.current({ y: d.y, m: d.m, d: d.d });
            },
            // 片ページで払って、同じ見開きの反対のページへ横に移った（R20）。
            onFocusSide: (side) => setView(side),
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
        return world3d.load(frame ? [frame] : []).then(() => alive && setReady(true));
      })
      .catch(() => alive && setFailed(true));
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

  // 確認用: 描けたら最初の本を開き、指定のページへ寄る（`autoOpen`）。
  const autoOpened = useRef(false);
  const autoViewed = useRef(false);
  useEffect(() => {
    if (!autoOpen || !ready || autoOpened.current) return;
    autoOpened.current = true;
    world.current?.openMonth(0);
  }, [autoOpen, ready]);
  useEffect(() => {
    if (!autoOpen || autoOpen === "spread" || autoViewed.current) return;
    if (!state.open || state.cover || view !== "spread") return;
    autoViewed.current = true;
    setView(autoOpen);
  }, [autoOpen, state.open, state.cover, view]);

  // 片ページ = **同じ 3D の本のまま、そのページへ寄る**（R19: めくりは見開きと同じ紙の動き）。
  useEffect(() => {
    world.current?.setFocus(state.open ? view : "spread");
  }, [view, state.open, ready]);

  // 払ってめくった・表紙まで戻った時に、見ているページを追いかける
  // （右のページをめくると、その裏＝左のページへ。左をめくり戻すと右へ）。
  useEffect(() => {
    if (!state.open) {
      prevPage.current = 0;
      return;
    }
    const before = prevPage.current;
    prevPage.current = state.page;
    if (view === "right" && state.page > before) setView("left");
    else if (view === "left" && state.page < before) setView("right");
    else if ((view === "right" || view === "left") && state.cover) setView("cover");
    else if (view === "cover" && !state.cover) setView("right");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.page, state.cover, state.open]);

  // 開いている間は、Esc で片ページ → 見開き → 棚の順に戻る（キーボードの人のため）。
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && view !== "spread") stepSingle(1);
      else if (e.key === "ArrowLeft" && view !== "spread") stepSingle(-1);
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
    // 紙をめくる時（flip）は、見ているページの切り替えは上の effect が追いかける。
    if (dir === 1) {
      if (view === "cover") w.flip(1);
      else if (view === "left") setView("right");
      else if (at < count - 1) w.flip(1);
      else return false;
      return true;
    }
    if (view === "cover") return false;
    if (view === "right" && at > 0) setView("left");
    else if (view === "left" && at > 0) w.flip(-1);
    else if (view === "right")
      w.flip(-1); // 最初の見開きから戻る → 表紙（パタッと閉じる）
    else return false;
    return true;
  };

  const days = world.current?.openDays ?? [];
  const dayIndex = state.open && !state.cover ? state.page - 1 : -1;
  const day = dayIndex >= 0 ? days[dayIndex] : undefined;
  dayRef.current = day;
  if (!months.length || failed) return null;

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
          {/* **3D より先に出す棚の絵**（R20）。前に開いた時にこの端末で撮った絵、無ければ
              アプリに同梱の空の棚。3D が描けたら、同じ位置のまま消える（絵と 3D はほぼ同じ）。 */}
          {snap !== undefined && !state.open && (
            <img
              src={snap ?? SHELF_PLACEHOLDER}
              alt=""
              aria-hidden
              draggable={false}
              className="home-shelf__snap"
              data-gone={ready || undefined}
            />
          )}
          {full && !state.open && !closing && (
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
          {state.open && view === "spread" && (
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
              // キーボードを除いた、いま見えている範囲に置く（`use-visual-viewport.ts`）。
              style={
                viewport
                  ? { top: viewport.top, height: viewport.height, bottom: "auto" }
                  : undefined
              }
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
                  // 打つ欄は `swap` の別名で描く（新しい字の切り分けが届くまで、欄の字が
                  // 全部消えていた。`diary-fonts.ts` の `diaryInputFamily`）。
                  style={{ fontFamily: diaryInputFamily(font) }}
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
      {state.open && view !== "spread" && writing === null && (
        <SinglePage
          view={view}
          heading={heading}
          onStep={stepSingle}
          onClose={() => setView("spread")}
          // 片ページでも日記を書ける（オーナー指示 2026-09-29「片ページモードにしたときにも
          // 日記を書くボタンを表示して」）。書く欄は見開きと同じ物を開く。
          onWrite={day ? () => setWriting(day.diary) : undefined}
          writeLabel={day?.diary.trim() ? t("shelf.home.rewriteDiary") : t("shelf.home.writeDiary")}
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
 * **片ページ**の操作部品（上の題と切替、下の前へ・次へ）。ページそのものは**同じ 3D の本**が
 * 手前へ寄って見せる（`ShelfWorld.setFocus`）ので、ここに絵は無い。だから
 *  - 開く・閉じる = 見開きの中のページへ寄る・戻る 3D の動き（R17「ズームするように」）
 *  - めくる = 見開きと**同じ紙**（同じ曲がり方・ばね・指に付いてくる払い）（R19）
 * 払うのは 3D の本が直に受ける（この層は素通し）。ここの釦は同じ紙を同じ動きでめくる。
 */
function SinglePage({
  view,
  heading,
  onStep,
  onClose,
  onWrite,
  writeLabel,
  labels,
}: {
  view: Exclude<View, "spread">;
  heading: string;
  onStep: (dir: 1 | -1) => boolean;
  onClose: () => void;
  /** 日記を書く（その日のページを見ている時だけ）。 */
  onWrite?: () => void;
  writeLabel: string;
  labels: Record<"single" | "spread" | "pageView" | "back" | "prev" | "next" | "side", string>;
}) {
  return (
    <div role="dialog" aria-label={labels.single} className="home-shelf__single" data-view={view}>
      <div className="home-shelf__single-top">
        <span className="home-shelf__single-title">{heading}</span>
        <div role="radiogroup" aria-label={labels.pageView} className="home-shelf__seg">
          <button type="button" role="radio" aria-checked={false} onClick={onClose}>
            {labels.spread}
          </button>
          <button type="button" role="radio" aria-checked>
            {labels.single}
          </button>
        </div>
      </div>
      <div>
        {onWrite && (
          <div className="home-shelf__single-write">
            <button
              type="button"
              onClick={onWrite}
              className="home-shelf__btn home-shelf__write w-full"
            >
              {writeLabel}
            </button>
          </div>
        )}
        <div className="home-shelf__single-nav">
          <button type="button" onClick={() => onStep(-1)} className="home-shelf__btn">
            ‹ {labels.prev}
          </button>
          <span className="home-shelf__single-side">{labels.side}</span>
          <button type="button" onClick={() => onStep(1)} className="home-shelf__btn">
            {labels.next} ›
          </button>
        </div>
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
