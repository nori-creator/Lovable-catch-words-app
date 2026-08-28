import { ChevronUp } from "lucide-react";
import { useT } from "@/lib/i18n";
import { WordCardSectionsEditor } from "@/components/WordCard";

/**
 * 項目の並べ替え。**押した歯車の下に、その場で開く。**
 *
 * ## オーナー指示 2026-08-28 ⑤
 * > 「単語の順番を変える右上の設定。上のボタン押すと、項目が全画面で
 * >  表示させるけど、前のように右上端に収まるようにサイズを戻して。
 * >  またすべての項目が見えるようにして。今1番下の項目が表示されてない。」
 *
 * ## 2つの不具合が重なっていた
 * ① `left-0 right-0` で画面の端から端まで伸びていた。押したのは右上の
 *    小さな歯車なのに、開くのは画面の幅いっぱいの板 — どこから出てきた
 *    物なのか分からない。
 * ② 行は 44px で、節は最大18ある(英語のカード)。**畳の高さを決めて
 *    いなかった**ので、下の数項目は画面の外へ出ていた。出ている物は
 *    掴めないので、並べ替えも出来なかった。
 *
 * 幅を歯車の側に寄せて畳み、**中で巻く**。掴んで動かす間は
 * `touch-action: none` が効くので、巻きと喧嘩しない。
 *
 * ## なぜ部品にしたか
 * この形はカードのシートの中にしか無く、**絵の検査に一度も映って
 * いなかった**。だから「下の項目が出ていない」を目で見つけられたのは
 * オーナーだけだった。部品にして場面を1つ作れば、次からは機械が見る。
 * 写しを作らない — 写すと、直した側と直っていない側が生まれる。
 */
export function SectionsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <div
      className={`fixed right-3 top-[52px] z-20 w-72 max-w-[calc(100vw-1.5rem)] transition-all duration-300 [transition-timing-function:var(--ease-ios)] ${
        open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0"
      }`}
    >
      <div className="mt-2 rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between gap-1 pl-1.5">
          <p className="min-w-0 truncate text-footnote font-semibold text-muted-foreground">
            {t("card.sections")}
          </p>
          <button
            onClick={onClose}
            // **44px。** この形は今まで絵に映っていなかったので、
            // 40px のまま指の下限を割っていた(検査に入れた途端に出た)。
            className="lift-soft inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary"
            aria-label={t("common.closeEdit")}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
        {/* **いちばん下の項目まで届く。** 高さを画面に合わせて切り、足りない
            分は中で巻く。切らずに置くと、画面の外へ出た行は触れない
            = 並べ替えられない。 */}
        <div className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain pr-0.5">
          <WordCardSectionsEditor />
        </div>
      </div>
    </div>
  );
}
