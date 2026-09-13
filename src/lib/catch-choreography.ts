/**
 * キャッチの報酬演出 — **数だけ**。
 *
 * ## オーナー指示 2026-09-13
 * > 「図鑑に追加するボタンを押したら、該当の画面のなかの画像だけが動き出し、
 * >  画像が生き生きとしたアニメーションできゅっと浮き上がり、画面いっぱいに
 * >  広がったタイミングで、画像のしたには単語が表示されかつ音声が同時に鳴る
 * >  （ドラえもんのひみつ道具の紹介のように）。静止するのは音声が鳴り、
 * >  単語が表示される1秒間だけで、あとは動的。**今画像が動くような軌跡が
 * >  まったくない。**」
 *
 * ## なぜ軌跡が出ていなかったのか（原因は1つ）
 * 前の版（`v4_hold.ts`）は CSS transition を `setTimeout` で繋いでいた。
 *
 *     fly.style.transition = "transform 320ms …";   // 第1幕
 *     await sleep(300);
 *     fly.style.transition = "transform 420ms …";   // 第2幕
 *
 * transition は**必ず速度ゼロから始まり、速度ゼロで終わる**（`cubic-bezier` の
 * 端点がそう定義されている）。幕が変わるたびに物が止まるので、
 * 4つの別々の動きが並んでいるだけで、**1つの物が飛んでいるようには見えない**。
 *
 * ばねは逆で、**目標を差し替えても速度が引き継がれる**。
 * 沈み込みの途中（まだ下向きの速度を持っている）で上を目標にすると、
 * コイルが解放されたような立ち上がりになる — これが「きゅっ」。
 * 時間指定のアニメーションでは**原理的に**作れない。
 *
 * ## この紙は数しか持たない
 * ばね自体は `lib/spring.ts`、DOM を触るのは `effects/catch-landing/v5_*`。
 * ここに外の世界に触れるものを入れないこと。
 */

/** ばねの指定。Apple と同じ2つだけで設計する（`lib/spring.ts` の注）。 */
export type SpringSpec = { response: number; damping: number };

/**
 * 幕ごとのばね。
 *
 * ## 軸ごとに response を変えるのが「軌跡」の正体
 * `x` と `y` を同じばねで動かすと**直線**になる。
 * 上へ跳ねる（`y`）のは速く、中央へ寄る（`x`）のは遅くすると、
 * 軌跡が弧を描く。物を放り上げたときの見え方がこれ。
 *
 * ## damping < 1 を置く場所は選ぶ
 * apple-design §17「跳ねは、勢いを伴った操作の後だけ」。
 * 押した勢いを引き継ぐ離陸と展開は跳ねてよく、退場は跳ねない
 * （行き先が画面外なので、跳ねても見えないうえ収束が遅れる）。
 */
export const SPRING = {
  /** 沈み込み。速く沈んで、**沈みきる前に**次へ渡す。 */
  anticipateScale: { response: 0.16, damping: 0.9 },
  /** 離陸の縦。跳ねる。これが浮き上がり感。 */
  launchY: { response: 0.3, damping: 0.72 },
  /** 離陸の横。**縦より遅い** → 弧になる。 */
  launchX: { response: 0.44, damping: 0.92 },
  /** 離陸の拡大。 */
  launchScale: { response: 0.36, damping: 0.8 },
  /** 展開（画面いっぱい）。わずかに行き過ぎてから収まる = 「きゅっと開く」。 */
  bloomScale: { response: 0.46, damping: 0.86 },
  /** 展開の縦位置。拡大より少し速く決まると、開き終わりが安定して見える。 */
  bloomY: { response: 0.38, damping: 0.95 },
  /** 単語が画像の下から突き上がる。 */
  wordRise: { response: 0.34, damping: 0.7 },
  /** 退場。跳ねさせない。 */
  exit: { response: 0.34, damping: 1 },
} as const satisfies Record<string, SpringSpec>;

/**
 * 沈み込みの時間（ms）。
 *
 * **150ms を超えると「押したのに反応が遅い」と読まれる**（apple-design §14）。
 * 80ms を下回ると沈んだことが見えない。その間で、いちばん短い側に置く。
 * ここで待つのは**次の動きを強く見せるため**なので、長くする理由がない。
 */
export const ANTICIPATE_MS = 110;

/**
 * 空中で止まる時間（ms）。**オーナー指定の「1秒間」そのまま。**
 *
 * ここを縮めると単語を読み終わる前に動き出す。伸ばすと待たされた感じになる。
 * 報酬の演出で効くのは**受け取る瞬間よりも、その直前の期待**なので、
 * この1秒は「間が空いている」のではなく**演出の主役**。
 */
export const HOLD_MS = 1000;

/** 沈み込みで縦に潰れる率。横は体積が保たれるように逆に膨らむ。 */
export const ANTICIPATE_SQUASH = 0.945;

/**
 * 「静止」中の呼吸。
 *
 * オーナーは「静止するのは1秒だけ」と言っているが、**完全に止めると
 * 動画が一時停止したように見える**。0.5% の拡縮だけ残すと、
 * 止まっているのに生きている — 息を止めて構えている状態になる。
 *
 * 周期は 2.6 秒（0.38Hz）。a11y の注意点にある 0.2Hz 帯の揺れを避け、
 * 振幅も全画面で 2px 程度に収める。
 */
export const BREATH = { amplitude: 0.005, periodMs: 2600 } as const;

/**
 * 画面いっぱいに広がったときの拡大率。
 *
 * 横幅より**わずかに大きく**する（1.02）。ぴったり合わせると左右に
 * 1px の隙が見える回があり、「画面いっぱい」に見えない。
 */
export function bloomScale(fromWidth: number, viewportWidth: number): number {
  return (viewportWidth * 1.02) / Math.max(fromWidth, 1);
}

/**
 * 浮き上がりの頂点と、広がりきったときの中心。
 *
 * どちらも**画面の上寄り**。下に単語が出るので、画像が真ん中にあると
 * 単語が画面の下端に押し出される。
 */
export const apexY = (viewportHeight: number) => viewportHeight * 0.34;
export const bloomY = (viewportHeight: number) => viewportHeight * 0.4;

/**
 * 速度から出す潰れ・伸び（squash & stretch）。
 *
 * 速く動いている物は進行方向に伸びる。**これが無いと、どんなに速く
 * 動かしても「絵が移動している」までしか見えない。**
 *
 * 体積を保つ（`sx * sy ≒ 1`）。片方だけ伸ばすと風船のように膨らんで、
 * 物が重さを失う。
 *
 * @param vx 横の速度 px/s
 * @param vy 縦の速度 px/s
 */
export function motionStretch(vx: number, vy: number): { sx: number; sy: number } {
  const speed = Math.hypot(vx, vy);
  // 上限を置く。置かないと、退場の 2000px/s で縦に2倍以上伸びて棒になる。
  const t = Math.min(speed / 2600, 1);
  const stretch = 1 + t * 0.18;
  // 縦優先で伸ばす。この演出の動きはほぼ縦なので、
  // 速度の向きごとに軸を選ぶ複雑さに見合う差が出ない。
  return { sx: 1 / stretch, sy: stretch };
}

/**
 * 横の速度から出す傾き（度）。
 *
 * 放られた物は回る。**真っ直ぐ平行に飛ぶ物は、飛んでいるように見えない。**
 * 3.2度は「気づかないが効いている」量。5度を超えると漫画になる。
 */
export function tiltDeg(vx: number): number {
  return Math.max(-1, Math.min(1, vx / 900)) * 3.2;
}

/**
 * 音と単語を出す瞬間の判定。
 *
 * ## なぜ時間で計らないのか
 * 前の版は「420ms 待ってから鳴らす」だった。ばねは**到達時間が
 * 状況で変わる**（画面の大きさ・前の幕から引き継いだ速度）ので、
 * 時間で計ると回によって音が早い/遅いになる。
 *
 * 「広がりきった**その瞬間**」に鳴らしたいのだから、
 * **拡大率そのものを見る**のが正しい。apple-design §20
 * 「絵と音と振動は同じフレームに乗せる」。
 *
 * 0.90 なのは、人の目には 90% でもう「広がりきった」と見えるから。
 * 1.0 を待つとばねの収束を待つことになり、音が明らかに遅れて聞こえる。
 */
export const SPEAK_AT_SCALE_RATIO = 0.9;

export function shouldSpeak(scale: number, targetScale: number): boolean {
  return scale >= targetScale * SPEAK_AT_SCALE_RATIO;
}

/**
 * 残像（軌跡）の間隔。
 *
 * 速いほど間隔を広げる。等間隔にすると、遅いときに残像が団子になって
 * 「絵が濁った」ようにしか見えない。
 *
 * ブラウザには本物のモーションブラーが無いので、**薄くぼかした写しを
 * 数枚置く**のが代わり。60fps で見ると速度として読める。
 */
export function trailSpacing(speed: number): number {
  return Math.max(1, Math.min(4, Math.round(speed / 700)));
}

/** 残像の枚数。増やすと速さではなく「残像そのもの」が見えてくる。 */
export const TRAIL_SAMPLES = 5;

/**
 * 残像1枚ごとの濃さとぼかし。`i` は 0（いちばん新しい）から。
 */
export function trailStyle(i: number): { opacity: number; blurPx: number } {
  const t = (i + 1) / (TRAIL_SAMPLES + 1);
  return { opacity: 0.34 * (1 - t), blurPx: 2 + t * 7 };
}

/**
 * 退場の初速（px/s、上向きなので負）。
 *
 * ## なぜ初速を与えるのか
 * 1秒止まった後のばねは速度ゼロ。そこで目標だけ変えると、
 * **ゆっくり動き出してから加速する** — 物が自分から動いたように見えて、
 * 「投げられた」感じにならない。
 *
 * 明示的に初速を渡すと、その瞬間から最高速で抜ける。
 * apple-design §18「速度の受け渡し」を、指ではなく演出が担う形。
 */
export function exitImpulse(viewportHeight: number): number {
  return -viewportHeight * 2.1;
}

/**
 * 着弾したセルの**隣のセル**が受ける揺れ。
 *
 * ## なぜ隣を揺らすのか
 * 落ちた物だけが跳ねると、**背景に貼られた絵の上でスプライトが動いた**
 * ようにしか見えない。周りが少しでも反応すると、同じ世界で起きた出来事に
 * なる。物理法則を感じるのは、物そのものより**周りの反応**から。
 *
 * 距離で減衰し、距離ぶん遅れて届く（衝撃波の伝わり）。
 *
 * @param dx セルいくつ横か / @param dy セルいくつ縦か
 */
export function neighborRipple(dx: number, dy: number): { liftPx: number; delayMs: number } {
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > 2.9) return { liftPx: 0, delayMs: 0 };
  return {
    // 1マス隣で 3px、2マスで 1.2px。這うように小さくする。
    liftPx: Math.round((3.4 / (1 + (d - 1) * 1.4)) * 10) / 10,
    delayMs: Math.round(d * 26),
  };
}

/**
 * レア度で報酬の**大きさ**を変える倍率。
 *
 * ## ガチャとの違いをここで線引きする
 * ガチャが刺激するのは「**当たるかどうか分からない**」という不確実性。
 * それは学習アプリに持ち込むと、頑張りと報酬の関係を壊す
 * （偶然の演出は、覚えた実感の代わりにならない）。
 *
 * 代わりに **珍しい語を捕まえたときほど演出を大きくする**。
 * 確率は動かさず、**大きさだけ**を動かす。
 * 行動経済学で言えば、可変比率ではなく**可変量**の強化。
 * 「珍しい物を捕まえた」は事実なので、演出は嘘にならない。
 *
 * @param level TOCFL / CEFR の段（1〜6）。高いほど珍しい。
 */
export function rewardScale(level: number | null | undefined): number {
  const n = Number.isFinite(level) ? Math.max(1, Math.min(6, Number(level))) : 1;
  // 1段で 1.0、6段で 1.25。差は出るが、別の演出には見えない幅に留める。
  return 1 + (n - 1) * 0.05;
}
