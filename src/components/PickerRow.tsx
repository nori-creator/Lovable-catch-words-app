import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { WheelPicker } from "@/components/WheelPicker";
import { haptic } from "@/lib/haptics";

/**
 * 設定の1行。**押すと、その下から選ぶ輪が開く**（2段階）。
 *
 * ## オーナー指示 2026-09-15
 * > 「設定の縦のスクロール元のあれに戻して、その元の設定をタップしたら
 * >  選択肢がスクロールできるように2段階にしたい。Apple の公式のデザイン
 * >  調べて同じもの再現して」
 *
 * ## 何を写したか — iOS の「設定」の行
 * Apple の Human Interface Guidelines（Lists / Pickers）に沿った形:
 *   ・行の**左に項目名、右にいま選んでいる値**（値は控えめな色）
 *   ・右端に**開閉の印**（下向きの山。開くと上を向く）
 *   ・押すと**その場で下に開く**。別の画面へ飛ばさない
 *     （HIG §10「使うのは必要なときだけ。できるだけその場で完結させる」）
 *
 * 前の版は輪を最初から4つ並べていた。選ぶのは楽だが、**設定を眺めたいだけの
 * 人にも輪が4つ居座る**ので、画面がどこまでも縦に伸びていた。
 * 畳んでおけば、いま何が選ばれているかは**1行で読める**。
 *
 * ## 輪は畳んでいる間も置いたままにする
 * 開いた瞬間に作ると、高さが 0 の箱の中で位置を合わせることになり、
 * **選んでいる行が真ん中に来ない**。ずっと置いておき、外側の箱だけを
 * 開け閉めする（`grid-template-rows` の 0fr ↔ 1fr。高さが `auto` でも
 * 滑らかに動かせる唯一の書き方）。
 */
export function PickerRow({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const bodyId = useId();
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <div className="picker-row">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen((v) => !v);
          haptic("selection");
        }}
        className="picker-row__head"
      >
        <span id={labelId} className="picker-row__label">
          {label}
        </span>
        {/* **いま選んでいる値は、畳んでいても読める。** これが無いと、
            開かないと何を選んだか分からない行になる。 */}
        <span className="picker-row__value">{current}</span>
        <ChevronDown aria-hidden className="picker-row__chevron" data-open={open || undefined} />
      </button>
      <div id={bodyId} className="picker-row__body" data-open={open || undefined}>
        <div className="picker-row__inner" inert={!open}>
          <WheelPicker
            id={id}
            labelledBy={labelId}
            value={value}
            onChange={onChange}
            options={options}
          />
        </div>
      </div>
    </div>
  );
}
