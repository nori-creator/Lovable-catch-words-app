import {
  ANTICIPATE_MS,
  ANTICIPATE_SQUASH,
  BREATH,
  HOLD_MS,
  SPRING,
  TRAIL_SAMPLES,
  apexY,
  bloomScale,
  bloomY,
  exitImpulse,
  motionStretch,
  neighborRipple,
  rewardScale,
  shouldSpeak,
  tiltDeg,
  trailSpacing,
  trailStyle,
} from "@/lib/catch-choreography";
import { createSpring } from "@/lib/spring";
import { haptic } from "@/lib/haptics";
import type { LandingCtx, LandingRunner } from "./types";

/**
 * キャッチの報酬演出 v5 — **ばねで動かす版**（オーナー指示 2026-09-13）。
 *
 * ## 前の版と何が違うのか（1つだけ）
 * v1〜v4 は CSS transition を `setTimeout` で繋いでいた。transition は
 * **必ず速度ゼロから始まり速度ゼロで終わる**ので、幕が変わるたびに物が止まる。
 * 4つの動きが並んでいるだけで、1つの物が飛んでいるようには見えない。
 * オーナーの「**今画像が動くような軌跡がまったくない**」はこれが原因。
 *
 * ここは `lib/spring.ts` のばねを使い、**毎フレーム自分で描く**。
 * 目標を差し替えても速度が残るので、幕が繋がる。
 *
 * ## 「きゅっ」はどこで生まれるか
 * 沈み込みの**途中**（まだ下向きの速度を持っている）で上を目標にする。
 * ばねは下向きの速度を持ったまま上へ引かれるので、
 * コイルが解放されたような立ち上がりになる。
 * **時間指定のアニメーションでは原理的に作れない。**
 *
 * ## 幕
 *   0 予兆   110ms  沈み込む（押した力が溜まる）
 *   1 離陸   ばね   弧を描いて浮き上がる ＋ 残像 ＋ 傾き ＋ 影が遅れて付いてくる
 *   2 展開   ばね   画面いっぱい。**拡大率が9割を越えたフレーム**で音と単語
 *   3 静止  1000ms  息だけ残して止まる ← 報酬の主役はこの「間」
 *   4 退場   ばね   初速を与えて投げ抜く（図鑑側が受け止める）
 *
 * ## 描くのは1つの transform だけ
 * ばねを軸ごとに分けても、**書き込む先は1つ**にすること。
 * 別々の style を別々の onFrame で書くと、同じフレームで互いを上書きして
 * 片方の動きが消える。だから onFrame は空にして、描画は自分の rAF が
 * `spring.value()` を読んで1回だけ行う。
 */

/** 影の追従の遅れ（0〜1、小さいほど遅れる）。遅れが高度に見える。 */
const SHADOW_LAG = 0.12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const v5physics: LandingRunner = async (ctx: LandingCtx) => {
  const startEl = ctx.startEl;
  const fly = ctx.fly;

  // §14 reduced motion: 画面いっぱいの飛行はまさに避けたい前庭系の動き。
  // 音と単語（＝情報）は残し、移動だけを省く。
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !startEl || !fly) {
    const word = document.getElementById("catch-hero-word");
    if (word) {
      word.style.opacity = "1";
      word.style.transform = "translateX(-50%)";
    }
    ctx.speakLine?.();
    await sleep(HOLD_MS);
    if (ctx.gate) await ctx.gate.catch(() => {});
    if (word) word.style.opacity = "0";
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // **枠ではなく、絵そのものを測る。**
  // 渡されるのはカードの箱で、中の写真は `p-6` ぶん内側に在り、縁と地の色も
  // 付いている。箱の寸法で飛ばすと、離陸の瞬間に絵が一段大きくなって
  // 「別の物に入れ替わった」ように見える。中に img が在ればそれを採る。
  const measured = startEl.querySelector("img") ?? startEl;
  const from = measured.getBoundingClientRect();
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;

  // レア度で報酬の**大きさ**だけを変える（確率は動かさない — 純粋側の注）。
  const reward = rewardScale(ctx.level);

  const echo = document.getElementById("catch-echo");
  const echoes = echo ? (Array.from(echo.children) as HTMLElement[]) : [];
  const shadow = document.getElementById("catch-shadow");
  const vignette = document.getElementById("catch-vignette");
  const glint = document.getElementById("catch-glint");
  const wordEl = document.getElementById("catch-hero-word");

  // 飛ぶ絵を、いま画面に出ている写真の**ぴったり同じ場所**に置く。
  // ここがずれると、押した瞬間に絵が飛んで「別の物が出てきた」になる。
  fly.style.left = `${from.left}px`;
  fly.style.top = `${from.top}px`;
  fly.style.width = `${from.width}px`;
  fly.style.height = `${from.height}px`;
  fly.style.opacity = "1";
  fly.style.transition = "none";
  fly.style.transformOrigin = "50% 50%";
  for (const e of echoes) {
    e.style.left = `${from.left}px`;
    e.style.top = `${from.top}px`;
    e.style.width = `${from.width}px`;
    e.style.height = `${from.height}px`;
    e.style.opacity = "0";
  }

  // ── ばね。**軸ごとに別**（`lib/spring.ts` の注）。onFrame は空。 ──────
  const noop = () => {};
  const sX = createSpring(0, noop, SPRING.launchX);
  const sY = createSpring(0, noop, SPRING.launchY);
  const sScale = createSpring(1, noop, SPRING.launchScale);
  const sWord = createSpring(0, noop, SPRING.wordRise);

  // `paint` は関数宣言なので、TS は上の `if (!fly) return` の絞り込みを
  // ここまで運んでくれない。別名にして絞り込みを固定する。
  const img = fly;

  // ── 描画。**1フレームにつき transform を1回だけ書く。** ───────────────
  const target = { scale: 1 };
  let spoke = false;
  let shadowY = 0;
  let breathFrom = 0; // 息を始めた時刻。0 の間は息をしない。
  let stopped = false;
  const history: { x: number; y: number; s: number; r: number }[] = [];

  function paint(now: number) {
    if (stopped) return;
    const x = sX.value();
    const y = sY.value();
    const s = sScale.value();
    const vx = sX.velocity();
    const vy = sY.velocity();

    // 速度から出す潰れ・伸びと傾き。これが無いと「絵が移動している」までしか
    // 見えない（純粋側 motionStretch / tiltDeg の注）。
    const { sx: stretchX, sy: stretchY } = motionStretch(vx, vy);
    const rot = tiltDeg(vx);

    // 静止中の息。完全に止めると一時停止した動画に見える。
    const breath = breathFrom
      ? 1 + Math.sin(((now - breathFrom) / BREATH.periodMs) * Math.PI * 2) * BREATH.amplitude
      : 1;

    const paintScale = s * breath;
    img.style.transform =
      `translate(${x}px, ${y}px) rotate(${rot}deg) ` +
      `scale(${paintScale * stretchX}, ${paintScale * stretchY})`;

    // 残像。ブラウザに本物のモーションブラーが無いので、薄くぼかした写しを
    // 過去の位置に置く。速いほど間隔を広げる（団子にしない）。
    const speed = Math.hypot(vx, vy);
    history.unshift({ x, y, s: paintScale, r: rot });
    if (history.length > TRAIL_SAMPLES * 4 + 1) history.pop();
    const gap = trailSpacing(speed);
    echoes.forEach((e, i) => {
      const h = history[(i + 1) * gap];
      // 動いていないときは残像を出さない。出すと絵が濁って見える。
      if (!h || speed < 120) {
        e.style.opacity = "0";
        return;
      }
      const st = trailStyle(i);
      e.style.opacity = String(st.opacity);
      e.style.filter = `blur(${st.blurPx}px)`;
      e.style.transform = `translate(${h.x}px, ${h.y}px) rotate(${h.r}deg) scale(${h.s})`;
    });

    // 影は**遅れて**付いてくる。遅れと滲みが高度に見える。
    // 物と同じ速さで動く影は、床に貼った絵にしか見えない。
    if (shadow) {
      shadowY += (y - shadowY) * SHADOW_LAG;
      const alt = Math.max(0, Math.min(1, -y / Math.max(vh * 0.4, 1)));
      shadow.style.transform = `translate(${x * 0.5}px, ${shadowY * 0.18}px) scale(${1 + alt * 0.9})`;
      shadow.style.opacity = String(0.3 * (1 - alt * 0.7));
    }

    // **音と単語は「広がりきったフレーム」で出す。**
    // 時間で待つとばねの到達時間の揺れでずれる（純粋側 shouldSpeak の注）。
    if (!spoke && target.scale > 1 && shouldSpeak(s, target.scale)) {
      spoke = true;
      ctx.speakLine?.();
      haptic("medium");
      sWord.to(1, SPRING.wordRise);
      if (glint) glint.classList.add("glint-play");
    }

    if (wordEl) {
      const w = sWord.value();
      wordEl.style.opacity = String(Math.max(0, Math.min(1, w)));
      // 画像の**下から**突き上がる。上から降ってくると画像と競合する。
      wordEl.style.transform = `translateX(-50%) translateY(${(1 - w) * 44}px) scale(${0.9 + w * 0.1})`;
    }

    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);

  try {
    // ── 幕0 予兆: 沈み込む ────────────────────────────────────────────
    // 押した力が溜まる。ここを飛ばすと、離陸が「勝手に動き出した」に見える。
    haptic("light");
    sScale.to(ANTICIPATE_SQUASH, SPRING.anticipateScale);
    sY.to(5, SPRING.anticipateScale);
    await sleep(ANTICIPATE_MS);

    // ── 幕1 離陸: 弧を描いて浮き上がる ───────────────────────────────
    // **ここで沈み込みはまだ終わっていない。** 下向きの速度を持ったまま
    // 上を目標にするので、解放されたように跳ね上がる = 「きゅっ」。
    sY.to(apexY(vh) - fromCy, SPRING.launchY);
    sX.to(vw / 2 - fromCx, SPRING.launchX);
    sScale.to(1.16 * reward, SPRING.launchScale);
    if (vignette) vignette.style.opacity = "0.55";
    await sleep(230);

    // ── 幕2 展開: 画面いっぱい ───────────────────────────────────────
    // 離陸の上向きの速度が残っているところへ拡大の目標を重ねる。
    // 上がりながら開くので、開き始めに勢いがある。
    // **ここに reward を掛けない。** 掛けると珍しい語ほど写真が画面から
    // はみ出して、切り取られる面積が増える — 報酬ではなく劣化になる。
    // 「画面いっぱい」は幾何で決まる量なので、珍しさで動かさない。
    // レア度は離陸の跳ね上がり(上)と暗転の深さで出す。
    target.scale = bloomScale(from.width, vw);
    sScale.to(target.scale, SPRING.bloomScale);
    sY.to(bloomY(vh) - fromCy, SPRING.bloomY);
    // 珍しい語ほど周りを深く落とす。写真の大きさは変えずに「格が上がる」。
    if (vignette) vignette.style.opacity = String(Math.min(0.94, 0.78 + (reward - 1) * 0.6));
    // 音と単語はこの中の**フレーム判定**で出る（上の paint を見よ）。
    // ここで待つのは「開ききるまで」の目安。
    await sleep(460);

    // ── 幕3 静止: ちょうど1秒。息だけ残す ────────────────────────────
    breathFrom = performance.now();
    await sleep(HOLD_MS);
    // 保存がまだ届いていなければ、**息をしたまま**待つ。
    // ここで待たないと、演出が終わってから無言の待ち時間が現れる。
    if (ctx.gate) await ctx.gate.catch(() => {});

    // ── 幕4 退場: 初速を与えて投げ抜く ──────────────────────────────
    // 目標だけ変えるとゆっくり動き出す。初速を渡すとその瞬間から最高速。
    breathFrom = 0;
    sWord.to(0, { response: 0.22, damping: 1 });
    sY.to(bloomY(vh) - fromCy - vh * 1.25, {
      ...SPRING.exit,
      velocity: exitImpulse(vh),
    });
    sScale.to(target.scale * 0.34, SPRING.exit);
    if (vignette) vignette.style.opacity = "0";
    await sleep(300);
    fly.style.opacity = "0.1";
    await sleep(80);
  } finally {
    // どこで転んでも層は必ず片付ける。残すと画面が触れなくなる。
    stopped = true;
    sX.dispose();
    sY.dispose();
    sScale.dispose();
    sWord.dispose();
    if (glint) glint.classList.remove("glint-play");
    for (const e of echoes) e.style.opacity = "0";
    if (shadow) shadow.style.opacity = "0";
    if (vignette) vignette.style.opacity = "0";
    if (wordEl) wordEl.style.opacity = "0";
  }
};

/**
 * 着弾したセルの隣を揺らす（図鑑側から呼ぶ）。
 *
 * 落ちた物だけが跳ねると、背景の絵の上でスプライトが動いたようにしか
 * 見えない。周りが少しでも反応すると同じ世界の出来事になる
 * （純粋側 neighborRipple の注）。
 *
 * DOM を触るのでここに置く。純粋な計算は `catch-choreography.ts`。
 */
export function rippleNeighbors(landedId: string): () => void {
  const landed = document.getElementById(`dex-cell-${landedId}`);
  if (!landed) return () => {};
  const a = landed.getBoundingClientRect();
  const unitX = Math.max(a.width, 1);
  const unitY = Math.max(a.height, 1);
  // **格子の番号では測らない。** 棚は1行の冊数が幅で変わり、アルバムは3列、
  // 一覧はまた別。番号で数えると、どれかの表示で隣が隣でなくなる。
  // 画面上の距離を「セルいくつ分」に直せば、どの並びでも同じ意味になる。
  const cells = Array.from(document.querySelectorAll<HTMLElement>('[id^="dex-cell-"]'));
  const timers: ReturnType<typeof setTimeout>[] = [];
  const touched: HTMLElement[] = [];
  for (const cell of cells) {
    if (cell === landed) continue;
    const b = cell.getBoundingClientRect();
    // 画面の外は触らない（見えない物を動かしても意味がなく、重いだけ）。
    if (b.bottom < 0 || b.top > window.innerHeight) continue;
    const { liftPx, delayMs } = neighborRipple((b.left - a.left) / unitX, (b.top - a.top) / unitY);
    if (liftPx === 0) continue;
    touched.push(cell);
    timers.push(
      setTimeout(() => {
        cell.style.transition = "transform 90ms cubic-bezier(0.2,0.9,0.3,1)";
        cell.style.transform = `translateY(${liftPx}px)`;
        timers.push(
          setTimeout(() => {
            // 戻りは行きより遅く、わずかに行き過ぎる。同じ速さで戻すと
            // 「押された」ではなく「点滅した」に見える。
            cell.style.transition = "transform 320ms cubic-bezier(0.2,0.8,0.3,1.2)";
            cell.style.transform = "";
          }, 100),
        );
      }, delayMs),
    );
  }
  return () => {
    for (const t of timers) clearTimeout(t);
    for (const c of touched) {
      c.style.transition = "";
      c.style.transform = "";
    }
  };
}
