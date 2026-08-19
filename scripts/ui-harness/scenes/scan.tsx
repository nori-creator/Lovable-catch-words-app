/**
 * 語の印を押したときに出る札。**scan の中でいちばん読む所**。
 *
 * `scan.tsx` は「カメラ依存」として丸ごと未検査だったが、`<video>` は
 * **1箇所だけ**で、しかも撮る前の枝の中。撮った後の面は静止画の上に描かれる。
 * ここは素の Tailwind の番号がいちばん密に残っている所でもある(72箇所)。
 */
import { ScanChip, ScanFoundList, ScanNothingFound } from "@/routes/_authenticated/scan";

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

/**
 * 見つかった語の一覧。**3通りの出会い方を必ず1つずつ入れる** —
 * どれか欠けると、その印は一度も撮られない。
 *
 * ガラスのシートは撮った写真の上に乗るので、**下に写真を敷いて撮る**。
 * 白い地の上で撮ると、半透明の面が実際より読みやすく写る。
 */
export function ScanFoundScene() {
  const items = [
    {
      id: "d1",
      kind: "object",
      headword: "珍珠奶茶",
      zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
      pinyin: "zhēn zhū nǎi chá",
      meaning_ja: "タピオカミルクティー",
      pos: "N",
      point: [0.3, 0.4],
      confidence: 0.92,
      alternatives: [],
    },
    {
      id: "d2",
      kind: "object",
      headword: "杯子",
      zhuyin: "ㄅㄟ ㄗ˙",
      pinyin: "bēi zi",
      meaning_ja: "コップ",
      pos: "N",
      point: [0.6, 0.5],
      confidence: 0.8,
      alternatives: [],
    },
    {
      id: "d3",
      kind: "object",
      headword: "吸管",
      zhuyin: "ㄒㄧ ㄍㄨㄢˇ",
      pinyin: "xī guǎn",
      meaning_ja: "ストロー",
      pos: "N",
      point: [0.5, 0.7],
      confidence: 0.7,
      alternatives: [],
    },
  ] as never[];
  // 出会い方は `owned` の中身で決まる:
  //   写真あり → 「持っている」 / 写真なし → 「再会」 / 載っていない → 「はじめて」
  const ctx = {
    owned: {
      杯子: { has_photo: true },
      吸管: { has_photo: false },
    },
    tappedSet: new Set<string>(),
  } as never;
  return (
    <div
      className="min-h-[60vh] rounded-3xl p-4"
      style={{ background: "linear-gradient(160deg,#3a2c1e,#7a5a3a)" }}
    >
      <ScanFoundList items={items} scanCtx={ctx} onOpen={() => {}} />
    </div>
  );
}

/** 撮ったのに何も見つからなかった面。写真の上に乗るので下に地を敷く。 */
export function ScanNothingScene() {
  return (
    <div
      className="min-h-[40vh] rounded-3xl p-4"
      style={{ background: "linear-gradient(160deg,#3a2c1e,#7a5a3a)" }}
    >
      <ScanNothingFound />
    </div>
  );
}
