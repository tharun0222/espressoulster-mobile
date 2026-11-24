import { isCoordinates, type Coordinates, type CafeRoute } from "./cafe-routing";

export async function getOpenRoute(origin: string | Coordinates, destination: Coordinates, key: string, mode: "drive" | "walk" = "drive"): Promise<CafeRoute> {
  const signal = AbortSignal.timeout(9000);
  const headers = { Authorization: key };
  let start = origin;

  if (typeof start === "string") {
    const params = new URLSearchParams({
      text: start,
      "boundary.country": "IND",
      "focus.point.lon": String(destination[0]),
      "focus.point.lat": String(destination[1]),
      size: "1",
    });
    const response = await fetch(`https://api.heigit.org/pelias/v1/search?${params}`, { headers, signal });
    if (!response.ok) throw Error("Address lookup is temporarily unavailable.");
    const result = await response.json() as { features?: { geometry?: { coordinates?: unknown } }[] };
    const coordinates = result.features?.[0]?.geometry?.coordinates;
    if (!isCoordinates(coordinates)) throw Error("Starting point not found. Try a nearby landmark or use your location.");
    start = coordinates;
  }

  const profile = mode === "walk" ? "foot-walking" : "driving-car";
  const response = await fetch(`https://api.heigit.org/openrouteservice/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: [start, destination], preference: "shortest", instructions: false }),
    signal,
  });
  if (!response.ok) throw Error("Couldn’t get a route. Try another starting point.");
  const result = await response.json() as {
    features?: { geometry?: { coordinates?: Coordinates[] }; properties?: { summary?: { distance: number; duration: number } } }[];
  };
  const route = result.features?.[0];
  const coordinates = route?.geometry?.coordinates;
  const summary = route?.properties?.summary;
  if (!coordinates || coordinates.length < 2 || !coordinates.every(isCoordinates) ||
    !summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration)) {
    throw Error("No route was found.");
  }
  return { coordinates, distance: summary.distance, duration: summary.duration };
}
