import { Check } from "lucide-react";
import { DiaryDate } from "@/routes/_authenticated/home";
import { DATE_STYLES, DATE_STYLE_META, setDateStyle, useDateStyle } from "@/lib/date-style";

/**
 * **ホームの日付の組み方を見比べて選ぶ**（開発者専用・オーナー指示 2026-09-24）。
 *
 * 見本は同じ日付（見ている日の今日）を全部の組み方で並べる — 1つずつ切り替えて
 * 記憶と比べるより、並べた方が違いが分かる。押すと端末に覚え、ホームの日付が
 * その場で変わる。一般の利用者には出さない（設定の開発者欄の中だけ）。
 */
export function DateStylePicker({ date = new Date() }: { date?: Date }) {
  const chosen = useDateStyle();
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h3 className="text-body font-semibold">ホームの日付の組み方（開発者だけ）</h3>
      <p className="mt-1 text-footnote text-muted-foreground">
        押すと、この端末のホームの日付がその形に変わります。
      </p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="ホームの日付の組み方">
        {DATE_STYLES.map((id) => {
          const on = chosen === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setDateStyle(id)}
              className={`press-in rounded-2xl border p-3 text-left transition-colors ${
                on ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-footnote font-semibold">{DATE_STYLE_META[id].label}</span>
                {on && <Check className="h-4 w-4 text-primary" aria-hidden />}
              </div>
              <p className="text-caption text-muted-foreground">{DATE_STYLE_META[id].note}</p>
              <div className="mt-2 pointer-events-none">
                <DiaryDate date={date} style={id} preview />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
