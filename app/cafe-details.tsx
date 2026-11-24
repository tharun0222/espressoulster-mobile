import { useEffect, useRef, useState } from "react";
import { defaultSettings } from "../lib/catalog";
import { currentLocation, ensureDirectionsLocationEnabled, LocationError, preciseLocationMeters } from "../lib/address-location";
import { isKoramangala, koramangalaPin, type CafeRoute, type Coordinates } from "../lib/cafe-routing";
import { Footprints, CarFront } from "lucide-react";
import "./cafe-motion.css";
import CafeMap from "./cafe-map";

type CafeSettings = Pick<typeof defaultSettings, "brand" | "address"> & {
  cafeDirectionsAvailable?: boolean;
};
type TravelMode = "walk" | "drive";

export function cafeOutletLabel(settings: CafeSettings) {
  return isKoramangala(settings.address || "") ? "Koramangala 4th Block" : settings.brand;
}

function CafeDirections({ label, available }: { label: string; available: boolean }) {
  const [outlet, setOutlet] = useState("");
  const [mode, setMode] = useState<"" | TravelMode>("");
  const [route, setRoute] = useState<CafeRoute | null>(null);
  const [pending, setPending] = useState<"" | "location" | "route">("");
  const [routeError, setRouteError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [startingPoint, setStartingPoint] = useState("");
  const confirmedStartingPoint = useRef<string | undefined>(undefined);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [showStartingPoint, setShowStartingPoint] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function selectMode(value: "" | TravelMode, startingAddress?: string) {
    request.current?.abort();
    confirmedStartingPoint.current = startingAddress;
    setMode(value);
    setRoute(null);
    setRouteError("");
    setLocationAccuracy(null);
    if (!startingAddress) setLocationError("");
    if (!value || !outlet) return;

    const controller = new AbortController();
    request.current = controller;
    setPending(startingAddress ? "route" : "location");
    try {
      let origin: string | Coordinates;
      let accuracy: number | null = null;
      if (startingAddress) {
        origin = startingAddress;
      } else {
        try {
          ensureDirectionsLocationEnabled();
          const location = await currentLocation(controller.signal);
          if (controller.signal.aborted) return;
          origin = [location.longitude, location.latitude];
          accuracy = location.accuracy;
        } catch (error) {
          if (!controller.signal.aborted) {
            setLocationError(error instanceof LocationError ? error.message : "Your browser couldn’t get your location.");
          }
          return;
        }
      }
      setPending("route");
      const response = await fetch("/api/cafe/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, mode: value }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error((result as { error?: string }).error || "Directions are temporarily unavailable.");
      if (controller.signal.aborted) return;
      setLocationAccuracy(accuracy);
      setRoute(result as CafeRoute);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRouteError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setPending("");
    }
  }

  return (
    <>
      {available ? (
        <div className="cafe-directions-choices">
          <label>
            Outlet
            <select value={outlet} disabled={Boolean(pending)} onChange={(event) => {
              setOutlet(event.target.value);
              setMode("");
              setRoute(null);
              setRouteError("");
              setLocationError("");
              setStartingPoint("");
              confirmedStartingPoint.current = undefined;
              setShowStartingPoint(false);
            }}>
              <option value="">Choose an outlet</option>
              <option value="koramangala">{label}</option>
            </select>
          </label>
          <fieldset className="cafe-travel-mode">
            <legend>Travel mode</legend>
            <div className="cafe-travel-options" data-mode={mode}>
              <span aria-hidden="true" />
              <button type="button" aria-pressed={mode === "walk"} disabled={!outlet} onClick={() => void selectMode("walk", confirmedStartingPoint.current)}>
                <Footprints size={16} aria-hidden="true" /> Walking
              </button>
              <button type="button" aria-pressed={mode === "drive"} disabled={!outlet} onClick={() => void selectMode("drive", confirmedStartingPoint.current)}>
                <CarFront size={16} aria-hidden="true" /> Driving
              </button>
            </div>
          </fieldset>
        </div>
      ) : <p>Live routes are currently unavailable. The café pin is shown below.</p>}
      {pending && <p role="status">{pending === "location" ? "Finding your location…" : "Finding the shortest route…"}</p>}
      {available && mode && !locationError && !showStartingPoint && (
        <button type="button" onClick={() => setShowStartingPoint(true)}>Enter a starting point</button>
      )}
      {(locationError || showStartingPoint) && mode && (
        <form className="cafe-directions-recovery" onSubmit={(event) => {
          event.preventDefault();
          if (startingPoint.trim()) void selectMode(mode, startingPoint.trim());
        }}>
          {!route && locationError && <p role="status">{locationError} Enter a nearby landmark or street address to continue.</p>}
          <label>
            Starting point
            <input type="text" value={startingPoint} onChange={(event) => setStartingPoint(event.target.value)}
              maxLength={200} placeholder="Landmark or street address" required disabled={pending === "route"} />
          </label>
          <div className="cafe-directions-recovery-actions">
            <button type="submit" disabled={pending === "route" || !startingPoint.trim()}>Use starting point</button>
            <button type="button" disabled={Boolean(pending)} onClick={() => void selectMode(mode)}>Retry location</button>
          </div>
        </form>
      )}
      {routeError && !locationError && mode && !pending && (
        <button type="button" onClick={() => void selectMode(mode, confirmedStartingPoint.current)}>Try again</button>
      )}
      {routeError && <p role="alert">{routeError}</p>}
      {route && (
        <p className="cafe-route-summary" role="status">
          <strong>{route.distance < 1000 ? `${Math.round(route.distance)} m` : `${(route.distance / 1000).toFixed(1)} km`} · {Math.max(1, Math.round(route.duration / 60))} min</strong>
          <small>Shortest {mode === "walk" ? "walk" : "drive"} from {locationAccuracy === null ? "your starting point" : locationAccuracy > preciseLocationMeters ? "your approximate location" : "your location"} · estimated time</small>
        </p>
      )}
      <CafeMap pin={koramangalaPin} label={label} route={route} />
    </>
  );
}

export default function CafeDetails({ settings }: { settings: CafeSettings }) {
  return (
    <section className="club-offer cafe-directions" aria-label="Café directions">
      {isKoramangala(settings.address || "")
        ? <CafeDirections label={cafeOutletLabel(settings)} available={settings.cafeDirectionsAvailable === true} />
        : <p>Map directions are unavailable for this address.</p>}
    </section>
  );
}
