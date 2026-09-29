import { useState } from "react";
import { toast } from "sonner";
import { DexCategoryDrag } from "@/components/DexCategoryDrag";
import { DexAlbumGrid, DexList } from "@/routes/_authenticated/dex";
import { FIXTURES, makeSticker } from "./home";

/**
 * **図鑑の単語を長押しで別のカテゴリーへ運ぶ**（R14）。本物の `DexCategoryDrag` と
 * 本物の写真の升目・縦の一覧を使う。移した先はこの画面の中だけで覚える（通信しない）。
 * `?list=1` で縦の一覧。見出しを長押しすると「編集」の知らせが出る（本番では編集の面）。
 */
const CATS = [
  { key: "drink", label: "🧋 飲み物" },
  { key: "town", label: "🏙️ 街" },
  { key: "thing", label: "🧸 物" },
];

export function DexDragScene({ q }: { q: URLSearchParams }) {
  const [where, setWhere] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    FIXTURES.slice(0, 9).forEach((_, i) => (m[`s0-${i}`] = CATS[i % 3].key));
    return m;
  });
  const items = FIXTURES.slice(0, 9).map((f, i) => makeSticker(f, i, 0));
  const list = q.get("list") === "1";
  return (
    <div style={{ padding: "8px 16px 120px" }}>
      <p style={{ fontSize: 13, color: "#6e6e73", margin: "0 0 12px" }}>
        写真を長押し →
        別の分類の上で離すと移ります。分類の見出しを長押しすると名前を変える面が開きます。
      </p>
      <DexCategoryDrag
        onMove={(id, key) => {
          setWhere((w) => ({ ...w, [id]: key }));
          toast(`${CATS.find((c) => c.key === key)?.label} へ移しました`);
        }}
        onEditCategory={(key) => toast(`「${CATS.find((c) => c.key === key)?.label}」を編集`)}
      >
        {CATS.map((c) => {
          const here = items.filter((s) => where[s.id] === c.key);
          return (
            <section
              key={c.key}
              className="dex-cat"
              data-dex-cat={c.key}
              style={{ marginBottom: 20, padding: 4 }}
            >
              <h3
                data-dex-cat-head={c.key}
                style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}
              >
                {c.label} <span style={{ color: "#8e8e93", fontWeight: 400 }}>{here.length}</span>
              </h3>
              {here.length === 0 ? (
                <div style={{ height: 64, borderRadius: 16, border: "1.5px dashed #c7c7cc" }} />
              ) : list ? (
                <DexList items={here} onOpen={() => {}} />
              ) : (
                <DexAlbumGrid items={here} onOpen={() => {}} memory={new Map()} />
              )}
            </section>
          );
        })}
      </DexCategoryDrag>
    </div>
  );
}
