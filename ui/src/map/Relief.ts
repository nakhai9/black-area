import { CELL_SIZE, WORLD_SCALE } from '../constants';
import { ValueNoise } from '../core/Random';

/** Metres of ground one cell spans (at the equator): Earth's circumference over the texture, × cells per texel. */
export const CELL_METRES = (CELL_SIZE / WORLD_SCALE) * (40_075_000 / 4096);
/** How much steeper the relief is drawn than it really is (at this map scale real slopes would look flat). */
export const RELIEF_LIFT = 9;

/** Fixed seed: the hills sit in the same places in every game (and after loading a save). */
const hills = new ValueNoise(7331);
/** Where hollows are allowed (very low frequency). */
const dips = new ValueNoise(7349);
const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * Rolling hills on top of the real elevation `h` (m) at cell (x, y): low mounds on every land cell (they fade out
 * at the shore), bigger hills on uplands (~200 m and up), big rounded knolls in the mountains (~800 m and up).
 * Smooth value noise (two octaves, zero mean), so the average height stays the real one. Used by both the painted
 * relief and the climbing speed of units.
 */
export function hillHeight(h: number, x: number, y: number): number {
  const amp = 320 * smooth(0, 60, h) + 300 * smooth(200, 800, h) + 900 * smooth(800, 3000, h);
  if (amp <= 0) return 0;
  const n = (hills.noise(x * 0.3, y * 0.3) - 0.5) + (hills.noise(x * 0.7 + 41, y * 0.7 + 13) - 0.5) * 0.4;
  // Hollows only in a few places (large, rare patches of DIPS noise): elsewhere the ground below the mean is lifted
  // flat (with a soft knee), so most land is level to build on with hills standing on it.
  if (n < 0) {
    const hollow = smooth(0.82, 0.92, dips.noise(x * 0.04 + 5, y * 0.04 + 11));
    const flat = n * 0.08;
    return amp * (flat + (n - flat) * hollow) * 2;
  }
  return amp * n * 2;
}

/** Drawn slopes up to this are gentle rises that cost no speed (the mounds of the lowlands). */
export const FREE_SLOPE = 0.2;

/** Drawn slope (rise / run) of a climb of `dh` metres over `cells` cells. */
export function drawnSlope(dh: number, cells: number): number {
  return (dh * RELIEF_LIFT) / (CELL_METRES * Math.max(1e-3, cells));
}
