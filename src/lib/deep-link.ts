/**
 * **外から開かれたときの行き先**（ウィジェット・通知・リンク）。
 *
 * ウィジェット（オーナー指示 2026-09-27「カメラ検索をすぐ開けるようにしたり、
 * 今日のアルバムの画像をスマホ上で表示できるようにして」）や通知を押すと、
 * アプリは URL か通知の `extra` を受け取る。それを**決まった画面だけ**に
 * 振り分ける（知らない行き先・外のサイトへは飛ばない）。
 *
 * 受け付ける形:
 *   catchwords://capture?mode=search   … 撮る画面（検索 / 写真）
 *   catchwords://scan                  … スキャン
 *   catchwords://review?sticker=<id>   … 復習（その語から）
 *   catchwords://home  /  catchwords://dex
 * `https://<このアプリ>/…` の同じ道も受ける（Android の App Links 用）。
 */
export type DeepLink =
  | { to: "/capture"; search: { mode?: "search" | "photo" } }
  | { to: "/scan"; search: Record<string, never> }
  | { to: "/review"; search: { sticker?: string } }
  | { to: "/home"; search: Record<string, never> }
  | { to: "/dex"; search: Record<string, never> };

export const DEEP_LINK_SCHEME = "catchwords";

/** ウィジェットのボタンが開く URL（ネイティブ側はこの文字列をそのまま使う）。 */
export const WIDGET_LINKS = {
  photo: `${DEEP_LINK_SCHEME}://capture?mode=photo`,
  search: `${DEEP_LINK_SCHEME}://capture?mode=search`,
  scan: `${DEEP_LINK_SCHEME}://scan`,
  review: `${DEEP_LINK_SCHEME}://review`,
  home: `${DEEP_LINK_SCHEME}://home`,
} as const;

const ID = /^[A-Za-z0-9-]{1,64}$/;

export function routeFromUrl(raw: string): DeepLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  // `catchwords://capture` は host が "capture"、`https://x/capture` は path が "/capture"。
  const custom = u.protocol === `${DEEP_LINK_SCHEME}:`;
  if (!custom && u.protocol !== "https:") return null;
  const seg = (custom ? `${u.host}${u.pathname}` : u.pathname)
    .replace(/^\/+|\/+$/g, "")
    .split("/")[0];
  switch (seg) {
    case "capture": {
      const mode = u.searchParams.get("mode");
      return {
        to: "/capture",
        search: mode === "search" || mode === "photo" ? { mode } : {},
      };
    }
    case "scan":
      return { to: "/scan", search: {} };
    case "review": {
      const sticker = u.searchParams.get("sticker");
      return { to: "/review", search: sticker && ID.test(sticker) ? { sticker } : {} };
    }
    case "home":
    case "":
      return { to: "/home", search: {} };
    case "dex":
      return { to: "/dex", search: {} };
    default:
      return null;
  }
}

/**
 * 通知を押したとき。場所の通知は `sticker_id`、復習の通知は `route` を持つ
 * （`place-reminder.ts` / `review-reminder-schedule.ts`）。
 */
export function routeFromNotificationExtra(extra: unknown): DeepLink | null {
  if (!extra || typeof extra !== "object") return null;
  const e = extra as Record<string, unknown>;
  if (typeof e.sticker_id === "string" && ID.test(e.sticker_id))
    return { to: "/review", search: { sticker: e.sticker_id } };
  if (typeof e.route === "string") return routeFromUrl(`${DEEP_LINK_SCHEME}:/${e.route}`);
  return null;
}
