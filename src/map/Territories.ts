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
    // The United States and Alaska (Canada is a contested nation of its own): the 49th parallel and the Great Lakes
    // to the north, Alaska joined on by a strip of Pacific Ocean off the British Columbia coast.
    polygon: poly([
      [-168, 66], [-156, 71.5], [-141, 70], [-141, 60], [-137, 59], [-133, 56.5], [-130, 56], [-130.5, 54.7],
      [-135, 54], [-124.7, 48.35], [-123.2, 48.25], [-123, 49], [-95, 49], [-89.6, 48], [-84.5, 46.5],
      [-82.4, 45.3], [-82.4, 43], [-83.1, 42.2], [-80, 42.3], [-79, 42.8], [-79, 43.6], [-76.5, 43.7],
      [-75.5, 44.6], [-74.7, 45], [-71.5, 45], [-70.5, 46.2], [-69.2, 47.4], [-68, 47.3], [-67.8, 45.7],
      [-67, 45], [-66, 43],
      [-75, 34], [-80, 24], [-87, 20], [-97, 15], [-106, 20], [-118, 31], [-126, 41],
      [-128, 48], [-139, 54.5], [-148, 58], [-168, 53],
    ]),
  },
  {
    faction: 'europe',
    name: 'Europe',
    polygon: poly([
      // Great Britain left the EU (Brexit): the border skirts it through the Irish Sea, the Channel and the North Sea.
      [-11, 36], [-11, 44], [-6, 49], [-12, 51], [-11, 55.6], [-6.2, 55.4], [-6.2, 51.5], [-6, 49.8],
      [1.5, 50.8], [2.5, 51.3], [3, 53], [2, 57], [-1, 61], [4, 63], [6, 71.5],
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
  {
    faction: 'islamic',
    name: 'Middle East',
    // The Islamic world's homeland: the Arabian Peninsula, Iraq, Syria, Jordan and Iran (Turkey and Egypt stay out).
    polygon: poly([
      [36, 37], [42, 37.3], [44, 39.5], [48, 38.5], [54, 37.5], [61, 36.6], [61, 31], [63, 29.5],
      [61.5, 25], [57, 25.5], [59.8, 22.5], [57, 18.8], [52, 16], [43, 12.5], [42.5, 15.5], [39, 21],
      [35, 28], [34.5, 31], [35, 33], [35.8, 35.5],
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
