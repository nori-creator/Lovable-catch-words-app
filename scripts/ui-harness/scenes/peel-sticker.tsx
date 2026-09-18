import { useEffect, useRef, useState } from "react";
import { PeelSticker } from "@/components/PeelSticker";

// Deterministic alpha fixture, no external image, AI call or authentication.
const cup = `<defs><linearGradient id="tea" x2=".8" y2="1"><stop stop-color="#eed4ad"/><stop offset=".55" stop-color="#c88c56"/><stop offset="1" stop-color="#a96d3c"/></linearGradient><linearGradient id="glass"><stop stop-color="#fff" stop-opacity=".8"/><stop offset=".2" stop-color="#fff" stop-opacity=".05"/><stop offset=".7" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient></defs><g transform="rotate(-9 160 160)"><path d="M174 22h13l-11 80h-13z" fill="#b76247"/><path d="M91 89h142l-19 187q-52 19-103 0z" fill="url(#tea)" stroke="#e8c6a0" stroke-width="3"/><ellipse cx="162" cy="91" rx="74" ry="16" fill="#e8d3b6"/><ellipse cx="162" cy="87" rx="69" ry="10" fill="#eaddc9"/><g fill="#3d2521">${[
  [126, 250],
  [150, 258],
  [177, 253],
  [197, 256],
  [134, 231],
  [163, 236],
  [190, 231],
  [150, 215],
  [178, 215],
  [118, 265],
  [172, 274],
  [197, 272],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10"/>`)
  .join(
    "",
  )}</g><path d="M96 102h132l-17 170q-48 18-97 0z" fill="url(#glass)"/><rect x="119" y="139" width="84" height="60" rx="4" fill="#f8f3e5"/><text x="161" y="163" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#574634" letter-spacing="2">TAIPEI</text><text x="161" y="184" text-anchor="middle" font-size="16" font-family="serif" fill="#574634">tea time</text></g>`;
const svg = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">${body}</svg>`)}`;
const cutout = svg(cup);
const photo = svg(
  `<rect width="320" height="320" fill="#a9b2a2"/><rect y="175" width="320" height="145" fill="#c8b394"/><path d="M0 195L320 215M0 265L320 285" stroke="#af9a7d" stroke-width="3"/><rect x="12" y="12" width="85" height="148" fill="#55664e"/><rect x="109" y="12" width="199" height="148" fill="#d9ded1"/>${cup}`,
);

export function PeelStickerScene() {
  const [round, setRound] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 750);
    return () => clearTimeout(t);
  }, [round]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    const prev = document.documentElement.dataset.motion;
    document.documentElement.dataset.motion = reduced ? "reduce" : "full";
    return () => {
      if (prev) document.documentElement.dataset.motion = prev;
      else delete document.documentElement.dataset.motion;
    };
  }, [reduced]);
  function save() {
    if (saving || saved) return;
    setSaving(true);
    timer.current = setTimeout(() => {
      setSaved(true);
      setSaving(false);
    }, 700);
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setSaved(false);
    setSaving(false);
    setRound((n) => n + 1);
  }
  return (
    <div
      style={{
        minHeight: "100svh",
        background: "#f4f3ef",
        color: "#242c29",
        padding: "30px 20px 48px",
        fontFamily: "Inter,system-ui,sans-serif",
      }}
    >
      <div style={{ maxWidth: 390, margin: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 34,
          }}
        >
          <b style={{ letterSpacing: "-.7px", fontSize: 21 }}>
            CatchWords<span style={{ color: "#087cf4" }}>✦</span>
          </b>
          <span style={{ fontSize: 10, letterSpacing: 2, color: "#7d847e" }}>
            MOTION STUDY / 01
          </span>
        </div>
        <p style={{ fontSize: 11, letterSpacing: 2, color: "#7d847e" }}>TODAY, IN YOUR WORDS</p>
        <h1 style={{ fontSize: 29, fontWeight: 550, letterSpacing: "-1.4px", margin: "8px 0" }}>
          日常を、ひとつ持ち帰る。
        </h1>
        <p style={{ fontSize: 13, color: "#7d847e", marginBottom: 26 }}>
          触れて、はがして、あなたの言葉に。
        </p>
        <div style={{ aspectRatio: "1", position: "relative" }}>
          <PeelSticker
            key={round}
            photoUrl={photo}
            cutoutUrl={ready && !fallback ? cutout : null}
            label="珍珠奶茶"
            hint="右下へはがして図鑑へ"
            actionLabel="図鑑へ追加"
            disabled={saving || saved}
            onPeel={save}
          />
          {saved && (
            <div
              role="status"
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeContent: "center",
                textAlign: "center",
                borderRadius: 24,
                background: "#26302944",
                backdropFilter: "blur(6px)",
                color: "white",
              }}
            >
              <span style={{ fontSize: 38 }}>✓</span>
              <b>図鑑に追加しました</b>
              <small style={{ marginTop: 8 }}>プレビューのため保存はシミュレーションです</small>
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            margin: "24px 0",
          }}
        >
          <div>
            <h2 style={{ fontSize: 24, margin: 0, fontWeight: 550 }}>珍珠奶茶</h2>
            <p style={{ fontSize: 12, color: "#7d847e", margin: "5px 0" }}>ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ</p>
          </div>
          <span style={{ fontSize: 12, color: "#7d847e" }}>タピオカミルクティー</span>
        </div>
        <button
          onClick={saved ? reset : save}
          disabled={saving}
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 30,
            background: "#087cf4",
            color: "white",
            border: 0,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {saving ? "追加しています…" : saved ? "もう一度はがす" : "図鑑へ追加"}
        </button>
        <p style={{ fontSize: 12, color: "#7d847e", textAlign: "center", margin: "16px 0 26px" }}>
          少し引いて離すと元に戻ります。
        </p>
        <details style={{ fontSize: 12, color: "#7d847e" }}>
          <summary>動作を確認する</summary>
          <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
            <label>
              <input
                type="checkbox"
                checked={fallback}
                onChange={(e) => {
                  setFallback(e.target.checked);
                  reset();
                }}
              />{" "}
              切り抜きなし・失敗時
            </label>
            <label>
              <input
                type="checkbox"
                checked={reduced}
                onChange={(e) => setReduced(e.target.checked)}
              />{" "}
              動きを減らす
            </label>
            <button onClick={reset}>撮影直後から再生</button>
            <small>サンプル画像。実際の画面では撮影した写真と切り抜きを使います。</small>
          </div>
        </details>
      </div>
    </div>
  );
}
