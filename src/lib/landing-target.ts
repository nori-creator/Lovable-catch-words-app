/**
 * **キャッチの絵をどこへ着地させるか**（`effects/catch-landing/v5_reward.ts`）。
 *
 * ## オーナー報告 2026-10-08（文字で調べた語）
 * > 図鑑に追加しても、語がそのカテゴリーへ入っていく動きが無い。
 *
 * 着地先は図鑑のその札のマス目（`#dex-cell-<id>`。図鑑の側が持つ約束で、
 * ここでは**変えない**）。ただしマス目がまだ描かれていない回がある —
 * 一覧の読み直しが遅い・リスト表示・まだ並んでいない。前はそこで5秒待ってから
 * **淡く消えて終わり**で、図鑑に入ったように見えなかった。
 *
 * 探す順:
 * 1. `#dex-cell-<id>` — その札のマス目（写真の升目）
 * 2. `[data-dex-item="<id>"]` — 同じ札の行（リスト表示など）
 * 3. `[data-dex-cat="<key>"]` の見出し — その語のカテゴリー（マス目を待ちきれない時）
 * 4. `[data-nav="/dex"]` — 下の図鑑のタブ（何も無い時の最後の受け口）
 *
 * 3・4 は**マス目を待つ時間が過ぎてから**だけ使う（すぐ使うと、少し遅れて
 * 現れる本物のマス目を素通りする）。
 *
 * ここには DOM を直に触るものを入れない（探し方を受け取る形にして試験できるようにする）。
 */

/** 本物のマス目（と行）を待つ上限。過ぎたらカテゴリーの見出しかタブへ降ろす。 */
export const LANDING_CELL_WAIT_MS = 2200;
/** 着地先を探すのをやめる上限（これを過ぎたら淡く消して終わる）。 */
export const LANDING_GIVE_UP_MS = 3000;

export type LandingTargetKind = "cell" | "item" | "category" | "tab";

/** CSS の属性値として安全な形にする（id は uuid、鍵は英小文字だが、念のため）。 */
function attr(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/** 探す順の一覧。`fallback` が偽ならマス目と行だけ。 */
export function landingTargetSelectors(opts: {
  id?: string | null;
  categoryKey?: string | null;
  fallback: boolean;
}): Array<{ kind: LandingTargetKind; selector: string }> {
  const list: Array<{ kind: LandingTargetKind; selector: string }> = [];
  if (opts.id) {
    list.push({ kind: "cell", selector: `[id="dex-cell-${attr(opts.id)}"]` });
    list.push({ kind: "item", selector: `[data-dex-item="${attr(opts.id)}"]` });
  }
  if (!opts.fallback) return list;
  if (opts.categoryKey) {
    const cat = `[data-dex-cat="${attr(opts.categoryKey)}"]`;
    list.push({ kind: "category", selector: `${cat} .dex-cat__head` });
    list.push({ kind: "category", selector: cat });
  }
  list.push({ kind: "tab", selector: '[data-nav="/dex"]' });
  return list;
}

/**
 * 着地先を1つ選ぶ。`find` は「見えている要素だけ返す」探し方（見えない物は null）。
 */
export function findLandingTarget<T>(
  find: (selector: string) => T | null,
  opts: { id?: string | null; categoryKey?: string | null; fallback: boolean },
): { el: T; kind: LandingTargetKind } | null {
  for (const { kind, selector } of landingTargetSelectors(opts)) {
    const el = find(selector);
    if (el) return { el, kind };
  }
  return null;
}

/**
 * マス目ではない所（見出し・タブ）に降ろすときの着地の箱。
 * 横長の見出しに絵を合わせると潰れて棒になるので、**正方形**で、見出しの頭
 * （絵文字の所）か、タブの真ん中に置く。
 */
export function landingBoxFor(
  kind: LandingTargetKind,
  rect: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  if (kind === "cell" || kind === "item") return rect;
  const side = Math.max(24, Math.min(56, rect.height * (kind === "tab" ? 1 : 1.6)));
  const cy = rect.top + rect.height / 2;
  const left = kind === "tab" ? rect.left + rect.width / 2 - side / 2 : rect.left;
  return { left, top: cy - side / 2, width: side, height: side };
}
