import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers } from "@/lib/stickers.functions";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "マップ — Catchwords" },
      { name: "description", content: "あなたが街でステッカーをキャッチした場所を地図で振り返ります。" },
    ],
  }),
  component: MapPage,
});

declare global {
  interface Window {
    initMap?: () => void;
    google?: unknown;
  }
}

function MapPage() {
  const fetchStickers = useServerFn(listMyStickers);
  const { data: stickers } = useQuery({ queryKey: ["stickers"], queryFn: () => fetchStickers() });
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);

  useEffect(() => {
    const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!browserKey) return;
    if (window.google) {
      initMap();
      return;
    }
    window.initMap = initMap;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&loading=async&callback=initMap${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    document.head.appendChild(s);

    function initMap() {
      if (!mapRef.current) return;
      const g = (window.google as { maps: { Map: new (el: HTMLElement, opts: object) => unknown } }).maps;
      mapInstance.current = new g.Map(mapRef.current, {
        center: { lat: 25.033, lng: 121.5654 }, // Taipei default
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
      });
      renderMarkers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMarkers() {
    if (!mapInstance.current || !window.google) return;
    const g = (window.google as { maps: { Marker: new (opts: object) => unknown; LatLngBounds: new () => { extend: (l: object) => void; isEmpty: () => boolean } } }).maps;
    for (const m of markersRef.current) {
      (m as { setMap: (x: null) => void }).setMap(null);
    }
    markersRef.current = [];
    const bounds = new g.LatLngBounds();
    for (const s of stickers ?? []) {
      if (s.lat == null || s.lng == null) continue;
      const marker = new g.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: mapInstance.current,
        title: s.word.headword,
      });
      (marker as { addListener: (ev: string, cb: () => void) => void }).addListener("click", () => {
        navigate({ to: "/dex/$stickerId", params: { stickerId: s.id } });
      });
      bounds.extend({ lat: s.lat, lng: s.lng });
      markersRef.current.push(marker);
    }
    if (!bounds.isEmpty()) {
      (mapInstance.current as { fitBounds: (b: object, p: number) => void }).fitBounds(bounds, 64);
    }
  }

  useEffect(() => {
    if (mapInstance.current) renderMarkers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickers]);

  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const withLoc = (stickers ?? []).filter((s) => s.lat != null && s.lng != null);

  return (
    <AppShell title="マップ">
      {!browserKey ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Google Maps の連携が完了していません。
        </div>
      ) : (
        <>
          <div
            ref={mapRef}
            className="h-[60vh] w-full overflow-hidden rounded-2xl border border-border bg-secondary"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            位置情報付きのステッカー: {withLoc.length} 件
          </p>
        </>
      )}
    </AppShell>
  );
}
