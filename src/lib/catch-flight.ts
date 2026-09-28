/**
 * **飛んで図鑑に着いた札**の控え（オーナー指示 2026-09-28「図鑑に追加し終わったあとに、
 * 一度図鑑から写真が消えて、また現れてバウンスするアニメーションになってる。そうでは
 * なく追加するアニメーションで着地すると同時に図鑑に追加されるタイミング画像が少し
 * 縮むようなバウンスするアニメーションを一連にして」）。
 *
 * 捕まえた写真が図鑑まで飛ぶ演出（`v5_reward`）が着地を受け持った札は、図鑑の側の
 * 「上から落ちてくる」演出（`.slam-in` / `.reward-slot-in`）をもう走らせない。前は
 * 飛行が終わって目印（`data-reward-flight`）が外れた瞬間や、棚の描き直しのたびに
 * その演出が頭から走り、**着いた写真が一度消えて上から落ち直していた**。
 */
const flown = new Set<string>();

export function markFlown(id: string): void {
  flown.add(id);
}

export function wasFlown(id: string | null | undefined): boolean {
  return !!id && flown.has(id);
}

/** 試験用。 */
export function resetFlownForTest(): void {
  flown.clear();
}
