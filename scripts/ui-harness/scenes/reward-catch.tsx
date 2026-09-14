import { useEffect, useRef } from "react";
import { CatchLandingOverlay, runCatchLanding } from "@/components/CatchLanding";

const PREVIEW_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#f4c542"/><circle cx="256" cy="232" r="116" fill="#e85d3f"/><path d="M250 108c28-58 89-70 129-45-23 50-70 73-129 45Z" fill="#31956b"/><circle cx="219" cy="213" r="14" fill="#fff"/><circle cx="298" cy="213" r="14" fill="#fff"/></svg>',
  );

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
