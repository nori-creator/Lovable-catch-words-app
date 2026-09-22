import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { WheelPicker } from "@/components/WheelPicker";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

/** The row stays fixed; choices are a separate, focus-trapped overlay. */
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
            className="mt-2 flex min-h-14 w-full items-center justify-between rounded-[20px] border border-slate-200 bg-white px-4 text-left text-slate-900 shadow-sm"
            aria-label={label}
          >
            <span>{options.find((o) => o.value === value)?.label}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
        </DialogTrigger>
        <DialogContent
          aria-labelledby={`${id}-sheet-label`}
          aria-describedby={undefined}
          className="picker-sheet w-[calc(100%-2rem)] rounded-[30px] bg-white p-6 text-slate-900 sm:rounded-[30px]"
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
