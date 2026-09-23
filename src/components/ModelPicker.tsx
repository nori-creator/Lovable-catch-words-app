import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import {
  filterModels,
  fromFeatureSpec,
  priceLabel,
  toFeatureSpec,
  type OpenRouterModel,
} from "@/lib/openrouter-models";

/**
 * 機能ごとに使う AI を**一覧から選ぶ**（開発者だけの設定）。
 *
 * （オーナー指示 2026-09-22「開発者である私だけ設定からアプリ内の機能を、
 *  openrouter の ai を使い分けられるようにして。この機能はこれみたいに
 *  簡単に設定したい」）
 *
 * 以前はモデル名を**手で打つ欄**だった（綴りを1字違えると 404 で機能が止まる）。
 * OpenRouter の一覧から、名前と値段を見て押すだけにする。
 *  ・探す欄で絞れる（「gemini flash」のように語を並べる）。
 *  ・スキャンは写真を読むので、**画像を読めるモデルだけ**を出す。
 *  ・一覧が取れないとき（鍵が無い・通信の失敗）は、前と同じ手で打つ欄に落ちる。
 */
export function ModelPicker({
  label,
  value,
  onChange,
  models,
  visionOnly = false,
  unavailable = false,
}: {
  label: string;
  /** 保存されている値（"openrouter:<id>" / 他の "provider:model" / 空＝既定）。 */
  value: string;
  onChange: (spec: string) => void;
  models: OpenRouterModel[];
  visionOnly?: boolean;
  /** 一覧が取れなかった。手で打つ欄に落とす。 */
  unavailable?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chosenId = fromFeatureSpec(value);
  const chosen = chosenId ? models.find((m) => m.id === chosenId) : undefined;
  const list = useMemo(
    () => filterModels(models, q, { visionOnly }).slice(0, 80),
    [models, q, visionOnly],
  );

  if (unavailable) {
    return (
      <div>
        <p className="text-caption font-medium">{label}</p>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("settings.aiEnvDefault")}
          aria-label={label}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-muted-foreground">{label}</span>
          <span className="block truncate text-footnote font-semibold">
            {chosen ? chosen.name : value ? value : t("settings.aiEnvDefault")}
          </span>
          {chosen && (
            <span className="block truncate text-caption text-muted-foreground">
              {priceLabel(chosen, t("set.orFree"))}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-border p-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("set.orSearch")}
            aria-label={t("set.orSearch")}
          />
          {visionOnly && (
            <p className="mt-1 text-caption text-muted-foreground">{t("set.orVisionOnly")}</p>
          )}
          <ul className="mt-2 max-h-72 overflow-y-auto overscroll-contain" role="listbox">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-footnote"
              >
                <RotateCcw className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1">{t("settings.aiEnvDefault")}</span>
                {!value && <Check className="h-4 w-4 text-primary" aria-hidden />}
              </button>
            </li>
            {list.map((m) => {
              const on = m.id === chosenId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      onChange(toFeatureSpec(m.id));
                      setOpen(false);
                    }}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                      on ? "bg-secondary" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-footnote font-medium">{m.name}</span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {m.id}
                      </span>
                    </span>
                    {m.vision && (
                      <Eye
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label={t("set.orVision")}
                      />
                    )}
                    <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                      {priceLabel(m, t("set.orFree"))}
                    </span>
                    {on && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-caption text-muted-foreground">{t("set.orPriceUnit")}</p>
        </div>
      )}
    </div>
  );
}
