import { logAppEvent } from "@/lib/metrics.functions";
import { screenOf } from "@/lib/admin-user-stats";

/**
 * **滞在時間と、離れる直前の画面を記録する**（開発者だけの利用者ごとの画面、
 * オーナー指示 2026-09-27「ユーザーのアプリ滞在時間、滞在中の行動、アプリ離脱の前の行動」）。
 *
 * 前面に来たら `session_start`、後ろに回ったら `session_end` と `leave_<画面>`。
 * 記録は種類と時刻だけ（画面の中身・入力した文字は送らない）。
 * 1分以内に戻ってきた時は同じ滞在とみなす（通知を見て戻る等で数が膨らまないように）。
 */
let installed = false;
let hiddenAt = 0;

type Kind =
  | "session_start"
  | "session_end"
  | `leave_${"home" | "dex" | "capture" | "scan" | "review" | "settings" | "other"}`;

function send(kind: Kind) {
  void logAppEvent({ data: { kind } }).catch(() => {});
}

export function installSessionTracker(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  send("session_start");
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      send("session_end");
      send(`leave_${screenOf(location.pathname)}`);
    } else if (Date.now() - hiddenAt > 60_000) {
      send("session_start");
    }
  });
}
