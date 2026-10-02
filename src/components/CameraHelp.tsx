import { useEffect, useId, useState } from "react";
import {
  CameraOff,
  ChevronDown,
  ExternalLink,
  ImagePlus,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  cameraFixSteps,
  externalBrowserUrl,
  inAppBrowser,
  mayAutoOpenExternal,
  osCameraKind,
  type CameraPrimerVariant,
  type CameraProblem,
} from "@/lib/camera-access";
import "./camera-primer.css";

/**
 * **カメラが使えないときの面**（オーナー指示 2026-09-30「カメラの許可をとる、必要であれば
 * スマホの設定を変えるように誘導して」→ 2026-10-02「iPhone ユーザーでもAndroid ユーザーでも
 * ブラウザからでもどこからでも…新規登録前にこのアプリを体験できるようにして」）。
 *
 * - いちばん上の釦は**このまま続ける道**（端末のカメラアプリで撮る。パソコンは写真を選ぶ）。
 *   許可を直さなくても、撮った写真は同じ道（縮めて AI へ）を通る
 * - アプリ内ブラウザ（LINE など）… ふつうのブラウザで開き直す（LINE・Android は自動で1度）
 * - 許可されていない … 端末ごとの直し方（畳んである。開けば手順）と「もう一度試す」
 * - 起動できない … 他のアプリを閉じて「もう一度試す」
 *
 * `variant` を渡すと（チュートリアル）、撮る前の一枚（`CameraPrimer`）と同じ面・同じ位置に
 * 出す。渡さなければ（ログイン後の撮る画面）、今まで通り映像の枠の中に出し、下の撮り方の
 * 帯（検索など）はそのまま使える。
 */
export function CameraHelp({
  problem,
  onRetry,
  onOsCamera,
  onLibrary,
  variant,
}: {
  problem: CameraProblem;
  onRetry: () => void;
  onOsCamera: () => void;
  onLibrary: () => void;
  variant?: CameraPrimerVariant;
}) {
  const t = useT();
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const app = inAppBrowser(ua);
  const kind = osCameraKind(ua);
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

  const body = (
    <>
      <span className="cam-primer__badge cam-primer__badge--off" aria-hidden="true">
        <CameraOff size={24} strokeWidth={2.2} />
      </span>
      <h2 id={titleId} className="cam-primer__title ja-phrase">
        {t(`camhelp.title.${problem}`)}
      </h2>
      <p className="cam-primer__reason ja-phrase">{t(`camhelp.body.${problem}`)}</p>
    </>
  );

  const actions = (
    <div className="cam-primer__actions">
      <button
        type="button"
        data-tour="camera-file"
        className={`cam-primer__allow press-in${variant ? " tour-pulse" : ""}`}
        onClick={kind === "camera" ? onOsCamera : onLibrary}
      >
        {kind === "camera" ? (
          <Smartphone size={20} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <ImagePlus size={20} strokeWidth={2.2} aria-hidden="true" />
        )}
        {t(kind === "camera" ? "campriming.osCamera" : "campriming.library")}
      </button>
      <div className="cam-primer__alt">
        {kind === "camera" && (
          <button type="button" className="cam-primer__file press-in" onClick={onLibrary}>
            <ImagePlus size={18} strokeWidth={2.2} aria-hidden="true" />
            {t("campriming.library")}
          </button>
        )}
        {external ? (
          <a href={external} className="cam-primer__file press-in">
            <ExternalLink size={18} strokeWidth={2.2} aria-hidden="true" />
            {t("camhelp.openBrowser")}
          </a>
        ) : (
          <button type="button" className="cam-primer__file press-in" onClick={onRetry}>
            <RotateCcw size={18} strokeWidth={2.2} aria-hidden="true" />
            {t(problem === "denied" ? "camhelp.allowRetry" : "camhelp.retry")}
          </button>
        )}
      </div>
      {steps.length > 0 && (
        <details className="cam-primer__steps" open={problem === "inapp"}>
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
      {(problem === "inapp" || problem === "unsupported" || external) && (
        <div className="cam-primer__links">
          {(problem === "inapp" || problem === "unsupported") && (
            <button type="button" onClick={copy} className="cam-primer__link">
              {copied ? t("camhelp.copied") : t("camhelp.copyLink")}
            </button>
          )}
          {external && (
            <button type="button" onClick={onRetry} className="cam-primer__link">
              {t("camhelp.retry")}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (variant)
    return (
      <div
        className={`cam-primer cam-primer--${variant} cam-primer--help`}
        data-tour="camera-help"
        role="alert"
        aria-labelledby={titleId}
      >
        {variant === "sheet" && <div className="cam-primer__scrim" aria-hidden="true" />}
        <div className="cam-primer__panel">
          <div className="cam-primer__body">{body}</div>
          {actions}
        </div>
      </div>
    );

  return (
    <div
      role="alert"
      aria-labelledby={titleId}
      data-tour="camera-help"
      className="cam-primer cam-primer--frame cam-primer--help"
    >
      <div className="cam-primer__panel">
        <div className="cam-primer__body">{body}</div>
        {actions}
      </div>
    </div>
  );
}
