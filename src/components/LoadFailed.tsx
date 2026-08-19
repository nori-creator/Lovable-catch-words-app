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
  what,
}: {
  onRetry: () => void;
  /** 再試行が走っている間はボタンを回す(押した手応えを返す)。 */
  retrying?: boolean;
  /**
   * **何が**読み込めなかったか(「今日の復習」「図鑑」など)。
   *
   * 無いと「読み込めませんでした」としか言えず、画面のどこが欠けたのか
   * 分からない(独立監査の指摘)。渡せる所からは渡す。
   */
  what?: string;
}) {
  const t = useT();
  // オフラインなら理由が分かっているので、そう言う。
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <div
      role="alert"
      // 本文は**左揃え・幅を絞る**。中央揃えの日本語は、行末の1〜2文字が
      // 2行目に孤立する(「い。」だけが残る、という事故が3画面で出ていた)。
      className="rounded-3xl border border-border bg-card p-8 shadow-sm"
    >
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground">
        {offline ? <WifiOff className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
      </span>
      {/* **再試行中に「失敗しました」と言い続けない。**
          押したのに画面が依然として失敗を主張していると、押せたのかどうか
          分からず二度三度押すことになる(独立監査の指摘)。
          走っている間は、走っていると言う。 */}
      <p className="text-body font-semibold">
        {retrying
          ? t("err.retryingTitle")
          : offline
            ? t("err.offlineTitle")
            : what
              ? t("err.loadTitleOf", { what })
              : t("err.loadTitle")}
      </p>
      <p className="ja-phrase mt-1 max-w-[22em] text-balance text-body text-muted-foreground">
        {retrying ? t("err.retryingHint") : offline ? t("err.offlineHint") : t("err.loadHint")}
      </p>
      <button
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        // **待っている間こそ薄くしない。** `disabled:opacity-60` を掛けていたので、
        // 再試行中は文字が 2.65:1 まで落ちていた — 押した人がいちばん見ている
        // 瞬間に読めなくなる。手応えは回るアイコンと `aria-busy` が返す。
        className="lift mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? t("err.retrying") : t("err.retry")}
      </button>
    </div>
  );
}
