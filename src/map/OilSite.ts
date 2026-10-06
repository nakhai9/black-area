import type { GridPoint } from '../types';
import type { TileMap } from './TileMap';

/** Cells away from sea or foreign territory, capped (cheap to store). */
const MAX_SAFETY = 255;

/**
 * Safety map for one nation: for every cell, the distance (in cells) to the
 * nearest "danger" — open water (naval landings) or another nation's land
 * (border). Higher = safer. Computed by a multi-source breadth-first search.
 */
export function computeSafety(map: TileMap, territoryIndex: number): Uint8Array {
  const { width: W, height: H } = map;
  const dist = new Uint8Array(W * H).fill(MAX_SAFETY);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (map.isWater(x, y) || map.territory[i] !== territoryIndex) {
        dist[i] = 0;
        queue[tail++] = i;
      }
    }
  }
  while (head < tail) {
    const i = queue[head++] ?? 0;
    const d = (dist[i] ?? 0) + 1;
    if (d >= MAX_SAFETY) continue;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if ((dist[j] ?? 0) > d) {
        dist[j] = d;
        queue[tail++] = j;
      }
    }
  }
  return dist;
}

export interface OilRowOptions {
  /** Footprint of one derrick (cells). */
  w: number;
  d: number;
  /** Free cells between neighbouring derricks. */
  gap: number;
  /** Search radius around the capital (cells). */
  radius: number;
  /** Rows closer than this to the capital (cells) are not considered. */
  minAway?: number;
  /** Other capitals (foreign ones) and how far from each of them (cells) the oil field must stay. */
  avoid?: readonly GridPoint[];
  avoidAway?: number;
}

/**
 * Finds the best straight (horizontal) row of `count` derricks: every
 * footprint on dry, unoccupied, standable ground, maximising the safety of
 * the least safe derrick (far from the sea and from foreign borders) and keeping
 * the oil field well away from the capital: closer than `minAway` is not allowed,
 * and the farther the better (up to a point).
 */
export function findOilRow(
  map: TileMap,
  safety: Uint8Array,
  capital: GridPoint,
  count: number,
  { w, d, gap, radius, minAway = 0, avoid = [], avoidAway = 0 }: OilRowOptions,
): GridPoint[] | null {
  const pitch = w + gap;
  let best: GridPoint[] | null = null;
  let bestScore = -Infinity;
  for (let y = capital.y - radius; y <= capital.y + radius; y += 2) {
    for (let x = capital.x - radius; x <= capital.x + radius; x += 2) {
      let minSafety = MAX_SAFETY;
      let ok = true;
      for (let i = 0; i < count && ok; i++) {
        const fx = x + i * pitch;
        if (!map.isAreaBuildable(fx, y, w, d, false, true)) {
          ok = false;
          break;
        }
        const cx = Math.min(map.width - 1, fx + (w >> 1));
        const cy = Math.min(map.height - 1, y + (d >> 1));
        minSafety = Math.min(minSafety, safety[cy * map.width + cx] ?? 0);
      }
      if (!ok) continue;
      const mid = x + ((count - 1) * pitch + w) / 2;
      const away = Math.hypot(mid - capital.x, y - capital.y);
      if (away < minAway) continue;
      if (avoid.some((o) => Math.hypot(mid - o.x, y - o.y) < avoidAway)) continue;
      const score = minSafety + Math.min(away, 50) * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = Array.from({ length: count }, (_, i) => ({ x: x + i * pitch, y }));
      }
    }
  }
  return best;
}
