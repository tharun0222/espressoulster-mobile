/// <reference types="vite/client" />
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource, Marker } from "maplibre-gl";
import type { CafeRoute, Coordinates } from "../lib/cafe-routing";
import { cafeMapWorker } from "../lib/cafe-map-worker";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url";
import "./cafe-map.css";

export default function CafeMap({ pin, label, route }: { pin: Coordinates; label: string; route: CafeRoute | null }) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<Marker | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let instance: MapLibreMap | undefined;
    let loaded = false;
    let preparedWorker: string | undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!disposed) {
        setMapError(true);
        if (!loaded) controller.abort();
      }
    }, 12000);

    // The CSP build takes an explicit worker asset, including in the Vite preview.
    // @ts-expect-error MapLibre ships one declaration file for both browser builds.
    const browserBuild: Promise<{ default: typeof import("maplibre-gl") }> = import("maplibre-gl/dist/maplibre-gl-csp.js");
    void browserBuild.then(async ({ default: { Map, Marker, NavigationControl, Popup, setWorkerUrl } }) => {
      preparedWorker = await cafeMapWorker(workerUrl, controller.signal);
      if (disposed) {
        URL.revokeObjectURL(preparedWorker);
        return;
      }
      if (disposed || !container.current) return;
      setWorkerUrl(preparedWorker);
      instance = new Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: pin,
        zoom: 15,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
      const activeMap = instance;
      activeMap.on("error", () => {
        // A missing worker/style must be actionable; a single tile failure on
        // an already visible map should not cover the remaining map.
        if (!disposed && !loaded) setMapError(true);
      });
      activeMap.on("webglcontextlost", () => {
        if (disposed) return;
        setMap(null);
        setMapError(true);
      });
      activeMap.on("webglcontextrestored", () => {
        // MapLibre restores its saved style and route source. Wait until it has
        // rendered again before allowing route updates against that style.
        activeMap.once("idle", () => {
          if (disposed || !loaded) return;
          activeMap.resize();
          setMapError(false);
          setMap(activeMap);
        });
      });
      marker.current = new Marker({ color: "#244c70" }).setLngLat(pin)
        .setPopup(new Popup({ offset: 25 }).setText(label)).addTo(activeMap);
      activeMap.addControl(new NavigationControl({ showCompass: false }));
      activeMap.once("load", () => {
        if (disposed) return;
        window.clearTimeout(timer);
        loaded = true;
        setMapError(false);
        activeMap.addSource("cafe-route", { type: "geojson", data: { type: "FeatureCollection", features: [] }, lineMetrics: true });
        activeMap.addLayer({
          id: "cafe-route",
          type: "line",
          source: "cafe-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-opacity": 0, "line-color": "#2467ce", "line-width": 5 },
        });
        setMap(activeMap);
      });
    }).catch((error) => {
      if (disposed) return;
      console.warn("Café map initialization failed", error);
      window.clearTimeout(timer);
      if (!disposed) setMapError(true);
    });

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
      marker.current = null;
      instance?.remove();
      if (preparedWorker) URL.revokeObjectURL(preparedWorker);
    };
  }, [pin, label, attempt]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>("cafe-route");
    if (!route) {
      map.setPaintProperty("cafe-route", "line-opacity", 0);
      source?.setData({ type: "FeatureCollection", features: [] });
      map.jumpTo({ center: pin, zoom: 15 });
      return;
    }

    map.setPaintProperty("cafe-route", "line-opacity", 0);
    source?.setData({ type: "LineString", coordinates: route.coordinates });
    const bounds = route.coordinates.reduce<[number, number, number, number]>(([west, south, east, north], [longitude, latitude]) =>
      [Math.min(west, longitude), Math.min(south, latitude), Math.max(east, longitude), Math.max(north, latitude)],
      [pin[0], pin[1], pin[0], pin[1]]);
    map.fitBounds(bounds, { padding: 45, maxZoom: 16, duration: 0 });

    const blue = "#2467ce";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number;
    const started = performance.now();
    function draw(now: number) {
      const progress = reducedMotion.matches ? 1 : Math.min(1, (now - started) / 780);
      const activeMap = map!;
      if (progress < 1) {
        activeMap.setPaintProperty("cafe-route", "line-gradient", [
          "step", ["line-progress"], blue, Math.max(.001, 1 - Math.pow(1 - progress, 2)), "rgba(36,103,206,0)",
        ]);
        frame = requestAnimationFrame(draw);
      } else {
        activeMap.setPaintProperty("cafe-route", "line-gradient", null);
        if (!reducedMotion.matches) marker.current?.getElement().animate(
          [{ opacity: 1 }, { opacity: .55 }, { opacity: 1 }], { duration: 420 },
        );
      }
      activeMap.setPaintProperty("cafe-route", "line-opacity", 1);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [map, pin, route]);

  return (
    <div className="cafe-map" aria-busy={!map && !mapError}>
      <div ref={container} className="cafe-map-canvas" role="region" aria-label={`Map to ${label}`} />
      {(!map || mapError) && <div className="cafe-map-feedback" role="status">
        <p>{mapError ? "The map couldn’t load. Check your connection and try again." : "Loading map…"}</p>
        {mapError && <button type="button" onClick={() => {
          setMap(null);
          setMapError(false);
          setAttempt(value => value + 1);
        }}>Reload map</button>}
      </div>}
    </div>
  );
}
