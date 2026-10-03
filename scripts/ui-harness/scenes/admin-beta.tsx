/**
 * 開発者だけ: **ベータの指標**（`/admin/beta`、2026-10-03）。本物の画面の中身
 * （`BetaDashboardView`）に、決まった見本の行を本物の集計（`computeBetaMetrics`）に通した数を
 * 渡して描く（通信・ログイン不要）。乱数の種を固定しているので、開くたびに同じ絵になる。
 *
 * `?scene=admin-beta`（既定は直近30日・表示言語は端末の設定）。`&window=7` で直近7日、
 * `&lang=en` / `&lang=zh-TW` / `&lang=ja` で文字の言語を切り替える。
 */
import { BetaDashboardView } from "@/components/AdminBetaViews";
import { addDays } from "@/lib/admin-user-stats";
import {
  computeBetaMetrics,
  normalizeUnitCosts,
  type BetaMetrics,
  type BetaRawData,
} from "@/lib/beta-metrics";
import { funnelKey, TUTORIAL_STEPS } from "@/lib/funnel-events";
import type { UiLang } from "@/lib/i18n";

const TODAY = "2026-10-03";

/** 種を固定した乱数（mulberry32）。 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 見本: 24 人が 3 週で登録。半分ほどが次の日に戻り、3 割ほどが 1 週後も使う。 */
export function betaFixture(): BetaMetrics {
  const r = rng(20261003);
  const users = Array.from({ length: 24 }, (_, i) => ({
    id: `u${i}`,
    signupDay: addDays(TODAY, -Math.floor((i * 21) / 24) - (i < 3 ? 14 : 0)),
  }));
  const usage: BetaRawData["usage"] = [];
  const catches: BetaRawData["catches"] = [];
  const reviews: BetaRawData["reviews"] = [];
  const latencies: BetaRawData["latencies"] = [];
  const aiRuns: BetaRawData["aiRuns"] = [];
  const runs: BetaRawData["runs"] = [];
  const picks: NonNullable<BetaRawData["picks"]> = [];
  const reviewStates: NonNullable<BetaRawData["reviewStates"]> = [];
  const shadow: NonNullable<BetaRawData["shadow"]> = [];
  const stay = users.map(() => r());
  users.forEach((u, i) => {
    for (let d = 0; d <= 40; d++) {
      const day = addDays(u.signupDay, d);
      if (day > TODAY) break;
      const keep = d === 0 ? 1 : stay[i] * Math.pow(0.93, d);
      if (r() > keep) continue;
      const add = (kind: string, n = 1) => {
        for (let k = 0; k < n; k++) usage.push({ user_id: u.id, kind, day });
      };
      add("app_open");
      add("camera_open");
      const shots = 1 + Math.floor(r() * 3);
      add("shutter", shots);
      add("scan_detect", shots);
      add("candidates_shown", shots);
      for (let k = 0; k < shots; k++)
        latencies.push({ user_id: u.id, day, ms: 2200 + Math.round(r() * 4200) });
      const saved = Math.max(0, shots - (r() < 0.3 ? 1 : 0));
      add("candidate_picked", saved);
      add("meaning_shown", saved);
      add("card", saved);
      add("first_audio_played", saved);
      add("tts", saved * 2);
      add("catch_started", saved);
      add("catch_saved", saved);
      for (let k = 0; k < saved; k++) {
        catches.push({ user_id: u.id, day });
        // 写真の候補の何番目を選んだか（1番目が多く、たまに母語で調べ直す）。
        const x = r();
        picks.push(
          x < 0.12
            ? { user_id: u.id, day, via: "native_search", rank: 1, n: 1 }
            : { user_id: u.id, day, via: "photo", rank: x < 0.62 ? 1 : x < 0.85 ? 2 : 4, n: 5 },
        );
        latencies.push(
          { user_id: u.id, day, ms: 120 + Math.round(r() * 900), event: "meaning_shown" },
          { user_id: u.id, day, ms: 150 + Math.round(r() * 1600), event: "first_audio_played" },
          { user_id: u.id, day, ms: 700 + Math.round(r() * 2600), event: "catch_saved" },
        );
        // 撮った日のうちに1回目の復習（間隔 1〜20 日）。
        if (r() < 0.8)
          reviewStates.push({
            user_id: u.id,
            sticker_id: `${u.id}-${day}-${k}`,
            at: `${day}T20:00:00+08:00`,
            interval_days: 1 + Math.floor(r() * 20),
          });
      }
      if (d > 0 && r() < 0.7) {
        add("review_started");
        const answers = 4 + Math.floor(r() * 10);
        add("review_answered", answers);
        add("review_session_done");
        const start = Date.parse(`${day}T12:00:00+08:00`);
        for (let k = 0; k < answers; k++)
          reviews.push({ user_id: u.id, at: new Date(start + k * 25_000).toISOString() });
        if (r() < 0.4) aiRuns.push({ user_id: u.id, loop: "review_distractor_pregen", day });
        // 答えごとの見込み（復習の式・Jev の影）と実際の正誤。
        for (let k = 0; k < answers; k++) {
          const truth = 0.35 + r() * 0.6;
          shadow.push({
            task: "recall",
            model: "jev-latest",
            baseline: Math.min(1, truth + 0.1),
            predicted: Math.min(1, Math.max(0, truth + (r() - 0.5) * 0.2)),
            outcome: r() < truth,
            day,
          });
        }
      }
      if (d === 0) {
        add("first_catch_ai", 3);
        for (const action of ["candidates", "card", "lesson"]) {
          const ok = r() > 0.08;
          runs.push({
            source: "member",
            user_id: u.id,
            day,
            ok,
            ms: ok ? 5000 + Math.round(r() * 9000) : 20000,
            action,
          });
        }
      }
      if (d === 3 && r() < 0.35) add("paywall_viewed");
      if (d === 3 && r() < 0.1) add("checkout_started");
    }
  });
  // 管理者（数えない）と匿名の口座（費用だけ「登録前」）。
  usage.push({ user_id: "admin", kind: "card", day: TODAY });
  usage.push({ user_id: "anon1", kind: "first_catch_ai", day: addDays(TODAY, -2) });
  // 登録前のチュートリアル: 段ごとに少しずつ減る。
  const funnelKeys: string[] = [];
  const reach = [1, 0.86, 0.78, 0.66, 0.6, 0.55, 0.47, 0.42, 0.3];
  for (let d = 0; d < 30; d++) {
    const day = addDays(TODAY, -d);
    const sessions = 2 + Math.floor(r() * 4);
    for (let s = 0; s < sessions; s++) {
      const sid = `s${d}x${s}`.padEnd(16, "0");
      const depth = r();
      TUTORIAL_STEPS.forEach((step, k) => {
        if (depth < reach[k]) funnelKeys.push(funnelKey(day, step, sid.replace(/[^0-9a-f]/g, "a")));
      });
      if (d < 14) {
        const ok = r() > 0.12;
        runs.push({
          source: "guest",
          day,
          ok,
          ms: ok ? 4500 + Math.round(r() * 11000) : 20000,
          action: "candidates",
          refunded: !ok && r() < 0.5,
        });
      }
    }
  }
  return computeBetaMetrics({
    today: TODAY,
    users,
    anonIds: ["anon1"],
    usage,
    catches,
    reviews,
    funnelKeys,
    latencies,
    runs,
    aiRuns,
    unitCosts: normalizeUnitCosts({ card: 0.004 }),
    picks,
    reviewStates,
    shadow,
    nowMs: Date.parse(`${TODAY}T12:00:00+08:00`),
  });
}

const FIXTURE = betaFixture();

export function AdminBetaScene({ q }: { q: URLSearchParams }) {
  const lang = q.get("lang");
  const w = q.get("window") === "7" ? 7 : 30;
  return (
    <div className="space-y-3 pb-24">
      <BetaDashboardView
        data={FIXTURE}
        lang={lang === "en" || lang === "zh-TW" || lang === "ja" ? (lang as UiLang) : undefined}
        initialWindow={w}
        onSaveCosts={async () => undefined}
      />
    </div>
  );
}
