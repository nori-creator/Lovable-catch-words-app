import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useCategories } from "@/lib/use-categories";
import { categoryDisplay, stickerCategoryKey } from "@/lib/user-category";
import type { CategoryKey } from "@/lib/category";
import { CategorySheet } from "@/components/CategorySheet";

/**
 * 写真の詳細で、その1枚のカテゴリーを見せて変える札（2026-09-27）。
 * 押すとカテゴリーの一覧が開き、選んだ所へ移る。名前を変える・作るも同じ面で。
 */
export function StickerCategoryChip({
  sticker,
}: {
  sticker: { id: string; shelf_key?: string | null; word: { category_key?: string | null } };
}) {
  const t = useT();
  const qc = useQueryClient();
  const { categories, save, remove, move } = useCategories();
  const [open, setOpen] = useState(false);
  const userKeys = useMemo(() => new Set(categories.map((c) => c.key)), [categories]);
  const current = stickerCategoryKey(sticker, userKeys);
  const d = categoryDisplay(current, categories, (k: CategoryKey) => t(`cat.${k}`));
  // 図鑑で使っているカテゴリー（読み込み済みの一覧から。無ければ空でよい）。
  // 開いたときに読む — 開く前に図鑑が読み直されていても、その時の並びを出す。
  const usedKeys = () => {
    const list = qc.getQueryData<{ items?: Array<Parameters<typeof stickerCategoryKey>[0]> }>([
      "stickers",
    ]);
    return [...new Set((list?.items ?? []).map((s) => stickerCategoryKey(s, userKeys)))];
  };
  return (
    <>
      <button
        type="button"
        className="category-chip press-in mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-footnote font-medium"
        aria-label={`${t("catEdit.change")}: ${d.label}`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>{d.emoji}</span>
        {d.label}
        <ChevronRight aria-hidden className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <CategorySheet
          current={current}
          usedKeys={usedKeys()}
          userCategories={categories}
          onMove={async (key) => {
            await move(sticker.id, key);
            setOpen(false);
          }}
          onSave={save}
          onDelete={remove}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
