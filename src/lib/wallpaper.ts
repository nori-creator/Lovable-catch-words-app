/**
 * ホームの**壁紙**（写真を貼る壁の種類）。
 *
 * （オーナー指示 2026-09-23「いろんな壁紙の種類をユーザーが選べるようにしたい。
 *  前のようにホームの上に壁紙の種類別に丸で表示するのはダサいからやめて。
 *  実際の紙のような壁紙やホームアルバムのノートのような壁紙、実際の壁のような
 *  壁紙、絵画の額、画鋲で刺すような壁の壁紙など」）
 *
 * 選ぶ所は設定（大きな見本の札で選ぶ）。ホームには選ぶ物を置かない。
 * **留め方も壁に合わせる**: コルクは画鋲、実際の壁はマスキングテープ、
 * 紙・ノート・額はテープと四隅の三角（`collage-decor.ts`）。
 *
 * 保存は端末ごと（`localStorage` の `album-bg`。前の版と同じ鍵なので、
 * 前に選んだ地はそのまま残る）。
 */
export type WallId = "paper" | "notebook" | "wall" | "frame" | "cork";

export const WALLPAPERS: ReadonlyArray<{ id: WallId; labelKey: string; className: string }> = [
  { id: "paper", labelKey: "home.bgPaper", className: "album-bg-paper" },
  { id: "notebook", labelKey: "home.bgNotebook", className: "album-bg-notebook" },
  { id: "wall", labelKey: "home.bgWall", className: "album-bg-wall" },
  { id: "frame", labelKey: "home.bgFrame", className: "album-bg-frame" },
  { id: "cork", labelKey: "home.bgCork", className: "album-bg-cork" },
];

export const WALLPAPER_KEY = "album-bg";
export const WALLPAPER_EVENT = "album-bg-changed";

export function parseWallpaper(v: unknown): WallId {
  return WALLPAPERS.some((w) => w.id === v) ? (v as WallId) : "paper";
}

export function wallClass(id: WallId): string {
  return WALLPAPERS.find((w) => w.id === id)?.className ?? "album-bg-paper";
}

export function readWallpaper(): WallId {
  try {
    return parseWallpaper(window.localStorage.getItem(WALLPAPER_KEY));
  } catch {
    return "paper";
  }
}

export function saveWallpaper(id: WallId): void {
  try {
    window.localStorage.setItem(WALLPAPER_KEY, id);
    window.dispatchEvent(new CustomEvent(WALLPAPER_EVENT));
  } catch {
    /* 保存できなくても、この画面の見た目は変える */
  }
}

/** 選択子から壁の種類へ（`DayCollage` は選択子で受け取っている）。 */
export function wallFromClass(className: string | undefined): WallId {
  return WALLPAPERS.find((w) => w.className === className)?.id ?? "paper";
}
