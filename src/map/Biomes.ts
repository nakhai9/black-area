import { smoothstep } from '../core/MathUtils';
import { ValueNoise } from '../core/Random';

/** Climate region, an ellipse in degrees with a soft, noise-perturbed edge. */
interface Region {
  kind: 'desert' | 'forest' | 'ice';
  lon: number;
  lat: number;
  rLon: number;
  rLat: number;
  strength: number;
}

const R = (kind: Region['kind'], lon: number, lat: number, rLon: number, rLat: number, strength = 1): Region => ({
  kind,
  lon,
  lat,
  rLon,
  rLat,
  strength,
});

/** Approximate real-world climate zones. */
const REGIONS: readonly Region[] = [
  // Deserts & arid steppe
  R('desert', 12, 23, 27, 9), // Sahara
  R('desert', 47, 23, 11, 8), // Arabia
  R('desert', 60, 31, 12, 6, 0.85), // Iran / Afghanistan
  R('desert', 71, 27, 4, 3, 0.8), // Thar
  R('desert', 62, 43, 9, 4, 0.7), // Kyzylkum / Karakum
  R('desert', 92, 41, 18, 5, 0.9), // Taklamakan / Gobi
  R('desert', 132, -25, 14, 8), // Australian outback
  R('desert', 20, -23, 7, 6, 0.8), // Kalahari / Namib
  R('desert', -70, -23, 2.5, 8, 0.9), // Atacama
  R('desert', -112, 32, 8, 6, 0.8), // US Southwest / Sonora
  R('desert', -68, -45, 4, 6, 0.55), // Patagonia
  // Lush forests
  R('forest', -60, -5, 15, 10), // Amazon
  R('forest', 20, 0, 11, 6), // Congo
  R('forest', 108, 8, 18, 14), // SE Asia
  R('forest', -83, 39, 11, 9, 0.75), // Eastern US
  R('forest', -95, 55, 32, 8, 0.7), // Canadian boreal
  R('forest', 95, 60, 55, 9, 0.7), // Siberian taiga
  R('forest', 15, 52, 15, 8, 0.55), // Central Europe
  R('forest', 120, 30, 12, 9, 0.6), // South China
  // Ice sheets
  R('ice', -41, 73, 21, 12), // Greenland
];

export interface BiomeFields {
  readonly width: number;
  readonly height: number;
  readonly desert: Float32Array;
  readonly forest: Float32Array;
  readonly ice: Float32Array;
}

/** Rasterises climate regions to grid-resolution weight fields (0..1). */
export function computeBiomes(width: number, height: number, seed: number): BiomeFields {
  const n = width * height;
  const fields = { desert: new Float32Array(n), forest: new Float32Array(n), ice: new Float32Array(n) };
  const noise = new ValueNoise(seed + 5);
  const toX = (lon: number): number => ((lon + 180) / 360) * width;
  const toY = (lat: number): number => ((90 - lat) / 180) * height;

  for (const r of REGIONS) {
    const field = fields[r.kind];
    const x0 = Math.max(0, Math.floor(toX(r.lon - r.rLon * 1.3)));
    const x1 = Math.min(width - 1, Math.ceil(toX(r.lon + r.rLon * 1.3)));
    const y0 = Math.max(0, Math.floor(toY(r.lat + r.rLat * 1.3)));
    const y1 = Math.min(height - 1, Math.ceil(toY(r.lat - r.rLat * 1.3)));
    for (let y = y0; y <= y1; y++) {
      const lat = 90 - ((y + 0.5) / height) * 180;
      for (let x = x0; x <= x1; x++) {
        const lon = ((x + 0.5) / width) * 360 - 180;
        const d =
          Math.hypot((lon - r.lon) / r.rLon, (lat - r.lat) / r.rLat) + (noise.fbm(x / 22, y / 22, 3) - 0.5) * 0.55;
        const w = (1 - smoothstep(0.65, 1.05, d)) * r.strength;
        const i = y * width + x;
        if (w > field[i]) field[i] = w;
      }
    }
  }

  // Antarctica and the high Arctic islands are glaciated.
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) / height) * 180;
    const polar = Math.max(1 - smoothstep(-64, -59, lat), smoothstep(76, 81, lat) * 0.8);
    if (polar <= 0) continue;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (polar > fields.ice[i]) fields.ice[i] = polar;
    }
  }
  return { width, height, ...fields };
}

/** Bilinear sample of a grid field at fractional grid coords. */
export function sampleField(field: Float32Array, width: number, height: number, gx: number, gy: number): number {
  const x = Math.min(Math.max(gx, 0), width - 1.001);
  const y = Math.min(Math.max(gy, 0), height - 1.001);
  const ix = x | 0;
  const iy = y | 0;
  const fx = x - ix;
  const fy = y - iy;
  const i = iy * width + ix;
  const top = field[i] + (field[i + 1] - field[i]) * fx;
  const bottom = field[i + width] + (field[i + width + 1] - field[i + width]) * fx;
  return top + (bottom - top) * fy;
}
