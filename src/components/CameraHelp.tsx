import { useEffect, useId, useState, type ReactNode } from "react";
import { CameraOff, ChevronDown, ExternalLink, ImagePlus, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  cameraFixSteps,
  externalBrowserUrl,
  inAppBrowser,
  mayAutoOpenExternal,
  type CameraProblem,
} from "@/lib/camera-access";
import "./camera-primer.css";

/**
 * **カメラが使えないときの面**（オーナー指示 2026-09-30「カメラの許可をとる、必要であれば
 * スマホの設定を変えるように誘導して」→ 2026-10-02「どこからでも…新規登録前にこのアプリを
 * 体験できるようにして」→ 2026-10-03「スマホのカメラで撮る機能は消して」）。
 *
 * どの理由でも**行き止まりにしない**。いちばん上の釦は、その理由でいちばん確かな道:
 * - 許可されていない … 端末ごとの直し方（開いてある）と「許可したので、もう一度試す」
 * - 起動できない … 他のアプリを閉じて「もう一度試す」
 * - アプリ内ブラウザ（LINE など）… 「ブラウザで開き直す」（LINE・Android は自動で1度）
 * - 仕組みが無い・開き直せない … 「写真を選ぶ」
 * 2つ目はいつも「写真を選ぶ」（`capture` を付けない、ふつうのファイルの選び口）。選んだ写真は
 * 撮った写真と同じ道（縮めて AI へ）を通るので、許可を直さなくてもチュートリアルを続けられる。
 *
 * `screen`（チュートリアル）は撮る前の一枚（`CameraPrimer`）と同じ画面いっぱいの面に、
 * 渡さなければ（ログイン後の撮る画面）今まで通り映像の枠の中に出し、下の撮り方の帯
 * （検索など）はそのまま使える。
 */
export function CameraHelp({
  problem,
  onRetry,
  onLibrary,
  screen = false,
}: {
  problem: CameraProblem;
  onRetry: () => void;
  onLibrary: () => void;
  screen?: boolean;
}) {
  const t = useT();
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const app = inAppBrowser(ua);
  const external =
    problem === "inapp" && typeof location !== "undefined"
      ? externalBrowserUrl(location.href, ua, app)
      : null;
  /** Brave は Chrome を名乗るので、名乗りではなく `navigator.brave` で見分ける。 */
  const brave = typeof navigator !== "undefined" && "brave" in navigator;
  const steps = cameraFixSteps(problem, ua, { brave, external: !!external });

  /**
   * **押さなくても、1度だけ自動でブラウザを開く**（オーナー指示 2026-09-30「ブラウザで
   * 開き直すボタンは実際にブラウザで自動的に開くように」）。アプリによっては押した時しか
   * 開かないので、釦も残す。
   */
  useEffect(() => {
    if (!external) return;
    const KEY = "catchwords-external-tried";
    let tried = false;
    try {
      tried = sessionStorage.getItem(KEY) === "1";
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* 覚えられなくても、LINE は URL の目印で繰り返さない。 */
    }
    if (mayAutoOpenExternal(location.href, tried)) location.href = external;
  }, [external]);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(location.href)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  /** 主の釦の見た目（チュートリアルでは案内と同じ青い光の輪で「ここ」を示す）。 */
  const primary = `cam-primer__allow press-in${screen ? " tour-pulse" : ""}`;
  const retry = (
    <>
      <RotateCcw size={20} strokeWidth={2.2} aria-hidden="true" />
      {t(problem === "denied" ? "camhelp.allowRetry" : "camhelp.retry")}
    </>
  );
  const library = (className: string): ReactNode => (
    <button type="button" data-tour="camera-library" className={className} onClick={onLibrary}>
      <ImagePlus size={18} strokeWidth={2.2} aria-hidden="true" />
      {t("campriming.library")}
    </button>
  );
  const libraryFirst = problem === "unsupported" || (problem === "inapp" && !external);

  return (
    <div
      role="alert"
      aria-labelledby={titleId}
      data-tour="camera-help"
      className={`cam-primer cam-primer--${screen ? "screen" : "frame"} cam-primer--help`}
    >
      <div className="cam-primer__panel">
        <div className="cam-primer__body">
          <span className="cam-primer__badge" aria-hidden="true">
            <CameraOff size={24} strokeWidth={2.2} />
          </span>
          <h2 id={titleId} className="cam-primer__title ja-phrase">
            {t(`camhelp.title.${problem}`)}
          </h2>
          <p className="cam-primer__reason ja-phrase">{t(`camhelp.body.${problem}`)}</p>
        </div>
        {steps.length > 0 && (
          // 直し方は、面の大きいチュートリアルでは開いておく（枠の中は狭いので畳む）。
          <details className="cam-primer__steps" open={screen || problem === "inapp"}>
            <summary className="ja-phrase">
              {t(problem === "inapp" ? "camhelp.openBrowser" : "camhelp.howTo")}
              <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
            </summary>
            <ol className="ja-phrase">
              {steps.map((step) => (
                <li key={step.key}>{t(step.key, step.vars)}</li>
              ))}
            </ol>
          </details>
        )}
        <div className="cam-primer__actions">
          {libraryFirst ? (
            library(primary)
          ) : external ? (
            <a href={external} className={primary}>
              <ExternalLink size={20} strokeWidth={2.2} aria-hidden="true" />
              {t("camhelp.openBrowser")}
            </a>
          ) : (
            <button type="button" className={primary} onClick={onRetry}>
              {retry}
            </button>
          )}
          {!libraryFirst && library("cam-primer__second press-in")}
          {(problem === "inapp" || problem === "unsupported") && (
            <div className="cam-primer__links">
              <button type="button" onClick={copy} className="cam-primer__link">
                {copied ? t("camhelp.copied") : t("camhelp.copyLink")}
              </button>
              {problem === "inapp" && (
                <button type="button" onClick={onRetry} className="cam-primer__link">
                  {t("camhelp.retry")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
