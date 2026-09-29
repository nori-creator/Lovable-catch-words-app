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
    THEMES.find((o) => o.key === q.get("theme"))?.key ?? "gallery",
  );
  const [tone, setTone] = useState<Tone>(TONES.find((o) => o.key === q.get("card"))?.key ?? "blue");
  return (
    <div className="px-4">
      {/* **カードの色の案**（R14「カードと背景が同じ色で見にくい…色のデザイン案だして」）。 */}
      <div
        role="radiogroup"
        aria-label="カードの色の案"
        style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 0 4px" }}
      >
        {TONES.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={tone === o.key}
            onClick={() => setTone(o.key)}
            style={{
              minHeight: 40,
              padding: "0 10px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: tone === o.key ? "#0a84ff" : "#fff",
              color: tone === o.key ? "#fff" : "#111",
              fontWeight: 600,
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: o.swatch,
                boxShadow: "0 0 0 1px rgba(0,0,0,.15)",
              }}
            />
            {o.label}
          </button>
        ))}
      </div>
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
        cardTone={tone}
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

const TONES = [
  { key: "blue", label: "A 淡い青（既定）", swatch: "#eef4ff" },
  { key: "ivory", label: "B 生成り", swatch: "#fbf5e9" },
  { key: "category", label: "C 分類の色", swatch: "#e3f4e8" },
  { key: "ink", label: "D 濃紺の額", swatch: "#16213a" },
] as const;
type Tone = (typeof TONES)[number]["key"];
