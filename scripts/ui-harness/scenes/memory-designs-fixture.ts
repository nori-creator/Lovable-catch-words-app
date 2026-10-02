/**
 * 記憶の状態のデザイン案の見本データ（`memory-designs.tsx`）。決まった値。
 *
 * 135語: 薄れぎみ 5・覚えている 67・はっきり 63、全体の今日の値 94%（オーナーの画面写し）。
 * 語ごとの間隔・ease・最後の復習から、本番と同じ式（`stabilityOf` / `forgettingCurve` /
 * `buildRetentionSeries`）で % と前後2週間の線と次の復習の日を作る — 数を手で並べると、
 * 一覧の % と線と予定の日が食い違う。
 * 日付は 2026-10-02 9:00（台湾）に固定する（絵が日によって変わらない）。
 */
import { daysUntilRetention, forgettingCurve, stabilityOf } from "@/lib/srs";
import { buildRetentionSeries, type RetentionEvent } from "@/lib/retention-series";
import type { MemoryWord } from "@/lib/reviews.functions";
import type { MemoryDesignProps } from "@/components/memory-designs";

const DAY = 86_400_000;
export const MEMORY_DESIGNS_NOW = Date.parse("2026-10-02T09:00:00+08:00");

/** 決まった乱数（毎回同じ並び）。 */
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

/** 先頭5語はオーナーの画面写しの「薄れぎみ」。 */
const HEADWORDS = (
  "手掌 拿鐵 滷味 蘋果核 焗烤 保溫瓶 珍珠奶茶 夜市 捷運 雨傘 蘋果 咖啡 便當 機車 悠遊卡 " +
  "便利商店 鳳梨酥 牛肉麵 小籠包 豆花 蚵仔煎 臭豆腐 雞排 刈包 蘿蔔糕 蛋餅 飯糰 豆漿 油條 燒餅 " +
  "鍋貼 水餃 滷肉飯 米粉 粽子 月餅 湯圓 芒果冰 仙草 愛玉 檸檬 西瓜 香蕉 芭樂 荔枝 龍眼 橘子 " +
  "葡萄 草莓 鉛筆 橡皮擦 筆記本 書包 剪刀 膠帶 眼鏡 手機 充電器 耳機 鍵盤 滑鼠 螢幕 電腦 冷氣 " +
  "電風扇 冰箱 洗衣機 吹風機 牙刷 牙膏 毛巾 肥皂 洗髮精 衛生紙 垃圾桶 拖鞋 枕頭 棉被 窗簾 沙發 " +
  "椅子 桌子 檯燈 時鐘 鏡子 鑰匙 錢包 背包 帽子 外套 襪子 皮帶 手錶 口罩 雨衣 腳踏車 公車 " +
  "計程車 高鐵 紅綠燈 斑馬線 郵筒 招牌 寺廟 公園 溜滑梯 鞦韆 長椅 路燈 樓梯 電梯 手扶梯 盆栽 " +
  "仙人掌 向日葵 櫻花 楓葉 竹子 石頭 貓咪 小狗 鴿子 麻雀 金魚 烏龜 蝴蝶 蜻蜓 螞蟻 蝸牛 彩虹 月亮 " +
  "星星 雲朵 毛筆 茶壺"
).split(" ");

export type Fixture = { words: MemoryWord[]; series: MemoryDesignProps["series"] };

export function buildMemoryDesignsFixture(): Fixture {
  const rand = rng(20261002);
  const pick = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const words: MemoryWord[] = [];
  const cards: Parameters<typeof buildRetentionSeries>[0]["cards"] = [];
  const events: RetentionEvent[] = [];
  // 目標の % の帯と語数（画面写しの内訳）。覚えているの先頭5語は 86〜89%（今日の復習に入る）
  // ので、今日の復習は 薄れぎみ 5 + 5 = 10語（画面写しの「0/10」）。
  const plan: Array<[number, number, number, [number, number]]> = [
    // [語数, %下限, %上限, 間隔の範囲]
    [5, 72, 84, [1, 2]],
    [5, 86, 89, [1, 3]],
    [62, 91, 94.4, [5, 40]],
    [63, 95, 100, [6, 90]],
  ];
  // 薄れぎみの5語は画面写しの並び（手掌 → 焗烤）で、% も低い順に決める。
  const FADING = [72, 74, 76, 79, 82];
  let i = 0;
  for (const [n, rLo, rHi, [iLo, iHi]] of plan) {
    for (let k = 0; k < n; k++, i++) {
      const target = i < FADING.length ? FADING[i] : pick(rLo, rHi);
      const interval = Math.round(pick(iLo, iHi));
      const ease = Math.round(pick(2.2, 2.8) * 100) / 100;
      const stability = stabilityOf(interval, ease);
      // 最後の復習から「目標の % まで落ちた」日数だけ遡った所を最後の復習にする。
      const dt = daysUntilRetention(stability, target / 100);
      const anchor = MEMORY_DESIGNS_NOW - dt * DAY;
      const prevInterval = Math.max(1, Math.round(interval / ease));
      const prevAt = anchor - prevInterval * DAY;
      const takenAt = Math.min(prevAt - DAY, MEMORY_DESIGNS_NOW - pick(16, 60) * DAY);
      const id = `md${i}`;
      const retention = Math.round(100 * forgettingCurve(dt, stability));
      const repetitions = 2 + Math.round(pick(0, 6));
      words.push({
        sticker_id: id,
        headword: HEADWORDS[i % HEADWORDS.length],
        retention,
        interval_days: interval,
        repetitions,
        due_at: new Date(anchor + interval * DAY).toISOString(),
        days_until_forgot: Math.max(0, Math.round(daysUntilRetention(stability, 0.5) - dt)),
        fresh: repetitions <= 2,
        long_term: interval >= 30,
        anchor_at: new Date(anchor).toISOString(),
        stability_days: stability,
        ease,
      });
      cards.push({
        sticker_id: id,
        taken_at: new Date(takenAt).toISOString(),
        ease,
        interval_days: interval,
        last_reviewed_at: new Date(anchor).toISOString(),
      });
      events.push(
        {
          sticker_id: id,
          reviewed_at: new Date(prevAt).toISOString(),
          interval_days_after: prevInterval,
          ease_after: ease,
        },
        {
          sticker_id: id,
          reviewed_at: new Date(anchor).toISOString(),
          interval_days_after: interval,
          ease_after: ease,
        },
      );
    }
  }
  const { series } = buildRetentionSeries({ cards, events, nowMs: MEMORY_DESIGNS_NOW });
  return { words, series };
}
