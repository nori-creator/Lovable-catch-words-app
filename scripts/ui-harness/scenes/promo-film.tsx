/**
 * **宣伝動画（モーショングラフィックス・15 秒・縦）**（オーナー指示 2026-09-28「アプリ内で
 * モーションアニメーションを実装するのと、このアプリの宣伝に使える動画をモーションアニメーション
 * で制作して」）。
 *
 * 絵は `promo/film.ts`（時刻から1枚を描く）。ここでは時計で再生し、音も同じ時刻表で鳴らす。
 * 動画ファイル（mp4）は `scripts/promo/render.mjs` で1コマずつ撮って焼いた物（下に置いてある）。
 */
import { useEffect, useRef, useState } from "react";
import { drawFilm, DURATION, H, SOUND_CUES, W, type FilmAssets } from "./promo/film";
import { CinemaAudio } from "./cinema/audio";

function load(src: string) {
  return new Promise<HTMLImageElement>((ok, ng) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = ng;
    i.src = src;
  });
}

export function PromoFilmScene({ q }: { q: URLSearchParams }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const assets = useRef<FilmAssets | null>(null);
  const audio = useRef(new CinemaAudio());
  const [t, setT] = useState(Number(q.get("t")) || 0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([
      load("/first-catch-cafe.webp"),
      load("/first-catch-cat.webp"),
      load("/first-catch-flower.webp"),
      load("/first-catch-interests.webp"),
    ]).then(([cafe, cat, flower, interests]) => {
      assets.current = { cafe, cat, flower, interests };
      setReady(true);
      // 動画に焼く道具（render.mjs）が1コマずつ描かせるための入口
      (window as unknown as { __promo: unknown }).__promo = {
        drawAt: (time: number) => {
          const c = ref.current;
          if (!c || !assets.current) return null;
          drawFilm(c.getContext("2d")!, time, assets.current);
          return c.toDataURL("image/jpeg", 0.92);
        },
      };
    });
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (c && assets.current) drawFilm(c.getContext("2d")!, t, assets.current);
  }, [t, ready]);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - t * 1000;
    const fired = new Set<number>();
    let raf = 0;
    const loop = (now: number) => {
      const time = (now - start) / 1000;
      SOUND_CUES.forEach((cue, i) => {
        if (!fired.has(i) && time >= cue.at && time < cue.at + 0.3) {
          fired.add(i);
          audio.current.play(cue.name, { gain: cue.gain });
        }
      });
      if (time >= DURATION) {
        setT(DURATION);
        setPlaying(false);
        return;
      }
      setT(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const pill: React.CSSProperties = {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    fontWeight: 600,
    fontSize: 14,
  };

  return (
    <div className="space-y-3 pb-28">
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          margin: "0 auto",
          aspectRatio: `${W} / ${H}`,
          borderRadius: 24,
          overflow: "hidden",
          background: "#000",
        }}
      >
        <canvas
          ref={ref}
          width={W}
          height={H}
          data-promo-film
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          style={pill}
          onClick={async () => {
            await audio.current.unlock();
            if (t >= DURATION) setT(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "止める" : "再生 ▶"}
        </button>
        <input
          type="range"
          min={0}
          max={DURATION}
          step={0.01}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="再生位置"
          style={{ flex: 1 }}
        />
        <span className="text-caption tabular-nums text-muted-foreground">{t.toFixed(1)}s</span>
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        15 秒・縦（1080×1920）。文字 → 撮る → 語がはじける → ステッカーが図鑑へ → アルバムと記憶の線
        → ロゴ。音は ElevenLabs で作った効果音と曲。焼いた動画ファイル:
      </p>
      <video
        src="/promo/catchwords-promo.mp4"
        controls
        playsInline
        preload="none"
        style={{
          width: "100%",
          maxWidth: 360,
          margin: "0 auto",
          display: "block",
          borderRadius: 16,
        }}
      />
    </div>
  );
}
