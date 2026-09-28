import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAlbumHidden, setAlbumHidden } from "./album-hidden.functions";

/**
 * **ホームのアルバムから外した写真の集合**（2026-09-28）。サーバの印
 * （`album_hidden`）と、サーバに書けなかった時に端末へ覚えた印を合わせる。
 * 外す・戻すはすぐ画面に効かせ（先に表示を変える）、保存は後ろで行う。
 */
const LOCAL_KEY = "album-hidden-v1";

export function readLocalHidden(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeLocalHidden(ids: Iterable<string>): void {
  try {
    globalThis.localStorage?.setItem(LOCAL_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // 覚えられない端末でも、この場の表示は変わる。
  }
}

/** 外す／戻す（純粋な計算。集合を返す）。 */
export function toggleHidden(set: ReadonlySet<string>, id: string, hidden: boolean): Set<string> {
  const next = new Set(set);
  if (hidden) next.add(id);
  else next.delete(id);
  return next;
}

export function useAlbumHidden() {
  const qc = useQueryClient();
  const list = useServerFn(listAlbumHidden);
  const save = useServerFn(setAlbumHidden);
  // 描くたびに新しい集合を作らない（作ると、受け取る側の useMemo が毎回走り直し、
  // アルバムが描き直しを繰り返して長押しも効かなくなる）。
  const localInit = useMemo(() => new Set(readLocalHidden()), []);
  const { data } = useQuery({
    queryKey: ["album-hidden"],
    queryFn: async () => {
      const r = await list();
      return new Set([...r.ids, ...readLocalHidden()]);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: localInit,
  });
  const hidden = data ?? localInit;
  const set = async (id: string, isHidden: boolean) => {
    const before = qc.getQueryData<Set<string>>(["album-hidden"]) ?? hidden;
    qc.setQueryData(["album-hidden"], toggleHidden(before, id, isHidden));
    const local = toggleHidden(new Set(readLocalHidden()), id, isHidden);
    try {
      const r = await save({ data: { sticker_id: id, hidden: isHidden } });
      // サーバに書けたら端末の印は要らない。書けなければ端末に覚える。
      writeLocalHidden(r.saved ? toggleHidden(local, id, false) : local);
    } catch {
      writeLocalHidden(local);
    }
  };
  return {
    hidden,
    hide: (id: string) => set(id, true),
    restore: (id: string) => set(id, false),
  };
}
