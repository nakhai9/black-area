import { SPRITE_SCALE } from '../constants';
import field from '../data/mesa-usa-west.json';

/**
 * The ground a red sandstone mesa (entities/Mesa) carries units on: heights in art px every `step` tiles over its
 * plot, written by tools/blender/mesa_render.py from the same height function its picture is built from — so a tank
 * climbs the ramp and drives on the plateau exactly where the picture shows them. Cliff cells are blocked.
 */
const { foot: FOOT, step: STEP, n: N, zs: ZS, h: H } = field as { foot: number; step: number; n: number; zs: number; h: number[] };
/** Steepest drawn slope (art px of height per tile) a vehicle can drive: the ramp is ~28, the cliffs 150+. */
const MAX_GRADE = 60;

function sample(i: number, j: number): number {
  return H[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))] ?? 0;
}

/** Height (art px) at plot-local tile coordinates (u along x, v along y), bilinear; 0 off the plot. */
export function mesaHeight(u: number, v: number): number {
  if (u < 0 || v < 0 || u > FOOT || v > FOOT) return 0;
  const fx = u / STEP;
  const fy = v / STEP;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = sample(i, j) + (sample(i + 1, j) - sample(i, j)) * tx;
  const b = sample(i, j + 1) + (sample(i + 1, j + 1) - sample(i, j + 1)) * tx;
  return a + (b - a) * ty;
}

/** Screen lift (iso px) of the mesa's ground at plot-local tile coordinates (drawn like its picture: art px × ZS). */
export function mesaLift(u: number, v: number): number {
  return mesaHeight(u, v) * ZS * SPRITE_SCALE;
}

/** Plot-local cells too steep to drive (the cliffs): blocked like a structure. Worked out once. */
export const MESA_BLOCKED: readonly { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  const per = Math.round(1 / STEP);
  for (let cy = 0; cy < FOOT; cy++) {
    for (let cx = 0; cx < FOOT; cx++) {
      let grade = 0;
      for (let j = cy * per; j <= (cy + 1) * per; j++) {
        for (let i = cx * per; i <= (cx + 1) * per; i++) {
          if (i + 1 < N) grade = Math.max(grade, Math.abs(sample(i + 1, j) - sample(i, j)) / STEP);
          if (j + 1 < N) grade = Math.max(grade, Math.abs(sample(i, j + 1) - sample(i, j)) / STEP);
        }
      }
      if (grade > MAX_GRADE) out.push({ x: cx, y: cy });
    }
  }
  return out;
})();

/** Steepest height spread (art px) across a structure's plot that still counts as level ground. */
const LEVEL = 3;

/**
 * Can a structure stand on plot-local cells (x, y, w, d)? Only on level ground: its whole plot on the plateau, or
 * all of it on the flat ground round the mesa — never across a cliff, the ramp or the talus. Cells off the mesa's
 * plot count as ground level (0).
 */
export function mesaPlotLevel(x: number, y: number, w: number, d: number): boolean {
  const per = Math.round(1 / STEP);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = y * per; j <= (y + d) * per; j++) {
    for (let i = x * per; i <= (x + w) * per; i++) {
      const h = i < 0 || j < 0 || i >= N || j >= N ? 0 : sample(i, j);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      if (hi - lo > LEVEL) return false;
    }
  }
  return true;
}
