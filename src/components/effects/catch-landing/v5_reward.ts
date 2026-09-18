import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import type { LandingRunner } from "./types";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 動きの曲線。**`styles.css` の `--ease-ios` と同じ値**。
 *
 * Web Animations API は easing に CSS 変数を取れないので、ここだけ実体で持つ。
 * 二重に書いた値は必ずずれるので、同じ値であることを門で見張っている
 * (`language-plumbing.test.ts`)。
 *
 * ## なぜ要るのか
 * この演出の `.animate()` 9本のうち**3本が easing 未指定＝linear** だった。
 * linear は等速で、止まる瞬間も同じ速さのまま消える — 物理的にありえない
 * 動きなので、短くても「機械が動いた」ように見える。とくに
 * 位置が動くもの(下へ 14px 逃げる一言)で linear は明確に誤り。
 */
const EASE_IOS = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * 保存後の新しい標準演出。過去版の振り付けは使わず、押し込まれた物体が
 * 浮き、張力を蓄え、解放され、図鑑へ渡る一続きの運動として組む。
 */
async function waitForDestination(id: string): Promise<HTMLElement | null> {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const target = document.getElementById(`dex-cell-${id}`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return document.getElementById(`dex-cell-${id}`);
    }
    await wait(32);
  }
  return null;
}

export const v5reward: LandingRunner = async ({
  startEl,
  fly,
  speakLine,
  destinationId,
  getDestinationId,
  openDex,
  gate,
}) => {
  const root = document.getElementById("reward-catch");
  if (!root || !startEl || !fly) {
    speakLine?.();
    if (gate) {
      try {
        await gate;
      } catch {
        return;
      }
    }
    await openDex?.();
    return;
  }

  // **枠ではなく、絵そのものを測る。**
  // 渡されるのはカードの箱で、中の写真は `p-6` ぶん内側に在り、縁と地の色も
  // 付いている。箱の寸法で飛ばすと `object-contain` が写真を箱いっぱいまで
  // 広げるので、離陸の瞬間に **16% ほど大きくなって**「別の物に入れ替わった」
  // ように見える。中に img が在ればそれを測る(無ければ従来どおり枠)。
  const measured = startEl.querySelector("img") ?? startEl;
  const source = measured.getBoundingClientRect();
  const width = Math.max(source.width, 1);
  const height = Math.max(source.height, 1);
  const centerX = source.left + width / 2;
  const centerY = source.top + height / 2;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const targetWidth = Math.min(viewportWidth * 0.9, viewportHeight * 0.52, 560);
  const heroScale = targetWidth / width;
  const heroX = viewportWidth / 2 - centerX;
  const heroY = viewportHeight * 0.38 - centerY;

  fly.style.left = `${source.left}px`;
  fly.style.top = `${source.top}px`;
  fly.style.width = `${width}px`;
  fly.style.height = `${height}px`;
  fly.style.opacity = "1";
  fly.style.transformOrigin = "50% 50%";

  root.dataset.stage = "grip";
  Sound.rewardGrip();
  haptic("selection");
  await fly.animate(
    [
      { transform: "translate3d(0, 2px, 0) scale3d(.985,.972,1) rotateX(2deg)" },
      { transform: "translate3d(0, -2px, 0) scale3d(1.018,1.018,1) rotateX(0deg)" },
    ],
    { duration: 180, easing: "cubic-bezier(.22,.78,.22,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "lift";
  Sound.rewardLift();
  Sound.itemFanfare();
  await fly.animate(
    [
      { transform: "translate3d(0,-2px,0) scale(1.018) rotateX(0deg)" },
      {
        offset: 0.2,
        transform: `translate3d(${heroX * 0.2}px,${heroY * 0.35}px,0) scale(${1 + (heroScale - 1) * 0.08}) rotateZ(-1.4deg)`,
      },
      {
        transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.96}) rotateZ(.35deg)`,
      },
    ],
    { duration: 440, easing: "cubic-bezier(.14,.72,.18,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "charge";
  Sound.rewardCharge();
  await fly.animate(
    [
      {
        transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.96}) rotateZ(.35deg)`,
      },
      {
        offset: 0.72,
        transform: `translate3d(${heroX}px,${heroY - 3}px,0) scale(${heroScale}) rotateZ(0deg)`,
      },
      {
        transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.972}) rotateZ(0deg)`,
      },
    ],
    { duration: 200, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "hold";
  await wait(60);
  root.dataset.stage = "break";
  speakLine?.();
  Sound.rewardBreak();
  setTimeout(() => haptic("heavy"), 32);
  await fly.animate(
    [
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.972})` },
      {
        offset: 0.58,
        transform: `translate3d(${heroX}px,${heroY - 7}px,0) scale(${heroScale * 1.065})`,
      },
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale})` },
    ],
    { duration: 340, easing: "cubic-bezier(.16,1.3,.3,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "reveal";
  await wait(1000);
  // **見せ場の1秒は、保存を待つ関所も兼ねる。**
  // 演出は押した瞬間に始まっているので、ここでまだ保存が終わっていない
  // ことがある。ここで待たないと、演出の後に無言の待ち時間が現れる
  // (見せ場の後に空白が来るのが、いちばん間の抜けた形)。
  // **転んだらここで畳む。** 受け渡し(図鑑へ飛び込む)まで進んでしまうと、
  // 保存に失敗したのに祝ってから謝ることになる。覆いを外すのは呼ぶ側。
  if (gate) {
    try {
      await gate;
    } catch {
      root.dataset.stage = "idle";
      return;
    }
  }

  root.dataset.stage = "transfer";
  Sound.rewardTransfer();
  const heroRect = fly.getBoundingClientRect();
  const handoff = root.cloneNode(true) as HTMLElement;
  handoff.id = "reward-catch-handoff";
  handoff.dataset.stage = "reveal";
  const handoffImage = handoff.querySelector(".reward-catch__image") as HTMLImageElement | null;
  if (!handoffImage) return;
  handoffImage.style.left = `${heroRect.left}px`;
  handoffImage.style.top = `${heroRect.top}px`;
  handoffImage.style.width = `${heroRect.width}px`;
  handoffImage.style.height = `${heroRect.height}px`;
  handoffImage.style.transform = "none";
  handoffImage.style.transformOrigin = "0 0";
  handoffImage.style.opacity = "1";
  // 着地先は**いま**読む。冒頭で分解した値は、押した時点ではまだ null。
  const targetId = getDestinationId?.() ?? destinationId;
  document.documentElement.dataset.rewardFlight = targetId ?? "active";
  document.body.appendChild(handoff);
  root.style.opacity = "0";

  /**
   * **ここから先の後始末は、必ず走らせる。**
   *
   * この関数はここで3つの物を「借りて」いる:
   *   ・`handoff` — `document.body` に直接足した複製。React は知らないので、
   *     消すのはこちらの責任。残ると図鑑の上に画像が貼り付いたままになる
   *     (`#reward-catch-handoff` は `inset:0 / z-index:10000`)。
   *   ・`<html data-reward-flight>` — 着地中だけ `.slam-in` を止める印。
   *     残ると**以後の着地演出が全部出なくなる**。
   *   ・図鑑のセルの `visibility:hidden` — 飛んでいる間だけ本物を隠す。
   *     残ると**いま捕まえた語だけが図鑑で見えない**。どれも再読み込み
   *     するまで直らない。
   *
   * 以前は後始末が最後の `try/finally` の中だけに在り、その手前の
   *   ・`openDex()` の失敗
   *   ・着弾先が見つからなかったときの淡色化
   *   ・飛行(720ms)の中断 — 図鑑の再描画で対象の節点が消えると
   *     `animate().finished` は AbortError で落ちる
   * の3経路が**借りたまま抜けていた**。借りた直後から包む。
   */
  let hiddenCell: HTMLElement | null = null;
  try {
    await openDex?.();
    // **`targetId` を使う。`destinationId` ではない。** 冒頭で分解した
    // `destinationId` は押した時点の値で、保存がまだ終わっていない回は
    // `undefined`。`gate` を待った後に読み直した `targetId`(163行目)が
    // 本当の着地先。ここを取り違えると、飛んだ絵が着く所を見失って
    // 淡く消えて終わる — **捕まえたのに図鑑へ入らなかったように見える**。
    const target = targetId ? await waitForDestination(targetId) : null;
    if (!target) {
      await handoff.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        easing: EASE_IOS,
        fill: "forwards",
      }).finished;
      return;
    }

    const targetRect = target.getBoundingClientRect();
    target.style.visibility = "hidden";
    hiddenCell = target;
    const dx = targetRect.left - heroRect.left;
    const dy = targetRect.top - heroRect.top;
    const sx = targetRect.width / Math.max(heroRect.width, 1);
    const sy = targetRect.height / Math.max(heroRect.height, 1);
    handoff.dataset.stage = "flight";
    const veil = handoff.querySelector(".reward-catch__veil") as HTMLElement | null;
    const copy = handoff.querySelector(".reward-catch__copy") as HTMLElement | null;
    const backgroundMotion = [
      veil?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 420,
        easing: EASE_IOS,
        fill: "forwards",
      }).finished,
      copy?.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(14px)" },
        ],
        { duration: 260, easing: EASE_IOS, fill: "forwards" },
      ).finished,
    ].filter(Boolean);
    await Promise.all([
      handoffImage.animate(
        [
          { transform: "translate3d(0,0,0) scale(1) rotateZ(0deg)", offset: 0 },
          {
            transform: `translate3d(${dx * 0.42}px,${dy * 0.25 - 28}px,0) scale(${1 - (1 - sx) * 0.2},${1 - (1 - sy) * 0.2}) rotateZ(-3deg)`,
            offset: 0.32,
          },
          {
            transform: `translate3d(${dx * 0.88}px,${dy * 0.78 - 18}px,0) scale(${sx * 1.08},${sy * 1.08}) rotateZ(1.2deg)`,
            offset: 0.78,
          },
          { transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy}) rotateZ(0deg)` },
        ],
        { duration: 720, easing: "cubic-bezier(.34,.05,.18,1)", fill: "forwards" },
      ).finished,
      ...backgroundMotion,
    ]);

    handoff.dataset.stage = "impact";
    Sound.shelfLand();
    haptic("heavy");
    // 着弾の跳ね。ここが中断されても外側の `finally` が借り物を返すので、
    // 以前あった内側の `try/finally` は要らない(同じ後始末の二重書きだった)。
    await handoffImage.animate(
      [
        { transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})` },
        {
          transform: `translate3d(${dx}px,${dy + targetRect.height * 0.035}px,0) scale(${sx * 1.07},${sy * 0.9})`,
          offset: 0.28,
        },
        {
          transform: `translate3d(${dx}px,${dy - targetRect.height * 0.045}px,0) scale(${sx * 0.98},${sy * 1.04})`,
          offset: 0.58,
        },
        { transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})` },
      ],
      { duration: 360, easing: "cubic-bezier(.2,.9,.3,1)", fill: "forwards" },
    ).finished;
  } finally {
    // 借りた物を返す。どの経路で抜けても、ここだけは通る。
    if (hiddenCell) hiddenCell.style.visibility = "";
    handoff.remove();
    delete document.documentElement.dataset.rewardFlight;
    // 覆いの層は呼ぶ側が畳むので普通は残らないが、畳まれなかったときに
    // 透明のまま次の演出に入らないよう、掴んだ見た目は返しておく。
    root.style.opacity = "";
  }
};
