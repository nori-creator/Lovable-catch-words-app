import { useState } from "react";
/**
 * 図鑑のカード表示（カバーフロー）。（オーナー指示 2026-09-22）
 *
 * 絵のある札・字だけの札・場所のある札・記憶の印のある札を混ぜる。
 * `?at=N` で N 枚目を真ん中に送った形（送った途中の傾きも見るため）。
 * `?n=N` で札を N 枚に増やす（何百枚でも送りが引っかからないかを見るため）。
 */
import { DexCoverFlow } from "@/components/DexCoverFlow";
import { DexHeader, DexOverlay } from "@/routes/_authenticated/dex";
import { NO_FILTER } from "@/lib/dex-filter";
import { memoryBadgeMap } from "@/lib/memory-badge";
import { FIXTURES, makeSticker } from "./home";
import { TabBarScene } from "./tabbar";

export function DexCardsScene({ q }: { q: URLSearchParams }) {
  const n = Math.max(FIXTURES.length, Number(q.get("n") ?? 0));
  const items = Array.from({ length: n }, (_, i) =>
    makeSticker(FIXTURES[i % FIXTURES.length], i, i),
  );
  const memory = memoryBadgeMap(
    items.slice(0, 4).map((s, i) => ({
      sticker_id: s.id,
      retention: [96, 70, 40, 100][i],
      interval_days: [3, 1, 1, 30][i],
      ease: 2.5,
    })),
  );
  const at = Number(q.get("at") ?? 0);
  const [theme] = useState<Theme>(THEMES.find((o) => o.key === q.get("theme"))?.key ?? "gallery");
  // 雛形の外枠がもう左右 1rem を空けている（本番の図鑑と同じ）。ここでさらに空けると、
  // カードの輪が左右で切れて見える。
  return (
    <div>
      {/* 実物と同じく、絞り込みと検索を上に重ね、その高さぶん空ける（カードの大きさは
          この残りで決まるので、無いと本番より大きく見えてしまう）。 */}
      <DexOverlay>
        <DexHeader
          found={items.length}
          caught={items.length}
          view="cards"
          onView={() => {}}
          filter={NO_FILTER}
          onFilter={() => {}}
          categories={[]}
          days={[]}
        />
      </DexOverlay>
      <div aria-hidden style={{ height: "var(--dex-overlay-h, 9rem)" }} />
      {/* R15: カードは白・背景は淡い青・台なし・手前で大きく・輪になって回る（参考: パック選びの
          動画）。色の案は白に決まったので選ぶ欄は置かない。ほかの背景は `?theme=stage` などで。 */}
      <DexCoverFlow
        stickers={items}
        onOpen={() => {}}
        memory={memory}
        initialIndex={at}
        theme={theme}
      />
      {/* **本物の下のバー**（R14「図鑑のスライドは下のアイコンのバーに被らせないで」
          「下の小さい画像と…アイコンのバーが被ってる」）。バーを置かないと、
          写真の列がバーの裏に潜っていても、この面では見えない。 */}
      {q.get("bar") !== "0" && <TabBarScene />}
    </div>
  );
}

const THEMES = [
  { key: "gallery", label: "白い部屋（本番）" },
  { key: "stage", label: "暗い舞台" },
  { key: "category", label: "B 分類の色" },
  { key: "motion", label: "C 分類の動き" },
  { key: "museum", label: "D 美術館" },
] as const;
type Theme = (typeof THEMES)[number]["key"];
