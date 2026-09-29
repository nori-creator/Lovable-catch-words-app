import { useEffect, useRef, useState } from "react";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";

const PREVIEW_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#f4c542"/><circle cx="256" cy="232" r="116" fill="#e85d3f"/><path d="M250 108c28-58 89-70 129-45-23 50-70 73-129 45Z" fill="#31956b"/><circle cx="219" cy="213" r="14" fill="#fff"/><circle cx="298" cy="213" r="14" fill="#fff"/></svg>',
  );

/**
 * キャッチの演出を**図鑑に着地するまで**通して見る（オーナー指示 2026-09-28「図鑑に
 * 追加し終わったあとに、一度図鑑から写真が消えて、また現れてバウンスする…そうではなく
 * 着地すると同時に図鑑に追加されるタイミング画像が少し縮むようなバウンス…一連にして」）。
 * 最後に図鑑のます目が出て、写真はそこへ飛んで着き、**ます目の写真そのもの**が少し
 * つぶれて戻る（消えて落ち直さない）。
 */
export function RewardCatchScene() {
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const [dex, setDex] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runCatchLanding({
        startEl: sourceRef.current,
        fly: flyRef,
        speakLine: () => {},
        destinationId: "demo",
        openDex: () => setDex(true),
      });
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  if (dex) {
    return (
      <div style={{ padding: 16, background: "var(--background)", minHeight: "100dvh" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              id={i === 4 ? "dex-cell-demo" : undefined}
              style={{
                aspectRatio: "1",
                borderRadius: 16,
                background: "#fff",
                boxShadow: "0 2px 8px rgb(0 0 0 / .08)",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
              }}
            >
              {i === 4 ? (
                <img src={PREVIEW_IMAGE} alt="" style={{ width: "86%", height: "86%" }} />
              ) : (
                <span style={{ fontSize: 28, opacity: 0.35 }}>
                  {["🍎", "🚲", "☕", "🌸", "", "🏮", "📚", "🥟", "🧋"][i]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--background)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div ref={sourceRef} style={{ width: 190, height: 190 }}>
        <img
          src={PREVIEW_IMAGE}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 24 }}
        />
      </div>
      <CatchLandingOverlay
        ref={flyRef}
        image={PREVIEW_IMAGE}
        headword="捕捉"
        reading="ㄅㄨˇ ㄓㄨㄛ"
        lang="zh-Hant"
      />
    </div>
  );
}
