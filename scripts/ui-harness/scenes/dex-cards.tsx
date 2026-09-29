import { useState } from "react";
/**
 * 図鑑のカード表示（カバーフロー）。（オーナー指示 2026-09-22）
 *
 * 絵のある札・字だけの札・場所のある札・記憶の印のある札を混ぜる。
 * `?at=N` で N 枚目を真ん中に送った形（送った途中の傾きも見るため）。
 * `?n=N` で札を N 枚に増やす（何百枚でも送りが引っかからないかを見るため）。
 */
import { DexCoverFlow } from "@/components/DexCoverFlow";
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
  const [theme, setTheme] = useState<Theme>(
    THEMES.find((o) => o.key === q.get("theme"))?.key ?? "stage",
  );
  return (
    <div className="px-4">
      {/* 背景の案（2026-09-27「カテゴリー別の背景やアニメの案を複数」）。
          A が本番の既定。ほかは押して見比べる。 */}
      <div
        role="radiogroup"
        aria-label="背景の案"
        style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 0 8px" }}
      >
        {THEMES.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={theme === o.key}
            onClick={() => setTheme(o.key)}
            style={{
              minHeight: 44,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: theme === o.key ? "#0a84ff" : "rgba(255,255,255,0.8)",
              color: theme === o.key ? "#fff" : "#111",
              fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
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
  { key: "stage", label: "暗い舞台（本番）" },
  { key: "gallery", label: "白い展示室" },
  { key: "category", label: "B 分類の色" },
  { key: "motion", label: "C 分類の動き" },
  { key: "museum", label: "D 美術館" },
] as const;
type Theme = (typeof THEMES)[number]["key"];
