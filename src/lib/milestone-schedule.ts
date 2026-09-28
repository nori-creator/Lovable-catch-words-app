import { Capacitor } from "@capacitor/core";
import { tStatic } from "@/lib/i18n";
import {
  MEMORIAL_HOUR,
  MEMORIAL_MINUTE,
  milestoneToday,
  nextMilestone,
} from "@/lib/milestone-album";

const ID = 920_000;

/**
 * 次の節目の日の 19:30 に「記念アルバムができました」を予約する（スマホのアプリのみ）。
 * 今日が節目でまだ 19:30 前なら今日。開くたびに置き直す（同じ番号で上書き）。
 */
export async function scheduleMilestoneNotification(start: Date, now = new Date()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const today = milestoneToday(start, now);
  const at = (d: Date) => {
    const x = new Date(d);
    x.setHours(MEMORIAL_HOUR, MEMORIAL_MINUTE, 0, 0);
    return x;
  };
  let target: { n: number; at: Date } | null = null;
  if (today && at(now).getTime() > now.getTime()) target = { n: today, at: at(now) };
  else {
    const next = nextMilestone(start, now);
    if (next) target = { n: next.n, at: at(next.date) };
  }
  if (!target) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID,
          title: tStatic("memorial.notifyTitle", { n: target.n }),
          body: tStatic("memorial.notifyBody", { n: target.n }),
          schedule: { at: target.at, allowWhileIdle: true },
          extra: { route: `/home?memorial=${target.n}` },
        },
      ],
    });
  } catch {
    /* 通知が許可されていなければ鳴らない（ホームの記念アルバムは出る） */
  }
}
