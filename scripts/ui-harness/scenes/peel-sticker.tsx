import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";
import { unlockAudio } from "@/lib/sound-engine";
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

  const [reduced, setReduced] = useState(false);
  const source = useRef<HTMLDivElement>(null);
  const fly = useRef<HTMLImageElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, [round]);
  useEffect(() => {
    const previous = document.documentElement.dataset.motion;
    document.documentElement.dataset.motion = reduced ? "reduce" : "full";
    return () => {
      if (previous) document.documentElement.dataset.motion = previous;
      else delete document.documentElement.dataset.motion;
    };
  }, [reduced]);
  async function save() {
    if (busy.current || saved) return;
    busy.current = true;
    unlockAudio();
    setSaving(true);
    try {
      await runCatchLanding({
        startEl: source.current,
        fly,
        destinationId: "preview-tea",
        speakLine: () =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 6000);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            if ("speechSynthesis" in window) {
              const u = new SpeechSynthesisUtterance("珍珠奶茶");
              u.lang = "zh-TW";
              u.rate = 0.95;
              u.onend = done;
              u.onerror = done;
              speechSynthesis.speak(u);
            } else done();
          }),
        openDex: () => {
          setSaved(true);
        },
        gate: Promise.resolve(),
      });
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }
  function reset() {
    setSaved(false);
    setRound((n) => n + 1);
  }
  return (
    <div
      style={{
        minHeight: "100svh",
        background: "#f4f3ef",
        color: "#242c29",
        padding: "24px 20px 48px",
      }}
    >
      <div style={{ maxWidth: 390, margin: "auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <b style={{ fontSize: 21 }}>
            CatchWords<span style={{ color: "#087cf4" }}>✦</span>
          </b>
          <span style={{ fontSize: 12, color: "#7d847e" }}>
            {saved ? "図鑑 / すべて" : "キャッチ"}
          </span>
        </header>
        {saved ? (
          <section aria-label="全カテゴリーの図鑑">
            <h1 style={{ fontSize: 30, margin: "8px 0 24px" }}>図鑑 · すべて</h1>
            {["食べ物", "日用品"].map((name) => (
              <section key={name} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, marginBottom: 16 }}>{name}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 190,
                        border: "1px dashed #ccd0cc",
                        borderRadius: 20,
                        display: "grid",
                        placeItems: "center",
                        color: "#a0aaa5",
                      }}
                    >
                      ＋
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <p style={{ fontSize: 12, color: "#7d847e" }}>YOUR COLLECTION</p>
            <h1 style={{ fontSize: 30, margin: "8px 0 24px" }}>飲み物</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div
                style={{
                  border: "1px dashed #b8bebc",
                  borderRadius: 20,
                  minHeight: 200,
                  display: "grid",
                  placeItems: "center",
                  color: "#aaa",
                }}
              >
                ＋
              </div>
              <div
                id="dex-cell-preview-tea"
                style={{
                  borderRadius: 20,
                  background: "white",
                  padding: 14,
                  textAlign: "center",
                  minHeight: 200,
                  boxShadow: "0 8px 24px #00000008",
                }}
              >
                <img
                  src={photo}
                  alt="珍珠奶茶"
                  style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: "8.6%" }}
                />
                <b>珍珠奶茶</b>
              </div>
            </div>
            {!saving && (
              <>
                <p role="status" style={{ textAlign: "center", fontSize: 13, margin: 24 }}>
                  飲み物の欄に追加しました
                </p>
                <button
                  onClick={reset}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 28,
                    background: "#087cf4",
                    color: "white",
                  }}
                >
                  もう一度キャッチ
                </button>
                <p style={{ fontSize: 11, color: "#888", marginTop: 16 }}>
                  保存先はプレビュー用です。実際の図鑑には追加されません。
                </p>
              </>
            )}
          </section>
        ) : (
          <>
            <div ref={source} style={{ aspectRatio: "1", opacity: saving ? 0 : 1 }}>
              <PeelSticker
                key={round}
                photoUrl={photo}
                cutoutUrl={ready ? cutout : null}
                label="珍珠奶茶"
                hint="好きな方向にはがしてキャッチ"
                actionLabel="図鑑へ追加"
                disabled={saving}
                onPeel={() => void save()}
              />
            </div>
            <div style={{ margin: "22px 0" }}>
              <h2 style={{ fontSize: 24, margin: 0 }}>珍珠奶茶</h2>
              <p style={{ fontSize: 12, color: "#7d847e", marginTop: 6 }}>
                ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ · タピオカミルクティー
              </p>
            </div>
            <button
              onClick={() => void save()}
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
              図鑑へ登録
            </button>
            <p style={{ fontSize: 12, color: "#7d847e", textAlign: "center", margin: 18 }}>
              どの方向でも。少し引いて離すと元に戻ります。
            </p>
            <details style={{ fontSize: 12, color: "#7d847e" }}>
              <summary>動作を確認する</summary>
              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                <label>
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={reduced}
                    onChange={(e) => setReduced(e.target.checked)}
                  />{" "}
                  動きを減らす
                </label>
                <small>音声は端末の台湾華語音声を使用。本番は既存の単語音声を使用します。</small>
              </div>
            </details>
          </>
        )}
      </div>
      {saving && (
        <CatchLandingOverlay
          ref={fly}
          image={photo}
          headword="珍珠奶茶"
          reading="ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ"
          lang="zh-TW"
        />
      )}
    </div>
  );
}
