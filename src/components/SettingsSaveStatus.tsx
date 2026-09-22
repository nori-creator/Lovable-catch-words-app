import { useT } from "@/lib/i18n";
import type { SaveState } from "@/lib/autosave";

/** Shared by the settings page and its interactive visual fixture. */
export function SettingsSaveStatus({ state, retry }: { state: SaveState; retry: () => void }) {
  const t = useT();
  return (
    <div
      className="sticky top-2 z-30 flex justify-end"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {state === "error" ? (
        <button
          type="button"
          onClick={retry}
          className="min-h-11 rounded-full border border-destructive/30 bg-background px-4 py-2 text-sm text-destructive shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("settings.autosaveRetry")}
        </button>
      ) : (
        <span className="flex min-h-11 items-center rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground shadow-sm">
          {t(state === "pending" || state === "saving" ? "settings.saving" : "settings.autosaved")}
        </span>
      )}
    </div>
  );
}
