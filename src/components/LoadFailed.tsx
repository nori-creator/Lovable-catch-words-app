import { RefreshCw, WifiOff } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * 読み込みに失敗したことを伝えて、やり直させる。
 *
 * ## なぜ要るか
 * React Query はエラーのとき `data` が `undefined` になる。`isError` を見て
 * いない画面は、それをそのまま「空」として描いてしまう。実際このアプリでは
 * 4つの画面がそうなっていて、いちばん重いのが復習だった —
 * **200枚溜まっていても「今日の復習はありません」と出る**。ユーザーは
 * 終わったと思ってアプリを閉じる。コレクションが消えたように見える画面も
 * あった(図鑑・ホーム)。
 *
 * 空とエラーは**別の状態**であって、同じ絵で描いてはいけない
 * (apple-design §8: 状態は正直に、回復手段と一緒に出す)。
 *
 * 再試行ボタンを必ず持つ。以前はどの画面にも再取得の手段が無く、
 * ユーザーに残された道はアプリの再起動だけだった。
 */
export function LoadFailed({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void;
  /** 再試行が走っている間はボタンを回す(押した手応えを返す)。 */
  retrying?: boolean;
}) {
  const t = useT();
  // オフラインなら理由が分かっているので、そう言う。
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <div
      role="alert"
      className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm"
    >
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground">
        {offline ? <WifiOff className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
      </span>
      <p className="text-sm font-medium">{offline ? t("err.offlineTitle") : t("err.loadTitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {offline ? t("err.offlineHint") : t("err.loadHint")}
      </p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="lift mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        {t("err.retry")}
      </button>
    </div>
  );
}
