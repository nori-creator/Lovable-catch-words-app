import { useEffect, useRef, useState } from "react";

/**
 * **アプリのアイコンを押して開くときの動きの案 A〜D**（オーナー指示 2026-09-28 R13）。
 *
 * 前提（大事）: iPhone・Android では、アイコンから画面が広がる最初の約 0.3 秒は **OS が描く**
 * （アプリからは変えられない）。アプリが描けるのは、その直後の「起動画面（スプラッシュ）→
 * 最初の画面」の間。ここの案は全部その部分で、**OS の広がりと同じ青い地・同じ印から始める**
 * ので、つなぎ目が見えない。長さは 0.9〜1.3 秒に抑える（起動のたびに見るので、長いと待たされる
 * 感じになる。Apple HIG「起動画面は最初の画面に似せ、飾りで引き延ばさない」）。
 * 2回目からは短い版（0.4 秒）にする想定。動きを減らす設定ではフェードだけ。
 *
 *  A 開くレンズ   — 輪の印がカメラの絞りのように開いて、今日のアルバムが見えてくる
 *  B はがれるシール — 印がシールのようにはがれて、ホームのアルバムに貼られる
 *  C ノートが開く — 青い表紙が左へ開いて、今日のページが出る
 *  D 文字が集まる — 注音・漢字の粒が集まって印になり、そのまま画面に溶ける（いちばん短い）
 *
 * 画面を押すともう一度。上の A〜D で切り替え。
 */
type Key = "a" | "b" | "c" | "d";
const KEYS: Array<{ k: Key; label: string }> = [
  { k: "a", label: "A 開くレンズ" },
  { k: "b", label: "B はがれるシール" },
  { k: "c", label: "C ノートが開く" },
  { k: "d", label: "D 文字が集まる" },
];

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function LaunchIntroScene({ q }: { q: URLSearchParams }) {
  const [k, setK] = useState<Key>(KEYS.find((x) => x.k === q.get("v"))?.k ?? "a");
  const [run, setRun] = useState(0);
  return (
    <div className="fixed inset-0 bg-black" onClick={() => setRun((n) => n + 1)}>
      <Phone key={`${k}-${run}`} k={k} />
      <div
        className="absolute inset-x-2 top-[64px] z-20 flex gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {KEYS.map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => {
              setK(x.k);
              setRun((n) => n + 1);
            }}
            className="min-h-11 flex-1 rounded-full px-1 text-caption font-semibold"
            style={{
              background: k === x.k ? "#0a84ff" : "rgba(255,255,255,0.85)",
              color: k === x.k ? "#fff" : "#111",
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 端末のホーム画面 → アイコンを押す → 開く。 */
function Phone({ k }: { k: Key }) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    const icon = q("[data-icon]");
    const splash = q("[data-splash]");
    const mark = q("[data-mark]");
    const home = q("[data-home]");
    const anims: Animation[] = [];
    const a = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      const x = el.animate(kf, { fill: "both", easing: EASE, ...o });
      anims.push(x);
      return x;
    };
    // 1) OS の広がり（ここだけは本物の端末では OS が描く）。
    const ir = icon.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const sx = ir.width / rr.width;
    const sy = ir.height / rr.height;
    const tx = ir.left - rr.left;
    const ty = ir.top - rr.top;
    a(
      splash,
      [
        {
          transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})`,
          borderRadius: "40px",
          opacity: 1,
        },
        { transform: "none", borderRadius: "0px", opacity: 1 },
      ],
      { duration: 380, delay: 500 },
    );
    a(mark, [{ transform: "scale(.24)" }, { transform: "scale(1)" }], {
      duration: 380,
      delay: 500,
    });
    const T = 900; // アプリの描く部分の始まり
    if (reduce) {
      a(splash, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, delay: T });
      a(home, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: T });
      return () => anims.forEach((x) => x.cancel());
    }
    if (k === "a") {
      // 絞りが開く: 印の輪が大きくなりながら回り、真ん中から地が透けて今日のアルバムが見える。
      a(
        mark,
        [{ transform: "scale(1) rotate(0)" }, { transform: "scale(9) rotate(90deg)", opacity: 0 }],
        {
          duration: 700,
          delay: T,
          easing: "cubic-bezier(.6,0,.2,1)",
        },
      );
      a(
        splash,
        [
          { clipPath: "circle(150% at 50% 50%)" },
          { clipPath: "circle(150% at 50% 50%)", offset: 0.25 },
          { clipPath: "circle(0% at 50% 50%)" },
        ],
        { duration: 800, delay: T, easing: "cubic-bezier(.7,0,.3,1)" },
      );
      a(
        home,
        [
          { transform: "scale(1.06)", filter: "blur(6px)" },
          { transform: "none", filter: "blur(0)" },
        ],
        {
          duration: 700,
          delay: T + 150,
        },
      );
    } else if (k === "b") {
      // シール: 印の右下の角からめくれて持ち上がり、アルバムの位置へ飛んで貼られる。
      a(
        mark,
        [
          { transform: "none", filter: "drop-shadow(0 0 0 rgba(0,0,0,0))" },
          {
            transform: "perspective(600px) rotateX(18deg) rotateY(-22deg) scale(1.08)",
            filter: "drop-shadow(0 18px 18px rgba(0,0,0,.35))",
            offset: 0.35,
          },
          {
            transform: "translate(-70px, 170px) perspective(600px) rotate(-6deg) scale(.42)",
            filter: "drop-shadow(0 4px 4px rgba(0,0,0,.25))",
          },
        ],
        { duration: 900, delay: T, easing: "cubic-bezier(.3,.7,.3,1)" },
      );
      a(splash, [{ background: "#0a6cff" }, { background: "rgba(10,108,255,0)" }], {
        duration: 500,
        delay: T + 250,
      });
      a(home, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: T + 250 });
    } else if (k === "c") {
      // ノート: 青い表紙が左の綴じ目を軸に開いていく。
      splash.style.transformOrigin = "0% 50%";
      a(
        splash,
        [
          { transform: "perspective(1400px) rotateY(0)" },
          { transform: "perspective(1400px) rotateY(-100deg)" },
        ],
        {
          duration: 950,
          delay: T,
          easing: "cubic-bezier(.45,0,.2,1)",
        },
      );
      a(home, [{ filter: "brightness(.55)" }, { filter: "brightness(1)" }], {
        duration: 950,
        delay: T,
      });
    } else {
      // 文字の粒: 注音・漢字が周りから集まって印に吸い込まれ、そのまま地ごと溶ける。
      const glyphs = Array.from(root.querySelectorAll("[data-glyph]")) as HTMLElement[];
      glyphs.forEach((g, i) => {
        const ang = (i / glyphs.length) * Math.PI * 2;
        a(
          g,
          [
            {
              transform: `translate(${Math.cos(ang) * 150}px, ${Math.sin(ang) * 220}px) scale(1.2)`,
              opacity: 0,
            },
            { opacity: 1, offset: 0.3 },
            { transform: "translate(0,0) scale(.2)", opacity: 0 },
          ],
          { duration: 600, delay: 560 + i * 18, easing: "cubic-bezier(.5,0,.2,1)" },
        );
      });
      a(
        mark,
        [
          { transform: "scale(1)" },
          { transform: "scale(1.12)", offset: 0.4 },
          { transform: "scale(1)" },
        ],
        {
          duration: 380,
          delay: T + 150,
        },
      );
      a(splash, [{ opacity: 1 }, { opacity: 0 }], { duration: 350, delay: T + 350 });
      a(
        home,
        [
          { transform: "scale(.98)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        {
          duration: 350,
          delay: T + 350,
        },
      );
    }
    return () => anims.forEach((x) => x.cancel());
  }, [k]);

  return (
    <div ref={stage} className="absolute inset-0 overflow-hidden">
      {/* 端末のホーム画面（押す前） */}
      <div
        className="absolute inset-0 grid grid-cols-4 content-start gap-x-4 gap-y-6 px-6 pt-40"
        style={{ background: "linear-gradient(160deg,#2c3e66,#6d4c7a 60%,#d98e73)" }}
      >
        {Array.from({ length: 12 }, (_, i) =>
          i === 5 ? (
            <div key={i} className="flex flex-col items-center gap-1">
              <img
                data-icon
                src="/icon-192.png"
                alt=""
                className="aspect-square w-full rounded-[22%]"
              />
              <span className="text-[11px] text-white">CatchWords</span>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="aspect-square w-full rounded-[22%] bg-white/25" />
              <span className="h-2 w-10 rounded bg-white/30" />
            </div>
          ),
        )}
      </div>
      {/* アプリの最初の画面（ホームのアルバム） */}
      <div data-home className="absolute inset-0 px-5 pt-32" style={{ background: "#f7f5f0" }}>
        <div className="text-center text-title2 font-bold" style={{ color: "#1d1d1f" }}>
          9月28日
        </div>
        <div className="mx-auto mt-6 grid max-w-[260px] grid-cols-2 gap-4">
          {["#d9b58c", "#9fb8c8", "#d0483c", "#f5a623"].map((c, i) => (
            <div
              key={c}
              className="rounded-md bg-white p-2 pb-6 shadow-md"
              style={{ transform: `rotate(${[-3, 2, 1.5, -2][i]}deg)` }}
            >
              <div className="aspect-square rounded-sm" style={{ background: c }} />
            </div>
          ))}
        </div>
      </div>
      {/* 起動画面（アイコンと同じ青と印） */}
      <div
        data-splash
        className="absolute inset-0 grid place-items-center"
        style={{ background: "linear-gradient(160deg,#1e7bff,#0a5bdc)", transformOrigin: "0 0" }}
      >
        <img
          data-mark
          src="/icon-512.png"
          alt=""
          className="h-64 w-64"
          style={{ clipPath: "circle(32% at 50% 50%)", mixBlendMode: "screen" }}
        />
      </div>
      {k === "d" &&
        ["ㄓ", "字", "ㄘ", "詞", "A", "ㄨ", "語", "あ", "ㄅ", "話"].map((g) => (
          <span
            key={g}
            data-glyph
            className="pointer-events-none absolute left-1/2 top-1/2 -ml-3 -mt-4 text-3xl font-bold text-white opacity-0"
          >
            {g}
          </span>
        ))}
    </div>
  );
}
