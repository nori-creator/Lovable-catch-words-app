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
 */
import { useEffect, useRef, useState } from "react";
import { ShelfWorld, type MonthBook } from "./shelf3d/engine";

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w: ShelfWorld;
    try {
      w = new ShelfWorld(el, MONTHS, { onState: setState });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    world.current = w;
    w.load(PHOTOS)
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

  return (
    <div className="space-y-2 pb-28">
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
              {state.open.y}年{state.open.m}月 · {state.page * 2 + 1}/{state.pages * 2 + 1}
            </span>
          </div>
        )}
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        本を押すと手元に寄って表紙が開きます。表紙は硬い板のまま回り、中の紙は指に付いて柔らかくめくれます（右半分を押す・左へ払う＝次）。
        形は Blender で作り、three.js で光と影を付けています。
      </p>
    </div>
  );
}
