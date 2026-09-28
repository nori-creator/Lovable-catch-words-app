import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { playSfx, preloadSfx } from "@/lib/sfx-files";

/**
 * **記念アルバムを開く瞬間の演出**（オーナー指示 2026-09-28「記念アルバムはただの
 * アルバムではなく、特別感のあるアルバムで、アニメーションやセレブレーション、
 * ユーザーの快感を刺激する演出を入れて」）。
 *
 * 流れ（約3.5秒。どこを押しても最後まで飛ばせる）:
 * 1. 夜の幕が下りる（深い青）。奥で光の筋がゆっくり回る。
 * 2. 真ん中の数字が 1 → n 日と数え上がり、**金の箔**に光が走る（数え上がりは
 *    「積み上げた」実感 — 目標勾配。終わりで一拍ためて弾ける）。
 * 3. 弾けた瞬間に、紙吹雪・祝福の音（ハープ）・触覚（成功）を**同じ瞬間**に出す
 *    （Apple の「因果・調和」— 絵と音と手応えを1つの出来事に）。
 * 4. 集めた語の数が数え上がり、思い出の写真が1枚ずつ中央から飛んで扇に並ぶ
 *    （1枚ごとに小さな手応え。変動報酬ではなく「自分の積み重ね」を見せる）。
 * 5. 「アルバムを開く」で幕が上がり、誌面（`MemorialAlbum`）が現れる。
 *
 * 動きを減らす設定（`html[data-motion="reduce"]`）では、最後の絵を静かに出すだけ。
 */
export function MemorialReveal({
  n,
  words,
  photos,
  onDone,
}: {
  n: number;
  words: number;
  /** 扇に並べる写真（最大7枚使う）。 */
  photos: string[];
  onDone: () => void;
}) {
  const t = useT();
  const reduce =
    typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce";
  const [phase, setPhase] = useState<"count" | "burst" | "fan" | "ready" | "leaving">(
    reduce ? "ready" : "count",
  );
  const [day, setDay] = useState(reduce ? n : 1);
  const [count, setCount] = useState(reduce ? words : 0);
  const confetti = useRef<HTMLCanvasElement>(null);
  const fan = photos.slice(0, 7);

  // 1 → n の数え上がり（最後がゆっくり — 一拍ためる）。
  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const dur = 1150;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDay(Math.max(1, Math.round(e * n)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setPhase("burst");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, reduce]);

  // 弾ける: 紙吹雪・音・触覚を同じ瞬間に。続けて語数と写真。
  // **段階が変わっても止めない**（紙吹雪と数え上げは弾けた1回だけ走り切る。
  // 段階ごとに片付けると、次の段階に移った瞬間に紙が空中で固まる）。
  const burst = phase !== "count";
  // 3D の紙吹雪（`components/three/confetti3d.ts`）は開いた時に読み始め、弾ける時には
  // 手元に在るようにする。WebGL の無い端末では今まで通りの 2D の紙吹雪。
  const confetti3d = useRef<Promise<typeof import("@/components/three/confetti3d")> | null>(null);
  useEffect(() => {
    if (!reduce) confetti3d.current = import("@/components/three/confetti3d");
  }, [reduce]);
  useEffect(() => {
    if (!burst || reduce) return;
    haptic("success");
    playCelebrate();
    const canvas = confetti.current;
    let stop: () => void = () => {};
    let gone = false;
    if (canvas) {
      const flat = () => {
        if (!gone) stop = runConfetti(canvas);
      };
      if (confetti3d.current) {
        void confetti3d.current
          .then(({ runConfetti3d }) => {
            if (gone) return;
            const s = runConfetti3d(canvas, { from: "corners", count: 220 });
            if (s) stop = s;
            else flat();
          })
          .catch(flat);
      } else flat();
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setCount((c) => Math.max(c, Math.round((1 - Math.pow(1 - p, 2)) * words)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [burst, reduce, words]);
  useEffect(() => {
    if (phase !== "burst") return;
    const toFan = window.setTimeout(() => setPhase("fan"), 250);
    return () => window.clearTimeout(toFan);
  }, [phase]);

  // 写真が1枚着くごとに小さな手応え。全部着いたら「開く」を出す。
  useEffect(() => {
    if (phase !== "fan") return;
    const k = fan.length;
    const timers = Array.from({ length: k }, (_, i) =>
      window.setTimeout(() => haptic("light"), 380 + i * 110),
    );
    const ready = window.setTimeout(() => setPhase("ready"), 420 + k * 110 + 300);
    return () => {
      timers.forEach((x) => window.clearTimeout(x));
      window.clearTimeout(ready);
    };
  }, [phase, fan.length]);

  const finish = () => {
    if (phase === "leaving") return;
    if (phase !== "ready") {
      // 途中で押したら、最後の絵へ一気に（二度押しで開く）。
      setDay(n);
      setCount(words);
      setPhase("ready");
      return;
    }
    setPhase("leaving");
    window.setTimeout(onDone, reduce ? 0 : 520);
  };

  const shown = phase === "fan" || phase === "ready" || phase === "leaving";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("memorial.title", { n })}
      className="memorial-reveal"
      data-phase={phase}
      onClick={finish}
    >
      <div className="memorial-reveal__rays" aria-hidden />
      <canvas ref={confetti} className="memorial-reveal__confetti" aria-hidden />
      <div className="memorial-reveal__stage">
        <p className="memorial-reveal__kicker">{t("memorial.kicker")}</p>
        <p className="memorial-reveal__number" aria-live="polite">
          <span className="memorial-reveal__digits">{day}</span>
          <span className="memorial-reveal__unit">{t("memorial.daysUnit")}</span>
        </p>
        <p className="memorial-reveal__words" data-on={phase !== "count"}>
          {t("memorial.wordsCaught", { count })}
        </p>
        <div className="memorial-reveal__fan" aria-hidden>
          {fan.map((src, i) => {
            const mid = (fan.length - 1) / 2;
            const k = i - mid;
            const style = {
              "--x": `${k * 44}px`,
              "--y": `${Math.abs(k) * 9}px`,
              "--r": `${k * 7}deg`,
              "--d": `${i * 110}ms`,
              zIndex: 10 - Math.abs(Math.round(k)),
            } as CSSProperties;
            return (
              <span key={i} className="memorial-reveal__photo" data-on={shown} style={style}>
                <img src={src} alt="" draggable={false} />
              </span>
            );
          })}
        </div>
        <button
          type="button"
          className="memorial-reveal__open press-in"
          data-on={phase === "ready"}
          onClick={(e) => {
            e.stopPropagation();
            finish();
          }}
        >
          {t("memorial.openAlbum")}
        </button>
      </div>
    </div>
  );
}

/**
 * 祝福の音（ElevenLabs Music で作った5秒の弦とハープ、`public/sfx/el-celebrate-sting.mp3`）。
 * 音量の設定に従う（オフなら鳴らない）。まだ読み解けていなければ読み終わり次第鳴らす。
 */
function playCelebrate() {
  if (playSfx("celebrate-sting")) return;
  void preloadSfx(["celebrate-sting"]).then(() => playSfx("celebrate-sting"));
}

/**
 * 紙吹雪（canvas）。下の両端から打ち上げ＋真ん中で弾ける。紙はひらひら回りながら
 * 空気の抵抗で減速して落ちる。3.6秒で自分で止まる。止める関数を返す。
 */
function runConfetti(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#f5c542", "#ffd97a", "#ff375f", "#0a84ff", "#30d158", "#ffffff", "#bf5af2"];
  type P = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    vr: number;
    w: number;
    h: number;
    c: string;
    ph: number;
    round: boolean;
  };
  const ps: P[] = [];
  const shoot = (x: number, y: number, angle: number, spread: number, speed: number, k: number) => {
    for (let i = 0; i < k; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.55 + Math.random() * 0.6);
      ps.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        c: colors[(Math.random() * colors.length) | 0],
        ph: Math.random() * Math.PI * 2,
        round: Math.random() < 0.18,
      });
    }
  };
  shoot(0, H, -Math.PI / 3, 0.5, 17, 70);
  shoot(W, H, (-2 * Math.PI) / 3, 0.5, 17, 70);
  shoot(W / 2, H * 0.36, -Math.PI / 2, Math.PI * 2, 10, 90);
  const start = performance.now();
  let last = start;
  let raf = 0;
  const frame = (now: number) => {
    const dt = Math.min(2, (now - last) / 16.67);
    last = now;
    ctx.clearRect(0, 0, W, H);
    const age = (now - start) / 3600;
    for (const p of ps) {
      p.vx *= Math.pow(0.985, dt);
      p.vy = p.vy * Math.pow(0.985, dt) + 0.32 * dt;
      p.x += (p.vx + Math.sin(p.ph + now / 260) * 0.8) * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.7) / 0.3);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(1, Math.cos(p.ph + now / 180)); // ひらひら（紙の裏表）
      ctx.fillStyle = p.c;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (age < 1) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
