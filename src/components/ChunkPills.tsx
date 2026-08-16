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
      ? "px-1.5 py-0.5 text-footnote"
      : size === "lg"
        ? "px-2.5 py-1.5 text-headline leading-snug tracking-wide"
        : "px-2 py-1 text-body";
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
            {/* 記号(S/V/O…)は**帯から外した**。語のすぐ右に同じベースラインで
                置いていたので「我 s」が誤字に見えたうえ、凡例の表記(Ptc)と
                帯の表記(P)が食い違っていた(独立監査)。
                色は動詞と目的語だけに絞ったので、凡例の2項目で足りる。 */}
          </span>
        );
      })}
    </div>
  );
}

export function ChunkLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-caption text-muted-foreground">
      {CHUNK_LEGEND.map(({ key, style }) => (
        // 記号(V=)は出さない。帯からも外したので、凡例に記号だけ残ると
        // どこにも対応しない文字になる。色と語だけで足りる。
        <span key={key} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      ))}
    </div>
  );
}
