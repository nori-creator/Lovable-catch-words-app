/**
 * 語の印を押したときに出る札。**scan の中でいちばん読む所**。
 *
 * `scan.tsx` は「カメラ依存」として丸ごと未検査だったが、`<video>` は
 * **1箇所だけ**で、しかも撮る前の枝の中。撮った後の面は静止画の上に描かれる。
 * ここは素の Tailwind の番号がいちばん密に残っている所でもある(72箇所)。
 */
import { ScanChip } from "@/routes/_authenticated/scan";

const BASE = {
  headword: "珍珠奶茶",
  zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
  pinyin: "zhēn zhū nǎi chá",
  meaning: "タピオカミルクティー",
  pos: "N",
  verified: true,
  candidates: [] as string[],
  expanding: false,
  canExpand: true,
  onPickCandidate: () => {},
  onPlay: () => {},
  onExpand: () => {},
  onCatch: () => {},
  onClose: () => {},
};

/**
 * 出会い方で見た目が変わる。**3通りとも撮る** —
 * 再会の琥珀は素の番号で書かれているので、暗い面で沈む疑いがある。
 */
export function ScanChipScene({ q }: { q: URLSearchParams }) {
  const v = q.get("variant");
  if (v === "candidates") {
    // 1つに絞れなかったとき。選ばせる面。
    return (
      <ScanChip {...BASE} state="new" foundAt={null} candidates={["奶茶", "飲料", "手搖飲"]} />
    );
  }
  if (v === "owned") {
    return <ScanChip {...BASE} state="owned" foundAt="2026-05-02T09:00:00Z" />;
  }
  if (v === "reunion") {
    return <ScanChip {...BASE} state="reunion" foundAt="2026-05-02T09:00:00Z" />;
  }
  if (v === "expanding") {
    return <ScanChip {...BASE} state="new" foundAt={null} expanding />;
  }
  // まだ持っていない語。**AI生成のときは但し書きが変わる。**
  return <ScanChip {...BASE} verified={false} state="new" foundAt={null} />;
}
