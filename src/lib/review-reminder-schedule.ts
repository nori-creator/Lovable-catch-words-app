import { Capacitor } from "@capacitor/core";
import { getUiLang, tStatic } from "@/lib/i18n";
import { fitsReaderLanguage } from "@/lib/meaning-language";
import { learningLanguageName } from "@/lib/place-reminder";
import type { PlannedReminder } from "@/lib/review-reminder";
import { CAUGHT_AGO_KEY, caughtAgoAt } from "@/lib/resurface";
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
 * - 撮った語: 題「〇〇前に撮ったこの単語、覚えてる？」＋写真（オーナー指示 2026-10-07
 *   「〇〇前に撮ったのこの単語覚えてる？に通知の名前を変えて」）。「〇〇前」は**鳴る時刻**
 *   から数える（`caughtAgoAt(quiz.caught_at, p.at)`）— 予約は先 24 時間ぶんなので、
 *   今から数えると鳴った時に1日ずれる。撮った時刻が読めなければ「これ、台湾華語で言える？」。
 * - 写真の無い語（文字から作った語）: 題「『意味』、台湾華語で言える？」。意味が
 *   表示言語と合わない時は問いを作れないので、語数の文に戻る。
 * - 本文は「押すと、この単語から復習が始まります」。押すとその語が1問目に出て、続けて
 *   今日の復習へ（`sticker_id` → `/review?sticker=…`）。束は予約する前に用意してある
 *   （`ReviewReminderWatcher` → `review-prepare.ts`）ので「準備中…」は出ない。
 * - 1問の語が無い（時が来る語が無い・用意できなかった）時は、前と同じ語数の文。
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
      const ago = caughtAgoAt(quiz.caught_at, p.at.getTime());
      return {
        title: ago
          ? tStatic(CAUGHT_AGO_KEY[ago.unit], { n: ago.n })
          : tStatic("remind.quizPhoto", { lang }),
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
  /**
   * **語の数は文に入れない**（PRODUCT.md「Never present review backlog as debt」、
   * ARCHITECTURE.md › No to-do counts、2026-10-03）。「7語あります」「12語が忘れかけ」は
   * 溜まった宿題に見える。数は「時が来た語があるか」の判断にだけ使い、文は1分だけの誘い。
   */
  if (n <= 0) return { title, body: tStatic("remind.bodyEmpty") };
  if (p.reason === "srs") return { title, body: tStatic("remind.bodySrs") };
  return { title, body: tStatic("remind.body") };
}

export async function applyReminderSchedule(
  plan: PlannedReminder[],
  dueTimes: Date[],
  quiz: ReminderQuiz | null = null,
): Promise<void> {
  /**
   * **その語を名指しするのは、いちばん早い1件だけ**（Codex 指摘 2026-10-07）。用意して
   * ある名指しの束は1つで、その語から1回復習すれば捨てる（`dropTargetedReview`）。全部の
   * 通知に同じ語を付けると、2件目以降は束の無い・もう答えた語を約束してしまう。残りは
   * いつもの文で `/review` へ。
   */
  const items = plan.slice(0, ID_COUNT).map((p, i) => ({
    id: ID_BASE + i,
    at: p.at,
    ...reminderMessage(p, dueCountAt(p.at, dueTimes), i === 0 ? quiz : null),
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
