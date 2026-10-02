import { useEffect, useState } from "react";
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
import { setReaderMeaningFiller, setReaderMeaningLoader } from "@/lib/reader-meanings";

/**
 * `?reader=1` … 読む人の言語の意味の**本物の道**を通す（オーナー報告 2026-10-02、英語と
 * 繁體中文の両方「図鑑のスライドの見出しの下に意味が出ない」）。札の共有の意味は日本語
 * （`FIXTURES` の `gloss`）。引く問い合わせ（`getReaderMeanings` の代わり）は何も返さず、
 * 埋める問い合わせ（`fillReaderMeanings` の代わり）が下の決まった意味を返す — 本番で
 * その人向けの意味がまだ無い語を、図鑑を開いたときに埋める流れと同じ。
 */
const READER_GLOSS: Record<string, Record<string, string>> = {
  en: {
    珍珠奶茶: "bubble tea",
    夜市: "night market",
    腳踏車: "bicycle",
    芒果: "mango",
    捷運: "MRT",
    雨傘: "umbrella",
    獎學金: "scholarship",
  },
  "zh-TW": {
    珍珠奶茶: "加了粉圓的奶茶",
    夜市: "晚上的市集",
    腳踏車: "自行車",
    芒果: "熱帶水果",
    捷運: "大眾捷運",
    雨傘: "擋雨的傘",
    獎學金: "給學生的獎勵金",
  },
};

export function DexCardsScene({ q }: { q: URLSearchParams }) {
  const n = Math.max(FIXTURES.length, Number(q.get("n") ?? 0));
  const items = Array.from({ length: n }, (_, i) =>
    makeSticker(FIXTURES[i % FIXTURES.length], i, i),
  );
  // 札が描かれる前に差し込む（札の `useEffect` は親より先に走る）。
  useState(() => {
    if (q.get("reader") !== "1") return null;
    const headOf = new Map(items.map((s) => [s.word_id, s.word.headword]));
    setReaderMeaningLoader(async () => ({}));
    setReaderMeaningFiller(async (ids, lang) =>
      Object.fromEntries(
        ids.flatMap((id) => {
          const m = READER_GLOSS[lang]?.[headOf.get(id) ?? ""];
          return m ? [[id, m]] : [];
        }),
      ),
    );
    return null;
  });
  const memory = memoryBadgeMap(
    items.slice(0, 4).map((s, i) => ({
      sticker_id: s.id,
      retention: [96, 70, 40, 100][i],
      interval_days: [3, 1, 1, 30][i],
      ease: 2.5,
    })),
  );
  const at = Number(q.get("at") ?? 0);
  /**
   * `?swap=1` … 開いて少し後に、**奥の方にあった2枚だけ**に絞り込む（R24「カテゴリーを
   * 動物にしたら、カードが最初映らなく、時間差で映る」の再現）。絞り込みで同じ札の
   * 要素が使い回されるので、画面外で隠していた札が隠れたまま残らないかを見る。
   */
  const [shown, setShown] = useState(items);
  const swap = q.get("swap") === "1";
  useEffect(() => {
    if (!swap) return;
    const id = window.setTimeout(() => setShown(items.slice(-2)), 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swap]);
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
        stickers={shown}
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
