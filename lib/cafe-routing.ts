export type Coordinates = [longitude: number, latitude: number];

export type CafeRoute = {
  coordinates: Coordinates[];
  distance: number;
  duration: number;
};

export const koramangalaPin: Coordinates = [77.630215, 12.934217];
export const koramangalaAddress = "4, 80 Feet Rd, above 3M showroom, next to 1522, S.T. Bed, 4th Block, Koramangala, Bengaluru, Karnataka 560034, India";

export function isKoramangala(address: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(address) === normalize(koramangalaAddress);
}

export function isCoordinates(value: unknown): value is Coordinates {
  return Array.isArray(value) && value.length === 2 &&
    Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
}
