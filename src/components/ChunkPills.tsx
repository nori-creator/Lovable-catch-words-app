import { chunkStyle, CHUNK_LEGEND } from "@/lib/pos";
import type { ChunkPart } from "@/lib/extras";

/**
 * 文のパーツ(チャンク)を品詞色分けのピルで並べる共通コンポーネント。
 * 復習の添削(型)と単語詳細(例文・使い方チャンク)で同じ見た目にして、
 * 「スピーキングの時にこの塊のまま口から出す」感覚を育てる。
 */
export function ChunkPills({
  parts,
  size = "md",
}: {
  parts: ChunkPart[];
  size?: "sm" | "md";
}) {
  if (!parts.length) return null;
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[13px]" : "px-2 py-1 text-sm";
  return (
    <div className="flex flex-wrap gap-1.5">
      {parts.map((c, i) => {
        const st = chunkStyle(c.pos);
        return (
          <span
            key={i}
            className={`rounded-lg font-medium ${pad} ${st.bg} ${st.text}`}
            title={st.label}
          >
            {c.text}
            {c.pos && <span className="ml-1 text-[9px] opacity-60">{c.pos}</span>}
          </span>
        );
      })}
    </div>
  );
}

export function ChunkLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
      {CHUNK_LEGEND.map(({ key, style }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${style.bg}`} />
          {key}={style.label}
        </span>
      ))}
    </div>
  );
}
