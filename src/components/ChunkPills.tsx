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
  size?: "sm" | "md" | "lg";
}) {
  if (!parts.length) return null;
  // lg: 復習のヒント用。中国語そのものを一番大きく見せる(周りの説明文より上)。
  const pad =
    size === "sm"
      ? "px-1.5 py-0.5 text-[13px]"
      : size === "lg"
        ? "px-2.5 py-1.5 text-lg leading-snug tracking-wide"
        : "px-2 py-1 text-sm";
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
            {/* チャンク本体は台湾華語。品詞ラベル(名詞など)は解説語なので
                こちらだけ言語を宣言し、字形を繁体字に固定する。 */}
            <span lang="zh-Hant">{c.text}</span>
            {/* 品詞の記号。**薄くしない。** `opacity-60` を掛けていたので、
                9px のこの記号が 3.1〜3.8:1 まで落ちていた(琥珀の帯で 3.12:1)。
                小ささで十分に控えめなので、その上に薄さを重ねる必要は無い。 */}
            {c.pos && (
              <span className={`ml-1 ${size === "lg" ? "text-[10px]" : "text-[9px]"}`}>
                {c.pos}
              </span>
            )}
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
