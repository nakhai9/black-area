import { CELL_SIZE, MOUNTAIN_CREST, MOUNTAIN_PASS, MOUNTAIN_PATH_COST, SWIM_MAX_CELLS } from '../constants';
import type { GridPoint, WorldPoint } from '../types';
import type { TileMap } from './TileMap';

const SQRT2 = Math.SQRT2;
const MAX_EXPANSIONS = 40000;
/** Search budget for the second try when the first one ran out before reaching the goal (a long way round a mountain wall). */
export const DETOUR_EXPANSIONS = 600000;
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

/** DIRS split into flat arrays for the search loop. */
const DX = DIRS.map((d) => d[0]);
const DY = DIRS.map((d) => d[1]);
const STEP = DIRS.map((d) => d[2]);

/**
 * A* pathfinding for infantry on the cell grid (8-directional, no corner
 * cutting). Buildings block; water blocks walkers but not swimmers (special
 * forces); trees only cost more.
 */
/** Search budget of a sea route (oceans are wide; a ship's order is rare). */
const NAVAL_EXPANSIONS = 400_000;

export class Pathfinder {
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly stamp: Uint32Array;
  /** Cells already expanded in the current run (== run). */
  private readonly closed: Uint32Array;
  /** Open list, reused by every search. */
  private readonly heap = new MinHeap();
  private run = 0;

  constructor(private readonly map: TileMap) {
    const n = map.width * map.height;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  passable(x: number, y: number, swim = false): boolean {
    if (!this.map.inBounds(x, y) || this.map.occupantAt(x, y) !== null || this.map.isRockWall(x, y)) return false;
    return !this.map.isWater(x, y) || (swim && (this.swimmable()[this.map.index(x, y)] ?? 0) === 1);
  }

  /** World px (x, y) on a mountain ledge (high ground)? */
  highGround(px: number, py: number): boolean {
    return this.map.isHighGround(Math.floor(px / CELL_SIZE), Math.floor(py / CELL_SIZE));
  }

  /** 1 for every cell a swimmer may be in: land, or water at most SWIM_MAX_CELLS from the shore (built once, lazily). */
  private swimCells: Uint8Array | null = null;
  swimmable(): Uint8Array {
    if (this.swimCells) return this.swimCells;
    const map = this.map;
    const n = map.width * map.height;
    const dist = new Int16Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < n; i++) {
      if (!map.isWater(i % map.width, (i / map.width) | 0)) {
        dist[i] = 0;
        queue[tail++] = i;
      }
    }
    // Breadth-first out from the shore (8 neighbours): a water cell's distance is its ring number.
    while (head < tail) {
      const i = queue[head++]!;
      const d = dist[i]!;
      if (d >= SWIM_MAX_CELLS) continue;
      const x = i % map.width;
      const y = (i / map.width) | 0;
      for (let k = 0; k < DX.length; k++) {
        const nx = x + DX[k]!;
        const ny = y + DY[k]!;
        if (!map.inBounds(nx, ny)) continue;
        const j = map.index(nx, ny);
        if (dist[j] !== -1) continue;
        dist[j] = d + 1;
        queue[tail++] = j;
      }
    }
    const cells = new Uint8Array(n);
    for (let i = 0; i < n; i++) cells[i] = dist[i]! >= 0 ? 1 : 0;
    this.swimCells = cells;
    return cells;
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
  find(start: WorldPoint, goal: GridPoint, swim = false, corridor: Corridor | null = null, budget = MAX_EXPANSIONS): WorldPoint[] {
    const { map } = this;
    const W = map.width;
    const H = map.height;
    const sx = Math.floor(start.x / CELL_SIZE);
    const sy = Math.floor(start.y / CELL_SIZE);
    if (!map.inBounds(sx, sy) || !map.inBounds(goal.x, goal.y)) return [];
    const startI = map.index(sx, sy);
    const goalI = map.index(goal.x, goal.y);
    // Hot loop: the grid's typed arrays are read directly (same rules as passable()).
    const types = map.types;
    const occupied = map.occupied;
    const trees = map.trees;
    const mountain = map.mountain;
    const { g, stamp, closed } = this;
    const open = this.heap;
    open.clear();
    const swimCells = swim ? this.swimmable() : null;
    const free = (i: number): boolean => (types[i] !== 0 || (swimCells !== null && swimCells[i] === 1)) && occupied[i] === 0 && mountain[i] !== MOUNTAIN_CREST;
    const gx = goal.x;
    const gy = goal.y;
    const h = (x: number, y: number): number => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return dx + dy + (SQRT2 - 2) * (dx < dy ? dx : dy);
    };

    const run = ++this.run;
    this.visit(startI, 0, -1);
    open.push(startI, h(sx, sy));
    let best = startI;
    let bestH = h(sx, sy);
    let expansions = 0;

    while (open.size > 0 && expansions < budget) {
      const cur = open.pop();
      // A cell queued several times (a cheaper route found later) is expanded once: the later copies are stale.
      if (closed[cur] === run) continue;
      closed[cur] = run;
      expansions++;
      if (cur === goalI) {
        best = cur;
        break;
      }
      const cx = cur % W;
      const cy = (cur / W) | 0;
      const hc = h(cx, cy);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      const gc = g[cur] ?? 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k] ?? 0;
        const dy = DY[k] ?? 0;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!free(ni)) continue;
        if (corridor && !inCorridor(corridor, nx, ny)) continue;
        // No corner cutting: both side cells of a diagonal step must be open too (they are in bounds here).
        if (dx !== 0 && dy !== 0 && (!free(cy * W + nx) || !free(ny * W + cx))) continue;
        if (closed[ni] === run) continue;
        const cost = gc + (STEP[k] ?? 1) * (mountain[ni] === MOUNTAIN_PASS ? MOUNTAIN_PATH_COST : (trees[ni] ?? 0) > 0 ? TREE_COST : 1);
        if (stamp[ni] === run && cost >= (g[ni] ?? Infinity)) continue;
        this.visit(ni, cost, cur);
        open.push(ni, cost + h(nx, ny));
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

  /** Open water a ship may sail on (any sea or lake cell inside the map). */
  navigable(x: number, y: number): boolean {
    return this.map.inBounds(x, y) && this.map.types[this.map.index(x, y)] === 0;
  }

  /** Nearest navigable cell to (x, y) within `radius` cells (ring by ring), or null. */
  nearestNavigable(x: number, y: number, radius = 16): GridPoint | null {
    if (this.navigable(x, y)) return { x, y };
    for (let r = 1; r <= radius; r++) {
      let best: GridPoint | null = null;
      let bestD = Infinity;
      for (let cy = y - r; cy <= y + r; cy++) {
        for (let cx = x - r; cx <= x + r; cx++) {
          if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) !== r || !this.navigable(cx, cy)) continue;
          const d = Math.hypot(cx - x, cy - y);
          if (d < bestD) {
            bestD = d;
            best = { x: cx, y: cy };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Sea route for a ship (Unit.naval): A* over water cells only (8 neighbours, no corner cutting over land), a little
   * greedy (weighted heuristic) so long crossings stay cheap, then string-pulled over open water. If the goal cannot be
   * reached, the route ends at the closest water cell reached.
   */
  findNaval(start: WorldPoint, goal: GridPoint, budget = NAVAL_EXPANSIONS): WorldPoint[] {
    const { map } = this;
    const W = map.width;
    const H = map.height;
    const sx = Math.floor(start.x / CELL_SIZE);
    const sy = Math.floor(start.y / CELL_SIZE);
    if (!map.inBounds(sx, sy) || !map.inBounds(goal.x, goal.y)) return [];
    const startI = map.index(sx, sy);
    const goalI = map.index(goal.x, goal.y);
    const types = map.types;
    const { g, stamp, closed } = this;
    const open = this.heap;
    open.clear();
    const free = (i: number): boolean => types[i] === 0;
    const gx = goal.x;
    const gy = goal.y;
    const h = (x: number, y: number): number => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return (dx + dy + (SQRT2 - 2) * (dx < dy ? dx : dy)) * 1.4;
    };
    const run = ++this.run;
    this.visit(startI, 0, -1);
    open.push(startI, h(sx, sy));
    let best = startI;
    let bestH = h(sx, sy);
    let expansions = 0;
    while (open.size > 0 && expansions < budget) {
      const cur = open.pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      expansions++;
      if (cur === goalI) {
        best = cur;
        break;
      }
      const cx = cur % W;
      const cy = (cur / W) | 0;
      const hc = h(cx, cy);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      const gc = g[cur] ?? 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k] ?? 0;
        const dy = DY[k] ?? 0;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!free(ni)) continue;
        if (dx !== 0 && dy !== 0 && (!free(cy * W + nx) || !free(ny * W + cx))) continue;
        if (closed[ni] === run) continue;
        const cost = gc + (STEP[k] ?? 1);
        if (stamp[ni] === run && cost >= (g[ni] ?? Infinity)) continue;
        this.visit(ni, cost, cur);
        open.push(ni, cost + h(nx, ny));
      }
    }
    const cells: number[] = [];
    for (let i = best; i !== -1 && i !== startI; i = this.from[i] ?? -1) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => ({ x: i % W, y: (i / W) | 0 }));
    // String pulling over water.
    const out: GridPoint[] = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 80);
      while (j > i) {
        const p = pts[j];
        if (p && this.seaClear(ax, ay, p.x, p.y)) break;
        j--;
      }
      const keep = pts[j];
      if (!keep) break;
      out.push(keep);
      ax = keep.x;
      ay = keep.y;
      i = j + 1;
    }
    return out.map((c) => ({ x: (c.x + 0.5) * CELL_SIZE, y: (c.y + 0.5) * CELL_SIZE }));
  }

  /** Is the straight line between two cell centres open water all the way? */
  private seaClear(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2);
    let px = x0;
    let py = y0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round(x0 + dx * t);
      const cy = Math.round(y0 + dy * t);
      if (!this.navigable(cx, cy)) return false;
      if (cx !== px && cy !== py && (!this.navigable(px, cy) || !this.navigable(cx, py))) return false;
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

/** Binary min-heap of (index, priority) on growable typed arrays (no per-search allocation, no tuple swaps). */
export class MinHeap {
  private items = new Int32Array(1024);
  private prio = new Float64Array(1024);
  private n = 0;

  get size(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }

  push(item: number, priority: number): void {
    if (this.n === this.items.length) {
      const items = new Int32Array(this.n * 2);
      const prio = new Float64Array(this.n * 2);
      items.set(this.items);
      prio.set(this.prio);
      this.items = items;
      this.prio = prio;
    }
    const { items, prio } = this;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pp = prio[p] ?? 0;
      if (pp <= priority) break;
      items[i] = items[p] ?? 0;
      prio[i] = pp;
      i = p;
    }
    items[i] = item;
    prio[i] = priority;
  }

  pop(): number {
    const { items, prio } = this;
    if (this.n === 0) return -1;
    const top = items[0] ?? -1;
    const n = --this.n;
    if (n > 0) {
      const lastItem = items[n] ?? 0;
      const lastPrio = prio[n] ?? 0;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        let m = l;
        if (r < n && (prio[r] ?? 0) < (prio[l] ?? 0)) m = r;
        if ((prio[m] ?? 0) >= lastPrio) break;
        items[i] = items[m] ?? 0;
        prio[i] = prio[m] ?? 0;
        i = m;
      }
      items[i] = lastItem;
      prio[i] = lastPrio;
    }
    return top;
  }
}
