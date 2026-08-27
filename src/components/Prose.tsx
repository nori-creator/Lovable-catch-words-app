import { toProse } from "@/lib/prose";
import { Term } from "@/components/Term";

/**
 * 解説の地の文。**段落に分けて、目印を付けて出す。**
 *
 * これまでは `<p>` 1つに全文を流していたので、4文つながった和文が
 * 白地に黒で並ぶだけだった(オーナー指摘)。やることは2つ:
 *   ① 文の切れ目で段落を分ける — 目が行を追い直せる
 *   ② 学ぶ言語の語と読みに印を付ける — 探している物が先に目に入る
 *
 * **色で意味を作らない。** 印は太さと地色でも分かる形にする
 * (色だけに頼ると、色が見えない人に何も伝わらない)。
 */
export function Prose({
  text,
  className = "",
  panel = false,
  lang,
}: {
  text: string;
  className?: string;
  /**
   * 地の文だけの節では、**沈めた面に載せる**（オーナー指摘 2026-08-27 ⑥）。
   *
   * 数値や札と混ざる節（頻度・場面）では外す — 面が入れ子になると、
   * どこからどこまでが1つの説明なのかがかえって読めなくなる。
   */
  panel?: boolean;
  /** その語の学習言語。印を付けた語の字形をここから決める。 */
  lang?: string | null;
}) {
  const paragraphs = toProse(text);
  if (paragraphs.length === 0) return null;
  return (
    // 読みやすさの中身は `.prose-body` / `.prose-panel`（`styles.css` に
    // 何がなぜ効くかを書いてある）。行間・行長・行末の始末・地色の4つ。
    <div className={`prose-body text-body ${panel ? "prose-panel" : ""} ${className}`}>
      {paragraphs.map((spans, i) => (
        // **最終行に1〜2文字だけ残さない。** 段落に割ったことで
        // 「日本語の『ちん』より息を強く前に出してくださ / い。」のように
        // 1行目いっぱい・2行目に「い。」だけ、という組みが出ていた
        // (独立監査の指摘。自分が入れた段落分けが作った崩れ)。
        //
        // 行の長さを揃えると最終行が伸びる。実測: 最終行 30px → 168px。
        // `auto-phrase` は切る**位置**を、`balance` は行の**長さ**を決める —
        // 役目が違うので両方いる。
        <p key={i} className="ja-phrase">
          {spans.map((s, j) => {
            if (s.kind === "term") {
              return (
                // **語の途中で折り返させない。** 和文は文字単位で折り返すので、
                // 印を付けた語も「少 / 冰」と割れる。塗りが2行にちぎれると、
                // どこからどこまでが1語なのかが読めなくなる — 印を付けた
                // 意味そのものが消える(実物の台湾メモで起きていた)。
                // 語ごと次の行へ送る。
                // **字形は学習言語から決める。** `lang="zh-Hant"` の
                // 決め打ちだったので、英語の解説の中で印を付けた語に
                // 中国語のフォントが当たっていた（`Term` の注）。
                <Term
                  key={j}
                  lang={lang}
                  className="prose-term inline-block whitespace-nowrap rounded px-1 font-semibold text-primary-ink"
                >
                  {s.text}
                </Term>
              );
            }
            if (s.kind === "reading") {
              // 読みの**両側**に間を入れる。右を空けていなかったので
              // 「珍 zhēn は」が「zhēnは」と続いて見えていた
              // (和文と欧文の間の四分アキ)。
              return (
                <span key={j} className="mx-0.5 font-mono text-footnote text-muted-foreground">
                  {s.text}
                </span>
              );
            }
            return <span key={j}>{s.text}</span>;
          })}
        </p>
      ))}
    </div>
  );
}
