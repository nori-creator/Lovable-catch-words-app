/**
 * スキャンで選んだ語を、**撮影モードの流れ**へ渡す（端末の中だけ・1回きり）。
 *
 * （オーナー指示 2026-09-23「単語の候補をタップしたら、撮影モードと全く
 *  同じように単語を追加する流れにして」）
 *
 * スキャンは撮った写真と場所をもう持っている。撮影モードの画面
 * （`/capture`）は、写真を撮った後の段（語を選ぶ → カード → 保存の演出、
 * 持っている語なら再会の画面）を全部持っている。**写真を撮り直させずに**、
 * その段から始めるための受け渡し。
 *
 * 画面の移動は同じアプリの中なので、メモリに置くだけでよい（URL に写真を
 * 載せない）。受け取ったら消す — 戻る・再読み込みで同じ語がもう一度
 * 足されないように。古すぎる物（2分）も捨てる。
 */
export type ScanHandoff = {
  image: string;
  headword: string;
  /** 候補の読み・意味（カードを待たずに出すため）。 */
  hint: {
    reading_zhuyin: string;
    pinyin: string;
    meaning_ja: string;
    category_key: string;
  };
  /**
   * 検出が迷った語の別の候補。**2つ以上**あれば、撮影モードの「語を選ぶ」
   * 段から始める（撮影モードと同じ）。
   */
  alternatives: string[];
  loc: { lat: number | null; lng: number | null; name: string | null };
  at: number;
};

const MAX_AGE_MS = 2 * 60_000;
let pending: ScanHandoff | null = null;

export function putScanHandoff(h: Omit<ScanHandoff, "at">, now = Date.now()): void {
  pending = { ...h, at: now };
}

export function takeScanHandoff(now = Date.now()): ScanHandoff | null {
  const h = pending;
  pending = null;
  if (!h || now - h.at > MAX_AGE_MS) return null;
  return h;
}
