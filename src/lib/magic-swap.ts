/**
 * **解説が作り直されたときの「魔法の入れ替わり」**（オーナー指示 2026-09-27、
 * 新幹線アプリの動画を参考に）。
 *
 * > 「解説を作り直す時、古い解説を残したまま、新しい解説ができたら
 * >  ふわっと魔法のように新しくなるアニメーション」
 *
 * 参考動画では、古いチケット欄が**砂のように崩れて**消え、同じ場所に
 * 新しい中身（QR）が**粒から集まって**現れる。ここでは:
 *
 *  1. 作り直している間は古い解説を**そのまま**見せる（光の筋が静かに流れる
 *     `magic-wait` だけ）。読みかけを奪わない。
 *  2. 新しい解説が届いたら、古い解説の**写し**（DOM の複製）を上に重ね、
 *     左から右へ**砂になって散る**（SVG の乱れ模様で字を崩し、帯状に消す）。
 *  3. 同時に、下の新しい解説が**ぼかしの中から浮かび上がる**。
 *
 * 写しを使うので、どの項目の中身でも同じ仕掛けで動く。React の描き直しを
 * 待たせない（届いた瞬間に新しい物が下に在り、写しが消えていくだけ）。
 *
 * 動きを減らす設定の人には、崩しも浮かび上がりも使わず、短い重ね替えだけ。
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const DURATION = 1100;
let seq = 0;

function filterHost(): SVGSVGElement {
  let host = document.getElementById("magic-swap-defs") as SVGSVGElement | null;
  if (!host) {
    host = document.createElementNS(SVG_NS, "svg");
    host.id = "magic-swap-defs";
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    document.body.appendChild(host);
  }
  return host;
}

/** 砂に崩す1回ぶんのフィルター。1回ごとに作って、終われば捨てる。 */
function makeDust(): { id: string; setScale: (v: number) => void; remove: () => void } {
  const id = `magic-dust-${++seq}`;
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.id = id;
  filter.setAttribute("x", "-20%");
  filter.setAttribute("y", "-20%");
  filter.setAttribute("width", "140%");
  filter.setAttribute("height", "140%");
  const noise = document.createElementNS(SVG_NS, "feTurbulence");
  noise.setAttribute("type", "fractalNoise");
  noise.setAttribute("baseFrequency", "0.85");
  noise.setAttribute("numOctaves", "1");
  noise.setAttribute("seed", String(seq % 97));
  noise.setAttribute("result", "n");
  const disp = document.createElementNS(SVG_NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "n");
  disp.setAttribute("scale", "0");
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  filter.append(noise, disp);
  filterHost().appendChild(filter);
  return {
    id,
    setScale: (v) => disp.setAttribute("scale", v.toFixed(1)),
    remove: () => filter.remove(),
  };
}

function reducedMotion(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset.motion === "reduce";
}

/**
 * 入れ替わる前の姿を写しておく。**新しい中身が描かれる前に**呼ぶ。
 * 戻り値を `playMagicSwap` に渡す。
 */
export function snapshotForSwap(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  return ghost;
}

/**
 * 写し（古い姿）を砂にして散らし、`el`（新しい姿）を浮かび上がらせる。
 * `el` の親は `position: relative` でなくてよい — 写しは `el` の位置に合わせて
 * 置く。
 */
export function playMagicSwap(el: HTMLElement | null, ghost: HTMLElement | null): Promise<void> {
  if (!el || !ghost || typeof window === "undefined") return Promise.resolve();
  const parent = el.parentElement;
  if (!parent) return Promise.resolve();

  if (reducedMotion()) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    return Promise.resolve();
  }

  // 写しを新しい姿の真上に重ねる。
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  ghost.style.cssText += `;position:absolute;left:${el.offsetLeft}px;top:${el.offsetTop}px;width:${el.offsetWidth}px;pointer-events:none;margin:0;z-index:2`;
  ghost.classList.add("magic-ghost");
  parent.appendChild(ghost);
  const dust = makeDust();
  ghost.style.filter = `url(#${dust.id})`;

  // 新しい姿: ぼかしの中から、左から右へ浮かび上がる。
  const inAnim = el.animate(
    [
      {
        opacity: 0,
        filter: "blur(10px) saturate(1.6)",
        transform: "translateY(6px) scale(0.985)",
        maskImage: "linear-gradient(90deg, #000 -60%, transparent -10%)",
        WebkitMaskImage: "linear-gradient(90deg, #000 -60%, transparent -10%)",
      },
      {
        opacity: 1,
        filter: "blur(0px) saturate(1)",
        transform: "none",
        maskImage: "linear-gradient(90deg, #000 110%, transparent 160%)",
        WebkitMaskImage: "linear-gradient(90deg, #000 110%, transparent 160%)",
      },
    ],
    {
      duration: DURATION * 0.85,
      delay: DURATION * 0.22,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "backwards",
    },
  );

  // 古い姿: 左から右へ、砂になって上へ流れて消える。
  const outAnim = ghost.animate(
    [
      {
        opacity: 1,
        transform: "none",
        maskImage: "linear-gradient(90deg, transparent -40%, #000 0%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent -40%, #000 0%)",
      },
      {
        opacity: 0,
        transform: "translate(14px, -10px)",
        maskImage: "linear-gradient(90deg, transparent 100%, #000 140%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 100%, #000 140%)",
      },
    ],
    { duration: DURATION, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
  );

  // 崩れの強さは、時間とともに上げる（最初は字が読める → 砂になる）。
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / DURATION);
    dust.setScale(80 * k * k);
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return Promise.all([outAnim.finished, inAnim.finished])
    .catch(() => undefined)
    .then(() => {
      cancelAnimationFrame(raf);
      ghost.remove();
      dust.remove();
    });
}
