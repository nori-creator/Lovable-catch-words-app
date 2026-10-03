import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { settingsSaveStatus, type SaveState } from "@/lib/save-status";

/**
 * 設定の「保存しました」の小さな札（`lib/save-status.ts`）。
 *
 * - **押した物の邪魔をしない**: 高さ 0 の sticky の箱に浮かべるので、出ても行がずれない。
 *   指も通す（`pointer-events-none`）。
 * - **読み上げにも届く**: `role="status"`（`aria-live="polite"`）。
 * - 「保存中」は札を出さない（毎回ちらつくと、それ自体がうるさい）。失敗はトースト。
 */
export function SaveStatusPill({ state: forced }: { state?: SaveState } = {}) {
  const t = useT();
  const live = useSyncExternalStore(
    settingsSaveStatus.subscribe,
    settingsSaveStatus.get,
    () => "idle" as const,
  );
  const state = forced ?? live;
  return (
    <div className="pointer-events-none sticky top-[calc(env(safe-area-inset-top)+8px)] z-30 flex h-0 justify-center">
      <div role="status" aria-live="polite" className="h-0">
        {state === "saved" && (
          <span className="save-status inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-footnote font-medium text-foreground shadow-sm backdrop-blur">
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden strokeWidth={2.5} />
            {t("settings.savedInline")}
          </span>
        )}
      </div>
    </div>
  );
}
