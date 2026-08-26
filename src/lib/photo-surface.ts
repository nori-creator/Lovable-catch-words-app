import { useCallback, useEffect, useState } from "react";
import type { PhotoRole } from "./sticker-photo";
import { isPhotoRole } from "./sticker-photo";

/**
 * **どの画面で、その札をどの絵で見せるか。**
 *
 * オーナー指示 2026-08-25:
 * > 「アルバム/単語詳細の画像長押しの『設定に従う』ボタンを削除。
 * >  **アルバムと単語詳細で別々に**種類を選べる。」
 *
 * ## なぜ「別々」が要るか
 * 同じ札でも、見たい絵は画面で違う。アルバムは並べて眺めるので
 * 切り抜きが映えるが、単語の詳細では**その場の空気ごと**思い出したいので
 * 元の写真がいい、ということが普通に起こる。
 * 1つしか選べないと、どちらかを諦めることになる。
 *
 * ## どこに置くか
 * `stickers.hero_role` は**列が1つ**しか無いので、2つの選択を入れられない。
 * 列を足す移行は、この作業場では**当たらないことがある**
 * (`review_mode_hybrid` は1週間当たらなかった)。だから:
 *
 * - **単語の詳細**の選択 … 今までどおり `hero_role`(サーバ、端末をまたぐ)
 * - **アルバム**の選択 … この端末に憶える
 *
 * 詳細の選択は今までと同じように持ち歩ける。アルバムの選択は端末ごとに
 * なるが、**選べなかった物が選べるようになる**ほうが値打ちが大きい。
 * (列を足せる日が来たら、下の `resolveSurfaceRole` はそのまま使える。)
 */

/** 絵を出す画面。 */
export type PhotoSurface = "album" | "detail";

const KEY = "photo-surface-role-v1";
const EVENT = "photo-surface-role-changed";

export type SurfaceRoleMap = Partial<Record<string, PhotoRole>>;
type Store = SurfaceRoleMap;

/** `album:<id>` の形。画面をまたいで混ざらないようにする。 */
export function surfaceKey(surface: PhotoSurface, stickerId: string): string {
  return `${surface}:${stickerId}`;
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isPhotoRole(v)) out[k] = v;
    }
    return out;
  } catch {
    // 壊れた値で画面を落とさない。**選択が消えるだけ**にする。
    return {};
  }
}

export function getSurfaceRole(surface: PhotoSurface, stickerId: string): PhotoRole | null {
  return readStore()[surfaceKey(surface, stickerId)] ?? null;
}

export function setSurfaceRole(surface: PhotoSurface, stickerId: string, role: PhotoRole) {
  try {
    const store = readStore();
    store[surfaceKey(surface, stickerId)] = role;
    localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

/**
 * **画面ぜんぶぶんの選択を一度に読む。**
 *
 * アルバムは札を並べて描くので、1枚ごとに `useSurfaceRole` を呼ぶと
 * 札の枚数だけ hook を呼ぶことになる(枚数が変わると React が落ちる)。
 * 束で読んで `surfaceKey` で引く。
 */
export function useSurfaceRoleMap(): SurfaceRoleMap {
  const [map, setMap] = useState<SurfaceRoleMap>(readStore);
  useEffect(() => {
    const h = () => setMap(readStore());
    h();
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return map;
}

/** その画面のその札の選択を読む。他のタブで変えたら追従する。 */
export function useSurfaceRole(surface: PhotoSurface, stickerId: string | null): PhotoRole | null {
  const read = useCallback(
    () => (stickerId ? getSurfaceRole(surface, stickerId) : null),
    [surface, stickerId],
  );
  const [role, setRole] = useState<PhotoRole | null>(read);
  useEffect(() => {
    const h = () => setRole(read());
    h();
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, [read]);
  return role;
}

/**
 * その画面で実際に使う役を決める。**強い順に3つ。**
 *
 * 1. その画面でその札に選んだ物
 * 2. その札の共通の選択(`hero_role`。前からある物なので消さない)
 * 3. 画面の意図(棚は切り抜き、詳細は指定なし)
 */
export function resolveSurfaceRole(input: {
  surfaceRole?: PhotoRole | null;
  heroRole?: string | null;
  screenIntent?: PhotoRole | null;
}): PhotoRole | null {
  if (input.surfaceRole) return input.surfaceRole;
  if (isPhotoRole(input.heroRole)) return input.heroRole;
  return input.screenIntent ?? null;
}
