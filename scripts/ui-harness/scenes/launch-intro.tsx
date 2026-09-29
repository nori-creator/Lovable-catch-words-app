import { useEffect, useRef, useState } from "react";

/**
 * **アプリを開くときの動き — 作り直し**（オーナー指示 2026-09-28 R14「アプリを開くときの
 * アニメーションはやり直して。モーションアニメーションの質を上げて」）。
 *
 * 前の案（R13）は時間で区切った「ease の曲線」で動かしていた。止まり際が機械的で、
 * 物がどこから来てどこへ行くのかの**つながり**も弱かった。今回は質を上げるために:
 *
 *  1. **全部ばねで動かす。** ばねの計算（減衰比・応答時間。Apple が WWDC18 *Designing
 *     Fluid Interfaces* で使う2つの値）をそのまま解いて、CSS の `linear()` の点列に
 *     する。止まり際が自然に減速し、弾む案だけ少し行き過ぎて戻る。
 *  2. **同じ物がつながって見える（共有要素）。** 起動画面の青い地・印が、ホームの
 *     どれか1つ（写真の1枚・カメラの釦）へ**そのまま姿を変えて**収まる。
 *  3. **一度に全部を動かさない（ずらし）。** 日付 → 写真 → 下のバーの順に 30〜40ms ずつ
 *     遅らせ、奥（大きい物）が先、手前（小さい物）が後。
 *  4. **奥行き。** 出てくるホームは少し大きく・少しぼけた所から、ぴったりの大きさ・
 *     くっきりへ（ピントが合う感じ）。
 *
 * 前提: iPhone・Android では、アイコンから画面が広がる最初の約 0.3 秒は **OS が描く**
 * （アプリからは変えられない）。案は全部その直後から。長さは 0.45〜0.9 秒（毎回見るので
 * 長いと待たされる。HIG「起動画面は最初の画面に似せ、飾りで引き延ばさない」）。
 * 動きを減らす設定ではフェードだけ。
 *
 *  A 写真になる   — 青い地がばねで縮んで角丸の札になり、今日の1枚目の写真に収まる
 *  B 光の輪が開く — 印の中心から丸い窓がばねで開き、縁に細い光の輪が走る
 *  C 幕が上がる   — 青い地が1枚の幕として上へ抜け、下のホームが少し遅れて持ち上がる
 *  D いちばん短い — 印が少し膨らんで消え、ホームがピントを合わせて出る（0.45 秒・推奨）
 *
 * 画面を押すともう一度。「ゆっくり」で 1/4 の速さにして動きの質を確かめられる。
 */
type Key = "a" | "b" | "c" | "d";
const KEYS: Array<{ k: Key; label: string }> = [
  { k: "a", label: "A 写真になる" },
  { k: "b", label: "B 光の輪" },
  { k: "c", label: "C 幕が上がる" },
  { k: "d", label: "D 短い・推奨" },
];

/**
 * **ばねを解いて CSS の `linear()` にする。**
 * damping = 減衰比（1 で行き過ぎ無し、0.8 で少し弾む）、response = 応答時間（秒）。
 * 0→1 の位置を 1/60 秒ごとに計算し、止まった所（誤差 0.1% 未満）で切る。
 */
export function springEasing(damping: number, response: number): { easing: string; ms: number } {
  const w = (2 * Math.PI) / response; // 固有角振動数
  const k = w * w; // 質量 1 のばね定数
  const c = 2 * damping * w; // 減衰係数
  let x = 0;
  let v = 0;
  const dt = 1 / 240;
  const pts: number[] = [0];
  let t = 0;
  let still = 0;
  while (t < 3) {
    for (let i = 0; i < 4; i++) {
      const a = -k * (x - 1) - c * v;
      v += a * dt;
      x += v * dt;
      t += dt;
    }
    pts.push(x);
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) {
      if (++still > 3) break;
    } else still = 0;
  }
  pts[pts.length - 1] = 1;
  return {
    easing: `linear(${pts.map((p) => +p.toFixed(4)).join(", ")})`,
    ms: Math.round((pts.length - 1) * (1000 / 60)),
  };
}

// よく使うばね（HIG の既定: 動く物 1.0/0.4、弾みを許すのは勢いのある物だけ）。
const SMOOTH = springEasing(1, 0.42);
const SNAPPY = springEasing(1, 0.3);
const BOUNCY = springEasing(0.78, 0.46);
const SOFT = springEasing(0.9, 0.55);

export function LaunchIntroScene({ q }: { q: URLSearchParams }) {
  const [k, setK] = useState<Key>(KEYS.find((x) => x.k === q.get("v"))?.k ?? "d");
  const [run, setRun] = useState(0);
  const [slow, setSlow] = useState(q.get("slow") === "1");
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#000" }}
      onClick={() => setRun((n) => n + 1)}
    >
      <Phone key={`${k}-${run}-${slow}`} k={k} slow={slow} />
      <div
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: 56,
          zIndex: 20,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
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
            style={{
              ...CHIP,
              flex: "1 1 40%",
              background: k === x.k ? "#0a84ff" : "rgba(255,255,255,0.88)",
              color: k === x.k ? "#fff" : "#111",
            }}
          >
            {x.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSlow((v) => !v)}
          aria-pressed={slow}
          style={{
            ...CHIP,
            flex: "1 1 100%",
            background: slow ? "#ffd60a" : "rgba(255,255,255,0.88)",
            color: "#111",
          }}
        >
          {slow ? "ゆっくり ×¼（押すと普通の速さ）" : "ゆっくり ×¼ で見る"}
        </button>
      </div>
    </div>
  );
}

const CHIP: React.CSSProperties = {
  minHeight: 40,
  borderRadius: 999,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 700,
  border: 0,
};

const PHOTOS = [
  { src: "/first-catch-cafe.webp", word: "咖啡", rot: -3 },
  { src: "/first-catch-cat.webp", word: "貓", rot: 2.5 },
  { src: "/first-catch-flower.webp", word: "花", rot: 1.5 },
  { src: "/first-catch-ready.webp", word: "今天", rot: -2 },
];

/** 端末のホーム画面 → アイコンを押す → 開く。 */
function Phone({ k, slow }: { k: Key; slow: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    const qa = (s: string) => Array.from(root.querySelectorAll(s)) as HTMLElement[];
    const icon = q("[data-icon]");
    const splash = q("[data-splash]");
    const mark = q("[data-mark]");
    const home = q("[data-home]");
    const date = q("[data-date]");
    const photos = qa("[data-photo]");
    const tabbar = q("[data-tabbar]");
    const ring = q("[data-ring]");
    const anims: Animation[] = [];
    const rate = slow ? 0.25 : 1;
    const a = (
      el: Element,
      kf: Keyframe[],
      o: { ms: number; delay?: number; easing?: string; fill?: FillMode },
    ) => {
      const x = el.animate(kf, {
        duration: o.ms,
        delay: o.delay ?? 0,
        easing: o.easing ?? "linear",
        fill: o.fill ?? "both",
      });
      x.playbackRate = rate;
      anims.push(x);
      return x;
    };
    const rr = root.getBoundingClientRect();
    // 1) OS の広がり（本物の端末では OS が描く部分。ここは真似）。
    const ir = icon.getBoundingClientRect();
    a(
      splash,
      [
        {
          transform: `translate(${ir.left - rr.left}px,${ir.top - rr.top}px) scale(${ir.width / rr.width},${ir.height / rr.height})`,
          borderRadius: "44px",
        },
        { transform: "none", borderRadius: "0px" },
      ],
      { ms: SNAPPY.ms, delay: 450, easing: SNAPPY.easing },
    );
    a(mark, [{ transform: "scale(.24)" }, { transform: "scale(1)" }], {
      ms: SNAPPY.ms,
      delay: 450,
      easing: SNAPPY.easing,
    });
    const T = 450 + 320; // アプリが描く部分の始まり
    if (reduce) {
      a(splash, [{ opacity: 1 }, { opacity: 0 }], { ms: 250, delay: T });
      return () => anims.forEach((x) => x.cancel());
    }
    // ホームの中身の「ピントが合う」出方（どの案も同じ。ずらしだけ変える）。
    const settleHome = (t0: number, fromScale = 1.06) => {
      a(
        home,
        [
          { transform: `scale(${fromScale})`, filter: "blur(10px)" },
          { transform: "none", filter: "blur(0px)" },
        ],
        { ms: SMOOTH.ms, delay: t0, easing: SMOOTH.easing },
      );
      a(
        date,
        [
          { transform: "translateY(14px)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { ms: SMOOTH.ms, delay: t0 + 40, easing: SMOOTH.easing },
      );
      photos.forEach((p, i) => {
        const rot = Number(p.dataset.rot);
        if (k === "a" && i === 0) return; // A は1枚目が共有要素
        a(
          p,
          [
            { transform: `translateY(26px) scale(.9) rotate(${rot * 3}deg)`, opacity: 0 },
            { transform: `rotate(${rot}deg)`, opacity: 1 },
          ],
          { ms: BOUNCY.ms, delay: t0 + 80 + i * 38, easing: BOUNCY.easing },
        );
      });
      a(
        tabbar,
        [
          { transform: "translateY(120%)", opacity: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        { ms: SOFT.ms, delay: t0 + 160, easing: SOFT.easing },
      );
    };

    if (k === "a") {
      // A 写真になる: 青い地がばねで縮み、1枚目の写真の位置・角・傾きに収まる。
      // 収まりながら青 → 写真へ入れ替わる（同じ物が姿を変えた、と読める）。
      const first = photos[0];
      const fr = first.getBoundingClientRect();
      const rot = Number(first.dataset.rot);
      const sx = fr.width / rr.width;
      const sy = fr.height / rr.height;
      a(
        splash,
        [
          { transform: "none", borderRadius: "0px" },
          {
            transform: `translate(${fr.left - rr.left}px,${fr.top - rr.top}px) scale(${sx},${sy}) rotate(${rot}deg)`,
            borderRadius: `${12 / sx}px / ${12 / sy}px`,
          },
        ],
        { ms: BOUNCY.ms, delay: T, easing: BOUNCY.easing },
      );
      a(splash, [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], {
        ms: 520,
        delay: T,
      });
      a(
        mark,
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(.6)", opacity: 0 },
        ],
        {
          ms: 220,
          delay: T,
          easing: "cubic-bezier(.3,0,.8,.2)",
        },
      );
      a(
        first,
        [
          { opacity: 0, filter: "saturate(0) brightness(1.4)" },
          { opacity: 0, offset: 0.35 },
          { opacity: 1, filter: "saturate(1) brightness(1)" },
        ],
        { ms: 560, delay: T },
      );
      settleHome(T + 60, 1.03);
    } else if (k === "b") {
      // B 光の輪: 印の中心から丸い窓がばねで開く。縁を細い光の輪がなぞって広がる。
      const R = Math.hypot(rr.width, rr.height) / 2 + 20;
      // ホームを起動画面の上に出し、その切り抜きの丸をばねで広げる（丸の半径は
      // 補間できるので、ばねの `linear()` がそのまま効く）。
      home.style.zIndex = "2";
      ring.style.zIndex = "3";
      a(home, [{ clipPath: "circle(0px at 50% 50%)" }, { clipPath: `circle(${R}px at 50% 50%)` }], {
        ms: SMOOTH.ms,
        delay: T + 60,
        easing: SMOOTH.easing,
      });
      a(
        ring,
        [
          { transform: "translate(-50%,-50%) scale(.05)", opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { transform: `translate(-50%,-50%) scale(${(R * 2) / 100})`, opacity: 0 },
        ],
        { ms: SMOOTH.ms, delay: T + 60, easing: SMOOTH.easing },
      );
      a(
        mark,
        [
          { transform: "scale(1) rotate(0)", opacity: 1 },
          { transform: "scale(1.7) rotate(40deg)", opacity: 0 },
        ],
        { ms: SNAPPY.ms, delay: T, easing: SNAPPY.easing },
      );
      settleHome(T + 90);
    } else if (k === "c") {
      // C 幕が上がる: 青い地が1枚の幕として上へ抜ける。幕の下端に影、下のホームは
      // 少し遅れて持ち上がる（速さの違う2枚 = 奥行き）。
      a(
        splash,
        [
          { transform: "none", borderRadius: "0 0 0 0", boxShadow: "0 0 0 rgba(0,0,0,0)" },
          {
            transform: "translateY(-104%)",
            borderRadius: "0 0 36px 36px",
            boxShadow: "0 30px 60px rgba(0,0,0,.35)",
          },
        ],
        { ms: SOFT.ms, delay: T, easing: SOFT.easing },
      );
      a(
        mark,
        [
          { transform: "none", opacity: 1 },
          { transform: "translateY(-60px) scale(.9)", opacity: 0 },
        ],
        { ms: 260, delay: T, easing: "cubic-bezier(.3,0,.8,.2)" },
      );
      a(home, [{ transform: "translateY(48px)" }, { transform: "none" }], {
        ms: SOFT.ms,
        delay: T + 40,
        easing: SOFT.easing,
      });
      settleHome(T + 60, 1);
    } else {
      // D いちばん短い（推奨）: 印が 1.12 倍に膨らみながら薄れ、地はそのまま溶ける。
      // ホームはピントを合わせて出る。全部で 0.45 秒。
      a(
        mark,
        [
          { transform: "scale(1)", opacity: 1, filter: "blur(0px)" },
          { transform: "scale(1.12)", opacity: 0, filter: "blur(4px)" },
        ],
        { ms: 260, delay: T, easing: "cubic-bezier(.2,0,0,1)" },
      );
      a(splash, [{ opacity: 1 }, { opacity: 0 }], {
        ms: 300,
        delay: T + 40,
        easing: "cubic-bezier(.2,0,0,1)",
      });
      settleHome(T + 40, 1.04);
    }
    return () => anims.forEach((x) => x.cancel());
  }, [k, slow]);

  const abs: React.CSSProperties = { position: "absolute", inset: 0 };
  return (
    <div ref={stage} style={{ ...abs, overflow: "hidden" }}>
      {/* 端末のホーム画面（押す前） */}
      <div
        style={{
          ...abs,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          alignContent: "start",
          columnGap: 16,
          rowGap: 24,
          padding: "180px 24px 0",
          background: "linear-gradient(160deg,#2c3e66,#6d4c7a 60%,#d98e73)",
        }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
          >
            {i === 5 ? (
              <img
                data-icon
                src="/icon-192.png"
                alt=""
                style={{ width: "100%", aspectRatio: "1", borderRadius: "22%" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: "22%",
                  background: "rgba(255,255,255,.25)",
                }}
              />
            )}
            <span style={{ fontSize: 11, color: "#fff", opacity: i === 5 ? 1 : 0.5 }}>
              {i === 5 ? "CatchWords" : "　"}
            </span>
          </div>
        ))}
      </div>
      {/* アプリの最初の画面（ホームのアルバム） */}
      <div
        data-home
        style={{
          ...abs,
          padding: "178px 24px 0",
          background: "#f7f5f0",
          transformOrigin: "50% 40%",
        }}
      >
        <div
          data-date
          style={{
            textAlign: "center",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#1d1d1f",
          }}
        >
          9月28日
        </div>
        <div
          style={{
            margin: "22px auto 0",
            maxWidth: 290,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          {PHOTOS.map((p) => (
            <div
              key={p.src}
              data-photo
              data-rot={p.rot}
              style={{
                borderRadius: 12,
                background: "#fff",
                padding: "8px 8px 6px",
                boxShadow: "0 8px 20px -8px rgba(0,0,0,.35)",
                transform: `rotate(${p.rot}deg)`,
              }}
            >
              <img
                src={p.src}
                alt=""
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  borderRadius: 6,
                  display: "block",
                }}
              />
              <div
                style={{
                  marginTop: 4,
                  textAlign: "center",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#1d1d1f",
                }}
              >
                {p.word}
              </div>
            </div>
          ))}
        </div>
        <div
          data-tabbar
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 24,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            borderRadius: 999,
            background: "rgba(255,255,255,.82)",
            boxShadow: "0 10px 30px -10px rgba(0,0,0,.3)",
            backdropFilter: "blur(20px)",
          }}
        >
          {["ホーム", "図鑑", "", "復習", "設定"].map((l, i) =>
            i === 2 ? (
              <span
                key={i}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: "#0a6cff",
                }}
              >
                <span
                  style={{ width: 20, height: 20, borderRadius: 999, border: "3px solid #fff" }}
                />
              </span>
            ) : (
              <span
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  width: 48,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: i === 0 ? "#0a6cff" : "#9a9aa0",
                  }}
                />
                <span
                  style={{ fontSize: 10, fontWeight: 600, color: i === 0 ? "#0a6cff" : "#6e6e73" }}
                >
                  {l}
                </span>
              </span>
            ),
          )}
        </div>
      </div>
      {/* 起動画面（アイコンと同じ青と印） */}
      <div
        data-splash
        style={{
          ...abs,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(160deg,#1e7bff,#0a5bdc)",
          transformOrigin: "0 0",
        }}
      >
        <img
          data-mark
          src="/icon-512.png"
          alt=""
          style={{
            width: 256,
            height: 256,
            clipPath: "circle(32% at 50% 50%)",
            mixBlendMode: "screen",
          }}
        />
      </div>
      {/* B の光の輪（直径 100px を拡大して使う） */}
      <span
        data-ring
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 100,
          height: 100,
          borderRadius: 999,
          opacity: 0,
          pointerEvents: "none",
          boxShadow: "0 0 0 1.5px rgba(255,255,255,.95), 0 0 18px 4px rgba(120,190,255,.7)",
        }}
      />
    </div>
  );
}
