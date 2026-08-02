import type { LandingCtx, LandingRunner } from "./types";

/** 歴代のキャッチ演出(1ceb603 時点)。 */
export const v2fullwidth: LandingRunner = async (ctx: LandingCtx) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([18, 40, 60]);
  // §14 reduced motion: the full-screen fly-to-cabinet flight is exactly the
  // vestibular motion to avoid — keep the chime/haptic, skip the travel.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  // give the fly image one frame to mount
  await new Promise((r) => setTimeout(r, 30));
  const startEl = ctx.startEl;
  const fly = ctx.fly;
  const dexEl = ctx.dexEl;
  if (!startEl || !fly || !dexEl) {
    await new Promise((r) => setTimeout(r, 700));
    return;
  }
  const from = startEl.getBoundingClientRect();
  const to = dexEl.getBoundingClientRect();
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  // Set initial position for the flying cutout
  fly.style.left = `${from.left}px`;
  fly.style.top = `${from.top}px`;
  fly.style.width = `${from.width}px`;
  fly.style.height = `${from.height}px`;
  fly.style.opacity = "1";
  fly.style.transform = "translate(0,0) scale(1)";
  // Position the shimmer trail overlay to match
  const trail = document.getElementById("catch-trail");
  if (trail) {
    trail.style.left = `${fromCx}px`;
    trail.style.top = `${fromCy}px`;
  }
  void fly.offsetWidth;

  // --- 第1幕: 画面いっぱいに「バン」と拡大 + 単語ドーン ---------------------
  // 画像全体が画面いっぱいに広がるように、ビューポート幅いっぱいまで拡大する
  // (以前の 0.9×短辺 だと横に余白が残っていた)。fly は object-contain なので
  // 正方形の写真も全体が見えたまま画面幅まで広がる。
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const heroScale = (vw * 1.0) / Math.max(from.width, 1);
  const dxHero = vw / 2 - fromCx;
  const dyHero = vh * 0.42 - fromCy;
  fly.style.transition = "transform 460ms cubic-bezier(0.2, 0.9, 0.3, 1.18)";
  fly.style.transform = `translate(${dxHero}px, ${dyHero}px) scale(${heroScale})`;
  const flash = document.getElementById("catch-hero-flash");
  const wordEl = document.getElementById("catch-hero-word");
  if (flash) flash.classList.add("hero-flash-play");
  if (wordEl) wordEl.classList.add("hero-word-play");
  await new Promise((r) => setTimeout(r, 460));
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
  await new Promise((r) => setTimeout(r, 480)); // 見せ場のタメ

  // --- 第2幕: ふわっと上に抜けて図鑑ページへ(着弾は図鑑側の slam-in) -----
  if (wordEl) wordEl.classList.remove("hero-word-play");
  fly.style.transition = "transform 480ms cubic-bezier(0.55, -0.1, 0.6, 0.9), opacity 480ms ease";
  fly.style.transform = `translate(${dxHero}px, ${dyHero - vh * 0.5}px) scale(${heroScale * 0.5})`;
  fly.style.opacity = "0";
  if (trail)
    trail.style.transform = `translate(-50%, -50%) translate(${dxHero}px, ${dyHero - vh * 0.5}px)`;
  await new Promise((r) => setTimeout(r, 480));
  if (flash) flash.classList.remove("hero-flash-play");
  // Small pulse on the dex tab as the page opens (the real「バン」is the
  // slam-in of the new cell on the dex grid, driven by ?justCaught=).
  dexEl.classList.add("dex-impact");
  void to;
  setTimeout(() => dexEl.classList.remove("dex-impact"), 900);
};
