import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 何も無いことを伝えて、次の一手を渡す面。
 *
 * ## なぜ切り出したか
 * 図鑑・ホーム・復習の3画面が**それぞれ別々に**同じ形を書いていた。
 * 書き写しは静かにずれる。実際、揃っていなかったのは:
 *
 *   寄せ方   図鑑・ホーム = 中央 / 復習 = 左
 *   角丸     3xl / 3xl / 2xl
 *   内側余白 p-8 / p-10 / p-8
 *   見出し   headline / headline / body
 *   説明     footnote / footnote / body
 *   絵       どれにも無い
 *
 * 復習だけ左寄せだったのは「中央揃えの和文は末尾の1〜2文字が孤立する」
 * ためで、コメントにもそう書いてあった。**その原因は
 * `text-balance` + `ja-phrase` で既に潰してある**ので、揃えられる。
 *
 * ## 何を必ず置くか
 * 純正の空の面は「なぜ空か」「次に何をすればよいか」「その場で始める道」の
 * 3つを必ず持つ。文言はこの3つとも呼ぶ側から渡す — 画面ごとに違うので、
 * ここが決めるのは**形だけ**。
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  /** 何が入る場所かを静かに示す絵。**斜線の入った記号は使わない**(壊れて見える)。 */
  icon: LucideIcon;
  title: string;
  hint: string;
  /** その場で始められる導線。無い面もある(上限に達したときなど)。 */
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
      <Icon aria-hidden className="mx-auto mb-3 h-9 w-9 text-muted-foreground/70" />
      <p className="text-headline font-semibold text-foreground">{title}</p>
      {/* 和文は行の長さを揃え(`text-balance`)、文節で切る(`ja-phrase`)。
          この2つが無いと、中央揃えの説明文は末尾が1〜2文字だけ孤立する。 */}
      <p className="ja-phrase mt-1 text-balance text-footnote text-muted-foreground">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
