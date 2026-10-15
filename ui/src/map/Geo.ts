import { ATLANTIC_SQUEEZE, EARTH_LON_SPAN, PACIFIC_SQUEEZE, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import type { GeoPoint, WorldPoint } from '../types';

const { west: AW, east: AE, keep: AK } = ATLANTIC_SQUEEZE;
const P = PACIFIC_SQUEEZE;

/** Degrees across the map (0..EARTH_LON_SPAN) of a longitude, with only the Atlantic squeezed. */
function atlanticDeg(lon: number): number {
  return lon <= AW ? lon + 180 : lon <= AE ? AW + 180 + (lon - AW) * AK : AW + 180 + (AE - AW) * AK + (lon - AE);
}

function atlanticLon(deg: number): number {
  const a = AW + 180;
  const b = a + (AE - AW) * AK;
  return deg <= a ? deg - 180 : deg <= b ? AW + (deg - a) / AK : AE + (deg - b);
}

/** Share of the Pacific band kept at this latitude: PACIFIC_SQUEEZE.keep inside south..north, easing to 1 outside. */
function pacificKeep(lat: number): number {
  const out = lat > P.north ? (lat - P.north) / P.ramp : lat < P.south ? (P.south - lat) / P.ramp : 0;
  const t = Math.min(1, out);
  const ease = t * t * (3 - 2 * t);
  return P.keep + (1 - P.keep) * ease;
}

/**
 * Longitude (at a latitude) → 0..1 across the map: equirectangular, except the Atlantic band (ATLANTIC_SQUEEZE) is
 * squeezed everywhere and the eastern Pacific band (PACIFIC_SQUEEZE) at mid latitudes, so the continents sit closer.
 */
export function lonToFrac(lon: number, lat: number): number {
  const s = pacificKeep(lat);
  const removed = (P.east - P.west) * (1 - s);
  const deg = lon >= P.east ? atlanticDeg(lon) : lon >= P.west ? atlanticDeg(P.east) - (P.east - lon) * s : atlanticDeg(lon) + removed;
  return deg / EARTH_LON_SPAN;
}

/** Inverse of lonToFrac; below -180 (the open-sea strip at the west edge) where the Pacific is squeezed. */
export function fracToLon(f: number, lat: number): number {
  const deg = f * EARTH_LON_SPAN;
  const s = pacificKeep(lat);
  const removed = (P.east - P.west) * (1 - s);
  const east = atlanticDeg(P.east);
  if (deg >= east) return atlanticLon(deg);
  if (deg >= east - (P.east - P.west) * s) return P.east - (east - deg) / s;
  return atlanticLon(deg - removed);
}

/** Projection: lon → x (squeezed oceans, see lonToFrac), lat 90..-90 → y. */
export const geoToWorld = ({ lon, lat }: GeoPoint): WorldPoint => ({
  x: lonToFrac(lon, lat) * WORLD_WIDTH,
  y: ((90 - lat) / 180) * WORLD_HEIGHT,
});

export const worldToGeo = ({ x, y }: WorldPoint): GeoPoint => {
  const lat = 90 - (y / WORLD_HEIGHT) * 180;
  return { lon: fracToLon(x / WORLD_WIDTH, lat), lat };
};

export const formatGeo = ({ lon, lat }: GeoPoint): string =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
