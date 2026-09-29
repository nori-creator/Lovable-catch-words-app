import { useState } from "react";
import { CategorySheet } from "@/components/CategorySheet";
import { CategoryMembersSheet, type MemberRow } from "@/components/CategoryMembersSheet";
import { newCategoryKey, type UserCategory } from "@/lib/user-category";

/**
 * **カテゴリーの側から単語を入れる・外す**（オーナー指示 2026-09-28「図鑑のカテゴリーに
 * 入れる単語をユーザーが編集できるようにして。ある単語をあるカテゴリーに追加削除
 * できるようにして」）。
 *
 * 図鑑の「カテゴリーを編集」→ 行を押す（または行の右の ☑ 印）→ 全部の単語に印を付ける面。
 * 最初はいきなり「旅のお土産」の単語選びを開く。閉じると図鑑側の一覧に戻る。
 * 保存先が無いので、この場面の中だけで覚える。
 */
const INITIAL: MemberRow[] = [
  {
    id: "1",
    headword: "珍珠奶茶",
    meaning: "タピオカミルクティー",
    shelf_key: null,
    word: { category_key: "drink" },
    thumb: "/first-catch-cafe.webp",
  },
  {
    id: "2",
    headword: "鳳梨酥",
    meaning: "パイナップルケーキ",
    shelf_key: "u_trip0001",
    word: { category_key: "food" },
  },
  {
    id: "3",
    headword: "貓",
    meaning: "ねこ",
    shelf_key: null,
    word: { category_key: "animal" },
    thumb: "/first-catch-cat.webp",
  },
  {
    id: "4",
    headword: "花",
    meaning: "花",
    shelf_key: null,
    word: { category_key: "plant" },
    thumb: "/first-catch-flower.webp",
  },
  {
    id: "5",
    headword: "茶葉",
    meaning: "茶葉",
    shelf_key: "u_trip0001",
    word: { category_key: "drink" },
  },
  {
    id: "6",
    headword: "捷運",
    meaning: "MRT（地下鉄）",
    shelf_key: null,
    word: { category_key: "vehicle" },
  },
  {
    id: "7",
    headword: "明信片",
    meaning: "ポストカード",
    shelf_key: null,
    word: { category_key: "other" },
  },
];

export function CategoryMembersScene() {
  const [items, setItems] = useState(INITIAL);
  const [mine, setMine] = useState<UserCategory[]>([
    { key: "u_trip0001", label: "旅のお土産", emoji: "🎁", room_key: "mine", room_label: "マイ" },
  ]);
  const [membersKey, setMembersKey] = useState<string | null>("u_trip0001");
  const [open, setOpen] = useState(true);
  return (
    <>
      {open && (
        <CategorySheet
          usedKeys={["drink", "food", "animal", "plant", "vehicle", "other"]}
          userCategories={mine}
          onSave={async ({ key, label, emoji }) => {
            const k = key ?? newCategoryKey(mine.map((m) => m.key));
            setMine((list) => [
              ...list.filter((m) => m.key !== k),
              { key: k, label, emoji, room_key: "mine", room_label: "マイ" },
            ]);
            return k;
          }}
          onDelete={async (key) => setMine((list) => list.filter((m) => m.key !== key))}
          onEditMembers={setMembersKey}
          onClose={() => setOpen(false)}
        />
      )}
      {membersKey && (
        <CategoryMembersSheet
          categoryKey={membersKey}
          items={items}
          userCategories={mine}
          onApply={async (changes) =>
            setItems((list) =>
              list.map((it) => {
                const c = changes.find((x) => x.sticker_id === it.id);
                return c ? { ...it, shelf_key: c.key } : it;
              }),
            )
          }
          onClose={() => setMembersKey(null)}
        />
      )}
      {!open && !membersKey && (
        <button type="button" style={{ margin: 24 }} onClick={() => setOpen(true)}>
          カテゴリーを編集
        </button>
      )}
    </>
  );
}
