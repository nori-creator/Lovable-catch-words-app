import { toProse } from "@/lib/prose";

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
export function Prose({ text, className = "" }: { text: string; className?: string }) {
  const paragraphs = toProse(text);
  if (paragraphs.length === 0) return null;
  return (
    <div className={`space-y-2 text-body leading-relaxed ${className}`}>
      {paragraphs.map((spans, i) => (
        <p key={i}>
          {spans.map((s, j) => {
            if (s.kind === "term") {
              return (
                <span
                  key={j}
                  lang="zh-Hant"
                  className="rounded bg-primary/10 px-1 font-semibold text-primary-ink"
                >
                  {s.text}
                </span>
              );
            }
            if (s.kind === "reading") {
              return (
                <span key={j} className="ml-0.5 font-mono text-footnote text-muted-foreground">
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
