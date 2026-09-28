import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Check,
  Eraser,
  Expand,
  Highlighter,
  PenLine,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  FONTS,
  INK_MAX_WIDTH,
  INK_MIN_WIDTH,
  eraseAt,
  isLight,
  smoothPath,
  strokeStyle,
  type FontId,
  type InkTool,
} from "@/lib/story-ink-draw";

/**
 * **アルバムに書き込む — ストーリー風**（オーナー指示 2026-09-27、Instagram の
 * ストーリーのお絵かきを参考に）。
 *
 * > 「書きながら写真の大きさ・傾きも同時に変更でき、ノートも広げられる」
 * > 「直接指で書くと字が汚くなるので、書く欄を大きく表示し、書いたものを
 * >  好きな所にドロップ・大きさ調整」
 * > 「書いたものやラベルをドラッグで動かせる」
 *
 * - 紙の上の物（写真・手書き・文字）は**全部同じ扱い**。1本指で動かす、
 *   2本指でつまんで大きさと傾きを変える。触った物が一番上に来る。
 *   モードの切り替えは無い — 書いた直後にそのまま写真を回せる。
 * - 「手書き」: 画面いっぱいの**大きな書く欄**が開く。大きく書いて「完了」で、
 *   紙の真ん中に小さく貼られる（後から好きな所・大きさへ）。
 * - 「Aa」: 文字。字体（モダン / クラシック / サイン / タイプ）・色・地の有無。
 * - 動かしている間、下に**ごみ箱**が出る。そこまで運んで離すと消える。
 * - 「ページを広げる」: 紙の縦を伸ばす（ノートを継ぎ足す）。
 *
 * 位置と大きさは**紙の幅に対する割合**で持つ。画面の幅が変わっても崩れない。
 */
export type StoryItem =
  | (Base & { kind: "photo"; src: string; caption?: string })
  | (Base & { kind: "sketch"; strokes: Stroke[]; box: [number, number, number, number] })
  | (Base & { kind: "text"; text: string; font: FontId; color: string; bg: BgMode });

type Base = {
  id: string;
  /** 中心（紙の幅に対する割合。縦も幅に対する割合）。 */
  x: number;
  y: number;
  /** 幅（紙の幅に対する割合）。 */
  w: number;
  /** 傾き（度）。 */
  rot: number;
  z: number;
};
/** 足す物（id と重なり順はこちらで振る）。和の型ごとに外す。 */
type NewItem = StoryItem extends infer T
  ? T extends StoryItem
    ? Omit<T, "id" | "z">
    : never
  : never;
type Stroke = { color: string; width: number; pts: Array<[number, number]>; tool?: InkTool };
type BgMode = "none" | "solid" | "soft";

const COLORS = ["#1c1c1e", "#ffffff", "#ff375f", "#ff9f0a", "#30d158", "#0a84ff", "#bf5af2"];

let uid = 0;
const newId = () => `ink-${Date.now().toString(36)}-${++uid}`;

export function StoryInk({
  initial,
  onChange,
  aspect,
  paperClass = "album-bg-paper",
  background,
}: {
  initial: StoryItem[];
  onChange?: (items: StoryItem[]) => void;
  /**
   * 紙の縦（幅に対する割合）を固定する。**本の表紙**に書くときに使う
   * （表紙は伸ばせないので「ページを広げる」を出さない）。
   */
  aspect?: number;
  /** 紙の地の class（表紙なら布や革の地に替える）。 */
  paperClass?: string;
  /** 書いた物の下に敷く絵（表紙の題字など）。指は通さない。 */
  background?: ReactNode;
}) {
  const t = useT();
  const board = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<StoryItem[]>(initial);
  const [grown, setHeight] = useState(1.35); // 紙の縦（幅に対する割合）
  const height = aspect ?? grown;
  const [pad, setPad] = useState(false);
  const [textEdit, setTextEdit] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const history = useRef<StoryItem[][]>([]);

  useEffect(() => onChange?.(items), [items, onChange]);
  // 縦の位置も「幅に対する割合」なので、紙の幅を CSS に渡す。
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const set = () => el.style.setProperty("--board-w", `${el.clientWidth}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commit = (next: StoryItem[]) => {
    history.current.push(items);
    if (history.current.length > 30) history.current.shift();
    setItems(next);
  };
  const topZ = () => items.reduce((m, it) => Math.max(m, it.z), 0) + 1;
  const add = (it: NewItem) => commit([...items, { ...(it as StoryItem), id: newId(), z: topZ() }]);

  // ---- 指: 1本で動かす、2本でつまんで大きさと傾き -----------------------------
  const g = useRef({
    id: null as string | null,
    pts: new Map<number, { x: number; y: number }>(),
    start: null as null | {
      item: StoryItem;
      a: { x: number; y: number };
      b?: { x: number; y: number };
    },
    moved: false,
  });

  const rect = () => board.current!.getBoundingClientRect();
  const snapshotStart = (it: StoryItem) => {
    const p = [...g.current.pts.values()];
    g.current.start = { item: { ...it }, a: p[0], b: p[1] };
  };

  const onItemDown = (e: ReactPointerEvent, it: StoryItem) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const s = g.current;
    if (s.id && s.id !== it.id) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!s.id) {
      s.id = it.id;
      s.moved = false;
      // 触った物を一番上へ。
      setItems((all) => all.map((x) => (x.id === it.id ? { ...x, z: topZ() } : x)));
      history.current.push(items);
    }
    const cur = items.find((x) => x.id === it.id) ?? it;
    snapshotStart(cur);
  };

  // 2本目の指は**紙のどこでも**よい（ストーリーと同じ）。
  const onBoardDown = (e: ReactPointerEvent) => {
    const s = g.current;
    if (!s.id) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = items.find((x) => x.id === s.id);
    if (cur) snapshotStart(cur);
  };

  const onMove = (e: ReactPointerEvent) => {
    const s = g.current;
    if (!s.id || !s.pts.has(e.pointerId) || !s.start) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = rect();
    const p = [...s.pts.values()];
    const st = s.start;
    let next: StoryItem;
    if (p.length >= 2 && st.b) {
      const d0 = Math.hypot(st.b.x - st.a.x, st.b.y - st.a.y) || 1;
      const d1 = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const a0 = Math.atan2(st.b.y - st.a.y, st.b.x - st.a.x);
      const a1 = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
      const m0 = { x: (st.a.x + st.b.x) / 2, y: (st.a.y + st.b.y) / 2 };
      const m1 = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      next = {
        ...st.item,
        w: Math.max(0.08, Math.min(1.4, st.item.w * (d1 / d0))),
        rot: st.item.rot + ((a1 - a0) * 180) / Math.PI,
        x: st.item.x + (m1.x - m0.x) / r.width,
        y: st.item.y + (m1.y - m0.y) / r.width,
      };
    } else {
      next = {
        ...st.item,
        x: st.item.x + (p[0].x - st.a.x) / r.width,
        y: st.item.y + (p[0].y - st.a.y) / r.width,
      };
    }
    if (Math.hypot(p[0].x - st.a.x, p[0].y - st.a.y) > 4) {
      s.moved = true;
      if (dragging !== s.id) setDragging(s.id);
    }
    setOverTrash(isOverTrash(e.clientX, e.clientY));
    setItems((all) => all.map((x) => (x.id === s.id ? next : x)));
  };

  const onUp = (e: ReactPointerEvent) => {
    const s = g.current;
    if (!s.pts.has(e.pointerId)) return;
    s.pts.delete(e.pointerId);
    if (s.pts.size > 0) {
      // 1本残った: そこから1本の移動に戻す。
      const cur = items.find((x) => x.id === s.id);
      if (cur) snapshotStart(cur);
      return;
    }
    const id = s.id;
    s.id = null;
    s.start = null;
    setDragging(null);
    if (id && isOverTrash(e.clientX, e.clientY)) {
      setItems((all) => all.filter((x) => x.id !== id));
    }
    setOverTrash(false);
  };

  const trashRef = useRef<HTMLDivElement>(null);
  const isOverTrash = (cx: number, cy: number) => {
    const el = trashRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return cx > r.left - 16 && cx < r.right + 16 && cy > r.top - 16 && cy < r.bottom + 16;
  };

  return (
    <div className="story-ink">
      <div className="story-ink__bar" role="toolbar">
        <button type="button" onClick={() => setPad(true)} className="story-ink__tool">
          <PenLine className="h-5 w-5" />
          <span>{t("ink.write")}</span>
        </button>
        <button type="button" onClick={() => setTextEdit(true)} className="story-ink__tool">
          <Type className="h-5 w-5" />
          <span>Aa</span>
        </button>
        {aspect === undefined && (
          <button
            type="button"
            onClick={() => setHeight((h) => Math.min(4, h + 0.5))}
            className="story-ink__tool"
          >
            <Expand className="h-5 w-5" />
            <span>{t("ink.expand")}</span>
          </button>
        )}
        <button
          type="button"
          aria-label={t("ink.undo")}
          disabled={history.current.length === 0}
          onClick={() => {
            const prev = history.current.pop();
            if (prev) setItems(prev);
          }}
          className="story-ink__tool"
        >
          <Undo2 className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={board}
        className={`story-ink__board ${paperClass}`}
        style={{ aspectRatio: `1 / ${height}` }}
        onPointerDown={onBoardDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {background && <div className="story-ink__under">{background}</div>}
        {[...items]
          .sort((a, b) => a.z - b.z)
          .map((it) => (
            <div
              key={it.id}
              className={`story-ink__item ${dragging === it.id ? "is-dragging" : ""} ${
                dragging === it.id && overTrash ? "is-trash" : ""
              }`}
              style={{
                left: `${it.x * 100}%`,
                top: `calc(${it.y} * var(--board-w))`,
                width: `${it.w * 100}%`,
                transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
                zIndex: it.z,
              }}
              onPointerDown={(e) => onItemDown(e, it)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <ItemBody it={it} />
            </div>
          ))}
        {dragging && (
          <div
            ref={trashRef}
            className={`story-ink__trash ${overTrash ? "is-over" : ""}`}
            aria-label={t("ink.trash")}
          >
            <Trash2 className="h-6 w-6" />
          </div>
        )}
      </div>

      {pad && (
        <SketchPad
          onCancel={() => setPad(false)}
          onDone={(strokes, box) => {
            setPad(false);
            if (strokes.length === 0) return;
            add({ kind: "sketch", strokes, box, x: 0.5, y: 0.4, w: 0.5, rot: 0 });
          }}
        />
      )}
      {textEdit && (
        <TextEditor
          onCancel={() => setTextEdit(false)}
          onDone={(v) => {
            setTextEdit(false);
            if (!v.text.trim()) return;
            add({ kind: "text", ...v, x: 0.5, y: 0.35, w: 0.6, rot: -3 });
          }}
        />
      )}
    </div>
  );
}

/**
 * **書いた物を見るだけの面。**（表紙・本棚の背など、触らない所に描く）
 * 位置は `StoryInk` と同じく紙の幅に対する割合なので、どの大きさに
 * 縮めても同じ絵になる（`cqw` = この箱の幅の 1%）。
 */
export function StoryInkView({ items }: { items: StoryItem[] }) {
  return (
    <div className="story-ink__view" aria-hidden="true">
      {[...items]
        .sort((a, b) => a.z - b.z)
        .map((it) => (
          <div
            key={it.id}
            className="story-ink__view-item"
            style={{
              left: `${it.x * 100}%`,
              top: `${it.y * 100}cqw`,
              width: `${it.w * 100}%`,
              transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
              zIndex: it.z,
            }}
          >
            <ItemBody it={it} />
          </div>
        ))}
    </div>
  );
}

function ItemBody({ it }: { it: StoryItem }) {
  if (it.kind === "photo") {
    return (
      <figure className="story-ink__photo">
        <img src={it.src} alt="" draggable={false} />
        {it.caption && <figcaption lang="zh-Hant">{it.caption}</figcaption>}
      </figure>
    );
  }
  if (it.kind === "sketch") {
    const [x, y, w, h] = it.box;
    return (
      <svg viewBox={`${x} ${y} ${w} ${h}`} className="block w-full" style={{ overflow: "visible" }}>
        {it.strokes.map((s, i) => (
          <InkPath key={i} s={s} />
        ))}
      </svg>
    );
  }
  const font = FONTS.find((f) => f.id === it.font) ?? FONTS[0];
  const onBg = it.bg !== "none";
  const light = isLight(it.color);
  return (
    <div
      className="story-ink__text"
      style={{
        font: font.css,
        color: onBg && it.bg === "solid" ? (light ? "#111" : "#fff") : it.color,
        background:
          it.bg === "solid" ? it.color : it.bg === "soft" ? "rgb(255 255 255 / 0.72)" : "none",
        textShadow: onBg ? "none" : "0 1px 2px rgb(0 0 0 / 0.18)",
      }}
    >
      {it.text}
    </div>
  );
}

/** 1本の線を、道具ごとの見た目で描く（書く欄とアルバムの上で同じ見た目）。 */
function InkPath({ s }: { s: Stroke }) {
  const glowId = useId();
  const st = strokeStyle(s.tool, s.color, s.width);
  const d = smoothPath(s.pts.length === 1 ? [s.pts[0], s.pts[0]] : s.pts);
  const core = (
    <path
      d={d}
      fill="none"
      stroke={st.stroke}
      strokeWidth={st.strokeWidth}
      strokeOpacity={st.strokeOpacity}
      strokeLinecap={st.strokeLinecap}
      strokeLinejoin="round"
    />
  );
  if (!("glow" in st)) return core;
  // ネオン: 色の太い線をぼかして光にし、その上に白い芯（SVG のぼかし。CSS の filter は
  // SVG の線に効かないブラウザがある）。
  const id = `ink-glow-${glowId.replace(/:/g, "")}`;
  return (
    <g>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={s.width * 0.45} />
        </filter>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={st.glow}
        strokeWidth={s.width * 1.6}
        strokeOpacity={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${id})`}
      />
      <path
        d={d}
        fill="none"
        stroke={st.glow}
        strokeWidth={s.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {core}
    </g>
  );
}

/**
 * 大きな書く欄。書いた線は、書いた範囲（外枠）ごと渡す。
 *
 * Instagram のストーリーのお絵かきを参考に（オーナー指示 2026-09-28 R11「アルバムの落書き
 * 機能をIG等を参考に使いやすく」）:
 *  - 道具は **ペン / マーカー（半透明・重ねると濃い）/ ネオン（光る）/ 消しゴム**
 *  - 太さは左の**縦のスライダー**で自由に（3段の丸ではなく）。指で上下するだけ
 *  - 途中で指が画面の端などに取られても、書いた線を捨てない（pointercancel でも残す）
 */
function SketchPad({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (strokes: Stroke[], box: [number, number, number, number]) => void;
}) {
  const t = useT();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(14);
  const [tool, setTool] = useState<InkTool | "eraser">("pen");
  const cur = useRef<Stroke | null>(null);
  const [, force] = useState(0);
  const area = useRef<SVGSVGElement>(null);
  const pt = (e: ReactPointerEvent): [number, number] => {
    const r = area.current!.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * 1000),
      Math.round(((e.clientY - r.top) / r.width) * 1000),
    ];
  };
  const finish = () => {
    const s = cur.current;
    cur.current = null;
    if (s && s.pts.length > 0) setStrokes((all) => [...all, s]);
    force((n) => n + 1);
  };
  const done = () => {
    const all = strokes.flatMap((s) => s.pts);
    if (all.length === 0) return onDone([], [0, 0, 1, 1]);
    const pad =
      Math.max(...strokes.map((s) => strokeStyle(s.tool, s.color, s.width).strokeWidth)) + 12;
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad;
    onDone(strokes, [x0, y0, Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0]);
  };
  const TOOLS: Array<{ key: InkTool | "eraser"; icon: typeof PenLine; label: string }> = [
    { key: "pen", icon: PenLine, label: t("ink.pen") },
    { key: "marker", icon: Highlighter, label: t("ink.marker") },
    { key: "neon", icon: Sparkles, label: t("ink.neon") },
    { key: "eraser", icon: Eraser, label: t("ink.eraser") },
  ];
  return (
    <div className="story-ink__overlay" role="dialog" aria-modal>
      <div className="story-ink__overlay-bar">
        <button type="button" onClick={onCancel} className="story-ink__pill">
          {t("common.cancel")}
        </button>
        <button
          type="button"
          aria-label={t("ink.undo")}
          onClick={() => setStrokes((s) => s.slice(0, -1))}
          className="story-ink__pill"
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <button type="button" onClick={done} className="story-ink__pill is-primary">
          <Check className="h-5 w-5" />
          {t("ink.done")}
        </button>
      </div>
      <div className="story-ink__tools" role="radiogroup" aria-label={t("ink.tool")}>
        {TOOLS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={tool === key}
            aria-label={label}
            onClick={() => setTool(key)}
            className="story-ink__toolbtn"
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>
      <div className="story-ink__padrow">
        {/* 太さ: 縦のスライダー（上ほど太い）。いまの太さの丸を横に出す。 */}
        <label className="story-ink__size">
          <span className="sr-only">{t("ink.size")}</span>
          <input
            type="range"
            min={INK_MIN_WIDTH}
            max={INK_MAX_WIDTH}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            aria-label={t("ink.size")}
          />
          <span
            aria-hidden
            className="story-ink__size-dot"
            style={{
              width: Math.max(6, width * 0.6),
              height: Math.max(6, width * 0.6),
              background: tool === "eraser" ? "transparent" : color,
              border: tool === "eraser" ? "2px solid #fff" : undefined,
            }}
          />
        </label>
        <svg
          ref={area}
          viewBox="0 0 1000 750"
          className="story-ink__pad"
          onPointerDown={(e) => {
            if (cur.current) return; // 2本目の指（手のひら）は無視する
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            if (tool === "eraser") {
              setStrokes((all) => eraseAt(all, pt(e), width));
              return;
            }
            cur.current = { color, width, tool, pts: [pt(e)] };
            force((n) => n + 1);
          }}
          onPointerMove={(e) => {
            if (tool === "eraser") {
              if (e.buttons) setStrokes((all) => eraseAt(all, pt(e), width));
              return;
            }
            if (!cur.current) return;
            cur.current.pts.push(pt(e));
            force((n) => n + 1);
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        >
          {[...strokes, ...(cur.current ? [cur.current] : [])].map((s, i) => (
            <InkPath key={i} s={s} />
          ))}
        </svg>
      </div>
      <div className="story-ink__swatches">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={color === c}
            aria-label={c}
            onClick={() => {
              setColor(c);
              if (tool === "eraser") setTool("pen");
            }}
            className="story-ink__swatch"
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

/** 文字の入力（ストーリーの文字と同じ: 字体・色・地）。 */
function TextEditor({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (v: { text: string; font: FontId; color: string; bg: BgMode }) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [font, setFont] = useState<FontId>("modern");
  const [color, setColor] = useState(COLORS[1]);
  const [bg, setBg] = useState<BgMode>("solid");
  const f = FONTS.find((x) => x.id === font)!;
  const light = isLight(color);
  return (
    <div className="story-ink__overlay" role="dialog" aria-modal>
      <div className="story-ink__overlay-bar">
        <button type="button" onClick={onCancel} className="story-ink__pill">
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => setBg((b) => (b === "none" ? "solid" : b === "solid" ? "soft" : "none"))}
          className="story-ink__pill"
          aria-label={t("ink.bg")}
        >
          <span className="story-ink__bg-icon" data-bg={bg}>
            A
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDone({ text, font, color, bg })}
          className="story-ink__pill is-primary"
        >
          <Check className="h-5 w-5" />
          {t("ink.done")}
        </button>
      </div>
      <div className="story-ink__text-stage">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ink.textPlaceholder")}
          rows={2}
          className="story-ink__textarea"
          style={{
            font: f.css,
            fontSize: 30,
            color: bg === "solid" ? (light ? "#111" : "#fff") : color,
            background: bg === "solid" ? color : bg === "soft" ? "rgb(255 255 255 / 0.75)" : "none",
          }}
        />
      </div>
      <div className="story-ink__fonts">
        {FONTS.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={font === x.id}
            onClick={() => setFont(x.id)}
            className="story-ink__font"
            style={{ font: x.css, fontSize: 15 }}
          >
            {t(x.key)}
          </button>
        ))}
      </div>
      <div className="story-ink__swatches">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className="story-ink__swatch"
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
