import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, Layers3 } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapStop } from "./DexDayMap";
import { nearbyStops } from "@/lib/day-map";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import { useUiLang } from "@/lib/i18n";

maplibregl.setWorkerUrl(workerUrl);

type LocatedStop = MapStop & { lat: number; lng: number };
type Pin = { stop: LocatedStop; element: HTMLDivElement; marker: maplibregl.Marker };
const valid = (s: MapStop): s is LocatedStop =>
  s.lat != null &&
  s.lng != null &&
  Number.isFinite(s.lat) &&
  Number.isFinite(s.lng) &&
  Math.abs(s.lat) <= 90 &&
  Math.abs(s.lng) <= 180;

/** The actual Dex map canvas; the existing Dex pin and timeline are rendered by its parent. */
export default function DexCityMap3D({
  stops,
  activeId,
  bottomInset,
  renderPin,
  onUnavailable,
}: {
  stops: MapStop[];
  activeId: string | null;
  bottomInset: number;
  renderPin: (stop: MapStop) => React.ReactNode;
  onUnavailable: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pins = useRef<Map<string, Pin>>(new Map());
  const [ready, setReady] = useState(false);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [flat, setFlat] = useState(false);
  const lang = useUiLang();
  const labels = {
    ja: { locate: "現在地を表示", empty: "現在地を表示すると、あなたの街を立体地図で見られます。" },
    en: { locate: "Show my location", empty: "Show your location to explore your city in 3D." },
    "zh-TW": { locate: "顯示目前位置", empty: "顯示目前位置，以立體地圖探索你的城市。" },
  }[lang];
  const initial = useRef(stops.find(valid));
  const inset = useRef(bottomInset);
  inset.current = bottomInset;
  const available = useRef(onUnavailable);
  available.current = onUnavailable;

  useEffect(() => {
    if (!host.current) {
      available.current();
      return;
    }
    const first = initial.current;
    // With no photo coordinates we show the whole world until the user explicitly locates.
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: host.current,
        style: "https://tiles.openfreemap.org/styles/bright",
        center: first ? [first.lng, first.lat] : [0, 20],
        zoom: first ? 15.8 : 1.8,
        pitch: first ? 58 : 0,
        bearing: first ? -23 : 0,
        maxPitch: 70,
        canvasContextAttributes: { antialias: true },
        attributionControl: { compact: true },
      });
    } catch (error) {
      console.warn("Dex 3D map could not initialize", error);
      available.current();
      return;
    }
    map.current = m;
    let loaded = false;
    const timeout = window.setTimeout(() => {
      if (!loaded) available.current();
    }, 14000);
    m.on("load", () => {
      loaded = true;
      window.clearTimeout(timeout);
      // A quiet city palette lets the user's photo pins remain the focal point.
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type !== "fill") continue;
        if (/water/i.test(layer.id)) m.setPaintProperty(layer.id, "fill-color", "#70b7ed");
        if (/park|garden|wood|forest/i.test(layer.id))
          m.setPaintProperty(layer.id, "fill-color", "#b9ddbe");
      }
      // The vector source supplies real building outlines/heights for the current city.
      if (!m.getSource("city-buildings")) {
        m.addSource("city-buildings", {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
        });
        const firstLabel = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
        m.addLayer(
          {
            id: "catchwords-buildings-3d",
            source: "city-buildings",
            "source-layer": "building",
            type: "fill-extrusion",
            minzoom: 13,
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "render_height"], 12],
                0,
                "#f7f4ed",
                25,
                "#e9e8f7",
                85,
                "#d8daf3",
              ],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.92,
            },
          },
          firstLabel,
        );
      }
      setReady(true);
    });
    m.on("error", (event) => {
      // Transient individual tile errors are tolerable. A failed style is not.
      if (!loaded && /style|source/i.test(String(event.error?.message ?? ""))) {
        console.warn("Dex 3D map style could not load", event.error);
        available.current();
      }
    });
    return () => {
      window.clearTimeout(timeout);
      pins.current.forEach(({ marker }) => marker.remove());
      pins.current.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  // Markers are stable DOM hosts. React portals render the SAME StopPin used by Google/grid.
  useLayoutEffect(() => {
    const m = map.current;
    if (!m) return;
    const located = stops.filter(valid);
    const ids = new Set(located.map((s) => s.id));
    pins.current.forEach((p, id) => {
      if (!ids.has(id)) {
        p.marker.remove();
        pins.current.delete(id);
      }
    });
    for (const stop of located) {
      const old = pins.current.get(stop.id);
      if (old) {
        old.stop = stop;
        old.marker.setLngLat([stop.lng, stop.lat]);
      } else {
        const element = document.createElement("div");
        element.className = "dex-city-map__marker";
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([stop.lng, stop.lat])
          .addTo(m);
        pins.current.set(stop.id, { stop, element, marker });
      }
    }
    // Portals need a render after marker hosts have been created.
    setMarkersVersion((n) => n + 1);
  }, [stops]);
  const [, setMarkersVersion] = useState(0);

  useEffect(() => {
    pins.current.forEach(({ element }, id) => {
      element.style.zIndex = id === activeId ? "5" : "1";
    });
  }, [activeId, stops]);

  const padding = () => ({
    top:
      Math.max(
        96,
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--dex-overlay-h"),
        ) || 96,
      ) + 24,
    bottom: inset.current + 40,
    left: 54,
    right: 54,
  });
  const lastDay = useRef(stops);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || lastDay.current === stops) return;
    lastDay.current = stops;
    const first = stops.find(valid);
    if (first)
      m.easeTo({
        center: [first.lng, first.lat],
        zoom: 16,
        pitch: flat ? 0 : 58,
        bearing: flat ? 0 : -23,
        duration: motionReducedNow() ? 0 : 800,
        padding: padding(),
      });
  }, [stops, ready, flat]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const stop = stops.find((s) => s.id === activeId && valid(s));
    if (!stop || !valid(stop)) return;
    const point = m.project([stop.lng, stop.lat]);
    const pad = padding();
    if (
      point.x >= pad.left &&
      point.x <= m.getContainer().clientWidth - pad.right &&
      point.y >= pad.top &&
      point.y <= m.getContainer().clientHeight - pad.bottom
    )
      return;
    // Keep a close city view even if the day's other photos were taken far away.
    const near = nearbyStops(stops, stop.id).filter(valid);
    if (near.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      near.forEach((s) => bounds.extend([s.lng, s.lat]));
      m.fitBounds(bounds, { padding: pad, maxZoom: 16.8, duration: motionReducedNow() ? 0 : 750 });
    } else {
      m.easeTo({
        center: [stop.lng, stop.lat],
        zoom: 16.2,
        padding: pad,
        duration: motionReducedNow() ? 0 : 750,
      });
    }
  }, [activeId, stops, ready]);

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const value: [number, number] = [coords.longitude, coords.latitude];
        setCenter(value);
        map.current?.flyTo({
          center: value,
          zoom: 16,
          pitch: flat ? 0 : 58,
          bearing: flat ? 0 : -23,
          duration: motionReducedNow() ? 0 : 900,
        });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 60000 },
    );
  };
  const toggleFlat = () => {
    const next = !flat;
    setFlat(next);
    map.current?.easeTo({
      pitch: next ? 0 : 58,
      bearing: next ? 0 : -23,
      duration: motionReducedNow() ? 0 : 650,
    });
  };
  return (
    <div className="dex-city-map h-full w-full">
      <div ref={host} className="absolute inset-0" aria-label="3D city map" />
      {!ready && <div className="dex-city-map__loading" aria-hidden />}
      <div className="dex-city-map__controls">
        <button
          type="button"
          onClick={toggleFlat}
          aria-label={flat ? "3D" : "2D"}
          className="dex-city-map__control"
          title={flat ? "3D" : "2D"}
        >
          <Layers3 size={20} /> <span>{flat ? "3D" : "2D"}</span>
        </button>
        <button
          type="button"
          onClick={locate}
          aria-label={labels.locate}
          title={labels.locate}
          className="dex-city-map__control"
        >
          <Crosshair size={20} />
        </button>
      </div>
      {!stops.some(valid) && !center && ready && (
        <div className="dex-city-map__empty">{labels.empty}</div>
      )}
      {[...pins.current.values()].map(({ stop, element }) =>
        createPortal(renderPin(stop), element, stop.id),
      )}
    </div>
  );
}
