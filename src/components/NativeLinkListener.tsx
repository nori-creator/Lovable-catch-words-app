import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "@tanstack/react-router";
import { routeFromNotificationExtra, routeFromUrl, type DeepLink } from "@/lib/deep-link";

/**
 * **通知・ウィジェット・リンクから開かれたら、その画面へ。**（`deep-link.ts`）
 *
 * これまで通知を押してもアプリの最初の画面が開くだけで、場所の通知の
 * 「この語を復習する」にも、復習の通知にも行かなかった。スマホのアプリの
 * 時だけ動く（ブラウザの通知は `Notification` の onclick が無いので対象外）。
 */
export function NativeLinkListener() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const go = (link: DeepLink | null) => {
      if (link) void navigate({ to: link.to, search: link.search as never });
    };
    // `AppShell` は画面ごとに作り直されるので、外し忘れると同じ通知で2回動く。
    // 読み込みの途中で外された時も、読み込み後に必ず外す。
    let cancelled = false;
    const removers: Array<Promise<{ remove: () => Promise<void> }>> = [];
    const keep = (h: Promise<{ remove: () => Promise<void> }>) => {
      if (cancelled) void h.then((x) => x.remove());
      else removers.push(h);
    };
    void import("@capacitor/app").then(({ App }) => {
      keep(App.addListener("appUrlOpen", ({ url }) => go(routeFromUrl(url))));
    });
    void import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      keep(
        LocalNotifications.addListener("localNotificationActionPerformed", (a) =>
          go(routeFromNotificationExtra(a.notification.extra)),
        ),
      );
    });
    return () => {
      cancelled = true;
      removers.forEach((r) => void r.then((h) => h.remove()));
    };
  }, [navigate]);
  return null;
}
