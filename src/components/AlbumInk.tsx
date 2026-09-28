import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useT } from "@/lib/i18n";
import { Circle, Pen, RectangleHorizontal, Tag, Trash2, Undo2, MoveUpRight } from "lucide-react";

/**
 * **アルバムに書き込む**（オーナー指示 2026-09-27「アルバムに書き込める機能
 * （ラベル・線・形・色）、CapLog のように」）— 試作。
 *
 * ページの上に透明な紙を1枚重ね、そこに描く:
 *   ・ペン … 指でなぞった線
 *   ・ラベル … 押した所に文字の札
 *   ・丸 / 四角 / 矢印 … 押して引いた範囲に形
 * 色は6色。「1つ戻す」と「全部消す」がある。
 *
 * 位置は**ページに対する割合（0〜1）**で持つ。画面の幅が変わっても、
 * 書いた物が写真からずれない。保存（`onChange`）は呼ぶ側の仕事 —
 * 試作では保存しない。
 */
export type InkTool = "pen" | "label" | "circle" | "rect" | "arrow";
export type InkItem =
  | { kind: "pen"; color: string; points: Array<[number, number]> }
  | { kind: "label"; color: string; x: number; y: number; text: string }
  | {
      kind: "circle" | "rect" | "arrow";
      color: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

export const INK_COLORS = ["#0a84ff", "#ff375f", "#ff9f0a", "#30d158", "#1c1c1e", "#ffffff"];

const TOOLS: Array<{ id: InkTool; Icon: typeof Pen }> = [
  { id: "pen", Icon: Pen },
  { id: "label", Icon: Tag },
  { id: "circle", Icon: Circle },
  { id: "rect", Icon: RectangleHorizontal },
  { id: "arrow", Icon: MoveUpRight },
];

export function AlbumInk({
  items,
  onChange,
}: {
  items: InkItem[];
  onChange: (next: InkItem[]) => void;
}) {
  const t = useT();
  const [tool, setTool] = useState<InkTool>("pen");
  const [color, setColor] = useState(INK_COLORS[0]);
  const [draft, setDraft] = useState<InkItem | null>(null);
  const board = useRef<HTMLDivElement>(null);

  const at = (e: ReactPointerEvent) => {
    const r = board.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ] as [number, number];
  };

  const down = (e: ReactPointerEvent) => {
    const [x, y] = at(e);
    if (tool === "label") {
      const text = window.prompt(t("ink.labelPrompt"))?.trim();
      if (text) onChange([...items, { kind: "label", color, x, y, text }]);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft(
      tool === "pen"
        ? { kind: "pen", color, points: [[x, y]] }
        : { kind: tool, color, x1: x, y1: y, x2: x, y2: y },
    );
  };
  const move = (e: ReactPointerEvent) => {
    if (!draft) return;
    const [x, y] = at(e);
    setDraft(
      draft.kind === "pen"
        ? { ...draft, points: [...draft.points, [x, y]] }
        : draft.kind === "label"
          ? draft
          : { ...draft, x2: x, y2: y },
    );
  };
  const up = () => {
    if (!draft) return;
    const tiny =
      draft.kind === "pen"
        ? draft.points.length < 2
        : draft.kind !== "label" && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 0.02;
    if (!tiny) onChange([...items, draft]);
    setDraft(null);
  };

  return (
    <div className="album-ink">
      <div
        ref={board}
        className="album-ink__board"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            {INK_COLORS.map((c) => (
              <marker
                key={c}
                id={`ink-arrow-${c.slice(1)}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {[...items, ...(draft ? [draft] : [])].map((it, i) => (
            <InkShape key={i} it={it} />
          ))}
        </svg>
        {items.map((it, i) =>
          it.kind === "label" ? (
            <span
              key={`l${i}`}
              className="album-ink__label"
              style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, background: it.color }}
            >
              {it.text}
            </span>
          ) : null,
        )}
      </div>

      <div className="album-ink__bar" role="toolbar">
        {TOOLS.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id}
            aria-label={t(`ink.${id}`)}
            onClick={() => setTool(id)}
            className="album-ink__btn"
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
        <span className="album-ink__sep" />
        {INK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className="album-ink__swatch"
            style={{ background: c }}
          />
        ))}
        <span className="album-ink__sep" />
        <button
          type="button"
          aria-label={t("ink.undo")}
          disabled={items.length === 0}
          onClick={() => onChange(items.slice(0, -1))}
          className="album-ink__btn"
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={t("ink.clear")}
          disabled={items.length === 0}
          onClick={() => onChange([])}
          className="album-ink__btn"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function InkShape({ it }: { it: InkItem }) {
  const s = {
    stroke: it.color,
    strokeWidth: 0.9,
    fill: "none",
    vectorEffect: "non-scaling-stroke",
  } as const;
  const w = {
    ...s,
    strokeWidth: 3.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (it.kind === "pen") {
    return (
      <polyline points={it.points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")} {...w} />
    );
  }
  if (it.kind === "label") return null;
  const x = Math.min(it.x1, it.x2) * 100;
  const y = Math.min(it.y1, it.y2) * 100;
  const wd = Math.abs(it.x2 - it.x1) * 100;
  const ht = Math.abs(it.y2 - it.y1) * 100;
  if (it.kind === "circle") {
    return <ellipse cx={x + wd / 2} cy={y + ht / 2} rx={wd / 2} ry={ht / 2} {...w} />;
  }
  if (it.kind === "rect") return <rect x={x} y={y} width={wd} height={ht} rx={2} {...w} />;
  return (
    <line
      x1={it.x1 * 100}
      y1={it.y1 * 100}
      x2={it.x2 * 100}
      y2={it.y2 * 100}
      {...w}
      markerEnd={`url(#ink-arrow-${it.color.slice(1)})`}
    />
  );
}
