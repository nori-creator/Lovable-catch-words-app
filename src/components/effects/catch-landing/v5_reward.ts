import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import type { LandingRunner } from "./types";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 保存後の新しい標準演出。過去版の振り付けは使わず、押し込まれた物体が
 * 浮き、張力を蓄え、解放され、図鑑へ渡る一続きの運動として組む。
 */
export const v5reward: LandingRunner = async ({ startEl, fly, speakLine }) => {
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
  await wait(170);
  speakLine?.();
  await wait(760);

  root.dataset.stage = "transfer";
  Sound.rewardTransfer();
  await Promise.all([
    fly.animate(
      [
        { transform: `translate3d(${heroX}px,${heroY}px,0) scale(${heroScale}) rotateX(0deg)`, opacity: 1 },
        { transform: `translate3d(${heroX}px,${heroY - viewportHeight * 0.72}px,0) scale(${heroScale * 0.34}) rotateX(-18deg)`, opacity: 0 },
      ],
      { duration: 450, easing: "cubic-bezier(.6,0,.85,.38)", fill: "forwards" },
    ).finished,
    wait(450),
  ]);
};