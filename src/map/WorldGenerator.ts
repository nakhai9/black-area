import { CELL_SIZE, DEPTH_M_PER_UNIT, ELEVATION_M_PER_UNIT, WORLD_SCALE } from '../constants';
import { type BiomeFields, sampleField } from './Biomes';
import type { EarthData } from './EarthData';
import { TERRITORIES, containsGeo } from './Territories';
import type { TileMap } from './TileMap';
import type { TerrainType } from '../types';

const SAND_COAST_RANGE = 1;

/**
 * Derives the gameplay grid from Earth data: terrain type and height per
 * cell, plus the faction territory each land cell belongs to.
 */
export function buildWorld(earth: EarthData, biomes: BiomeFields, map: TileMap): void {
  const { width: W, height: H } = map;
  const half = CELL_SIZE / 2;

  // 1. Land / sea and elevation from the cell-centre Earth sample.
  const land = new Uint8Array(W * H);
  const elev = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(earth.width - 1, Math.floor((x * CELL_SIZE + half) / WORLD_SCALE));
      const sy = Math.min(earth.height - 1, Math.floor((y * CELL_SIZE + half) / WORLD_SCALE));
      const p = sy * earth.width + sx;
      const i = map.index(x, y);
      if (earth.land[p] < 128) {
        map.heights[i] = -Math.max(1, earth.depth[p]) * DEPTH_M_PER_UNIT;
        map.setType(x, y, 'water');
      } else {
        land[i] = 1;
        elev[i] = earth.elevation[p] * ELEVATION_M_PER_UNIT;
        map.heights[i] = Math.max(1, elev[i]);
      }
    }
  }

  // 2. Climate: distance from the sea (continentality), then biome from latitude, altitude, rainfall belts.
  const coast = coastDistance(land, W, H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    for (let x = 0; x < W; x++) {
      const i = map.index(x, y);
      if (!land[i]) continue;
      map.setType(
        x,
        y,
        classify(lat, elev[i], coast[i] ?? 0, sampleField(biomes.desert, W, H, x, y), sampleField(biomes.forest, W, H, x, y), sampleField(biomes.ice, W, H, x, y)),
      );
    }
  }

  // 3. Beaches on low land next to the sea.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map.typeAt(x, y);
      if ((t !== 'grass' && t !== 'forest') || map.heightAt(x, y) > 60) continue;
      search: for (let dy = -SAND_COAST_RANGE; dy <= SAND_COAST_RANGE; dy++) {
        for (let dx = -SAND_COAST_RANGE; dx <= SAND_COAST_RANGE; dx++) {
          if (map.isWater(x + dx, y + dy)) {
            map.setType(x, y, 'sand');
            break search;
          }
        }
      }
    }
  }

  // 4. Territories.
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    for (let x = 0; x < W; x++) {
      if (map.isWater(x, y)) continue;
      const lon = ((x + 0.5) / W) * 360 - 180;
      const idx = TERRITORIES.findIndex((t) => containsGeo(t.polygon, lon, lat));
      if (idx >= 0) map.territory[map.index(x, y)] = idx + 1;
    }
  }
}

/** Cells to the nearest sea cell for every land cell (4-neighbour BFS, capped). */
function coastDistance(land: Uint8Array, W: number, H: number): Uint8Array {
  const CAP = 120;
  const dist = new Uint8Array(W * H).fill(CAP);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < W * H; i++) {
    if (!land[i]) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++] as number;
    const x = i % W;
    const y = (i / W) | 0;
    const d = (dist[i] as number) + 1;
    if (d >= CAP) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if ((dist[j] as number) > d) {
        dist[j] = d;
        queue[tail++] = j;
      }
    }
  }
  return dist;
}

/**
 * Real-world-like biome of a land cell: polar ice and high mountains are snow, rocky highlands are rock, hot
 * dry subtropical interiors are desert, wet tropics and the temperate / boreal belts are forest, the rest is
 * grassland. Known deserts, forests and ice sheets (map/Biomes) pull the result towards the real picture.
 */
function classify(lat: number, h: number, coast: number, desertHint: number, forestHint: number, iceHint: number): TerrainType {
  const a = Math.abs(lat);
  const temp = 29 - 0.52 * a - 6.2 * (h / 1000);
  if (iceHint > 0.5 || h > 4600 || temp < -9) return 'snow';
  if (h > 2300) return temp < -3 ? 'snow' : 'rock';
  const cont = Math.min(1, coast / 45);
  const equator = Math.exp(-(((a - 3) / 9) ** 2));
  const subtropics = Math.exp(-(((a - 26) / 8) ** 2));
  const westerlies = Math.exp(-(((a - 50) / 14) ** 2));
  let wet = 0.25 + 0.65 * equator + 0.35 * westerlies - 0.55 * subtropics * (0.35 + 0.65 * cont);
  wet -= 0.25 * cont * (a > 30 ? 0.8 : 0.3);
  wet += 0.22 * (1 - cont);
  if (desertHint > 0.5) wet = Math.min(wet, 0.08);
  if (forestHint > 0.5) wet = Math.max(wet, 0.6);
  if (h > 1500 && temp < 4) return wet > 0.35 ? 'forest' : 'rock';
  if (wet < 0.14 && temp > 6) return 'desert';
  if (temp < -4) return 'snow';
  if (wet > 0.52 && temp > 2) return 'forest';
  if (temp < 6 && wet > 0.26 && a > 45) return 'forest'; // taiga
  return 'grass';
}
