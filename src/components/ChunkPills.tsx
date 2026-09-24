import type { CSSProperties } from "react";
import { chunkStyle, chunkLegendFor } from "@/lib/pos";
import { Term } from "@/components/Term";
import { PronounceButton } from "@/components/PronounceButton";
import type { ChunkPart } from "@/lib/extras";
import { CHUNK_DESIGN, type ChunkDesign } from "@/lib/chunk-design";

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
  appearance = "pill",
  lang,
  onSpeak,
  design = CHUNK_DESIGN,
}: {
  /**
   * 札の見た目の案（`lib/chunk-design.ts`）。`appearance="pill"` のときだけ効く。
   * 既定は本番の案 — 単語の詳細と復習の解説が同じ値を読むので必ず揃う。
   */
  design?: ChunkDesign;
  parts: ChunkPart[];
  size?: "sm" | "md" | "lg";
  /** 単語詳細では札を外し、品詞色を文字そのものに使う。 */
  appearance?: "pill" | "text";
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
    appearance === "text"
      ? "px-0.5 py-0 text-body"
      : size === "sm"
        ? "px-2 py-1 text-footnote"
        : size === "lg"
          ? "px-3 py-2 text-headline leading-snug tracking-wide"
          : "px-2.5 py-1.5 text-body";
  return (
    // 影が落ちるぶん、札どうしの間合いを少し広げる。詰めると影が隣に重なって
    // 濁り、浮いているのではなく汚れているように見える。
    <div
      className={`flex flex-wrap ${
        appearance === "text" ? "gap-x-1.5 gap-y-1" : `chunk-set chunk-set--${design} gap-2`
      }`}
    >
      {parts.map((c, i) => {
        const st = chunkStyle(c.pos);
        // チャンク本体は**学習言語の語**。品詞ラベル(名詞など)は解説語なので、
        // こちらだけ言語を宣言して字形を固定する。
        // **`lang="zh-Hant"` の決め打ちにしない** — 英語の型に中国語の
        // フォントが当たる(`Term` の注)。
        // 記号(S/V/O…)は**帯から外した**。語のすぐ右に同じベースラインで
        // 置いていたので「我 s」が誤字に見えた。色と凡例で足りる。
        const body = <Term lang={lang}>{c.text}</Term>;
        const skin =
          appearance === "text"
            ? `chunk-word font-semibold ${pad} ${st.dot.replace("pos-dot ", "")}`
            : `chunk-bubble rounded-full font-semibold ${pad} ${st.pill}`;
        // 浮遊の案で、札ごとに揺れの位相をずらす（全部が同時に上下すると板に見える）。
        const style = { "--i": i } as CSSProperties;
        if (!onSpeak) {
          return (
            <span key={i} className={skin} title={st.label} style={style}>
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
            /**
             * **押せる札は指の大きさにする**(44px)。
             *
             * 見えない枠(`::before`)で広げる手もあるが、札は `gap-2`(8px)で
             * 隣り合うので、左右に 8px ずつ出すと**隣の枠と重なる**。
             * 重なった所は後から描いた札が取るので、左の札は自分の右端を
             * 押しても反応しない — 検査の「タップ領域 31x31 < 44」は
             * それを見ている。
             *
             * 押せる物になった以上、実際に押せる大きさで在るのが正しい。
             * 一文字の札も 44px 幅で揃うので、型の並びがきれいに揃う。
             * **押せない札(`onSpeak` なし)は小さいまま** — 復習の添削の
             * ように、触れない物を指の大きさにする理由は無い。
             */
            className={`${appearance === "text" ? "chunk-word-button" : "chunk-pill"} press-in inline-flex min-h-11 items-center justify-center ${skin} active:scale-95 motion-reduce:active:scale-100`}
            title={st.label}
            style={style}
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

/**
 * **チャンクの1行**（単語の詳細と復習の解説で同じ部品 — オーナー指示
 * 2026-09-24「単語の詳細のチャンクと復習の解説の欄のチャンクは同じデザインに
 * 統一して」）。
 *
 * 左に型ぜんぶを鳴らすボタン、札（品詞ごとの丸）、その**下に訳を小さく薄く**
 * （同じ指示「チャンクの訳も例文のように下に薄く小さく書いて」）。前は訳を
 * 右の列に置いていたので、札の取り分が痩せ、訳も2行に折れていた。
 */
export function ChunkLine({
  parts,
  translation,
  lang,
  speakText,
  onSpeak,
  design,
}: {
  parts: ChunkPart[];
  translation?: string | null;
  lang?: string | null;
  /** 型ぜんぶをひと息で鳴らす文。無ければボタンを出さない。 */
  speakText?: string;
  /** 札を1つずつ鳴らす。 */
  onSpeak?: (text: string) => void;
  design?: ChunkDesign;
}) {
  if (!parts.length) return null;
  return (
    <div className="chunk-line">
      {speakText ? (
        <PronounceButton
          text={speakText}
          language={lang ?? undefined}
          size="sm"
          tone="quiet"
          stopPropagation
        />
      ) : null}
      <div className="chunk-line__body">
        <ChunkPills parts={parts} size="md" lang={lang} onSpeak={onSpeak} design={design} />
        {translation ? <p className="chunk-line__translation">{translation}</p> : null}
      </div>
    </div>
  );
}
