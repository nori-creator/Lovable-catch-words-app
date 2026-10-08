import { markFlown } from "@/lib/catch-flight";
import { Sound } from "@/lib/sound-engine";
import { Score, SCORE } from "@/lib/celebration-score";
import { haptic } from "@/lib/haptics";
import type { LandingRunner } from "./types";
import { loadConfetti3d } from "@/components/three/load-confetti";
import {
  LANDING_CELL_WAIT_MS,
  LANDING_GIVE_UP_MS,
  findLandingTarget,
  landingBoxFor,
  type LandingTargetKind,
} from "@/lib/landing-target";

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
/**
 * 着地先を探す（`lib/landing-target.ts`）。まずその札のマス目を待ち、待ちきれなければ
 * **その語のカテゴリーの見出し**（無ければ図鑑のタブ）へ降ろす。
 *
 * 前はマス目だけを5秒待ち、見つからなければ淡く消えて終わっていた。文字で調べた語は
 * 図鑑の読み直しが追いつかない回が多く、**図鑑へ入っていく動きが無い**ように見えた
 * （オーナー報告 2026-10-08）。
 */
async function waitForDestination(
  id: string | undefined,
  categoryKey: string | null | undefined,
): Promise<{ el: HTMLElement; kind: LandingTargetKind } | null> {
  const started = performance.now();
  const visible = (selector: string): HTMLElement | null => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // 畳まれた・描かれていない要素（幅も高さも 0）は受け口にしない。
    return r.width > 0 || r.height > 0 ? el : null;
  };
  while (performance.now() - started < LANDING_GIVE_UP_MS) {
    const fallback = performance.now() - started >= LANDING_CELL_WAIT_MS;
    const found = findLandingTarget(visible, { id, categoryKey, fallback });
    if (found) {
      // 画面の外なら見える所まで送る（カテゴリーが下の方に在る・まだ巻き取っていない）。
      // 図鑑のタブは下に固定なので送らない。
      if (found.kind !== "tab") {
        found.el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }
      // 送った間に描き直されていたら、同じ物を探し直す。
      if (!found.el.isConnected) continue;
      return found;
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
  getDestinationCategory,
  openDex,
  gate,
  intensity = "full",
}) => {
  /**
   * **普段のキャッチは短く**（`lib/catch-animation-pref.ts`）。同じ動きの流れのまま、
   * BGM（溜め・打撃・解決）・紙吹雪・光の輪を省き、間を詰める。語は必ず読み、
   * 読み終わるまでは次へ進まない（発音が芯）。
   */
  const short = intensity === "short";
  const ms = (full: number, brief: number) => (short ? brief : full);
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
  const peelArt = startEl.querySelector(".cw-peel-art");
  const measured = peelArt ?? startEl.querySelector("img") ?? startEl;
  const bounds = measured.getBoundingClientRect();
  // The alpha image occupies 32..288 inside the 320px SVG viewBox.
  const source = peelArt
    ? {
        left: bounds.left + bounds.width * 0.0625,
        top: bounds.top + bounds.height * 0.0625,
        width: bounds.width * 0.875,
        height: bounds.height * 0.875,
      }
    : bounds;
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

  // 0–120ms release; 120–600ms entrance + signature; 600ms name/voice;
  // voice end: glint 180ms + 280ms afterglow; ascent 320ms; drop 240ms; bounce 560ms.
  root.dataset.stage = "grip";
  root.dataset.intensity = short ? "short" : "full";
  // 着地の音（録った「シュッ→ドン」）を先に読み解いておく。着地まで2秒以上ある。
  // 弾ける瞬間の 3D の紙吹雪も、ここで読み始める（three.js は重いので、この演出の
  // 時にだけ読む）。0.6 秒後の「弾ける」には間に合う。
  // 2026-10-03: 読むだけでなく**ここで用意まで済ませる**（canvas・WebGL・材質の組み立て）。
  // 弾ける瞬間に組み立てていた時は、ここで主の処理が数秒固まっていた（UI 監査）。
  const confetti = short
    ? Promise.resolve(null)
    : loadConfetti3d()
        .then((m) => m.prepareConfetti3d({ from: { x: 0.5, y: 0.38 }, count: 120 }, 83, root))
        .catch(() => null);
  Sound.rewardGrip();
  haptic("selection");
  await fly.animate(
    [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-8px) scale(1.025)" }],
    { duration: ms(120, 80), easing: EASE_IOS, fill: "forwards" },
  ).finished;

  root.dataset.stage = "lift";
  // 祝福の BGM（`celebration-score.ts`）。浮き上がる間に溜め、止まる瞬間に解放。
  // 短い版は鳴らさない（毎回の BGM は2回目から待ち時間に聞こえる）。
  if (!short) Score.build();
  haptic(short ? "light" : "medium");
  await fly.animate(
    [
      { transform: "translateY(-8px) scale(1.025)" },
      {
        offset: 0.72,
        transform: `translate(${heroX}px,${heroY - 12}px) scale(${heroScale * 1.06}) rotate(-2deg)`,
      },
      { transform: `translate(${heroX}px,${heroY}px) scale(${heroScale}) rotate(0deg)` },
    ],
    { duration: ms(480, 340), easing: "cubic-bezier(.16,.8,.22,1)", fill: "forwards" },
  ).finished;

  root.dataset.stage = "break";
  haptic("success");
  if (short) Sound.itemGlint();
  else Score.hit();
  // 札の後ろから、光を受けて明滅する本物の紙と金の箔が弾ける（`confetti3d.ts`）。
  // 演出の層の中で、札（z 84）の後ろ・光の粒（z 83）の手前に置く。WebGL が無ければ
  // 何も出さない（今まで通り）。
  void confetti.then((ready) => ready?.fire());
  // **語は打撃の響きが引いてから読む**。読む間は BGM を 20dB 下げる
  // （発音を聞き取れることが、このアプリでいちばん大事）。
  // 短い版は BGM が無いので、待たずに読む。
  const spoken = wait(short ? 0 : SCORE.speechDelayMs)
    .then(() => {
      if (!short) Score.duck(true);
      return speakLine?.();
    })
    .catch(() => {});
  await fly.animate(
    [
      { transform: `translate(${heroX}px,${heroY}px) scale(${heroScale})` },
      {
        offset: 0.4,
        transform: `translate(${heroX}px,${heroY - 5}px) scale(${heroScale * 1.025})`,
      },
      { transform: `translate(${heroX}px,${heroY}px) scale(${heroScale})` },
    ],
    { duration: ms(280, 200), easing: EASE_IOS, fill: "forwards" },
  ).finished;
  // Keep burst running, and don't leave while the word is still being read.
  await Promise.race([spoken, wait(2600)]);
  root.dataset.stage = "reveal";
  if (short) {
    // 短い版は二度目の山を省く。読み終えたら一息だけ置いて渡る。
    await wait(120);
  } else {
    // 二度目の山: ソの和音からドの和音へ（BGM もここで元の大きさに戻る）。
    Score.resolve();
    Sound.itemGlint();
    haptic("light");
    await fly.animate(
      [
        { filter: "brightness(1) drop-shadow(0 22px 30px #0008)" },
        { filter: "brightness(1.45) drop-shadow(0 0 26px #90edff99)", offset: 0.35 },
        { filter: "brightness(1) drop-shadow(0 22px 30px #0008)" },
      ],
      { duration: 180, easing: "ease-out" },
    ).finished;
    await wait(280);
  }
  if (gate) {
    // Slow storage must not leave a frozen reward image. Do not claim a landing
    // until persistence succeeds; keep the photo gently airborne while it waits.
    const hover = fly.animate(
      [
        { transform: `translate(${heroX}px,${heroY}px) scale(${heroScale})` },
        { transform: `translate(${heroX}px,${heroY - 9}px) scale(${heroScale * 1.015})` },
        { transform: `translate(${heroX}px,${heroY}px) scale(${heroScale})` },
      ],
      { duration: 900, iterations: Infinity, easing: "ease-in-out" },
    );
    try {
      await gate;
    } catch {
      root.dataset.stage = "idle";
      Score.stop();
      return;
    } finally {
      hover.cancel();
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
  // この札の着地はここが受け持つ。図鑑の側の落下演出はもう走らせない（`catch-flight.ts`）。
  if (targetId) markFlown(targetId);
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
    // **探している間も止めない**（オーナー報告 2026-10-08「語が白い画面で数秒止まる」）。
    // マス目が描かれるのを待つ間、札は浮いたまま小さく息をする。
    const searching = handoffImage.animate(
      [
        { transform: "translate(0,0) scale(1)" },
        { transform: "translate(0,-9px) scale(1.015)" },
        { transform: "translate(0,0) scale(1)" },
      ],
      { duration: 900, iterations: Infinity, easing: "ease-in-out" },
    );
    let found: Awaited<ReturnType<typeof waitForDestination>>;
    try {
      found = await waitForDestination(targetId, getDestinationCategory?.());
    } finally {
      searching.cancel();
    }
    if (!found) {
      await handoff.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        easing: EASE_IOS,
        fill: "forwards",
      }).finished;
      return;
    }

    const target = found.el;
    /** その札そのもの（マス目・行）に降りるか。見出し・タブなら、着いたら写しを溶かす。 */
    const onCell = found.kind === "cell" || found.kind === "item";
    const targetRect = landingBoxFor(
      found.kind,
      (onCell ? (target.querySelector("img") ?? target) : target).getBoundingClientRect(),
    );
    if (onCell) {
      target.style.visibility = "hidden";
      hiddenCell = target;
    }
    const dx = targetRect.left - heroRect.left;
    const dy = targetRect.top - heroRect.top;
    const sx = targetRect.width / Math.max(heroRect.width, 1);
    const sy = targetRect.height / Math.max(heroRect.height, 1);
    handoff.dataset.stage = "flight";
    const veil = handoff.querySelector(".reward-catch__veil") as HTMLElement | null;
    const copy = handoff.querySelector(".reward-catch__copy") as HTMLElement | null;
    const backgroundMotion = [
      veil?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 320,
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
    const apexX = dx * 0.3;
    const apexY = -Math.min(190, viewportHeight * 0.24);
    await Promise.all([
      handoffImage.animate(
        [
          { transform: "translate(0,0) scale(1)" },
          { transform: `translate(${apexX}px,${apexY}px) scale(.82) rotate(-5deg)` },
        ],
        { duration: ms(320, 240), easing: "cubic-bezier(.12,.8,.22,1)", fill: "forwards" },
      ).finished,
      ...backgroundMotion,
    ]);
    // 落ちる間は軽い「ひゅっ」だけ。着いた瞬間に柔らかい音（`Sound.softLand`）。
    // 前は録った「シュッ→ドン」を鳴らしていたが、ドスンと強すぎた（オーナー指示
    // 2026-09-28 R14「もっと柔らかく着地する音に」）。
    Sound.itemDrop();
    await handoffImage.animate(
      [
        { transform: `translate(${apexX}px,${apexY}px) scale(.82) rotate(-5deg)` },
        { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy}) rotate(0deg)` },
      ],
      { duration: ms(240, 200), easing: "cubic-bezier(.65,0,1,.45)", fill: "forwards" },
    ).finished;

    handoff.dataset.stage = "impact";
    Sound.softLand();
    if (!short) Score.land();
    haptic("light");
    /**
     * **着地した瞬間に、本物の札へ入れ替える**（オーナー指示 2026-09-28「着地すると
     * 同時に図鑑に追加されるタイミング画像が少し縮むようなバウンス…一連にして」）。
     *
     * 前は飛んできた写しが着地先の上で跳ね（560ms）、跳ね終わってから本物と
     * 入れ替えていた。入れ替えの瞬間に本物の側の落下演出が頭から走り、写真が
     * 一度消えて上から落ち直していた。いまは着いた瞬間に写しを外して本物を見せ、
     * **本物の札そのもの**が少しつぶれて戻る — 飛ぶ・着く・収まるが1つの動きになる。
     */
    target.style.visibility = "";
    hiddenCell = null;
    if (onCell) {
      handoffImage.style.opacity = "0";
    } else {
      // 本物の札がまだ並んでいない所へ降りた。写しを小さく溶かして「入った」を見せる。
      void handoffImage
        .animate(
          [
            { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 1 },
            { transform: `translate(${dx}px,${dy}px) scale(${sx * 0.4},${sy * 0.4})`, opacity: 0 },
          ],
          { duration: 220, easing: EASE_IOS, fill: "forwards" },
        )
        .finished.catch(() => undefined);
    }
    target.animate([{ boxShadow: "0 0 0 0 #58d7ff99" }, { boxShadow: "0 0 0 24px #58d7ff00" }], {
      duration: 600,
      easing: "ease-out",
    });
    const shelf = onCell ? target.parentElement : null;
    shelf?.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(4px)", offset: 0.2 },
        { transform: "translateY(-1px)", offset: 0.5 },
        { transform: "translateY(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
    const origin = target.style.transformOrigin;
    target.style.transformOrigin = "50% 100%";
    try {
      await target.animate(
        [
          { transform: "scale(1, 1)" },
          { transform: "scale(1.08, 0.86)", offset: 0.18 },
          { transform: "scale(0.97, 1.04)", offset: 0.5 },
          { transform: "scale(1.01, 0.99)", offset: 0.75 },
          { transform: "scale(1, 1)" },
        ],
        { duration: ms(460, 340), easing: "cubic-bezier(.2,.9,.3,1)" },
      ).finished;
    } finally {
      target.style.transformOrigin = origin;
    }
  } finally {
    // 借りた物を返す。どの経路で抜けても、ここだけは通る。
    // BGM の鳴り残し（語の下で続く和音）もここで必ず消す。
    Score.stop();
    if (hiddenCell) hiddenCell.style.visibility = "";
    handoff.remove();
    delete document.documentElement.dataset.rewardFlight;
    // 覆いの層は呼ぶ側が畳むので普通は残らないが、畳まれなかったときに
    // 透明のまま次の演出に入らないよう、掴んだ見た目は返しておく。
    root.style.opacity = "";
    delete root.dataset.intensity;
  }
};
