import type { LandingCtx, LandingRunner } from "./types";

/**
 * キャッチの本命(NORI指定 / 2026-08-03)。
 *
 * 暗い画面の中で小さい絵が**ふわっと上昇**し、切り抜きが**画面いっぱい**に
 * 広がって漢字も大きくなり、**キラッと光る**。そこで **0.7秒ほど空中で止まり
 * 単語の発音が鳴る** — ここが見せ場。聴き終えてから上へ抜け、図鑑のページが
 * 開いて、**上からドンと空欄に着地**する(最後の着地は図鑑側の slam-in)。
 *
 * これまでとの違いは「タメ」の置き方。前の版は拡大しきってから間を置かずに
 * 抜けていたので、単語を聴く時間がなかった。ここでは上昇と拡大を分け、
 * 拡大しきった一点で**動きを完全に止めて**音だけを聴かせる。
 */

/** 空中で止まる時間(ms)。単語1〜3文字の発音がちょうど収まる長さ。 */
const HOLD_MS = 700;

export const v4hold: LandingRunner = async (ctx: LandingCtx) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([18, 40, 60]);
  // §14 reduced motion: 画面いっぱいの飛行はまさに避けたい前庭系の動き。
  // 音と振動は残し、移動だけを省く。
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    ctx.speakLine?.();
    await new Promise((r) => setTimeout(r, HOLD_MS));
    return;
  }
  // ここで待つ必要はもう無い。**飛ぶ画像が載るのを待つのは呼ぶ側の仕事**
  // (`runCatchLanding` が ref を見張る)。ここに置いてあった 30ms の待ちは、
  // 渡された `fly` が既に「その瞬間の写し」だったので**一度も効いていなかった**。
  const startEl = ctx.startEl;
  const fly = ctx.fly;
  const dexEl = ctx.dexEl;
  if (!startEl || !fly || !dexEl) {
    ctx.speakLine?.();
    await new Promise((r) => setTimeout(r, 900));
    return;
  }
  const from = startEl.getBoundingClientRect();
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  fly.style.left = `${from.left}px`;
  fly.style.top = `${from.top}px`;
  fly.style.width = `${from.width}px`;
  fly.style.height = `${from.height}px`;
  fly.style.opacity = "1";
  fly.style.transform = "translate(0,0) scale(1)";
  const trail = document.getElementById("catch-trail");
  if (trail) {
    trail.style.left = `${fromCx}px`;
    trail.style.top = `${fromCy}px`;
  }
  void fly.offsetWidth;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flash = document.getElementById("catch-hero-flash");
  const wordEl = document.getElementById("catch-hero-word");
  const glint = document.getElementById("catch-glint");

  // --- 第1幕: 小さいままふわっと上昇 -------------------------------------
  // まだ拡大しない。「浮き上がった」ことだけが伝わればいい。
  const dyRise = vh * 0.36 - fromCy;
  fly.style.transition = "transform 320ms cubic-bezier(0.25, 0.8, 0.35, 1)";
  fly.style.transform = `translate(${vw / 2 - fromCx}px, ${dyRise}px) scale(1.12)`;
  if (flash) flash.classList.add("hero-flash-play");
  await new Promise((r) => setTimeout(r, 300));

  // --- 第2幕: 画面いっぱいに広がる + 漢字も大きく + キラッ ----------------
  const heroScale = (vw * 1.0) / Math.max(from.width, 1);
  const dxHero = vw / 2 - fromCx;
  const dyHero = vh * 0.42 - fromCy;
  fly.style.transition = "transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.18)";
  fly.style.transform = `translate(${dxHero}px, ${dyHero}px) scale(${heroScale})`;
  if (wordEl) wordEl.classList.add("hero-word-play");
  await new Promise((r) => setTimeout(r, 420));
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
  // 広がりきった瞬間に一度だけ光が走る
  if (glint) glint.classList.add("glint-play");

  // --- 第3幕: 空中で静止して発音を聴かせる -------------------------------
  // ここでは transition を切って**完全に止める**。動きながらだと音に集中
  // できないし、「止まった」こと自体が単語に注意を向けさせる。
  fly.style.transition = "none";
  ctx.speakLine?.();
  await new Promise((r) => setTimeout(r, HOLD_MS));

  // --- 第4幕: 上へ抜けて図鑑のページへ(着地は図鑑側の slam-in) -----------
  if (wordEl) wordEl.classList.remove("hero-word-play");
  if (glint) glint.classList.remove("glint-play");
  // 消えるのではなく**画面の上へ抜けきる**。そのまま図鑑のページが開き、
  // 上から降ってきて着地する — ひと続きの動きに見せたい。
  fly.style.transition = "transform 420ms cubic-bezier(0.55, -0.1, 0.6, 0.9), opacity 420ms ease";
  fly.style.transform = `translate(${dxHero}px, ${dyHero - vh * 1.0}px) scale(${heroScale * 0.42})`;
  fly.style.opacity = "0.15";
  if (trail)
    trail.style.transform = `translate(-50%, -50%) translate(${dxHero}px, ${dyHero - vh * 1.0}px)`;
  await new Promise((r) => setTimeout(r, 420));
  if (flash) flash.classList.remove("hero-flash-play");
  // 図鑑タブが小さく跳ねる。本当の「ドン」は図鑑のセルが上から落ちてくる
  // slam-in(?justCaught= を見て図鑑側が出す)。
  dexEl.classList.add("dex-impact");
  setTimeout(() => dexEl.classList.remove("dex-impact"), 900);
};
