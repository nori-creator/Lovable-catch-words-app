/* eslint-disable @typescript-eslint/no-explicit-any -- Maps JavaScript is loaded at runtime. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, Layers3 } from "lucide-react";
import type { MapStop } from "./DexDayMap";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import { useUiLang } from "@/lib/i18n";

const located = (s: MapStop) =>
  s.lat != null && s.lng != null && Number.isFinite(s.lat) && Number.isFinite(s.lng);

type PinHost = { stop: MapStop; element: HTMLElement & { position: any }; host: HTMLDivElement };

/** Google’s licensed photorealistic city model, with the production photo pins. */
export default function GoogleCityMap3D({
  g,
  stops,
  activeId,
  bottomInset,
  renderPin,
  onUnavailable,
}: {
  g: any;
  stops: MapStop[];
  activeId: string | null;
  bottomInset: number;
  renderPin: (stop: MapStop) => React.ReactNode;
  onUnavailable: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markerClass = useRef<any>(null);
  const pins = useRef<Map<string, PinHost>>(new Map());
  const [mounted, setMounted] = useState(false);
  const [, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState(false);
  const [locatedSelf, setLocatedSelf] = useState(false);
  const lang = useUiLang();
  const labels = {
    ja: { locate: "現在地を表示", empty: "現在地を表示すると、あなたの街を見られます。" },
    en: { locate: "Show my location", empty: "Show your location to explore your city." },
    "zh-TW": { locate: "顯示目前位置", empty: "顯示目前位置，探索你的城市。" },
  }[lang];
  const first = useRef(stops.find(located));
  const failed = useRef(onUnavailable);
  failed.current = onUnavailable;

  useEffect(() => {
    let disposed = false;
    const markerPins = pins.current;
    let timer: number;
    let element: any;
    let onError: () => void;
    let onSteady: (event: Event) => void;
    const initialize = async () => {
      try {
        const lib = await g.importLibrary("maps3d");
        if (disposed || !mount.current) return;
        markerClass.current = lib.MarkerElement;
        const place = first.current;
        element = new lib.Map3DElement({
          center: { lat: place?.lat ?? 25.033, lng: place?.lng ?? 121.5654, altitude: 0 },
          tilt: 63,
          heading: 335,
          range: place ? 950 : 2400,
          mode: "HYBRID",
          gestureHandling: "GREEDY",
          defaultUIHidden: true,
        });
        element.className = "dex-city-map__google";
        mount.current.append(element);
        map.current = element;
        onError = () => failed.current();
        onSteady = (event: Event) => {
          if ((event as Event & { isSteady?: boolean }).isSteady) {
            window.clearTimeout(timer);
            setReady(true);
          }
        };
        element.addEventListener("gmp-error", onError);
        element.addEventListener("gmp-steadychange", onSteady);
        timer = window.setTimeout(() => {
          if (!disposed) failed.current();
        }, 18000);
        setMounted(true);
      } catch (error) {
        console.warn("Photorealistic 3D map unavailable", error);
        if (!disposed) failed.current();
      }
    };
    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      element?.removeEventListener("gmp-error", onError);
      element?.removeEventListener("gmp-steadychange", onSteady);
      markerPins.forEach(({ element: pin }) => pin.remove());
      markerPins.clear();
      element?.remove();
      map.current = null;
    };
  }, [g]);

  useEffect(() => {
    const m = map.current;
    const Marker = markerClass.current;
    if (!m || !Marker) return;
    const ids = new Set(stops.filter(located).map((s) => s.id));
    pins.current.forEach(({ element }, id) => {
      if (!ids.has(id)) {
        element.remove();
        pins.current.delete(id);
      }
    });
    stops.filter(located).forEach((stop) => {
      let pin = pins.current.get(stop.id);
      if (!pin) {
        const element = new Marker({
          position: { lat: stop.lat, lng: stop.lng },
          anchorLeft: "-50%",
          anchorTop: "-50%",
          title: stop.items[0]?.s.word.headword ?? "",
        });
        const host = document.createElement("div");
        host.className = "dex-city-map__marker";
        element.append(host);
        m.append(element);
        pin = { stop, element, host };
        pins.current.set(stop.id, pin);
      } else {
        pin.stop = stop;
        pin.element.position = { lat: stop.lat, lng: stop.lng };
      }
    });
    setVersion((v) => v + 1);
  }, [stops, mounted]);

  const previousStops = useRef(stops);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || previousStops.current === stops) return;
    previousStops.current = stops;
    const s = stops.find(located);
    if (s)
      m.flyCameraTo({
        endCamera: {
          center: { lat: s.lat, lng: s.lng, altitude: 0 },
          tilt: flat ? 0 : 63,
          range: 950,
        },
        durationMillis: motionReducedNow() ? 0 : 900,
      });
  }, [stops, flat, ready]);

  useEffect(() => {
    const m = map.current;
    const s = stops.find((x) => x.id === activeId && located(x));
    if (!m || !ready || !s) return;
    // Shift the focal point upward, leaving the selected pin above the timeline.
    const visibleHeight = Math.max(240, window.innerHeight - bottomInset);
    const offset = Math.min(0.0015, (bottomInset / visibleHeight) * 0.0007);
    m.flyCameraTo({
      endCamera: {
        center: { lat: (s.lat as number) - offset, lng: s.lng, altitude: 0 },
        range: 850,
        tilt: flat ? 0 : 63,
        heading: 335,
      },
      durationMillis: motionReducedNow() ? 0 : 850,
    });
  }, [activeId, stops, ready, flat, bottomInset]);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        setLocatedSelf(true);
        map.current?.flyCameraTo({
          endCamera: {
            center: { lat: coords.latitude, lng: coords.longitude, altitude: 0 },
            range: 950,
            tilt: flat ? 0 : 63,
          },
          durationMillis: motionReducedNow() ? 0 : 950,
        });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 60000 },
    );

  return (
    <div className="dex-city-map h-full w-full">
      <div ref={mount} className="absolute inset-0" aria-label="3D city map" />
      {!ready && <div className="dex-city-map__loading" aria-hidden />}
      <div className="dex-city-map__controls">
        <button
          type="button"
          className="dex-city-map__control"
          aria-label={flat ? "3D" : "2D"}
          onClick={() => {
            const next = !flat;
            setFlat(next);
            if (map.current) map.current.tilt = next ? 0 : 63;
          }}
        >
          <Layers3 size={20} /> <span>{flat ? "3D" : "2D"}</span>
        </button>
        <button
          type="button"
          className="dex-city-map__control"
          aria-label={labels.locate}
          onClick={locate}
        >
          <Crosshair size={20} />
        </button>
      </div>
      {!stops.some(located) && !locatedSelf && ready && (
        <div className="dex-city-map__empty">{labels.empty}</div>
      )}
      {[...pins.current.values()].map(({ stop, host }) =>
        createPortal(renderPin(stop), host, stop.id),
      )}
    </div>
  );
}
