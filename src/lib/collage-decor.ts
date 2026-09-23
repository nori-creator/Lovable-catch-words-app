/**
 * 写真を壁に**どう留めるか**（オーナー指示 2026-09-22「前のように壁に付箋や
 * 四隅を固定して画像を張るようにして」）。
 *
 * 留め方は2つ:
 *   - `tape`    … マスキングテープ1〜2枚。上の辺の真ん中、または角を斜めに
 *   - `corners` … 四隅の三角コーナー（アルバムに差し込む紙の角）
 *
 * **`id` から決める。** 乱数にすると、描き直すたびにテープの位置が変わる。
 * 留め方がすべて同じだと貼り物の並びに見え、すべて違うと散らかって見える —
 * テープ6割・四隅4割に寄せ、色は4色から選ぶ。
 */
export type TapeSpot = "top" | "corner-tl" | "corner-tr";
export type TapeColor = "iris" | "sage" | "rose" | "cream";

export type PinColor = "red" | "blue" | "yellow" | "green";

export type CollageDecor =
  | { kind: "tape"; tapes: Array<{ spot: TapeSpot; rot: number; color: TapeColor }> }
  | { kind: "corners" }
  /** コルクの壁は**画鋲**（上の辺の真ん中あたりに1本）。 */
  | { kind: "pin"; color: PinColor; x: number }
  /** 額縁は**何も付けない**（オーナー指示 2026-09-23「額縁の壁紙のときは付箋デザインいらない」）。 */
  | { kind: "none" };

const PIN_COLORS: readonly PinColor[] = ["red", "blue", "yellow", "green"];

const COLORS: readonly TapeColor[] = ["iris", "sage", "rose", "cream"];

/** `id` から決まる 0〜1（`packCollage` と同じ混ぜ方）。 */
function seed(id: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function decorFor(
  id: string,
  /** 壁の種類（`wallpaper.ts`）。留め方が壁で変わる。 */
  wall: "paper" | "notebook" | "wall" | "frame" | "cork" = "paper",
): CollageDecor {
  // 額縁の中の絵にテープや角は要らない。
  if (wall === "frame") return { kind: "none" };
  if (wall === "cork") {
    return {
      kind: "pin",
      color: PIN_COLORS[Math.floor(seed(id, 59) * PIN_COLORS.length) % PIN_COLORS.length],
      // 真ん中から少しずらす（全部ど真ん中だと機械で打ったように見える）。
      x: 42 + seed(id, 61) * 16,
    };
  }
  // 実際の壁に四隅の三角は付かない。テープだけ。
  if (wall !== "wall" && seed(id, 31) >= 0.6) return { kind: "corners" };
  const color = COLORS[Math.floor(seed(id, 37) * COLORS.length) % COLORS.length];
  const shape = seed(id, 41);
  if (shape < 0.5) {
    // 上の辺の真ん中に1枚。わずかに傾ける（まっすぐだと印刷に見える）。
    return { kind: "tape", tapes: [{ spot: "top", rot: seed(id, 43) * 10 - 5, color }] };
  }
  // 対角の2つの角に斜めに1枚ずつ。**向きは角ごとに決まっている**
  // （左上は右下がり、右上は左下がり — 角を押さえる向き）。
  const alt = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length];
  return {
    kind: "tape",
    tapes: [
      { spot: "corner-tl", rot: -38 + seed(id, 47) * 8, color },
      { spot: "corner-tr", rot: 38 - seed(id, 53) * 8, color: alt },
    ],
  };
}
