import type { GeoPoint, Territory } from '../types';

const poly = (pts: readonly [number, number][]): GeoPoint[] => pts.map(([lon, lat]) => ({ lon, lat }));

/**
 * Coarse home regions per faction (lon, lat). Borders are clipped to the
 * coastline at render time, so polygons only need to bound the land.
 * North America is separated from Eurasia/Africa by the Atlantic Ocean.
 */
export const TERRITORIES: readonly Territory[] = [
  {
    faction: 'usa',
    name: 'North America',
    polygon: poly([
      [-168, 66], [-140, 71], [-95, 73], [-75, 69], [-58, 61], [-50, 47], [-66, 43],
      [-75, 34], [-80, 24], [-87, 20], [-97, 15], [-106, 20], [-118, 31], [-126, 41],
      [-127, 50], [-142, 59], [-168, 53],
    ]),
  },
  {
    faction: 'europe',
    name: 'Europe',
    polygon: poly([
      [-11, 36], [-11, 44], [-6, 49], [-12, 52], [-9, 59], [-2, 62], [4, 63], [6, 71.5],
      [28, 71.5], [30, 69.5], [29, 61], [27.5, 57], [24, 53.5], [24, 50], [22.5, 48],
      [29.5, 45.5], [28.5, 41.8], [26.5, 39], [26, 35], [14, 35.5], [6, 37.5], [-2, 35.5],
    ]),
  },
  {
    faction: 'russia',
    name: 'Russia',
    polygon: poly([
      [30, 70], [40, 69.5], [60, 70.5], [80, 74], [105, 78.5], [140, 74], [180, 71],
      [180, 64], [162, 58], [141, 54], [134, 48], [131, 43], [127, 50], [122, 53.5],
      [117, 50], [97, 50], [87, 49.5], [80, 51], [68, 55], [61, 51], [48, 50], [47, 42],
      [38, 45], [38, 49], [32, 52], [28, 56.5], [28.5, 60.5],
    ]),
  },
  {
    faction: 'china',
    name: 'China',
    polygon: poly([
      [73, 39], [75, 45], [80, 45], [87, 49], [97, 43], [105, 42], [112, 45], [117, 49.5],
      [122, 53], [127, 49.5], [134, 48], [131, 43], [125, 40], [122, 37], [122, 31],
      [118, 24], [110, 18], [106, 21], [98, 24], [92, 27], [85, 28], [79, 32],
    ]),
  },
];

/** Ray-casting point-in-polygon test in lon/lat space. */
export function containsGeo(polygon: readonly GeoPoint[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.lat > lat !== b.lat > lat && lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}
