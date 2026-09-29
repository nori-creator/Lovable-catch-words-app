/**
 * **本物の本棚（3D）**（オーナー指示 2026-09-28「本棚最もリアルにして…Blender や外部や
 * MCP・API なども利用して…3D 感。現実のようなもの」「表紙は硬い感じでめくって。本の大きさ
 * そろえて。ページがカクカクしてるから、もっと滑らかに」「アルバムの本のカバーは本物の本の
 * カバーを再現して」）。
 *
 * 形は Blender で作り（`scripts/blender/book_and_shelf.py` → `public/models/*.glb`）、
 * three.js で光と影を付けて描く。中身は `shelf3d/engine.ts`。
 *
 * 操作: 本を押す → 手元に寄って表紙が開く。右半分を押す／左へ払う＝次のページ。
 * 左半分を押す／右へ払う＝前のページ。「棚に戻す」で閉じて戻る。
 *
 * **1日＝1見開き**（オーナー指示 2026-09-28「本棚のアルバムをタップしたら左側に今日撮った
 * 画像のアルバム（ユーザーの一言や落書きなども含む）右側に今日の日記を表示される。日記は
 * ユーザーがタイプしたものが、本物の手書きのような字体含む日記の字体ユーザーが選べて」）。
 * 本を開くと**いちばん新しい日の見開き**までめくれて止まる。下の字体を押すと右のページが
 * その字体で書き直され、「日記を書く」で打った文がそのまま右のページに載る。
 */
import { useEffect, useRef, useState } from "react";
import { ShelfWorld, type MonthBook } from "@/components/shelf3d/engine";
import type { DaySpread } from "@/components/shelf3d/textures";
import {
  DIARY_FONTS,
  diaryFont,
  getDiaryFont,
  loadDiaryFont,
  setDiaryFont,
  type DiaryFontId,
} from "@/lib/diary-fonts";
import { useT } from "@/lib/i18n";

const COLORS = [
  "#23365e",
  "#7d2430",
  "#2f5a45",
  "#b58a2c",
  "#1f5f66",
  "#9a4a2e",
  "#5a3564",
  "#5d6a2e",
  "#3e4a5c",
  "#a7552c",
  "#262a33",
  "#6c8a6e",
];
const COUNTS = [8, 14, 5, 22, 30, 12, 18, 26, 9, 34, 21, 17];
const MONTHS: MonthBook[] = COUNTS.map((count, i) => {
  const idx = 9 + i; // 2025年10月から
  return { y: 2025 + Math.floor(idx / 12), m: (idx % 12) + 1, count, color: COLORS[i] };
});
const PHOTOS = [
  "/first-catch-cafe.webp",
  "/first-catch-cat.webp",
  "/first-catch-flower.webp",
  "/first-catch-interests.webp",
  "/first-catch-ready.webp",
];

/** 今月（最後の本）の4日ぶん。写真・一言・落書き・日記（日本語と台湾華語の混ざり）。 */
const NOTES = [
  "並んでも飲みたかった！",
  "猫が店番してた",
  "名前わからなかった花",
  "本屋さんで見つけた",
  "明日も来たい",
];
const DIARIES = [
  "今日は士林夜市へ。珍珠奶茶を頼むとき「半糖少冰」と言えた。\n店員さんに通じてうれしかった。",
  "雨の日。捷運で隣の人が読んでいた本のタイトルが気になって、写真を撮った。\n今天下雨，可是心情很好。",
  "",
  "朝ごはんに蛋餅。お店のおばさんが「要不要加辣？」と聞いてくれた。\n辣は「からい」。やっと聞き取れた！\n\n夜は友だちと火鍋。",
];
const HEART: Array<[number, number]> = Array.from({ length: 28 }, (_, i) => {
  const t = (i / 27) * Math.PI * 2;
  return [
    0.82 + 0.035 * 16 * Math.sin(t) ** 3 * 0.12,
    0.13 - 0.035 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t)) * 0.12,
  ];
});

function fixtureDays(b: MonthBook, imgs: Array<HTMLImageElement | null>): DaySpread[] {
  const current = b === MONTHS[MONTHS.length - 1];
  const n = current ? 4 : 3;
  const startDay = current ? 25 : 8;
  return Array.from({ length: n }, (_, i) => {
    const k = (b.m + i) % imgs.length;
    const photos = Array.from({ length: (i % 3) + 1 + (i === n - 1 ? 1 : 0) }, (_, j) => ({
      img: imgs[(k + j) % imgs.length],
      word: ["珍珠奶茶", "貓", "花", "書店", "蛋餅", "火鍋"][(i + j) % 6],
      note: j === 0 ? NOTES[(i + b.m) % NOTES.length] : undefined,
    }));
    return {
      y: b.y,
      m: b.m,
      d: startDay + i,
      photos,
      doodles:
        i % 2 === 1
          ? [{ color: "#e0564c", width: 5, pts: HEART }]
          : [
              {
                color: "#2f6fd6",
                width: 4,
                pts: [
                  [0.1, 0.93],
                  [0.2, 0.9],
                  [0.3, 0.94],
                  [0.4, 0.9],
                  [0.5, 0.93],
                ],
              },
            ],
      diary: current ? DIARIES[i % DIARIES.length] : "",
    };
  });
}

export function Shelf3DScene({ q }: { q: URLSearchParams }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const world = useRef<ShelfWorld | null>(null);
  const [state, setState] = useState<{ open: MonthBook | null; page: number; pages: number }>({
    open: null,
    page: 0,
    pages: 6,
  });
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const [font, setFont] = useState<DiaryFontId>(() => getDiaryFont());
  const fontRef = useRef(font);
  const imgs = useRef<Array<HTMLImageElement | null>>([]);
  const [writing, setWriting] = useState<string | null>(null);
  /**
   * **見開き／片ページ**（オーナー指示 2026-09-28 R14「ページをタップしたら片ページが
   * 全画面で見えるように。デフォルトは両面が見え、タップすると片面だけが見える。
   * 切り替えもできるように」）。"spread" が既定。
   */
  const [view, setView] = useState<"spread" | "left" | "right">("spread");
  const [pageUrl, setPageUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w: ShelfWorld;
    try {
      w = new ShelfWorld(el, MONTHS, {
        onState: (st) => {
          setState(st);
          if (!st.open) setView("spread");
        },
        onPageTap: (side) => setView(side),
        days: (b) => fixtureDays(b, imgs.current),
        diaryFont: () => fontRef.current,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    world.current = w;
    // 見開きに貼る写真と、日記・一言の字体を先に揃える（canvas は字体が届く前に
    // 描くと代わりの字で焼き付く）。
    const preload = Promise.all([
      Promise.all(
        PHOTOS.map(
          (src) =>
            new Promise<HTMLImageElement | null>((ok) => {
              const im = new Image();
              im.onload = () => ok(im);
              im.onerror = () => ok(null);
              im.src = src;
            }),
        ),
      ).then((list) => {
        imgs.current = list;
      }),
      loadDiaryFont(fontRef.current, DIARIES.join("")),
      loadDiaryFont("hand", NOTES.join("") + "月日（）火水木金土0123456789年見開きぶん"),
    ]);
    Promise.all([w.load(PHOTOS), preload])
      .then(() => {
        setReady(true);
        const n = Number(q.get("open"));
        if (n >= 1 && n <= 12)
          (w as unknown as { openBook: (b: unknown) => void }).openBook(
            (w as unknown as { books: unknown[] }).books[n - 1],
          );
      })
      .catch((e) => setErr(String(e)));
    w.start();
    const ro = new ResizeObserver(() => w.resize());
    ro.observe(el);
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      w.pointerDown(e);
    };
    const move = (e: PointerEvent) => w.pointerMove(e);
    const up = (e: PointerEvent) => w.pointerUp(e);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      w.dispose();
      world.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 片ページの絵（見開きの片側の canvas をそのまま大きく見せる）。
  useEffect(() => {
    if (view === "spread") {
      setPageUrl(null);
      return;
    }
    const c = world.current?.pageCanvas(view);
    setPageUrl(c ? c.toDataURL("image/jpeg", 0.92) : null);
  }, [view, state.page, font, writing]);

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

  const days = world.current?.openDays ?? [];
  const dayIndex = state.open ? state.page - 1 : -1;
  const day = dayIndex >= 0 ? days[dayIndex] : undefined;

  const chooseFont = async (id: DiaryFontId) => {
    setFont(id);
    fontRef.current = id;
    setDiaryFont(id);
    await loadDiaryFont(id, days.map((d) => d.diary).join(""));
    world.current?.repaintDiary();
  };

  const saveDiary = async () => {
    if (!day || writing === null) return;
    // 本番は `saveMyDiary`（journal.functions.ts）で保存する。ここは見本なのでその場だけ。
    day.diary = writing;
    await loadDiaryFont(fontRef.current, writing);
    world.current?.repaintDiary(dayIndex);
    setWriting(null);
  };

  const btn: React.CSSProperties = {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 999,
    border: "1px solid rgb(255 255 255 / .35)",
    background: "rgb(20 16 12 / .55)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
  };

  const arrow: React.CSSProperties = {
    ...btn,
    position: "absolute",
    top: "42%",
    width: 44,
    height: 44,
    padding: 0,
    fontSize: 26,
    lineHeight: "40px",
  };
  const seg = (on: boolean): React.CSSProperties => ({
    minHeight: 36,
    padding: "0 14px",
    borderRadius: 999,
    border: 0,
    fontSize: 13,
    fontWeight: 700,
    background: on ? "#fff" : "transparent",
    color: on ? "#1d1a16" : "#fff",
  });

  return (
    <div className="space-y-2 pb-28">
      {/* 片ページ（全画面）。押すと見開きに戻る。上で見開き／片ページを切り替え。 */}
      {state.open && view !== "spread" && (
        <div
          role="dialog"
          aria-label="片ページ"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "radial-gradient(120% 90% at 50% 40%, #3a322a, #14110e)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "calc(env(safe-area-inset-top) + 10px) 12px 8px",
            }}
          >
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              {state.open.y}年{state.open.m}月{day ? ` · ${day.d}日` : ""}
            </span>
            <div
              role="radiogroup"
              aria-label="ページの見せ方"
              style={{
                display: "flex",
                gap: 2,
                padding: 3,
                borderRadius: 999,
                background: "rgb(255 255 255 / .16)",
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={false}
                onClick={() => setView("spread")}
                style={seg(false)}
              >
                見開き
              </button>
              <button type="button" role="radio" aria-checked style={seg(true)}>
                片ページ
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="見開きに戻る"
            onClick={() => setView("spread")}
            style={{
              flex: 1,
              minHeight: 0,
              border: 0,
              background: "transparent",
              padding: "8px 16px",
              display: "grid",
              placeItems: "center",
            }}
          >
            {pageUrl && (
              <img
                key={pageUrl.length + view}
                src={pageUrl}
                alt=""
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  borderRadius: view === "left" ? "10px 3px 3px 10px" : "3px 10px 10px 3px",
                  boxShadow: "0 30px 60px -20px rgb(0 0 0 / .7), 0 2px 6px rgb(0 0 0 / .35)",
                  animation: "single-page-in 280ms cubic-bezier(.2,.8,.2,1) both",
                }}
              />
            )}
          </button>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 16px calc(env(safe-area-inset-bottom) + 18px)",
            }}
          >
            <button type="button" onClick={() => stepSingle(-1)} style={btn}>
              ‹ 前のページ
            </button>
            <span style={{ color: "rgb(255 255 255 / .7)", fontSize: 13 }}>
              {view === "left" ? "左のページ" : "右のページ"}
            </span>
            <button type="button" onClick={() => stepSingle(1)} style={btn}>
              次のページ ›
            </button>
          </div>
          <style>{`@keyframes single-page-in{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4.2",
          borderRadius: 24,
          overflow: "hidden",
          background: "#2a241e",
          touchAction: "none",
        }}
      >
        <canvas
          ref={ref}
          data-shelf-3d
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
        {!ready && !err && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "rgb(255 255 255 / .7)",
              fontSize: 13,
            }}
          >
            本棚を組み立てています…
          </div>
        )}
        {err && (
          <div style={{ position: "absolute", inset: 16, color: "#fff", fontSize: 13 }}>
            3D を表示できませんでした: {err}
          </div>
        )}
        {state.open && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button type="button" style={btn} onClick={() => world.current?.close()}>
              棚に戻す
            </button>
            <span style={{ ...btn, display: "inline-flex", alignItems: "center" }}>
              {state.open.y}年{state.open.m}月{day ? ` · ${day.d}日` : ""}
            </span>
          </div>
        )}
        {/* 見開きでめくる釦（押すとページは片ページで大きく開くので、めくりは払うかここで） */}
        {state.open && view === "spread" && (
          <>
            <button
              type="button"
              aria-label="前のページ"
              onClick={() => world.current?.flip(-1)}
              style={{ ...arrow, left: 6 }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="次のページ"
              onClick={() => world.current?.flip(1)}
              style={{ ...arrow, right: 6 }}
            >
              ›
            </button>
          </>
        )}
        {state.open && day && (
          <div
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* 日記の字体（押すと右のページがその字体で書き直される） */}
            <div role="radiogroup" aria-label="日記の字体" style={{ display: "flex", gap: 5 }}>
              {DIARY_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={font === f.id}
                  onClick={() => void chooseFont(f.id)}
                  style={{
                    ...btn,
                    flex: "1 1 0",
                    minWidth: 0,
                    padding: "0 4px",
                    whiteSpace: "nowrap",
                    fontFamily: f.family,
                    fontWeight: 400,
                    fontSize: 14,
                    background: font === f.id ? "rgb(255 255 255 / .92)" : btn.background,
                    color: font === f.id ? "#1d1a16" : "#fff",
                  }}
                >
                  {t(f.key)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setWriting(day.diary)}
              style={{ ...btn, background: "rgb(47 111 214 / .92)", border: "none" }}
            >
              {day.diary.trim() ? "日記を書き直す" : "日記を書く"}
            </button>
          </div>
        )}
        {writing !== null && day && (
          <div
            role="dialog"
            aria-label="日記を書く"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgb(20 16 12 / .55)",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                width: "100%",
                background: "#f7f2e6",
                borderRadius: "20px 20px 0 0",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontFamily: diaryFont("hand").family, fontSize: 20, color: "#3a3128" }}>
                {day.m}月{day.d}日の日記
              </div>
              <textarea
                autoFocus
                value={writing}
                onChange={(e) => setWriting(e.target.value)}
                rows={7}
                style={{
                  width: "100%",
                  resize: "none",
                  border: "1px solid rgb(90 120 170 / .3)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background:
                    "repeating-linear-gradient(#f7f2e6 0 34px, rgb(90 120 170 / .22) 34px 35px)",
                  lineHeight: "35px",
                  fontFamily: diaryFont(font).family,
                  fontSize: 20,
                  color: "#23304a",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setWriting(null)}
                  style={{ ...btn, flex: 1, background: "rgb(58 49 40 / .8)" }}
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={() => void saveDiary()}
                  style={{ ...btn, flex: 2, background: "#2f6fd6", border: "none" }}
                >
                  ページに書く
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        本を押すと手元に寄って表紙が開きます。表紙は硬い板のまま回り、中の紙は指に付いて柔らかくめくれます（左へ払う・右の
        › ＝次）。ページを押すと、そのページだけを全画面で見られます（上の「見開き」で戻る）。 形は
        Blender で作り、three.js で光と影を付けています。
      </p>
    </div>
  );
}
