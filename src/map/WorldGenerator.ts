import { CELL_SIZE, DEPTH_M_PER_UNIT, ELEVATION_M_PER_UNIT, WORLD_SCALE } from '../constants';
import { type BiomeFields, sampleField } from './Biomes';
import type { EarthData } from './EarthData';
import { TERRITORIES, containsGeo } from './Territories';
import type { TileMap } from './TileMap';

const SAND_COAST_RANGE = 1;

/**
 * Derives the gameplay grid from Earth data: terrain type and height per
 * cell, plus the faction territory each land cell belongs to.
 */
export function buildWorld(earth: EarthData, biomes: BiomeFields, map: TileMap): void {
  const { width: W, height: H } = map;
  const half = CELL_SIZE / 2;

  // 1. Terrain type & height from the cell-centre Earth sample.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(earth.width - 1, Math.floor((x * CELL_SIZE + half) / WORLD_SCALE));
      const sy = Math.min(earth.height - 1, Math.floor((y * CELL_SIZE + half) / WORLD_SCALE));
      const p = sy * earth.width + sx;
      const i = map.index(x, y);
      if (earth.land[p] < 128) {
        map.heights[i] = -Math.max(1, earth.depth[p]) * DEPTH_M_PER_UNIT;
        map.setType(x, y, 'water');
        continue;
      }
      const h = earth.elevation[p] * ELEVATION_M_PER_UNIT;
      map.heights[i] = Math.max(1, h);
      const ice = sampleField(biomes.ice, W, H, x, y);
      const desert = sampleField(biomes.desert, W, H, x, y);
      const forest = sampleField(biomes.forest, W, H, x, y);
      if (ice > 0.5 || h > 4800) map.setType(x, y, 'snow');
      else if (h > 1900) map.setType(x, y, 'rock');
      else if (desert > 0.5) map.setType(x, y, 'desert');
      else if (forest > 0.5 && h < 1400) map.setType(x, y, 'forest');
      else map.setType(x, y, 'grass');
    }
  }

  // 2. Beaches on low land next to the sea.
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

  // 3. Territories.
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
