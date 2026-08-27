/**
 * 浮いて、ぶつかって、跳ね返る札の動き。
 *
 * ## オーナー指示 2026-08-27 ⑤
 * > 「その単語を見かける場面、状況、場所などについてのカテゴリーを囲って
 * >  色分けして**バブル（物理法則を適用した浮遊感のあるバウンスする）**の
 * >  ように表示して。」
 *
 * ## なぜ純粋な物として出すか
 * 動きの計算を描画の中に書くと、**確かめる手が無くなる**。この手の輪は
 * 静かに壊れる — 札が枠の外へ抜ける、速さが発散する、裏で開いたタブに
 * 戻った瞬間に全部が飛ぶ。どれも「たまに変」としか報告されない。
 *
 * ここは「いまの状態 + 経った時間 → 次の状態」だけを返す。描く側は
 * `requestAnimationFrame` で呼ぶだけになる。
 *
 * ## 何を模すか
 * **重力は入れない。** 「浮遊感」なので、下に落ちるのではなく漂う。
 * 入れるのは4つ:
 *   ① ゆっくりした等速の漂い
 *   ② 枠での跳ね返り（反発 0.92 — 完全弾性にすると永久に同じ速さで
 *      往復して機械的に見える）
 *   ③ 札どうしの押し合い（重なりを解いて、速さを交換する）
 *   ④ ごく弱い減衰と、速さの上限
 *
 * ## 壊れ方を先に塞ぐ
 * - `dt` は上限を切る。裏に回ったタブが戻ると 30 秒ぶんの `dt` が来て、
 *   1コマで枠を突き抜ける（トンネリング）。
 * - 位置は毎コマ枠の中へ丸める。丸め落ちても外に残らない。
 * - 速さに上限を置く。押し合いは近づくほど強いので、上限が無いと
 *   重なった2つが弾け飛ぶ。
 */

/**
 * 札1つ。**丸ではなく箱で持つ。**
 *
 * 最初は外接円で当たりを取っていたが、絵で見たら札どうしが重なっていた。
 * 理由は面積 — 横長の札に外接する円は、札そのものの3倍近い面積を取る。
 * 8つ並べると円の総面積が枠を超え、**どう押し合っても収まらない**。
 * 札は角丸の長方形なので、長方形として当たりを取るのが素直。
 */
export type Bubble = {
  id: string;
  /** 中心の座標(px)。 */
  x: number;
  y: number;
  /** 速さ(px/秒)。 */
  vx: number;
  vy: number;
  /** 幅の半分(px)。 */
  hw: number;
  /** 高さの半分(px)。 */
  hh: number;
};

export type World = { width: number; height: number };

/** 枠での反発。1 だと永久に同じ速さで往復して機械的に見える。 */
export const RESTITUTION = 0.92;
/** 1秒あたりに残る速さ。漂いを止めきらない程度に落とす。 */
export const DAMPING_PER_SEC = 0.86;
/** 速さの上限(px/秒)。押し合いで弾け飛ぶのを止める。 */
export const MAX_SPEED = 46;
/** 1コマで進める時間の上限(ms)。裏タブ復帰のトンネリング止め。 */
export const MAX_DT_MS = 48;
/** これ以下の速さは 0 と見なす（浮動小数の残りかすで震え続けない）。 */
const EPSILON = 0.01;

/** 決まった種から同じ並びを作る乱数（試験で同じ絵を撮るため）。 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32。短いのに偏りが少なく、環境に依らず同じ列を返す。
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 最初の置き方。**重ならないように置く**（重なった状態から始めると、
 * 1コマ目で弾け飛ぶ）。置ききれない札は、少し詰めてでも枠の中に入れる。
 */
export function layoutBubbles(
  items: ReadonlyArray<{ id: string; hw: number; hh: number }>,
  world: World,
  seed = 1,
): Bubble[] {
  const rand = rng(seed);
  const out: Bubble[] = [];
  for (const it of items) {
    // 枠より大きい札は、枠に収まる大きさへ落とす。
    const hw = Math.min(it.hw, Math.max(2, world.width / 2));
    const hh = Math.min(it.hh, Math.max(2, world.height / 2));
    let best = { x: world.width / 2, y: world.height / 2, gap: -Infinity };
    // 何度か振って、いちばん空いている所を採る。総当たりにしない
    // （札は数個なので、これで十分ばらける）。
    for (let tryIdx = 0; tryIdx < 40; tryIdx++) {
      const x = hw + rand() * Math.max(0, world.width - 2 * hw);
      const y = hh + rand() * Math.max(0, world.height - 2 * hh);
      let gap = Infinity;
      for (const o of out) {
        // 長方形どうしの隙間。**軸ごとに見て、広いほうを採る** —
        // どちらか一方でも離れていれば重なっていない。
        gap = Math.min(
          gap,
          Math.max(Math.abs(x - o.x) - (hw + o.hw), Math.abs(y - o.y) - (hh + o.hh)),
        );
      }
      if (gap > best.gap) best = { x, y, gap };
      if (gap > 4) break;
    }
    const angle = rand() * Math.PI * 2;
    const speed = 10 + rand() * 14;
    out.push({
      id: it.id,
      x: best.x,
      y: best.y,
      hw,
      hh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  return out;
}

/**
 * 1コマ進める。**渡した配列は変えない**（React の状態をその場で書き換えると
 * 描き直しが起きない）。
 */
export function stepBubbles(bubbles: readonly Bubble[], world: World, dtMs: number): Bubble[] {
  const dt = clamp(dtMs, 0, MAX_DT_MS) / 1000;
  if (dt <= 0 || bubbles.length === 0) return bubbles.map((b) => ({ ...b }));
  const decay = Math.pow(DAMPING_PER_SEC, dt);
  const next = bubbles.map((b) => ({ ...b }));

  // ① 漂い + ④ 減衰
  for (const b of next) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= decay;
    b.vy *= decay;
  }

  /**
   * ③ 札どうしの押し合い。
   *
   * **食い込みの浅い軸へ逃がす**（分離軸）。長方形が重なったとき、
   * 横に 4px・縦に 30px 食い込んでいるなら、横へ 4px 動かすのが
   * いちばん自然で、いちばん短い。斜めへ逃がすと、隣の札を巻き込んで
   * 玉突きになる。
   *
   * **何周か回す。** 1回で解くと、3つ以上が重なった塊がほどけない
   * （A を B から離すと C に食い込む）。数周で十分収まる。
   */
  for (let pass = 0; pass < 3; pass++) {
    let touched = false;
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i];
        const b = next[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = a.hw + b.hw - Math.abs(dx);
        const overlapY = a.hh + b.hh - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        touched = true;
        // 重なった軸のうち、浅いほうへ。真上に重なっている（差 0）ときは
        // 決まった向きへ逃がす — 乱数を使うと同じ入力で違う絵になる。
        const useX = overlapX < overlapY;
        const nx = useX ? (dx === 0 ? 1 : Math.sign(dx)) : 0;
        const ny = useX ? 0 : dy === 0 ? 1 : Math.sign(dy);
        const push = (useX ? overlapX : overlapY) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // 近づいている成分だけを入れ替える（離れていく2つを跳ね返さない）。
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = rel * RESTITUTION;
          a.vx += imp * nx;
          a.vy += imp * ny;
          b.vx -= imp * nx;
          b.vy -= imp * ny;
        }
      }
    }
    if (!touched) break;
  }

  // ② 枠での跳ね返り + 位置の丸め + 速さの上限
  for (const b of next) {
    /**
     * **枠に入りきらない札は中央で止める。**
     *
     * 枠が縮んだ回（画面の回転・折りたたみ・幅0で描かれた1コマ目）に、
     * 跳ね返りの式は「左端も右端も札の半分」と言い出して、札を枠の外へ
     * 固定してしまう。入らないなら真ん中が唯一まともな答えなので、
     * **その軸の跳ね返りごと飛ばす**。
     */
    if (world.width < 2 * b.hw) {
      b.x = world.width / 2;
      b.vx = 0;
    } else {
      const maxX = world.width - b.hw;
      if (b.x < b.hw) {
        b.x = b.hw;
        if (b.vx < 0) b.vx = -b.vx * RESTITUTION;
      } else if (b.x > maxX) {
        b.x = maxX;
        if (b.vx > 0) b.vx = -b.vx * RESTITUTION;
      }
      // **丸め落ちを残さない。**
      b.x = clamp(b.x, b.hw, maxX);
    }
    if (world.height < 2 * b.hh) {
      b.y = world.height / 2;
      b.vy = 0;
    } else {
      const maxY = world.height - b.hh;
      if (b.y < b.hh) {
        b.y = b.hh;
        if (b.vy < 0) b.vy = -b.vy * RESTITUTION;
      } else if (b.y > maxY) {
        b.y = maxY;
        if (b.vy > 0) b.vy = -b.vy * RESTITUTION;
      }
      b.y = clamp(b.y, b.hh, maxY);
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx = (b.vx / speed) * MAX_SPEED;
      b.vy = (b.vy / speed) * MAX_SPEED;
    }
    if (Math.abs(b.vx) < EPSILON) b.vx = 0;
    if (Math.abs(b.vy) < EPSILON) b.vy = 0;
  }

  return next;
}

/**
 * 札の大きさの**見積もり**。実測が届くまでの1コマぶんだけ使う。
 *
 * 字数では当てられない（印の絵文字とその間合いが入らないし、言語が
 * 変われば字の幅も変わる）ので、描いたあと `getBoundingClientRect` で
 * 測り直す。ここは「測る前に全部が真ん中に重なる」のを避けるためだけの物。
 */
export function bubbleSize(label: string, charPx = 11, padPx = 20): { hw: number; hh: number } {
  const chars = Math.max(1, [...label].length);
  // 印(絵文字)+間合いのぶんを足しておく。
  return { hw: (chars * charPx + padPx * 2 + 22) / 2, hh: (charPx * 2.4 + padPx) / 2 };
}
