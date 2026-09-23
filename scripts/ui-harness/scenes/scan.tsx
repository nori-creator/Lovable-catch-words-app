import { useState } from "react";
/**
 * 語の印を押したときに出る札。**scan の中でいちばん読む所**。
 *
 * `scan.tsx` は「カメラ依存」として丸ごと未検査だったが、`<video>` は
 * **1箇所だけ**で、しかも撮る前の枝の中。撮った後の面は静止画の上に描かれる。
 * ここは素の Tailwind の番号がいちばん密に残っている所でもある(72箇所)。
 */
import {
  ScanCameraControls,
  ScanChip,
  ScanDots,
  ScanNothingFound,
} from "@/routes/_authenticated/scan";

const BASE = {
  headword: "珍珠奶茶",
  zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
  pinyin: "zhēn zhū nǎi chá",
  meaning: "タピオカミルクティー",
  pos: "N",
  verified: true,
  candidates: [] as string[],
  onPickCandidate: () => {},
  onPlay: () => {},
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
  // まだ持っていない語。**AI生成のときは但し書きが変わる。**
  return <ScanChip {...BASE} verified={false} state="new" foundAt={null} />;
}

/** 撮ったのに何も見つからなかった面。写真の上に乗るので下に地を敷く。 */
export function ScanNothingScene() {
  return (
    <div
      style={{
        minHeight: 320,
        padding: 16,
        borderRadius: 24,
        background: "linear-gradient(160deg,#3a2c1e,#7a5a3a)",
      }}
    >
      <ScanNothingFound />
    </div>
  );
}

/**
 * 撮った枠の上に印が乗った面。**scan の中心**で、素の Tailwind の番号が
 * いちばん密に残っている所。
 *
 * 出会い方3通りの光と、確信の低い印、文字の印、部品の印を1枚に並べる。
 * **印は写真の上にしか出ない**ので、実物と同じ暗さの地を敷いて撮る —
 * 白地の上で撮ると、白い光が消えて「はじめて」の印だけ写らない。
 */
export function ScanDotsScene() {
  const mk = (
    id: string,
    headword: string,
    point: [number, number],
    confidence: number,
    kind: "object" | "text" = "object",
  ) => ({
    id,
    kind,
    headword,
    zhuyin: "ㄅㄟ ㄗ˙",
    pinyin: "bēi zi",
    meaning_ja: "コップ",
    pos: "N",
    point,
    confidence,
    alternatives: [] as string[],
  });
  const items = [
    mk("d1", "珍珠奶茶", [250, 200], 0.95), // はじめて(白)
    mk("d2", "杯子", [600, 260], 0.9), // 持っている(緑)
    mk("d3", "吸管", [420, 520], 0.88), // 再会(琥珀)
    mk("d4", "冰塊", [760, 620], 0.5), // 確信が低い
    mk("d5", "半糖", [180, 700], 0.9, "text"), // 文字の印
  ] as never[];
  const ctx = {
    owned: { 杯子: { has_photo: true }, 吸管: { has_photo: false } },
    tappedSet: new Set<string>(),
  } as never;
  return (
    <div
      style={{
        position: "relative",
        height: 480,
        width: "100%",
        overflow: "hidden",
        borderRadius: 24,
        background: "linear-gradient(160deg,#2a1f14,#6b4f33)",
      }}
    >
      <ScanDots
        items={items}
        scanCtx={ctx}
        // 実物は枠の大きさから計算する。ここでは枠を固定してあるので
        // 同じ式(1000分率)をそのまま使う。
        dotStyle={(it) => ({ left: (it.point[0] / 1000) * 358, top: (it.point[1] / 1000) * 480 })}
        onOpen={() => {}}
      />
    </div>
  );
}

/**
 * 覗いている最中の面に載る操作 — **前後の切替と倍率。**
 *
 * `<video>` に偽の映像は流せないので、**同じ寸法の暗い面**を敷いて、
 * その上に本物の操作を載せて測る。載せる相手が暗いことが要点で、
 * 白地の上で撮ると当たり判定も対比も別物になる(前に一度やらかしている)。
 */
export function ScanCameraScene({ q }: { q: URLSearchParams }) {
  const noZoom = q.get("nozoom") === "1";
  const v = q.get("variant");
  /**
   * 倍率の目盛りは3通りを撮る（2026-09-15 に縦スライダーから
   * iPhone と同じ丸い粒へ変えた ─ `components/CameraChrome.tsx`）:
   *  ・既定 … ちょうど 2倍。**粒が点いている姿**
   *  ・`wide` … 広角を持つ端末。0.5 の粒が増える
   *  ・`between` … ピンチで刻みの間にいる。**どの粒も点かない**のが正しい
   */
  const [zoom, setZoom] = useState(v === "between" ? 2.4 : v === "wide" ? 0.5 : 2);
  const zoomMin = v === "wide" ? 0.5 : 1;
  return (
    // 足場はインラインの `style`。雛形にしか無いクラスは生成されない。
    <div style={{ position: "relative", inset: 0, height: "100vh", background: "#111318" }}>
      <ScanCameraControls
        hidden={false}
        facing="environment"
        onFlip={() => {}}
        // 実物は `showZoom={ready}` で常に渡す（`routes/_authenticated/scan.tsx`）。
        // 倍率を1つしか持たない端末では `CameraZoomMeter` 自身が
        // 「押せない `1×` の札」に落とすので、`nozoom=1` は幅の方を潰す。
        showZoom
        zoom={noZoom ? 1 : zoom}
        zoomMin={noZoom ? 1 : zoomMin}
        zoomMax={noZoom ? 1 : 6}
        // 触れる目盛りとして撮る（main で入った小数点の倍率メーター）。
        onZoom={setZoom}
      />
    </div>
  );
}
