import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import type { LandingRunner } from "./types";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
  openDex,
}) => {
  const root = document.getElementById("reward-catch");
  if (!root || !startEl || !fly) {
    speakLine?.();
    await wait(650);
    return;
  }

  const source = startEl.getBoundingClientRect();
  const width = Math.max(source.width, 1);
  const height = Math.max(source.height, 1);
  const centerX = source.left + width / 2;
  const centerY = source.top + height / 2;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const targetWidth = Math.min(viewportWidth * 0.76, 350);
  const heroScale = targetWidth / width;
  const heroX = viewportWidth / 2 - centerX;
  const heroY = viewportHeight * 0.38 - centerY;

  fly.style.left = `${source.left}px`;
  fly.style.top = `${source.top}px`;
  fly.style.width = `${width}px`;
  fly.style.height = `${height}px`;
  fly.style.opacity = "1";
  fly.style.transformOrigin = "50% 70%";

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
  await fly.animate(
    [
      { transform: "translate3d(0,-2px,0) scale(1.018) rotateX(0deg)" },
      { offset: 0.2, transform: `translate3d(${heroX * 0.2}px,${heroY * 0.35}px,0) scale(${1 + (heroScale - 1) * 0.08}) rotateZ(-1.4deg)` },
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.96}) rotateZ(.35deg)` },
    ],
    { duration: 440, easing: "cubic-bezier(.14,.72,.18,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "charge";
  Sound.rewardCharge();
  await fly.animate(
    [
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.96}) rotateZ(.35deg)` },
      { offset: 0.72, transform: `translate3d(${heroX}px,${heroY - 3}px,0) scale(${heroScale}) rotateZ(0deg)` },
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.972}) rotateZ(0deg)` },
    ],
    { duration: 560, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "hold";
  await wait(96);
  root.dataset.stage = "break";
  Sound.rewardBreak();
  setTimeout(() => haptic("heavy"), 32);
  await fly.animate(
    [
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale * 0.972})` },
      { offset: 0.58, transform: `translate3d(${heroX}px,${heroY - 7}px,0) scale(${heroScale * 1.065})` },
      { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale})` },
    ],
    { duration: 340, easing: "cubic-bezier(.16,1.3,.3,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "reveal";
  speakLine?.();
  await wait(1000);

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
  handoffImage.style.opacity = "1";
  document.documentElement.dataset.rewardFlight = destinationId ?? "active";
  document.body.appendChild(handoff);
  root.style.opacity = "0";

  await openDex?.();
  const target = destinationId ? await waitForDestination(destinationId) : null;
  if (!target) {
    await handoff.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).finished;
    handoff.remove();
    delete document.documentElement.dataset.rewardFlight;
    return;
  }

  const targetRect = target.getBoundingClientRect();
  target.style.visibility = "hidden";
  const dx = targetRect.left - heroRect.left;
  const dy = targetRect.top - heroRect.top;
  const sx = targetRect.width / Math.max(heroRect.width, 1);
  const sy = targetRect.height / Math.max(heroRect.height, 1);
  handoff.dataset.stage = "flight";
  const veil = handoff.querySelector(".reward-catch__veil") as HTMLElement | null;
  const copy = handoff.querySelector(".reward-catch__copy") as HTMLElement | null;
  const backgroundMotion = [
    veil?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: "forwards" }).finished,
    copy?.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(14px)" },
      ],
      { duration: 260, fill: "forwards" },
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
  await handoffImage.animate(
    [
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})` },
      { transform: `translate3d(${dx}px,${dy + targetRect.height * 0.035}px,0) scale(${sx * 1.07},${sy * 0.9})`, offset: 0.28 },
      { transform: `translate3d(${dx}px,${dy - targetRect.height * 0.045}px,0) scale(${sx * 0.98},${sy * 1.04})`, offset: 0.58 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})` },
    ],
    { duration: 360, easing: "cubic-bezier(.2,.9,.3,1)", fill: "forwards" },
  ).finished;
  target.style.visibility = "";
  handoff.remove();
  delete document.documentElement.dataset.rewardFlight;
};