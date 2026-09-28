import { Capacitor } from "@capacitor/core";
import { tStatic } from "@/lib/i18n";
import type { PlannedReminder } from "@/lib/review-reminder";

/**
 * 決めた予定（`planReminders`）を、実際に端末へ予約する。
 *
 * - スマホのアプリ: `LocalNotifications` に予約（閉じていても鳴る）。前の予約は
 *   同じ番号の範囲をまとめて取り消してから置き直す（開くたびに作り直すため）。
 * - ブラウザ: 閉じている間は鳴らせないので、**開いている間**に来る分だけ
 *   タイマーで出す（`review-reminder.ts` の注）。
 */
const ID_BASE = 910_000;
const ID_COUNT = 6;
let webTimers: number[] = [];

/** その時刻までに時が来ている語の数。 */
export function dueCountAt(at: Date, dueTimes: Date[]): number {
  return dueTimes.filter((d) => d.getTime() <= at.getTime()).length;
}

export function reminderMessage(p: PlannedReminder, n: number): { title: string; body: string } {
  const title = tStatic("remind.title");
  if (n <= 0) return { title, body: tStatic("remind.bodyEmpty") };
  if (p.reason === "srs") return { title, body: tStatic("remind.bodySrs", { n }) };
  return { title, body: tStatic("remind.body", { n }) };
}

export async function applyReminderSchedule(
  plan: PlannedReminder[],
  dueTimes: Date[],
): Promise<void> {
  const items = plan.slice(0, ID_COUNT).map((p, i) => ({
    id: ID_BASE + i,
    at: p.at,
    ...reminderMessage(p, dueCountAt(p.at, dueTimes)),
  }));
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({
        notifications: Array.from({ length: ID_COUNT }, (_, i) => ({ id: ID_BASE + i })),
      });
      if (!items.length) return;
      await LocalNotifications.schedule({
        notifications: items.map((it) => ({
          id: it.id,
          title: it.title,
          body: it.body,
          schedule: { at: it.at, allowWhileIdle: true },
          extra: { route: "/review" },
        })),
      });
    } catch {
      /* 許可が無い・予約できない端末では鳴らさない（設定の画面で理由を出す） */
    }
    return;
  }
  webTimers.forEach((t) => window.clearTimeout(t));
  webTimers = [];
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = Date.now();
  for (const it of items) {
    const wait = it.at.getTime() - now;
    // 開いたままの間に来る分だけ（12時間より先は、次に開いた時に置き直す）。
    if (wait <= 0 || wait > 12 * 60 * 60 * 1000) continue;
    webTimers.push(
      window.setTimeout(() => {
        try {
          new Notification(it.title, { body: it.body, tag: `review-${it.id}` });
        } catch {
          /* 出せない環境では黙る */
        }
      }, wait),
    );
  }
}
