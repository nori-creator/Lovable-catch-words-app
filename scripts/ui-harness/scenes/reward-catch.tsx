import { useEffect, useRef } from "react";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";

export function RewardCatchScene() {
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runCatchLanding({ startEl: sourceRef.current, fly: flyRef, speakLine: () => {} });
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--background)", display: "grid", placeItems: "center" }}>
      <div ref={sourceRef} style={{ width: 190, height: 190 }}>
        <img
          src="/icon-512.png"
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 24 }}
        />
      </div>
      <CatchLandingOverlay
        ref={flyRef}
        image="/icon-512.png"
        headword="捕捉"
        reading="ㄅㄨˇ ㄓㄨㄛ"
        lang="zh-Hant"
      />
    </div>
  );
}