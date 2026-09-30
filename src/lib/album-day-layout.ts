/**
 * **1日のアルバムの置き方を決める計算**（ホームの `DayCollage` と、本棚の本の左ページが
 * **同じ1つ**を使う。オーナー指示 2026-09-30「日記の写真が表示されるアルバム、ユーザーが
 * ホームで配置した写真の大きさ向きのように…そのまま再現して日記の左側に置いて」）。
 *
 * 前は `home.tsx` の中に在り、本の左ページ（canvas の絵）は別の升目で写真を並べていた。
 * 計算を2つ持つと、片方を直した日に静かに食い違う。ここに1本だけ置く。
 *
 * 入るのは**画面に触らない値だけ**: 札の情報・写真の縦横比・台紙の幅（px）。
 * 台紙の幅は「px で決まっている字の高さ」を割合に直すのに要る。
 */
import { resolvePrefer, type PhotoPref } from "@/lib/photo-pref";
import { resolveSurfaceRole, surfaceKey, type SurfaceRoleMap } from "@/lib/photo-surface";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import type { StickerWithWord } from "@/lib/stickers.functions";
import {
  avoidFixed,
  boxOf,
  boardHeight,
  collageRatio,
  COLLAGE_COL_W,
  packCollage,
  placeFromCell,
  placementFrom,
  type AlbumSize,
  type Placement,
} from "@/lib/album-place";

/**
 * **大きさの一覧は1本だけにする。**
 * 描画・保存・掴みが同じ並びを見る（2つ持つと、片方を直した日に静かに食い違う）。
 */
export const AUTO_ALBUM_SIZE: readonly AlbumSize[] = [
  "large",
  "portrait",
  "small",
  "landscape",
  "portrait",
  "small",
];

/**
 * 写真がまだ読めていない札・写真の無い札の縦横比。
 * 升目の比（`ratioOf`）をそのまま使うと `portrait` が 2.6 になり、読み込むまで塔のような
 * 枠が並ぶので、少しだけ縦長の写真らしい比に寄せる。
 */
export const PLACEHOLDER_RATIO = 1.2;

/**
 * 写真の下に付く字の高さ（px）。**px で持つ**（字の大きさは px で決まるので、紙が細い画面ほど
 * 同じ一言の行数が増える。割合で取ると細い画面で足りなくなり、次の写真が字に乗る）。
 *   `CAP_ROW_PX`  … 写真の下の白い余白（`--pol-strip` 34px）＋ 一言との間 4px。
 *   `CAP_NOTE_PX` … 手書きの一言 13px × 1.35 × 3行（`-webkit-line-clamp`）＋ 上の間 3px。
 */
export const CAP_ROW_PX = 38;
export const CAP_NOTE_PX = 56;

/** 写真の無い（文字から調べた）語の札の高さ（px）と、指の当たり判定の下限。 */
export const PLAIN_WORD_PX = 32;
export const MIN_TAP_PX = 44;

/** 置き方の計算に要る札の情報（`StickerWithWord` の一部）。 */
export type DayLayoutSticker = {
  id: string;
  caption?: string | null;
  album_order?: number | null;
  album_size?: AlbumSize | null;
  album_x?: number | null;
  album_y?: number | null;
  album_scale?: number | null;
  album_rot?: number | null;
};

export type DayLayoutInput = {
  stickers: readonly DayLayoutSticker[];
  /** その札に貼る写真が在るか（無ければ字だけの札）。 */
  hasHero: (id: string) => boolean;
  /** 読めた写真の縦横比（高さ / 幅）。まだの札は入っていない。 */
  photoRatio: Readonly<Record<string, number>>;
  /** 台紙の幅（px）。測れていなければ 0。 */
  boardW: number;
};

const byOrder = <T extends DayLayoutSticker>(a: T, b: T) =>
  (a.album_order ?? Number.MAX_SAFE_INTEGER) - (b.album_order ?? Number.MAX_SAFE_INTEGER);

/** その札の枠の縦横比。**置き方の計算と描く形で同じ1つの数を使う**（別々だと次の札が字に乗る）。 */
export function dayFrameRatio({
  stickers,
  hasHero,
  photoRatio,
  boardW,
}: DayLayoutInput): (id: string) => number {
  const hasNote = new Map(stickers.map((s) => [s.id, Boolean(s.caption)]));
  // 割るのは**いちばん細い札の幅**（札ごとの幅は `packCollage` の中で `id` から決まる）。
  const narrowest = Math.max(boardW * COLLAGE_COL_W * 0.78, 1);
  return (id: string) => {
    if (hasHero(id)) return collageRatio(photoRatio[id] ?? PLACEHOLDER_RATIO);
    // 細い画面では時刻が語の下の行へ回るぶんを足す。
    const timeLine = narrowest < 130 ? 14 : 0;
    const px = Math.max(PLAIN_WORD_PX + timeLine + (hasNote.get(id) ? CAP_NOTE_PX : 0), MIN_TAP_PX);
    // 台紙をまだ測れていない最初の1枚は、ほどほどの比で場所を取っておく。
    return boardW ? px / narrowest : 0.3;
  };
}

/** 写真の下に足す字のぶん（台紙の幅に対する割合）。字だけの札は枠の中に書くので 0。 */
export function dayExtra(s: DayLayoutSticker, hasHero: boolean, boardW: number): number {
  return hasHero && boardW ? (CAP_ROW_PX + (s.caption ? CAP_NOTE_PX : 0)) / boardW : 0;
}

/**
 * まだ自分で置いていない札の置き場所（誌面の石積み）を決め、**自分で置いて保存した写真を
 * 避ける**（`avoidFixed`）。返すのは「札 id → 置き場所」。
 *
 * `stickers` は**表から届いた並び**（重なり順のために入れ替える `ordered` ではない）。
 * 置き場所は「その札が何番目に撮られたか」で決まるべきで、「さっき誰を触ったか」で
 * 変わってはいけない。
 */
export function settleDayAlbum(input: DayLayoutInput): {
  frameRatio: (id: string) => number;
  settledById: Map<string, Placement>;
} {
  const { stickers, hasHero, boardW } = input;
  const frameRatio = dayFrameRatio(input);
  const base = [...stickers].sort(byOrder);
  const places = packCollage(
    base.map((s) => ({
      id: s.id,
      ratio: frameRatio(s.id),
      extra: dayExtra(s, hasHero(s.id), boardW),
    })),
  );
  const autoById = new Map<string, Placement>();
  base.forEach((s, i) => autoById.set(s.id, places[i]));

  const saved = (s: DayLayoutSticker) => s.album_x != null && s.album_y != null;
  const fixed = stickers.filter(saved).map((s) => {
    const p = placementFrom(
      { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
      autoById.get(s.id) ?? placeFromCell({ col: 0, row: 0 }, "small", s.id),
    );
    return boxOf(p, frameRatio(s.id), dayExtra(s, hasHero(s.id), boardW));
  });
  if (fixed.length === 0) return { frameRatio, settledById: autoById };

  const autos = base.filter((s) => !saved(s) && autoById.has(s.id));
  const settled = avoidFixed(
    autos.map((s) => ({
      place: autoById.get(s.id)!,
      ratio: frameRatio(s.id),
      extra: dayExtra(s, hasHero(s.id), boardW),
    })),
    fixed,
  );
  const settledById = new Map(autoById);
  autos.forEach((s, i) => settledById.set(s.id, settled[i]));
  return { frameRatio, settledById };
}

/** 札の本当の置き方（指で置いた値が在ればそれ、無ければ上の自動）。 */
export function dayPlacement(
  s: DayLayoutSticker,
  settledById: Map<string, Placement>,
  size: AlbumSize,
): Placement {
  return placementFrom(
    { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
    settledById.get(s.id) ?? placeFromCell({ col: 0, row: 0 }, size, s.id),
  );
}

export type DayLayoutItem = {
  id: string;
  place: Placement;
  ratio: number;
  /** 重なりの順（後ろほど上）。 */
  z: number;
};

/**
 * 1日の全体（本棚の本の左ページが使う）。並びは保存した `album_order`。
 * `boardH` は台紙の高さ（幅に対する割合）。
 */
export function layoutDayAlbum(input: DayLayoutInput): { items: DayLayoutItem[]; boardH: number } {
  const { frameRatio, settledById } = settleDayAlbum(input);
  const ordered = [...input.stickers].sort(byOrder);
  const items = ordered.map((s, i) => ({
    id: s.id,
    place: dayPlacement(
      s,
      settledById,
      s.album_size ?? AUTO_ALBUM_SIZE[i % AUTO_ALBUM_SIZE.length],
    ),
    ratio: frameRatio(s.id),
    z: 10 + i,
  }));
  return { items, boardH: boardHeight(items) };
}

/**
 * **アルバムに貼る写真の URL**（無ければ null = 字だけの札）。ホームの `DayCollage` と
 * 本の左ページが**同じ答え**を使う（片方だけ別の絵になると「そのまま再現」にならない）。
 * 長押しで選んだアルバムだけの絵 → 札の主役 → 設定、の順。placeholder は貼らない。
 */
export function albumHeroUrl(
  s: StickerWithWord,
  opts: { surfaceRoles: SurfaceRoleMap; photoPref: PhotoPref; thumb?: boolean },
): string | null {
  return (
    stickerPhotoUrl(s, {
      prefer: resolveSurfaceRole({
        surfaceRole: opts.surfaceRoles[surfaceKey("album", s.id)] ?? null,
        heroRole: s.hero_role,
        screenIntent: resolvePrefer(opts.photoPref, "selfie"),
      }),
      exclude: ["placeholder"],
      thumb: opts.thumb,
    }) ?? null
  );
}
