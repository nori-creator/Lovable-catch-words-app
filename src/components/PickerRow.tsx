import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { WheelPicker } from "@/components/WheelPicker";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

/**
 * 設定の1行。押すと**選ぶ輪だけ**が前に出る（焦点はその中に閉じる）。
 *
 * ## 色はトークンで持つ
 * ここは `bg-white` / `text-slate-900` / `border-slate-200` と、明るい面を
 * 前提にした固定色で書かれていた。この app はテーマを明暗2つ持っているので、
 * **暗い面ではここだけ白い板が浮く**。色の出し分けは `--card` /
 * `--foreground` / `--border` の側が持っているので、そちらを使う。
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
  const t = useT();
  return (
    <div>
      <span className="text-field font-medium text-foreground">{label}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-2 flex min-h-14 w-full items-center justify-between rounded-[20px] border border-border bg-card px-4 text-left text-foreground shadow-sm"
            aria-label={label}
          >
            <span>{options.find((o) => o.value === value)?.label}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DialogTrigger>
        <DialogContent
          aria-labelledby={`${id}-sheet-label`}
          aria-describedby={undefined}
          className="picker-sheet w-[calc(100%-2rem)] rounded-[30px] bg-card p-6 text-foreground sm:rounded-[30px]"
        >
          <DialogTitle id={`${id}-sheet-label`}>{label}</DialogTitle>
          <WheelPicker
            id={`${id}-sheet`}
            labelledBy={`${id}-sheet-label`}
            value={value}
            onChange={onChange}
            options={options}
          />
          <button
            onClick={() => setOpen(false)}
            className="min-h-12 rounded-full bg-primary px-6 font-semibold text-white"
          >
            {t("common.close")}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
