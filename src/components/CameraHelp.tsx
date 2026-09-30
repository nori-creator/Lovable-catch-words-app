import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  cameraPlatform,
  externalBrowserUrl,
  inAppBrowser,
  mayAutoOpenExternal,
  type CameraProblem,
} from "@/lib/camera-access";

/**
 * **カメラが使えないときの直し方**を、撮る枠の中に出す（オーナー指示 2026-09-30
 * 「カメラの許可をとる、必要であればスマホの設定を変えるように誘導して。
 * 必ずアプリ内のカメラで新規ユーザーにカメラ撮影させたい」）。
 *
 * - アプリ内ブラウザ（LINE など）… ふつうのブラウザで開き直す（LINE・Android は1タップ）
 * - 許可されていない … 端末ごとの設定の手順と「もう一度試す」
 * - 起動できない … 他のアプリを閉じて「もう一度試す」
 *
 * 端末の別のカメラアプリへは逃がさない（この画面のカメラで撮ってもらう）。
 */
export function CameraHelp({ problem, onRetry }: { problem: CameraProblem; onRetry: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const platform = cameraPlatform(ua);
  const app = inAppBrowser(ua);
  const external =
    problem === "inapp" && typeof location !== "undefined"
      ? externalBrowserUrl(location.href, ua, app)
      : null;
  const chromeOnIos = /CriOS/i.test(ua);

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

  const steps: string[] =
    problem === "denied"
      ? platform === "ios"
        ? chromeOnIos
          ? [t("camhelp.iosChrome1"), t("camhelp.iosChrome2")]
          : [t("camhelp.ios1"), t("camhelp.ios2")]
        : platform === "android"
          ? [t("camhelp.android1"), t("camhelp.android2"), t("camhelp.android3")]
          : [t("camhelp.desktop1")]
      : problem === "inapp" && !external
        ? [platform === "ios" ? t("camhelp.inappIos") : t("camhelp.inappOther")]
        : [];

  const copy = () => {
    void navigator.clipboard
      ?.writeText(location.href)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <div
      role="alert"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/80 p-5 text-center text-white"
    >
      <p className="ja-phrase text-body font-semibold">{t(`camhelp.title.${problem}`)}</p>
      <p className="ja-phrase text-footnote text-white/85">{t(`camhelp.body.${problem}`)}</p>
      {steps.length > 0 && (
        <ol className="ja-phrase w-full max-w-xs list-decimal space-y-1 rounded-2xl bg-white/10 py-3 pl-8 pr-4 text-left text-footnote">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {external ? (
        <a
          href={external}
          className="press-in inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground"
        >
          {t("camhelp.openBrowser")}
        </a>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="press-in min-h-11 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground"
        >
          {t(problem === "denied" ? "camhelp.allowRetry" : "camhelp.retry")}
        </button>
      )}
      {(problem === "inapp" || problem === "unsupported") && (
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded-full px-4 text-footnote font-semibold text-white underline"
        >
          {copied ? t("camhelp.copied") : t("camhelp.copyLink")}
        </button>
      )}
      {external && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-full px-4 text-footnote font-semibold text-white/85 underline"
        >
          {t("camhelp.retry")}
        </button>
      )}
    </div>
  );
}
