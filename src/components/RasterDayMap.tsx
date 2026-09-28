import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapStop } from "./DexDayMap";
import { useUiLang } from "@/lib/i18n";

const located = (s: MapStop) =>
  s.lat != null && s.lng != null && Number.isFinite(s.lat) && Number.isFinite(s.lng);
type Pin = { marker: L.Marker; host: HTMLDivElement; stop: MapStop };

/** A real, pan/zoom street map on devices without WebGL, not an empty grid. */
export default function RasterDayMap({
  stops,
  activeId,
  bottomInset,
  renderPin,
}: {
  stops: MapStop[];
  activeId: string | null;
  bottomInset: number;
  renderPin: (stop: MapStop) => React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef<Map<string, Pin>>(new Map());
  const [, redraw] = useState(0);
  const [current, setCurrent] = useState(false);
  const lang = useUiLang();
  const labels = {
    ja: { locate: "現在地を表示", empty: "現在地を表示すると、あなたの街を見られます。" },
    en: { locate: "Show my location", empty: "Show your location to explore your city." },
    "zh-TW": { locate: "顯示目前位置", empty: "顯示目前位置，探索你的城市。" },
  }[lang];
  const first = useRef(stops.find(located));
  useEffect(() => {
    if (!host.current) return;
    const markerPins = pins.current;
    const s = first.current;
    const m = L.map(host.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: false,
    }).setView(s ? [s.lat as number, s.lng as number] : [20, 0], s ? 16 : 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(m);
    map.current = m;
    return () => {
      markerPins.forEach(({ marker }) => marker.remove());
      markerPins.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ids = new Set(stops.filter(located).map((s) => s.id));
    pins.current.forEach(({ marker }, id) => {
      if (!ids.has(id)) {
        marker.remove();
        pins.current.delete(id);
      }
    });
    stops.filter(located).forEach((stop) => {
      let pin = pins.current.get(stop.id);
      if (!pin) {
        const marker = L.marker([stop.lat as number, stop.lng as number], {
          icon: L.divIcon({
            className: "dex-raster-map__pin",
            html: "",
            iconSize: [48, 48],
            iconAnchor: [24, 24],
          }),
        }).addTo(m);
        const host = document.createElement("div");
        host.className = "dex-city-map__marker";
        marker.getElement()?.append(host);
        pin = { marker, host, stop };
        pins.current.set(stop.id, pin);
      } else {
        pin.stop = stop;
        pin.marker.setLatLng([stop.lat as number, stop.lng as number]);
      }
    });
    redraw((n) => n + 1);
  }, [stops]);

  useEffect(() => {
    const s = stops.find((x) => x.id === activeId && located(x));
    const m = map.current;
    if (!s || !m) return;
    const target = L.latLng(s.lat as number, s.lng as number);
    const projected = m.latLngToContainerPoint(target);
    const p = m.containerPointToLatLng(
      L.point(projected.x, projected.y + Math.min(bottomInset * 0.32, 160)),
    );
    m.flyTo(p, Math.max(m.getZoom(), 15), { duration: 0.75 });
  }, [activeId, stops, bottomInset]);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        setCurrent(true);
        map.current?.flyTo([coords.latitude, coords.longitude], 16, { duration: 0.8 });
      },
      () => {},
      { timeout: 9000, maximumAge: 60000 },
    );
  return (
    <div className="dex-city-map dex-raster-map h-full w-full">
      <div ref={host} className="absolute inset-0" aria-label="City map" />
      <div className="dex-city-map__controls">
        <button
          type="button"
          className="dex-city-map__control"
          aria-label={labels.locate}
          onClick={locate}
        >
          <Crosshair size={20} />
        </button>
      </div>
      {!stops.some(located) && !current && (
        <div className="dex-city-map__empty">{labels.empty}</div>
      )}
      <a
        className="dex-raster-map__attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        style={{ bottom: `calc(${bottomInset}px + 5.5rem)` }}
      >
        © OpenStreetMap contributors
      </a>
      {[...pins.current.values()].map(({ host: pinHost, stop }) =>
        createPortal(renderPin(stop), pinHost, stop.id),
      )}
    </div>
  );
}
