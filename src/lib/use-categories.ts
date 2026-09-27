import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyShelves } from "./stickers.functions";
import { deleteMyCategory, saveMyCategory, setStickerCategory } from "./categories.functions";
import { useT } from "./i18n";
import type { UserCategory } from "./user-category";

/**
 * カテゴリーの一覧と、作る・名前を変える・消す・写真を移す（2026-09-27）。
 *
 * 変えたら図鑑（`stickers`）とその人のカテゴリー（`user-shelves`）を読み直す。
 * 図鑑の見出し・絞り込み・棚が、どれも同じ2つから組まれているので。
 */
export function useCategories() {
  const t = useT();
  const qc = useQueryClient();
  const list = useServerFn(listMyShelves);
  const save = useServerFn(saveMyCategory);
  const remove = useServerFn(deleteMyCategory);
  const move = useServerFn(setStickerCategory);
  const { data } = useQuery({
    queryKey: ["user-shelves"],
    queryFn: () => list(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const categories: UserCategory[] = useMemo(() => data?.shelves ?? [], [data]);
  const refresh = async (stickerId?: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["user-shelves"] }),
      qc.invalidateQueries({ queryKey: ["stickers"] }),
      stickerId ? qc.invalidateQueries({ queryKey: ["sticker", stickerId] }) : null,
    ]);
  };
  return {
    categories,
    save: async (input: { key?: string; label: string; emoji: string }) => {
      const r = await save({
        data: {
          ...input,
          room_label: t("catEdit.roomMine"),
          existing: categories.map((c) => c.key),
        },
      });
      await refresh();
      return r.key;
    },
    remove: async (key: string) => {
      await remove({ data: { key } });
      await refresh();
    },
    move: async (stickerId: string, key: string | null) => {
      await move({ data: { sticker_id: stickerId, key } });
      await refresh(stickerId);
    },
  };
}
