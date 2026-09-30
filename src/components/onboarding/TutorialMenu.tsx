import { createContext, useContext } from "react";
import { Check, Globe, RotateCcw, X } from "lucide-react";
import { UI_LANGS, TARGET_LANG_LABEL_KEYS, useT } from "@/lib/i18n";
import { TARGET_LANGUAGES } from "@/lib/target-lang";
import type { FirstCatch } from "@/lib/first-catch";

/** 言語の名前は**その言語自身で**書く。間違えた言語の画面からでも自分の言語を探せるように。 */
const NATIVE_NAME: Record<FirstCatch["uiLanguage"], string> = {
  ja: "日本語",
  en: "English",
  "zh-TW": "繁體中文",
};

/**
 * チュートリアルのどこからでも開ける小さなメニュー（βテスト 2026-09-30、母の報告
 * 「母語を台湾華語にして、途中でわからなくなった」）。
 *
 * - **表示言語・学ぶ言語をその場で変えられる**（設定画面はまだ登録前で開けないため）
 * - **最初の画面（ウェルカム）へ戻れる**
 *
 * 案内の覆い（`Spotlight`）が他の場所の操作を止めているので、この部品には
 * `data-tour-escape` を付け、覆いに通してもらう。
 */
/**
 * 下のタブの「設定」からこのメニューを開くための口（`FirstCatchShell` が読む）。
 * 登録前は本物の設定画面を開けないので、チュートリアルではこちらが設定になる。
 */
export const TutorialMenuContext = createContext<(() => void) | null>(null);
export function useOpenTutorialMenu() {
  return useContext(TutorialMenuContext);
}

export function TutorialMenu({
  draft,
  disabled,
  onChangeLanguage,
  onRestart,
  open,
  onOpenChange,
  showButton,
}: {
  draft: FirstCatch;
  disabled?: boolean;
  onChangeLanguage: (next: Pick<FirstCatch, "uiLanguage" | "targetLanguage">) => void;
  onRestart: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 右上の丸いボタンを出すか。下のタブが無い画面（質問・通知・準備）だけ出す。
   * タブがある画面では「設定」のタブから開く（右上には閉じる・切替などが在るので重ねない）。
   */
  showButton: "left" | "right" | false;
}) {
  const t = useT();
  const setOpen = onOpenChange;
  if (!showButton && !open) return null;
  return (
    <div
      className="tutorial-menu"
      data-anchor={showButton ? "top" : "bottom"}
      data-side={showButton || "right"}
      data-tour-escape
    >
      {showButton && (
        <button
          type="button"
          className="tutorial-menu__button"
          aria-label={t("first.menu")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Globe size={20} />}
        </button>
      )}
      {open && (
        <div className="tutorial-menu__panel" role="dialog" aria-label={t("first.menu")}>
          {!showButton && (
            <button
              type="button"
              className="tutorial-menu__close"
              aria-label={t("first.menuClose")}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          )}
          <p className="tutorial-menu__label">
            {t("first.menuDisplay")}
            <small> · Language · 語言</small>
          </p>
          <div className="tutorial-menu__choices">
            {UI_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                lang={lang}
                disabled={disabled}
                aria-pressed={draft.uiLanguage === lang}
                onClick={() =>
                  onChangeLanguage({ uiLanguage: lang, targetLanguage: draft.targetLanguage })
                }
              >
                {draft.uiLanguage === lang && <Check size={14} strokeWidth={3} />}
                {NATIVE_NAME[lang]}
              </button>
            ))}
          </div>
          <p className="tutorial-menu__label">{t("first.menuTarget")}</p>
          <div className="tutorial-menu__choices">
            {TARGET_LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                disabled={disabled}
                aria-pressed={draft.targetLanguage === lang}
                onClick={() =>
                  onChangeLanguage({
                    uiLanguage: draft.uiLanguage,
                    targetLanguage: lang as FirstCatch["targetLanguage"],
                  })
                }
              >
                {draft.targetLanguage === lang && <Check size={14} strokeWidth={3} />}
                {t(TARGET_LANG_LABEL_KEYS[lang as FirstCatch["targetLanguage"]])}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="tutorial-menu__restart"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onRestart();
            }}
          >
            <RotateCcw size={16} />
            {t("first.backToWelcome")}
          </button>
        </div>
      )}
    </div>
  );
}
