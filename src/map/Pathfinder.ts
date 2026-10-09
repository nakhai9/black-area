import { CELL_SIZE } from '../constants';
import type { GridPoint, WorldPoint } from '../types';
import type { TileMap } from './TileMap';

const SQRT2 = Math.SQRT2;
const MAX_EXPANSIONS = 40000;
/** Woods slow infantry down but do not block them. */
const TREE_COST = 1.6;

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * A* pathfinding for infantry on the cell grid (8-directional, no corner
 * cutting). Buildings block; water blocks walkers but not swimmers (special
 * forces); trees only cost more.
 */
export class Pathfinder {
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly stamp: Uint32Array;
  private run = 0;

  constructor(private readonly map: TileMap) {
    const n = map.width * map.height;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
  }

  passable(x: number, y: number, swim = false): boolean {
    return this.map.inBounds(x, y) && (swim || !this.map.isWater(x, y)) && this.map.occupantAt(x, y) === null;
  }

  private components: Int32Array | null = null;

  /**
   * Are two cells on the same piece of dry land (ignoring buildings)? Walkers can
   * only fight enemies on their own landmass. Labelled once, on first use.
   */
  sameLandmass(ax: number, ay: number, bx: number, by: number): boolean {
    const { map } = this;
    if (!this.components) {
      const comp = new Int32Array(map.width * map.height);
      const stack: number[] = [];
      let label = 0;
      for (let start = 0; start < comp.length; start++) {
        if ((comp[start] ?? 0) !== 0 || map.isWater(start % map.width, (start / map.width) | 0)) continue;
        label++;
        comp[start] = label;
        stack.push(start);
        while (stack.length > 0) {
          const i = stack.pop() ?? 0;
          const x = i % map.width;
          const y = (i / map.width) | 0;
          for (const [dx, dy] of DIRS) {
            if (dx !== 0 && dy !== 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!map.inBounds(nx, ny)) continue;
            const j = ny * map.width + nx;
            if ((comp[j] ?? 0) === 0 && !map.isWater(nx, ny)) {
              comp[j] = label;
              stack.push(j);
            }
          }
        }
      }
      this.components = comp;
    }
    if (!map.inBounds(ax, ay) || !map.inBounds(bx, by)) return false;
    const a = this.components[ay * map.width + ax] ?? 0;
    return a !== 0 && a === (this.components[by * map.width + bx] ?? -1);
  }

  /** Nearest passable cell to (x, y) within `radius`, excluding `taken`. */
  nearestPassable(x: number, y: number, radius = 8, taken?: ReadonlySet<number>, swim = false): GridPoint | null {
    for (let r = 0; r <= radius; r++) {
      let best: GridPoint | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = x + dx;
          const cy = y + dy;
          if (!this.passable(cx, cy, swim) || taken?.has(this.map.index(cx, cy))) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            best = { x: cx, y: cy };
            bestD = d;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Path of world-px waypoints (cell centres) from `start` to `goal`. If the
   * goal is unreachable, returns a path to the closest reachable cell.
   */
  find(start: WorldPoint, goal: GridPoint, swim = false, corridor: Corridor | null = null): WorldPoint[] {
    const { map } = this;
    const W = map.width;
    const sx = Math.floor(start.x / CELL_SIZE);
    const sy = Math.floor(start.y / CELL_SIZE);
    if (!map.inBounds(sx, sy) || !map.inBounds(goal.x, goal.y)) return [];
    const startI = map.index(sx, sy);
    const goalI = map.index(goal.x, goal.y);

    this.run++;
    const open = new MinHeap();
    const h = (i: number): number => {
      const dx = Math.abs((i % W) - goal.x);
      const dy = Math.abs(((i / W) | 0) - goal.y);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    this.visit(startI, 0, -1);
    open.push(startI, h(startI));
    let best = startI;
    let bestH = h(startI);
    let expansions = 0;

    while (open.size > 0 && expansions++ < MAX_EXPANSIONS) {
      const cur = open.pop();
      if (cur === goalI) {
        best = cur;
        break;
      }
      const cx = cur % W;
      const cy = (cur / W) | 0;
      const hc = h(cur);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      for (const [dx, dy, step] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.passable(nx, ny, swim)) continue;
        if (corridor && !inCorridor(corridor, nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!this.passable(cx + dx, cy, swim) || !this.passable(cx, cy + dy, swim))) continue;
        const ni = map.index(nx, ny);
        const cost = (this.g[cur] ?? 0) + step * (map.hasTrees(nx, ny) ? TREE_COST : 1);
        if (this.stamp[ni] === this.run && cost >= (this.g[ni] ?? Infinity)) continue;
        this.visit(ni, cost, cur);
        open.push(ni, cost + h(ni));
      }
    }

    // Walk back from the best cell reached and convert to cell centres.
    const cells: number[] = [];
    for (let i = best; i !== -1 && i !== startI; i = this.from[i] ?? -1) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => ({ x: i % W, y: (i / W) | 0 }));
    return this.smooth(sx, sy, pts, swim).map((c) => ({ x: (c.x + 0.5) * CELL_SIZE, y: (c.y + 0.5) * CELL_SIZE }));
  }

  /**
   * "String pulling": drops every waypoint that has a clear straight line to a
   * later one, so units walk in natural straight lines instead of grid zig-zags.
   */
  smooth(sx: number, sy: number, pts: readonly GridPoint[], swim: boolean): GridPoint[] {
    const out: GridPoint[] = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 40);
      while (j > i) {
        const p = pts[j];
        if (p && this.lineClear(ax, ay, p.x, p.y, swim)) break;
        j--;
      }
      const keep = pts[j];
      if (!keep) break;
      out.push(keep);
      ax = keep.x;
      ay = keep.y;
      i = j + 1;
    }
    return out;
  }

  /** Is the straight line between two cell centres free of obstacles (diagonal squeezes included)? */
  lineClear(x0: number, y0: number, x1: number, y1: number, swim: boolean): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2);
    let px = x0;
    let py = y0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round(x0 + dx * t);
      const cy = Math.round(y0 + dy * t);
      if (!this.passable(cx, cy, swim)) return false;
      if (cx !== px && cy !== py && (!this.passable(px, cy, swim) || !this.passable(cx, py, swim))) return false;
      px = cx;
      py = cy;
    }
    return true;
  }

  private visit(i: number, g: number, from: number): void {
    this.stamp[i] = this.run;
    this.g[i] = g;
    this.from[i] = from;
  }
}

/**
 * HPA* corridor: the clusters (CLUSTER × CLUSTER cells) a fine search may enter, as a mask over the cluster grid
 * (`width` clusters per row). Built by PathService from the coarse route between two far-apart cells.
 */
export interface Corridor {
  readonly mask: Uint8Array;
  readonly width: number;
  readonly cluster: number;
}

export function inCorridor(c: Corridor, x: number, y: number): boolean {
  return c.mask[((y / c.cluster) | 0) * c.width + ((x / c.cluster) | 0)] === 1;
}

/** Binary min-heap of (index, priority). */
export class MinHeap {
  private readonly items: number[] = [];
  private readonly prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.prio.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.prio[p] ?? 0) <= priority) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0] ?? -1;
    const lastItem = this.items.pop();
    const lastPrio = this.prio.pop();
    if (this.items.length > 0 && lastItem !== undefined && lastPrio !== undefined) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && (this.prio[l] ?? 0) < (this.prio[m] ?? 0)) m = l;
        if (r < this.items.length && (this.prio[r] ?? 0) < (this.prio[m] ?? 0)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b] ?? 0, this.items[a] ?? 0];
    [this.prio[a], this.prio[b]] = [this.prio[b] ?? 0, this.prio[a] ?? 0];
  }
}
