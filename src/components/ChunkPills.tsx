import { chunkStyle, chunkLegendFor } from "@/lib/pos";
import { Term } from "@/components/Term";
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
  lang,
  onSpeak,
}: {
  parts: ChunkPart[];
  size?: "sm" | "md" | "lg";
  /** その型の学習言語。**渡さないと台湾華語として組む**(既定)。 */
  lang?: string | null;
  /**
   * 札そのものを押したときに鳴らす(オーナー指示 2026-08-27 ⑧
   * 「それぞれのバブルをタップしたら独立して発音されるようにする」)。
   *
   * 渡さなければ**押せない札のまま**。復習の添削のように、押しても
   * 意味の無い場所で押せる見た目にしない。
   */
  onSpeak?: (text: string) => void;
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
        // チャンク本体は**学習言語の語**。品詞ラベル(名詞など)は解説語なので、
        // こちらだけ言語を宣言して字形を固定する。
        // **`lang="zh-Hant"` の決め打ちにしない** — 英語の型に中国語の
        // フォントが当たる(`Term` の注)。
        // 記号(S/V/O…)は**帯から外した**。語のすぐ右に同じベースラインで
        // 置いていたので「我 s」が誤字に見えた。色と凡例で足りる。
        const body = <Term lang={lang}>{c.text}</Term>;
        const skin = `rounded-xl font-medium ${pad} ${st.pill}`;
        if (!onSpeak) {
          return (
            <span key={i} className={skin} title={st.label}>
              {body}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              // 札は押せる物の中に入っていることがある(図鑑の一覧)。
              // ここで止めないと、鳴らすつもりが画面ごと切り替わる。
              e.stopPropagation();
              onSpeak(c.text);
            }}
            className={`chunk-pill press-in ${skin} active:scale-95 motion-reduce:active:scale-100`}
            title={st.label}
          >
            {body}
          </button>
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
