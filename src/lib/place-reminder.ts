/**
 * 場所による思い出し — 「ここで『芒果』撮ったね。覚えてる?」
 *
 * ## 正直に、できること・できないこと
 * **できる**: アプリを開いた/前面に戻した瞬間に現在地を見て、そこで前に
 * 撮った言葉があれば通知と画面上のカードで知らせる。
 *
 * **いまはできない**: アプリを完全に閉じている間に、勝手に場所を見張って
 * 通知を出すこと。これ(バックグラウンドのジオフェンス)には端末で常駐する
 * 仕組みが要り、Capacitor の標準プラグインには含まれていない。
 * 電池の消費も大きく、ストアの審査で「常時位置情報」の説明も求められる。
 * まずは開いた瞬間に効く形で出し、必要になったら常駐版を足す。
 *
 * ## 設計のねらい
 * - 撮った当日に「覚えてる?」と聞いても意味がないので、**1日以上経ったもの**だけ
 * - 同じ場所で何度も鳴ると鬱陶しいので、**1つの言葉につき12時間は再通知しない**
 * - 位置情報は**設定でONにした人だけ**取りに行く。既定はOFF
 */

import { Capacitor } from "@capacitor/core";
import { getUiLang, tStatic } from "@/lib/i18n";

const ENABLED_KEY = "place-reminder-enabled";
const SEEN_KEY = "place-reminder-seen-v1";
/** 同じ言葉を再び知らせるまでの間隔。 */
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type NearbyMemoryLike = {
  sticker_id: string;
  headword: string;
  meaning_ja: string | null;
  location_name: string | null;
  days_ago: number;
  /** 撮った日。文面は「何日前」ではなく**日付**で出す。 */
  taken_at?: string | null;
  distance_m: number;
};

/**
 * 撮った日を「8月1日」の形にする。
 * 日付が読めないときは空文字を返す — **推測で日付を作らない**。
 */
export function takenDateLabel(takenAt: string | null | undefined): string {
  if (!takenAt) return "";
  const d = new Date(takenAt);
  if (Number.isNaN(d.getTime())) return "";
  const locale = getUiLang() === "en" ? "en-US" : "ja-JP";
  try {
    return d.toLocaleDateString(locale, { month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

export function isPlaceReminderEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ENABLED_KEY) === "1";
}

export function setPlaceReminderEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ストレージが使えない環境では単に効かないだけにする */
  }
}

/** 直近で知らせた言葉の記録。{ [sticker_id]: 通知した時刻 } */
function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeSeen(map: Record<string, number>) {
  try {
    // 際限なく増えないよう、古い記録は落とす。
    const now = Date.now();
    const trimmed = Object.fromEntries(
      Object.entries(map).filter(([, t]) => now - t < COOLDOWN_MS * 4),
    );
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    /* noop */
  }
}

/** まだ知らせていない(冷却期間を過ぎた)ものだけに絞る。 */
export function filterUnnotified(items: NearbyMemoryLike[]): NearbyMemoryLike[] {
  const seen = readSeen();
  const now = Date.now();
  return items.filter((m) => {
    const last = seen[m.sticker_id];
    return !last || now - last > COOLDOWN_MS;
  });
}

export function markNotified(items: NearbyMemoryLike[]) {
  const seen = readSeen();
  const now = Date.now();
  for (const m of items) seen[m.sticker_id] = now;
  writeSeen(seen);
}

/**
 * 現在地を取る。
 * スマホアプリのときは Capacitor の仕組み、ブラウザのときは標準のAPIを使う。
 * 許可されていない/取れない場合は null を返す(呼び出し側は静かに諦める)。
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const asked = await Geolocation.requestPermissions();
        if (asked.location !== "granted") return null;
      }
      // 街中で「この店の前」を判定できればよいので、最高精度は要らない。
      // 精度を落とすほうが電池にも優しく、取得も速い。
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 120_000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
      );
    });
  } catch {
    return null;
  }
}

/** 通知の許可を求める。設定でONにした直後にだけ呼ぶ。 */
export async function requestNotificationPermission(): Promise<boolean> {
  return (await requestNotificationPermissionDetailed()).ok;
}

/**
 * 通知の許可を取る。**なぜ失敗したか**まで返す。
 *
 * 以前は false を返すだけだったので、スイッチが黙って戻り「オンにできない」
 * としか分からなかった(2026-08-02の指摘)。実際の原因はほぼ次の3つ:
 *  - unsupported: iOS Safari は**ホーム画面に追加していない**と Notification
 *    自体が存在しない(ブラウザで開いているだけでは絶対にオンにできない)
 *  - denied: 一度拒否すると再要求できない。端末の設定から戻すしかない
 *  - dismissed: ダイアログを閉じられた(もう一度試せば出る)
 */
export type NotificationPermissionResult = {
  ok: boolean;
  reason: "granted" | "unsupported" | "denied" | "dismissed" | "error";
};

export async function requestNotificationPermissionDetailed(): Promise<NotificationPermissionResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === "granted") return { ok: true, reason: "granted" };
      if (perm.display === "denied") return { ok: false, reason: "denied" };
      const asked = await LocalNotifications.requestPermissions();
      return asked.display === "granted"
        ? { ok: true, reason: "granted" }
        : { ok: false, reason: asked.display === "denied" ? "denied" : "dismissed" };
    }
    if (typeof Notification === "undefined") return { ok: false, reason: "unsupported" };
    if (Notification.permission === "granted") return { ok: true, reason: "granted" };
    if (Notification.permission === "denied") return { ok: false, reason: "denied" };
    const res = await Notification.requestPermission();
    return res === "granted"
      ? { ok: true, reason: "granted" }
      : { ok: false, reason: res === "denied" ? "denied" : "dismissed" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * 通知の文面。場所の名前が分かっていればそれを使うほうが思い出しやすい。
 * React の外から呼ばれるので `tStatic` を使う(フックは使えない)。
 */
export function buildMessage(m: NearbyMemoryLike): { title: string; body: string } {
  // **意味は書かない。** 通知そのものが「覚えてる?」という問いなので、
  // 答えを並べたら問いが成り立たない(オーナー指摘
  // 「通知バナーに日本語訳を書いてるけど消して。テストの意味がなくなる」)。
  //
  // 場所も市の名前では言わない。「Taipei City で撮った」は
  // 思い出す手がかりにならない — 思い出す鍵は**いつ**のほう。
  // 撮った日が読めないときだけ、場所の名前に落ちる。
  const date = takenDateLabel(m.taken_at);
  const body = date
    ? tStatic("place.caughtOn", { date })
    : m.location_name
      ? tStatic("place.caughtAt", { name: m.location_name })
      : tStatic("place.caughtHereShort");
  return {
    title: tStatic("place.rememberBefore") + m.headword + tStatic("place.rememberAfter"),
    body,
  };
}

/** 実際に通知を出す。 */
export async function notifyMemory(m: NearbyMemoryLike): Promise<void> {
  const { title, body } = buildMessage(m);
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            // 同じ言葉で重複しないよう、IDは sticker_id から作る。
            id: hashId(m.sticker_id),
            title,
            body,
            // すぐ出す。
            schedule: { at: new Date(Date.now() + 500) },
            extra: { sticker_id: m.sticker_id },
          },
        ],
      });
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, tag: m.sticker_id });
    }
  } catch {
    /* 通知が出せなくても、画面上のカードは出るので致命的ではない */
  }
}

/** 文字列のIDを、通知に使える 32bit の整数に潰す。 */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}
