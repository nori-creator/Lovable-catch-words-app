/**
 * **キャッチの祝福の絵の別案**（オーナー指示 2026-09-27）。頂点の瞬間に
 * 1度だけ鳴る「はじけ」。写真（シール）の後ろ・周りに重ねる。
 *
 * - ring … 光の輪が広がって消える（静かで上品）
 * - confetti … 紙吹雪が四方へ散って落ちる（にぎやか）
 * - stars … 小さな星がきらめいて散る（その中間）
 *
 * `key` を変えるたびに頭から再生する。動きを減らす設定では出さない
 * （`html[data-motion="reduce"] .burst`）。
 */
export type BurstKind = "ring" | "confetti" | "stars";

const CONFETTI_COLORS = ["#0a84ff", "#ff9f0a", "#30d158", "#ff375f", "#bf5af2", "#ffd60a"];

export function CelebrationBurst({ kind }: { kind: BurstKind }) {
  if (kind === "ring") {
    return (
      <div className="burst burst--ring" aria-hidden>
        <span />
        <span />
      </div>
    );
  }
  const n = kind === "confetti" ? 28 : 14;
  return (
    <div className={`burst burst--${kind}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = kind === "confetti" ? 120 + (i % 5) * 22 : 70 + (i % 4) * 18;
        return (
          <span
            key={i}
            style={
              {
                "--dx": `${Math.cos(a) * dist}px`,
                "--dy": `${Math.sin(a) * dist}px`,
                "--rot": `${(i * 47) % 360}deg`,
                "--c": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 4) * 0.02}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
