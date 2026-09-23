import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  readWallpaper,
  saveWallpaper,
  WALLPAPERS,
  WALLPAPER_EVENT,
  type WallId,
} from "@/lib/wallpaper";
import { decorFor } from "@/lib/collage-decor";

/**
 * ホームの壁紙を選ぶ（設定の中）。**見本の壁**に写真を1枚貼った小さな札を
 * 並べて、押して選ぶ（オーナー指示 2026-09-23「ホームの上に丸で表示するのは
 * ダサいからやめて」）。留め方（画鋲・テープ・四隅）も実物と同じに描くので、
 * 選ぶ前に貼られ方まで分かる。
 */
export function WallpaperPicker({
  value: controlled,
  onChange,
}: {
  /** 見本で値を決め打ちするとき。ふだんは端末の保存を読む。 */
  value?: WallId;
  onChange?: (id: WallId) => void;
}) {
  const t = useT();
  const [stored, setStored] = useState<WallId>("paper");
  useEffect(() => {
    setStored(readWallpaper());
    const h = () => setStored(readWallpaper());
    window.addEventListener(WALLPAPER_EVENT, h);
    return () => window.removeEventListener(WALLPAPER_EVENT, h);
  }, []);
  const value = controlled ?? stored;
  return (
    <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("home.background")}>
      {WALLPAPERS.map((w) => {
        const on = w.id === value;
        const d = decorFor("sample-photo", w.id);
        return (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              saveWallpaper(w.id);
              setStored(w.id);
              onChange?.(w.id);
            }}
            className="press-in text-left"
          >
            <span
              className={`wall-swatch relative block aspect-[3/4] overflow-hidden rounded-xl ${w.className} ${
                on
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : "ring-1 ring-border"
              }`}
            >
              {/* 見本の写真1枚。実物と同じ留め方で貼る。 */}
              <span className="wall-swatch__photo absolute left-1/2 top-[22%] block h-[46%] w-[58%] -translate-x-1/2 -rotate-3">
                <span className="block h-full w-full rounded-[3px] bg-[#9fb8c8]" />
                {d.kind === "none" ? null : d.kind === "pin" ? (
                  <span
                    className={`collage-pin collage-pin--${d.color}`}
                    style={{ left: `${d.x}%` }}
                  />
                ) : d.kind === "corners" ? (
                  (["tl", "tr", "bl", "br"] as const).map((c) => (
                    <span key={c} className={`collage-corner collage-corner--${c}`} />
                  ))
                ) : (
                  d.tapes.map((tp) => (
                    <span
                      key={tp.spot}
                      className={`collage-tape collage-tape--${tp.spot} collage-tape--${tp.color}`}
                      style={{ rotate: `${tp.rot}deg` }}
                    />
                  ))
                )}
              </span>
              {on && (
                <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </span>
            <span className="mt-1 block text-center text-footnote font-medium">
              {t(w.labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
