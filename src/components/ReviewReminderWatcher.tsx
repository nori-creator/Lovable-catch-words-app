import { useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getUpcomingDueTimes } from "@/lib/reviews.functions";
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

export function ReviewReminderWatcher() {
  const fetchDue = useServerFn(getUpcomingDueTimes);
  const refresh = useCallback(
    async (force = false) => {
      if (!force && Date.now() - lastRun < 60_000) return;
      lastRun = Date.now();
      recordAppOpen();
      const prefs = await loadReminderPrefs();
      let dueTimes: Date[] = [];
      if (prefs.mode === "ai" || prefs.mode === "custom") {
        try {
          const res = await fetchDue();
          dueTimes = res.dueTimes.map((s) => new Date(s));
        } catch {
          /* 通信できないときは語数なしの文面で予約する */
        }
      }
      const plan = planReminders(prefs, { dueTimes, opens: readAppOpens() }, new Date());
      await applyReminderSchedule(plan, dueTimes);
    },
    [fetchDue],
  );

  useEffect(() => {
    // 起動直後の読み込みと取り合わないよう、少し待つ。
    const t = setTimeout(() => void refresh(), 3000);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        const h = App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refresh(true);
        });
        cleanup = () => void h.then((x) => x.remove());
      });
    } else if (typeof document !== "undefined") {
      const onVis = () => {
        if (document.visibilityState === "visible") void refresh(true);
      };
      document.addEventListener("visibilitychange", onVis);
      cleanup = () => document.removeEventListener("visibilitychange", onVis);
    }
    return () => cleanup?.();
  }, [refresh]);

  // 設定で変えたらすぐ置き直す（`review-reminder-changed` は設定の画面が出す）。
  useEffect(() => {
    const on = () => void refresh(true);
    window.addEventListener("review-reminder-changed", on);
    return () => window.removeEventListener("review-reminder-changed", on);
  }, [refresh]);

  return null;
}
