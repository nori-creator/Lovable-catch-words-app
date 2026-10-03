/**
 * **記憶の状態のデザイン案を見比べる場面**（本番は未変更）。
 *
 * > オーナー指示 2026-10-02「記憶の状態のグラフのデザイン案を複数提案して。」
 * > （いまの復習タブ上部の帯・一覧・折れ線が見づらい）
 *
 * 上の切り替えで「現在」（本番の `ReviewSessionHeader` そのもの）と案 A〜D を同じデータで
 * 描く。開いた面 / 畳んだ面、明るい / 暗いも切り替えられる（`?v=a&open=0&theme=dark`）。
 *
 * **畳んだ面も見せる。** 本番ではこの面の下に4択の問題が続くので、畳んだ時の高さと
 * 読みやすさが毎回の復習に効く（開くのは押した時だけ）。
 *
 * データは `memory-designs-fixture.ts`（画面写しに寄せた決まった値）。
 * ※「現在」の折れ線の日付だけは本番の部品が端末の今日を使う。
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ReviewHeader, ReviewSessionHeader } from "@/components/screens/ReviewScreen";
import {
  MemoryDesignA,
  MemoryDesignB,
  MemoryDesignC,
  MemoryDesignD,
  type MemoryDesignProps,
} from "@/components/memory-designs";
import { buildMemoryDesignsFixture, MEMORY_DESIGNS_NOW } from "./memory-designs-fixture";

type Variant = "current" | "a" | "b" | "c" | "d";
/** `label` は切り替えの札（1行に5つ並ぶ短さ）、`name` は説明の頭に付ける案の名前。 */
const VARIANTS: Array<{ key: Variant; label: string; name: string; idea: string }> = [
  {
    key: "current",
    label: "現在",
    name: "現在（本番・2026-10-02 改良）",
    idea: "現行をベースに改良したもの。見出しの「0 / 10」などの数は出さない。全体の折れ線は1色のままで、地を記憶の段の帯（薄れぎみ・覚えている・はっきり）に分け、縦軸はデータのある所へ寄せる。過去の線は今までどおりなめらかに辿れる。",
  },
  {
    key: "a",
    label: "A 予定",
    name: "A 予定で見る",
    idea: "今日・明日・2〜7日後に何語の復習が来るかを、数と14日の棒で。「次に何をするか」が一目で分かる／どれだけ覚えているかは札の色でしか分からない。",
  },
  {
    key: "b",
    label: "B 数字",
    name: "B ひとつの数字",
    idea: "全体の記憶率 94% を主役に、段の内訳と薄れはじめた語だけを添える。いちばん短く読める／平均なので、語ごとの「いつ」は見えない。",
  },
  {
    key: "c",
    label: "C 一覧",
    name: "C 急ぐ順の一覧",
    idea: "語を次の復習の日の順に並べ、棒に復習どき（90%）の印、右に「あと3日」。どの語がいつ危ないか分かる／一覧が長く、全体の傾向は見えない。",
  },
  {
    key: "d",
    label: "D 曲線",
    name: "D 曲線を読みやすく",
    idea: "全体の線を記憶の段の色の帯の上に描き、予測は灰色の点線と地で分ける。これから下がる様子が分かる／平均の線なので、今日やることに直結しない。",
  },
];

const isVariant = (v: string | null): v is Variant => VARIANTS.some((x) => x.key === v);

/** 見比べの帯の見た目（Tailwind は `src` しか走査しないので、ここは素の style）。 */
const pill = (on: boolean): CSSProperties => ({
  padding: "8px 12px",
  minHeight: 36,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: on ? "var(--foreground)" : "var(--card)",
  color: on ? "var(--background)" : "var(--foreground)",
  fontSize: 13,
  fontWeight: on ? 700 : 500,
  whiteSpace: "nowrap",
});

export function MemoryDesignsScene({ q }: { q: URLSearchParams }) {
  const fixture = useMemo(buildMemoryDesignsFixture, []);
  const [variant, setVariant] = useState<Variant>(() => {
    const v = q.get("v");
    return isVariant(v) ? v : "a";
  });
  const [open, setOpen] = useState(q.get("open") !== "0");
  const [dark, setDark] = useState(
    q.get("theme") === "dark" || document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  // 選んだ状態を URL に残す（そのまま人に送れる）。
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("scene", "memory-designs");
    url.searchParams.set("v", variant);
    url.searchParams.set("open", open ? "1" : "0");
    if (dark) url.searchParams.set("theme", "dark");
    else url.searchParams.delete("theme");
    history.replaceState(null, "", url);
  }, [variant, open, dark]);

  const props: MemoryDesignProps = {
    words: fixture.words,
    series: fixture.series,
    expanded: open,
    onToggle: () => setOpen((o) => !o),
    onOpenWord: () => {},
    nowMs: MEMORY_DESIGNS_NOW,
  };
  // 見出しには数を出さない（オーナー指示 2026-10-02）。
  const header = { progress: 0 };
  const current = VARIANTS.find((v) => v.key === variant)!;

  return (
    <>
      {/* ---- 見比べの操作（検査の対象ではない） ---- */}
      <div
        data-harness-chrome=""
        style={{
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px dashed var(--border)",
          color: "var(--foreground)",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 6 }}>
          記憶の状態のデザイン案（同じ135語のデータ）
        </div>
        <div role="tablist" aria-label="デザイン案" style={{ display: "flex", gap: 6 }}>
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={variant === v.key}
              onClick={() => setVariant(v.key)}
              style={{ ...pill(variant === v.key), flex: 1, padding: "8px 4px" }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55 }}>
          <b>{current.name}</b> — {current.idea}
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button onClick={() => setOpen((o) => !o)} style={pill(false)}>
            {open ? "畳んだ形を見る" : "開いた形を見る"}
          </button>
          <button onClick={() => setDark((d) => !d)} style={pill(false)}>
            {dark ? "明るい画面" : "暗い画面"}
          </button>
        </div>
      </div>

      {/* ---- ここから下が復習タブの上部（本番の見出し＋記憶の面） ---- */}
      {variant === "current" ? (
        <ReviewSessionHeader
          header={header}
          memOverview={{ danger: 0, fuzzy: 0, solid: 0, words: fixture.words }}
          memListOpen={open}
          onToggle={props.onToggle}
          onOpenWord={() => {}}
          series={fixture.series}
          compact={false}
        />
      ) : (
        <section className="mb-4">
          <ReviewHeader {...header} />
          {variant === "a" && <MemoryDesignA {...props} />}
          {variant === "b" && <MemoryDesignB {...props} />}
          {variant === "c" && <MemoryDesignC {...props} />}
          {variant === "d" && <MemoryDesignD {...props} />}
        </section>
      )}
      {/* 畳んだ時は、本番でこの下に続く4択の場所を示す（面の高さの見当が付く）。 */}
      {!open && (
        <div
          aria-hidden
          style={{
            height: 360,
            border: "1px dashed var(--border)",
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            color: "var(--muted-foreground)",
            fontSize: 13,
          }}
        >
          （この下に写真と4択の問題が続きます）
        </div>
      )}
    </>
  );
}
