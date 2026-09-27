import { useState } from "react";
import { CategorySheet } from "@/components/CategorySheet";
import { newCategoryKey, type UserCategory } from "@/lib/user-category";

/**
 * **カテゴリーの一覧と編集**（2026-09-27）。写真の詳細の「カテゴリー」の札から
 * 開く面。確認用ページでは保存先が無いので、この場面の中だけで覚える —
 * 押す・作る・名前を変える・消すの動きはそのまま試せる。
 */
export function CategorySheetScene() {
  const [current, setCurrent] = useState<string>("drink");
  const [mine, setMine] = useState<UserCategory[]>([
    { key: "u_trip0001", label: "旅のお土産", emoji: "🎁", room_key: "mine", room_label: "マイ" },
  ]);
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <div style={{ padding: 24 }}>
        <button
          type="button"
          className="category-chip press-in inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-footnote font-medium"
          onClick={() => setOpen(true)}
        >
          {current} を開き直す
        </button>
      </div>
    );
  }
  return (
    <CategorySheet
      current={current}
      usedKeys={["drink", "fruit", "food", "vehicle"]}
      userCategories={mine}
      onMove={async (key) => setCurrent(key)}
      onSave={async ({ key, label, emoji }) => {
        const k = key ?? newCategoryKey(mine.map((m) => m.key));
        setMine((list) => [
          ...list.filter((m) => m.key !== k),
          { key: k, label, emoji, room_key: "mine", room_label: "マイ" },
        ]);
        return k;
      }}
      onDelete={async (key) => {
        setMine((list) => list.filter((m) => m.key !== key));
        if (current === key) setCurrent("drink");
      }}
      onClose={() => setOpen(false)}
    />
  );
}
