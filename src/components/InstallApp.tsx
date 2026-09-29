import { useEffect, useState } from "react";
import { Download, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  dismissInstall,
  installDismissed,
  promptInstall,
  useInstallState,
  type InstallState,
} from "@/lib/pwa";

/**
 * **アプリとしてスマホに入れる**（オーナー指示 2026-09-29「Android と iPhone でこの URL を開いて
 * 使用でき、またアプリとしてスマホ上にインストールできるようにして」、`lib/pwa.ts`）。
 *
 * - Android（入れられる合図が来ている）: 「インストール」の釦1つ
 * - iPhone: Safari の共有ボタン →「ホーム画面に追加」の手順（Apple は釦を用意していない）
 * - Android（合図がまだ）: Chrome のメニュー →「アプリをインストール」の手順
 * - LINE などのアプリの中: Safari / Chrome で開き直すよう案内
 */
function Steps({ state }: { state: InstallState }) {
  const t = useT();
  if (state.platform === "in-app")
    return <p className="text-caption text-muted-foreground">{t("install.inApp")}</p>;
  const steps =
    state.platform === "ios"
      ? [
          { icon: <Share className="h-4 w-4" aria-hidden />, text: t("install.iosStep1") },
          { icon: <SquarePlus className="h-4 w-4" aria-hidden />, text: t("install.iosStep2") },
          { icon: null, text: t("install.iosStep3") },
        ]
      : state.platform === "android"
        ? [
            {
              icon: <EllipsisVertical className="h-4 w-4" aria-hidden />,
              text: t("install.androidStep1"),
            },
            { icon: <Download className="h-4 w-4" aria-hidden />, text: t("install.androidStep2") },
          ]
        : [{ icon: <Download className="h-4 w-4" aria-hidden />, text: t("install.desktopStep") }];
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2 text-footnote">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-caption font-bold text-primary-ink">
            {i + 1}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            {s.icon}
            <span>{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function InstallButton({ onDone }: { onDone?: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => void promptInstall().then((ok) => ok && onDone?.())}
      className="press-in inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground"
    >
      <Download className="h-4 w-4" aria-hidden />
      {t("install.button")}
    </button>
  );
}

/** 設定の中の欄。入れ終えていれば「インストール済み」だけ出す。 */
export function InstallAppCard({ state: forced }: { state?: InstallState }) {
  const t = useT();
  const live = useInstallState();
  const state = forced ?? live;
  return (
    <div className="space-y-2" data-install-card={state.platform}>
      <p className="text-footnote font-medium">{t("install.title")}</p>
      {state.installed ? (
        <p className="text-caption text-muted-foreground">{t("install.done")}</p>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">{t("install.why")}</p>
          {state.canPrompt ? <InstallButton /> : <Steps state={state} />}
        </>
      )}
    </div>
  );
}

/**
 * ホームの下に1度だけ出す小さな案内。閉じたら二度と出さない（設定の欄からはいつでも入れられる）。
 * 入れ終えている・入れられない端末（パソコン）では出さない。
 */
export function InstallBanner({
  state: forced,
  inline = false,
}: {
  state?: InstallState;
  /** 確認用ページで並べて見せる時（浮かせない）。 */
  inline?: boolean;
}) {
  const t = useT();
  const live = useInstallState();
  const state = forced ?? live;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (forced) return setHidden(false);
    // 開いてすぐは出さない（まず画面を見てもらう）。
    const id = window.setTimeout(() => setHidden(installDismissed()), 2500);
    return () => window.clearTimeout(id);
  }, [forced]);
  if (hidden || state.installed || state.platform === "desktop") return null;
  const close = () => {
    dismissInstall();
    setHidden(true);
  };
  return (
    <div
      role="dialog"
      aria-label={t("install.title")}
      className={`install-banner${inline ? " install-banner--inline" : ""}`}
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold">{t("install.bannerTitle")}</p>
          <p className="text-caption text-muted-foreground">{t("install.why")}</p>
        </div>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={close}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2">
        {state.canPrompt ? <InstallButton onDone={close} /> : <Steps state={state} />}
      </div>
    </div>
  );
}
