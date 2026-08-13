import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import {
  SHELF_MATERIALS,
  SHELF_DENSITIES,
  type ShelfMaterial,
  type ShelfDensity,
} from "@/lib/shelf-prefs";

/**
 * 棚の見え方を選ぶシート(素材と密度)。
 *
 * ## 設計で決めたこと
 * **開いたまま後ろの棚が変わる。** 選ぶ → 閉じる → 確かめる、では
 * 選んでいるものが何なのか分からない。だからシートは画面の下半分だけを
 * 覆い、上半分に本物の棚を残す。押した結果がその場で見える。
 *
 * そのため、この画面には「適用」も「キャンセル」も無い。選択そのものが
 * 適用で、気に入らなければ別のものを押せばいい(apple-design §16 —
 * 元に戻せる操作に確認を挟まない)。
 *
 * 見本(小さな四角)は出さない。**本物が後ろに見えているのに、
 * 小さな偽物を並べる意味がない。**
 */
export function DexShelfOptions({
  material,
  density,
  onMaterial,
  onDensity,
  onClose,
}: {
  material: ShelfMaterial;
  density: ShelfDensity;
  onMaterial: (v: ShelfMaterial) => void;
  onDensity: (v: ShelfDensity) => void;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Esc で閉じる。全画面ではないが、覆っている以上は出口を鍵盤にも置く。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // 開いたら中の最初の操作へ焦点を移す(読み上げが後ろの一覧に残らないように)。
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const materialLabel: Record<ShelfMaterial, string> = {
    none: t("shelf.matNone"),
    oak: t("shelf.matOak"),
    walnut: t("shelf.matWalnut"),
    obsidian: t("shelf.matObsidian"),
    concrete: t("shelf.matConcrete"),
    glass: t("shelf.matGlass"),
  };
  const densityLabel: Record<ShelfDensity, string> = {
    two: t("shelf.den2"),
    three: t("shelf.den3"),
    four: t("shelf.den4"),
    spines: t("shelf.denSpines"),
  };

  return (
    // 幕は敷くが**上半分は素通し**。後ろの棚が変わるのを見せるため、
    // 暗くするのは自分が載っている下側だけにする。
    <div className="fixed inset-x-0 bottom-0 z-50" role="dialog" aria-label={t("shelf.optTitle")}>
      <div
        ref={panelRef}
        className="app-sheet material-in mx-auto max-w-3xl rounded-t-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-foreground/20" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("shelf.optTitle")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          {t("shelf.optMaterial")}
        </p>
        <div className="-mx-1 mb-4 overflow-x-auto px-1">
          <div className="flex w-max gap-2">
            {SHELF_MATERIALS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onMaterial(m);
                  haptic("selection");
                }}
                aria-pressed={material === m}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${
                  material === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                {materialLabel[m]}
              </button>
            ))}
          </div>
        </div>

        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          {t("shelf.optDensity")}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {SHELF_DENSITIES.map((d) => (
            <button
              key={d}
              onClick={() => {
                onDensity(d);
                haptic("selection");
              }}
              aria-pressed={density === d}
              className={`min-h-11 rounded-full border px-2 text-sm ${
                density === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              {densityLabel[d]}
            </button>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">{t("shelf.optLiveHint")}</p>
      </div>
    </div>
  );
}
