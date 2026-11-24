export function addressLocation(input:unknown){
 if(input===undefined||input===null)return null;
 const p=input as {latitude:number;longitude:number};
 if(typeof p.latitude!=='number'||!Number.isFinite(p.latitude)||p.latitude < -90||p.latitude > 90||typeof p.longitude!=='number'||!Number.isFinite(p.longitude)||p.longitude < -180||p.longitude > 180)throw Error('Choose a valid address location.');
 return {latitude:p.latitude,longitude:p.longitude};
}

type DeviceLocation = { latitude: number; longitude: number; accuracy: number };

export const preciseLocationMeters = 100;
const usableLocationMeters = 250;
const locationWaitMs = 20000;

export class LocationError extends Error {
  constructor(readonly reason: "permission" | "unsupported" | "unavailable" | "approximate" | "timeout" | "off") {
    super({
      permission: "Location access is blocked. Check location permissions for this site and browser.",
      unsupported: "Open the app in a browser that supports location access over a secure connection.",
      unavailable: "Your device couldn’t find your location. Check that Location Services are on.",
      approximate: "Your device’s location is too approximate for directions. Enable Precise Location and try again.",
      timeout: "Finding your location took too long. Try again near a window or outdoors.",
      off: "Turn on location services to use your current location.",
    }[reason]);
  }
}

export function ensureDirectionsLocationEnabled() {
  const device = window as Window & {espressoLocationSettings?: boolean};
  if (device.espressoLocationSettings && device.prompt("espresso:location:enable") !== "enabled") {
    throw new LocationError("off");
  }
}

export async function currentLocation(signal: AbortSignal): Promise<DeviceLocation> {
  signal.throwIfAborted();
  if (!window.isSecureContext || !navigator.geolocation) throw new LocationError("unsupported");
  const geolocation = navigator.geolocation;

  return new Promise((resolve, reject) => {
    let best: DeviceLocation | undefined;
    let reason: "unavailable" | "timeout" = "timeout";
    let watch: number | undefined;
    let finished = false;
    const timer = setTimeout(() => {
      cleanup();
      if (best && best.accuracy <= usableLocationMeters) resolve(best);
      else reject(new LocationError(best ? "approximate" : reason));
    }, locationWaitMs);

    function cleanup() {
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (watch !== undefined) geolocation.clearWatch(watch);
    }

    function onAbort() {
      cleanup();
      reject(signal.reason);
    }

    signal.addEventListener("abort", onAbort, { once: true });
    try {
      watch = geolocation.watchPosition(({ coords }) => {
        if (finished || !Number.isFinite(coords.accuracy) || coords.accuracy < 0) return;
        const { latitude, longitude, accuracy } = coords;
        if (!best || accuracy < best.accuracy) best = { latitude, longitude, accuracy };
        if (accuracy <= preciseLocationMeters) {
          cleanup();
          resolve(best);
        }
      }, ({ code }) => {
        if (finished) return;
        if (code === 1) {
          cleanup();
          reject(new LocationError("permission"));
        } else {
          reason = code === 3 ? "timeout" : "unavailable";
        }
      }, { enableHighAccuracy: true, timeout: locationWaitMs, maximumAge: 0 });
      if (finished) geolocation.clearWatch(watch);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
