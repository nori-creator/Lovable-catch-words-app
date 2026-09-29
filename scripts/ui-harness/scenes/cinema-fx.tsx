/**
 * **映画のような演出の試作（案 A/B）**（オーナー指示 2026-09-28「AI の分析中、キャッチの
 * アニメーション、効果音や視覚効果、BGM、聴覚・触覚効果、本物のハリウッド映画や映像クリエーター
 * のようなものを作って。外部サイトやできるものは何でも使って。最新の情報をもとに最高の道具で」）。
 *
 *  - 絵: three.js（GPU）＋ 光のにじみ（ブルーム）。中身は `cinema/engine.ts`
 *  - 音: ElevenLabs の効果音 v2・音楽 v2 で作った実音（`public/sfx`）を、残響とまとめ役
 *    （コンプレッサー）を通して、絵と同じ時計で鳴らす（`cinema/audio.ts`）
 *  - 触覚: 音と同じ瞬間に振動（Android。iPhone はアプリ版で Capacitor Haptics）
 *
 * 操作: 上で A/B を選ぶ →「分析中」→「キャッチ ▶」（そのまま祝福まで流れる）。
 */
import { useEffect, useRef, useState } from "react";
import { CinemaWorld, type FxMode, type FxPhase } from "./cinema/engine";
import { CinemaAudio, buzz } from "./cinema/audio";

const MODES: Array<{ key: FxMode; label: string; note: string }> = [
  {
    key: "particles",
    label: "A 光の粒",
    note: "写真が 16,384 粒の光にほどけ、渦を巻いて図鑑へ吸い込まれる。紙吹雪と光の筋で祝う。",
  },
  {
    key: "card",
    label: "B 3D カード",
    note: "写真が厚みのある虹色のカードになり、1回半まわって残像を引きながら図鑑へ差し込まれる。",
  },
];

export function CinemaFxScene({ q }: { q: URLSearchParams }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const world = useRef<CinemaWorld | null>(null);
  const audio = useRef(new CinemaAudio());
  const [mode, setMode] = useState<FxMode>(q.get("fx") === "card" ? "card" : "particles");
  const [phase, setPhase] = useState<FxPhase>("idle");
  const [sound, setSound] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = new CinemaWorld(el);
    world.current = w;
    const slow = Number(q.get("slow"));
    if (slow > 0 && slow < 1) w.timeScale = slow;
    w.onPhase = (p) => {
      setPhase(p);
      if (p === "celebrate") {
        audio.current.play("celebrate", { gain: 0.9 });
        audio.current.play("stinger", { gain: 0.8, delay: 0.05 });
        buzz([18, 40, 26, 60, 40]);
      }
    };
    w.onBeat = (b) => {
      if (b === "land") buzz(12);
    };
    void w.load("/first-catch-cafe.webp").then(() => {
      w.setMode(mode);
      if (q.get("auto") === "catch") w.start("catch");
    });
    w.begin();
    const ro = new ResizeObserver(() => w.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      w.dispose();
      audio.current.stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    world.current?.setMode(mode);
    audio.current.stopLoop();
  }, [mode]);

  useEffect(() => {
    audio.current.enabled = sound;
    if (!sound) audio.current.stopLoop();
  }, [sound]);

  const pill = (on: boolean): React.CSSProperties => ({
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: on ? "var(--primary)" : "var(--card)",
    color: on ? "var(--primary-foreground)" : "var(--foreground)",
    fontWeight: 600,
    fontSize: 13,
  });

  const analyze = async () => {
    await audio.current.unlock();
    world.current?.reset();
    world.current?.start("analyze");
    audio.current.startLoop();
  };
  const catchIt = async () => {
    await audio.current.unlock();
    audio.current.stopLoop();
    world.current?.start("catch");
    audio.current.play("catch", { gain: 1 });
    buzz(8);
  };

  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="案" className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={mode === m.key}
            style={pill(mode === m.key)}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
        <button type="button" style={pill(!sound)} onClick={() => setSound((s) => !s)}>
          {sound ? "音あり" : "音なし"}
        </button>
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 28,
          overflow: "hidden",
          background: "#0b1020",
        }}
      >
        <canvas
          ref={ref}
          data-cinema-fx
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 14,
            textAlign: "center",
            color: "rgb(255 255 255 / .85)",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {phase === "analyze"
            ? "AI が見ています…"
            : phase === "catch"
              ? "キャッチ！"
              : phase === "celebrate"
                ? "図鑑に入りました"
                : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" style={pill(phase === "analyze")} onClick={() => void analyze()}>
          分析中
        </button>
        <button type="button" style={pill(false)} onClick={() => void catchIt()}>
          キャッチ ▶
        </button>
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        {MODES.find((m) => m.key === mode)?.note} 音は ElevenLabs で作った実音（効果音 v2・音楽
        v2）を、残響とコンプレッサーに通して絵と同じ時計で鳴らしています。振動は Android
        で出ます（iPhone はアプリ版で対応）。
      </p>
    </div>
  );
}
