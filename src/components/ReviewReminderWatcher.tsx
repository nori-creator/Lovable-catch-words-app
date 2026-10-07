import { useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDueReviews, getUpcomingDueTimes, type ReminderQuiz } from "@/lib/reviews.functions";
import { prepareTargetedReview } from "@/lib/review-prepare";
import {
  normalizeReminderPrefs,
  planReminders,
  readAppOpens,
  readLocalReminderPrefs,
  recordAppOpen,
  writeLocalReminderPrefs,
  type ReminderPrefs,
} from "@/lib/review-reminder";
import { applyReminderSchedule } from "@/lib/review-reminder-schedule";

/**
 * 復習の通知の予約を、**アプリを開くたび・前面に戻るたび**に作り直す。
 * 画面には何も出さない（`AppShell` に1つだけ置く）。
 *
 * 開いた時刻もここで控える（おまかせの「昨日開いた時刻」の手がかり）。
 */
export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  const local = readLocalReminderPrefs();
  if (local) return local;
  try {
    const { data } = await supabase.auth.getUser();
    const prefs = normalizeReminderPrefs(data.user?.user_metadata?.notification_preferences);
    writeLocalReminderPrefs(prefs);
    return prefs;
  } catch {
    return normalizeReminderPrefs(null);
  }
}

/**
 * `AppShell` は画面ごとに作り直されるので、画面を移るたびに置き直さないよう
 * 1分は間を空ける（設定を変えたときだけは即座に）。
 */
let lastRun = 0;

/** 通知が鳴ってから押されるまでの猶予（この間は用意した束をそのまま出す）。 */
export const TAP_GRACE_MS = 12 * 60 * 60_000;

export function ReviewReminderWatcher() {
  const fetchDue = useServerFn(getUpcomingDueTimes);
  const fetchReview = useServerFn(getDueReviews);
  const refresh = useCallback(
    async (force = false) => {
      if (!force && Date.now() - lastRun < 60_000) return;
      lastRun = Date.now();
      recordAppOpen();
      const prefs = await loadReminderPrefs();
      let dueTimes: Date[] = [];
      let quiz: ReminderQuiz | null = null;
      if (prefs.mode === "ai" || prefs.mode === "custom") {
        try {
          const res = await fetchDue();
          dueTimes = res.dueTimes.map((s) => new Date(s));
          quiz = res.quiz ?? null;
        } catch {
          /* 通信できないときは語数なしの文面で予約する */
        }
      }
      const plan = planReminders(prefs, { dueTimes, opens: readAppOpens() }, new Date());
      /**
       * **通知を出す前に、その語から始まる復習を用意する**（オーナー指示 2026-10-07
       * 「通知を出すときは復習の画面を用意してからにして」「通知をタップしたらすぐに
       * 問題出るようにして。今日の問題を準備中と言う待ち時間無しで」）。
       *
       * 端末の予約通知は**鳴る時にこちらのコードが動かない**（題も行き先も予約した時に
       * 決まる）。だから「出す前に用意」＝「予約する前に用意」。束（その語が先頭・続きは
       * 普通の復習）を読み、写真を端末へ落とし、書き留めてから予約する。束は1つなので、
       * その語を名指しするのは**いちばん早い通知だけ**（残りはいつもの文で `/review` へ）。
       * 束はその通知の時刻＋`TAP_GRACE_MS` まで使えるようにする（`review-cache.ts` の `until`。上限 48 時間）。
       *
       * 用意できなかった（通信できない・その語の記録が無い）時は、その語を名指しせず
       * いつもの「復習の時間です」で `/review` へ（押しても待たせる約束をしない）。
       */
      if (quiz && plan.length) {
        // 名指しするのはいちばん早い1件だけ（`applyReminderSchedule`）。束はその通知が
        // 鳴ってから押されるまで生かす。
        const first = Math.min(...plan.map((p) => p.at.getTime()));
        const ready = await prepareTargetedReview(fetchReview, quiz.sticker_id, {
          until: first + TAP_GRACE_MS,
        });
        if (!ready) quiz = null;
      }
      await applyReminderSchedule(plan, dueTimes, quiz);
    },
    [fetchDue, fetchReview],
  );

  useEffect(() => {
    // 起動直後の読み込みと取り合わないよう、少し待つ。
    const t = setTimeout(() => void refresh(), 3000);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        const h = App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refresh(true);
        });
        cleanup = () => void h.then((x) => x.remove());
        // 読み込みの途中で外されていたら、ここで外す（残ると画面を移るたびに増える）。
        if (cancelled) cleanup();
      });
    } else if (typeof document !== "undefined") {
      const onVis = () => {
        if (document.visibilityState === "visible") void refresh(true);
      };
      document.addEventListener("visibilitychange", onVis);
      cleanup = () => document.removeEventListener("visibilitychange", onVis);
    }
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [refresh]);

  // 設定で変えたらすぐ置き直す（`review-reminder-changed` は設定の画面が出す）。
  useEffect(() => {
    const on = () => void refresh(true);
    window.addEventListener("review-reminder-changed", on);
    return () => window.removeEventListener("review-reminder-changed", on);
  }, [refresh]);

  return null;
}
