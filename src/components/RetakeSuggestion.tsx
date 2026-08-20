import { Camera } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { formatCount } from "@/lib/count";
import { retakeReason, retakeMessageKey, type RetakeInput } from "@/lib/retake";

/**
 * 「この語、もう一度撮ってみない?」
 *
 * オーナー: 「どうしても覚えられないものは、もう一度写真を撮ってみようと
 * 提案する。」
 *
 * ## 出す条件は自分で持たない
 * 判定は `src/lib/retake.ts` の1箇所だけ。ここで `reviewCount > 5` のような
 * 数字を書き始めると、復習側と図鑑側で「覚えられない」の意味が食い違う。
 * このアプリで同じ判断が2箇所に分かれて食い違った例は、写真の選び方だけで
 * 10箇所あった。
 *
 * ## 出ないときは何も描かない
 * 条件を満たさなければ `null`。空の枠や「順調です」を置かない —
 * 復習の画面で場所を取っていい理由が無い。
 */
export function RetakeSuggestion({
  headword,
  onRetake,
  ...input
}: RetakeInput & {
  headword: string;
  onRetake: () => void;
}) {
  const t = useT();
  const reason = retakeReason(input);
  if (!reason) return null;

  return (
    <section className="mt-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Camera className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {/* 見出しは「<語>、もう一度撮ってみる?」の1行。語だけ `Zh` で
              包むのは、繁体字の字形が和文の書体と違うから — 文ごと
              包むと日本語まで中文の書体になる。 */}
          <p className="text-footnote font-semibold">
            <Zh>{headword}</Zh>
            {t("retake.title")}
          </p>
          {/* 理由をそのまま書く。「おすすめです」だけだと、なぜ自分に
              これが出ているのか分からない。 */}
          <p className="ja-phrase mt-0.5 text-caption leading-relaxed text-muted-foreground">
            {t(retakeMessageKey(reason), { n: formatCount(input.reviewCount) })}
          </p>
        </div>
      </div>
      <button
        onClick={onRetake}
        className="mt-2 min-h-11 w-full rounded-xl bg-secondary py-2 text-footnote font-semibold active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {t("retake.cta")}
      </button>
    </section>
  );
}
