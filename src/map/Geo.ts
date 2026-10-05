import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import type { GeoPoint, WorldPoint } from '../types';

/** Equirectangular projection: lon -180..180 → x, lat 90..-90 → y. */
export const geoToWorld = ({ lon, lat }: GeoPoint): WorldPoint => ({
  x: ((lon + 180) / 360) * WORLD_WIDTH,
  y: ((90 - lat) / 180) * WORLD_HEIGHT,
});

export const worldToGeo = ({ x, y }: WorldPoint): GeoPoint => ({
  lon: (x / WORLD_WIDTH) * 360 - 180,
  lat: 90 - (y / WORLD_HEIGHT) * 180,
});

export const formatGeo = ({ lon, lat }: GeoPoint): string =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
