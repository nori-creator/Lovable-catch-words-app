import { Capacitor } from "@capacitor/core";
import { getUiLang, tStatic } from "@/lib/i18n";
import { fitsReaderLanguage } from "@/lib/meaning-language";
import { learningLanguageName } from "@/lib/place-reminder";
import type { PlannedReminder } from "@/lib/review-reminder";
import type { ReminderQuiz } from "@/lib/reviews.functions";

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

/**
 * 通知の文面。**写真つきの1問**（オーナー指示 2026-09-28「通知は写真付きで1問だけの
 * タイプにする」）。
 *
 * - 写真のある語: 題「これ、台湾華語で言える？」＋写真（写真そのものが問い）。
 * - 写真の無い語（文字から作った語）: 題「『意味』、台湾華語で言える？」。意味が
 *   表示言語と合わない時は問いを作れないので、語数の文に戻る。
 * - 本文は「押すと1問だけ出ます」。押すとその語から復習が始まる（`sticker_id`）。
 * - 1問の語が無い（時が来る語が無い）時は、前と同じ語数の文。
 */
export function reminderMessage(
  p: PlannedReminder,
  n: number,
  quiz?: ReminderQuiz | null,
): { title: string; body: string; image?: string; stickerId?: string } {
  if (quiz) {
    const lang = learningLanguageName(quiz.headword);
    const meaning = (quiz.meaning_ja ?? "").trim();
    if (quiz.image_url) {
      return {
        title: tStatic("remind.quizPhoto", { lang }),
        body: tStatic("remind.quizBody"),
        image: quiz.image_url,
        stickerId: quiz.sticker_id,
      };
    }
    if (meaning && fitsReaderLanguage(meaning, getUiLang())) {
      return {
        title: tStatic("remind.quizWord", { meaning, lang }),
        body: tStatic("remind.quizBody"),
        stickerId: quiz.sticker_id,
      };
    }
  }
  const title = tStatic("remind.title");
  if (n <= 0) return { title, body: tStatic("remind.bodyEmpty") };
  if (p.reason === "srs") return { title, body: tStatic("remind.bodySrs", { n }) };
  return { title, body: tStatic("remind.body", { n }) };
}

export async function applyReminderSchedule(
  plan: PlannedReminder[],
  dueTimes: Date[],
  quiz: ReminderQuiz | null = null,
): Promise<void> {
  const items = plan.slice(0, ID_COUNT).map((p, i) => ({
    id: ID_BASE + i,
    at: p.at,
    ...reminderMessage(p, dueCountAt(p.at, dueTimes), quiz),
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
          // **スマホのアプリの通知には、まだ写真を付けられない。** 端末の予約通知が
          // 付けられる絵は「端末の中のファイル」だけで、URL は受け付けない（Capacitor
          // の LocalNotifications の説明: 添付は iOS だけ・http の URL は不可）。
          // 付けるには写真を端末に保存する部品（@capacitor/filesystem）が要る。
          // 押すとその1語から（`deep-link.ts` が `/review?sticker=…` にする）。
          extra: it.stickerId ? { sticker_id: it.stickerId } : { route: "/review" },
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
          // `icon` はどの端末でも出る小さい絵、`image` は対応する端末でだけ大きく出る。
          const n = new Notification(it.title, {
            body: it.body,
            tag: `review-${it.id}`,
            ...(it.image ? { icon: it.image, image: it.image } : {}),
          } as NotificationOptions);
          n.onclick = () => {
            window.focus();
            window.location.assign(
              it.stickerId ? `/review?sticker=${encodeURIComponent(it.stickerId)}` : "/review",
            );
          };
        } catch {
          /* 出せない環境では黙る */
        }
      }, wait),
    );
  }
}
