import { chunkStyle, chunkLegendFor } from "@/lib/pos";
import type { ChunkPart } from "@/lib/extras";

/**
 * 文のパーツ(チャンク)を品詞色分けの札で並べる共通コンポーネント。
 * 復習の添削(型)と単語詳細(例文・使い方チャンク)で同じ見た目にして、
 * 「スピーキングの時にこの塊のまま口から出す」感覚を育てる。
 *
 * 札は**浮いている(NORI指定)** — 薄い地・同色の縁・下に落ちる影。
 * 押すと沈んで跳ね返る(`.chunk-pill`)。触れる物だと分かる手応えを返す。
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
      ? "px-2 py-1 text-footnote"
      : size === "lg"
        ? "px-3 py-2 text-headline leading-snug tracking-wide"
        : "px-2.5 py-1.5 text-body";
  return (
    // 影が落ちるぶん、札どうしの間合いを少し広げる。詰めると影が隣に重なって
    // 濁り、浮いているのではなく汚れているように見える。
    <div className="flex flex-wrap gap-2">
      {parts.map((c, i) => {
        const st = chunkStyle(c.pos);
        return (
          <span key={i} className={`rounded-xl font-medium ${pad} ${st.pill}`} title={st.label}>
            {/* チャンク本体は台湾華語。品詞ラベル(名詞など)は解説語なので
                こちらだけ言語を宣言し、字形を繁体字に固定する。 */}
            <span lang="zh-Hant">{c.text}</span>
            {/* 記号(S/V/O…)は**帯から外した**。語のすぐ右に同じベースラインで
                置いていたので「我 s」が誤字に見えた。色と凡例で足りる。 */}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 凡例。**その文に出てきた品詞だけ**を、詞類表の並びで出す。
 *
 * `parts` を渡さない呼び出しは何も描かない。以前は固定の2項目
 * (動詞・目的語)を無条件に並べていたので、その2つが1つも出てこない文の
 * 下にも凡例だけが残っていた。
 */
export function ChunkLegend({ parts }: { parts?: ChunkPart[] }) {
  const items = chunkLegendFor((parts ?? []).map((p) => p.pos));
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
      {items.map(({ key, style }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      ))}
    </div>
  );
}
