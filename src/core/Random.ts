import { lerp } from './MathUtils';

/** A seeded generator whose internal state can be read and restored (saved games). */
export type Rng = (() => number) & { state: number };

/** Small, fast seeded PRNG. Returns floats in [0, 1). Its `state` can be saved and set back. */
export function mulberry32(seed: number): Rng {
  const rng = (() => {
    rng.state = (rng.state + 0x6d2b79f5) >>> 0;
    let t = rng.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.state = seed >>> 0;
  return rng;
}

/** Deterministic hash of an integer lattice point to [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Seeded PRNG derived from a lattice point — stable per tile across runs. */
export const tileRng = (x: number, y: number, seed: number): (() => number) =>
  mulberry32(Math.floor(hash2(x, y, seed) * 0xffffffff));

/** 2D value noise with fractal Brownian motion. Output is roughly in [0, 1]. */
export class ValueNoise {
  constructor(private readonly seed: number) {}

  noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, this.seed);
    const b = hash2(ix + 1, iy, this.seed);
    const c = hash2(ix, iy + 1, this.seed);
    const d = hash2(ix + 1, iy + 1, this.seed);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq + i * 17.3, y * freq - i * 9.1) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
