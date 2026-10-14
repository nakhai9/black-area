import { CELL_SIZE, MOUNTAIN_PASS, MOUNTAIN_PATH_COST } from '../constants';
import type { Unit } from '../entities/Unit';
import type { GridPoint, WorldPoint } from '../types';
import { type Corridor, DETOUR_EXPANSIONS, MinHeap, type Pathfinder } from './Pathfinder';
import type { TileMap } from './TileMap';

/**
 * Route planning for many units at once without frame drops, in four layers (the classic RTS recipe):
 *  1. Global planner (HPA*): the map is cut into CLUSTER × CLUSTER cell clusters linked where dry land crosses their
 *     border. A cheap search over that coarse graph gives a corridor of clusters, and the fine A* / flow field may
 *     only expand inside it — tens of times fewer cells than searching the whole planet.
 *  2. Time-slicing scheduler: route work is queued as jobs (coroutines) and run within PATH_BUDGET_MS per frame, so a
 *     200-unit order is spread over a few frames instead of freezing one.
 *  3. Shared flow field: a group sent to one place shares a single distance field (Dijkstra from the goal over the
 *     corridor); each unit just walks downhill from its own cell — O(path length) per unit instead of one A* each.
 *  4. Local steering is done by the game (crowd yielding + separation), see Game.yieldInCrowds / separateUnits.
 */

/** Cells per cluster side. */
const CLUSTER = 16;
/** Milliseconds of route work allowed per frame. */
export const PATH_BUDGET_MS = 3;
/** Cells (Chebyshev) under which a route is short enough to plan without a corridor. */
const SHORT_ROUTE = CLUSTER * 2;
/** Flow-field cells settled per slice before the job yields to the frame. */
const FIELD_SLICE = 1500;
/** At most one big detour search per this many ms. */
const DETOUR_GAP_MS = 1000;
/** A goal the detour search failed on is not tried again for this long. */
const DETOUR_RETRY_MS = 30000;
/** A goal a full search just failed to reach (walled in, cut off) is searched with only MISS_EXPANSIONS for this long. */
const MISS_RETRY_MS = 3000;
/** Search budget toward a goal that recently could not be reached: enough for a partial route its way, far cheaper. */
const MISS_EXPANSIONS = 3000;
const SQRT2 = Math.SQRT2;
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

/** One unit's slot in a group order: where it should end up (world px) and its cell. */
export interface GroupMember {
  unit: Unit;
  goal: WorldPoint;
  cell: GridPoint;
}

export class PathService {
  private readonly cw: number;
  private readonly ch: number;
  /** Cluster has dry land at all. */
  private readonly land: Uint8Array;
  /** Dry-land crossing between a cluster and its right (bit 1) / lower (bit 2) neighbour. */
  private readonly links: Uint8Array;
  /** Flow-field distance per cell (valid where stamp === run). */
  private readonly dist: Float32Array;
  private readonly stamp: Uint32Array;
  private run = 0;
  private readonly jobs: Generator<void, void, void>[] = [];
  /** Goals (cell index) the big detour search recently failed to reach, until when (performance.now ms). */
  private readonly detourFailed = new Map<number, number>();
  /** `start cluster:goal cell` → time (performance.now) until which that search gets only MISS_EXPANSIONS. */
  private readonly missed = new Map<string, number>();
  private lastDetour = -Infinity;

  constructor(
    private readonly map: TileMap,
    private readonly pathfinder: Pathfinder,
  ) {
    this.cw = Math.ceil(map.width / CLUSTER);
    this.ch = Math.ceil(map.height / CLUSTER);
    this.land = new Uint8Array(this.cw * this.ch);
    this.links = new Uint8Array(this.cw * this.ch);
    this.dist = new Float32Array(map.width * map.height);
    this.stamp = new Uint32Array(map.width * map.height);
    this.buildClusters();
  }

  // ------------------------------------------------------------------ layer 1: clusters (HPA*)

  private buildClusters(): void {
    const { map } = this;
    const dry = (x: number, y: number): boolean => map.inBounds(x, y) && !map.isWater(x, y) && !map.isRockWall(x, y);
    for (let cy = 0; cy < this.ch; cy++) {
      for (let cx = 0; cx < this.cw; cx++) {
        const x0 = cx * CLUSTER;
        const y0 = cy * CLUSTER;
        let any = false;
        for (let y = y0; y < y0 + CLUSTER && !any; y++) for (let x = x0; x < x0 + CLUSTER && !any; x++) any = dry(x, y);
        const i = cy * this.cw + cx;
        this.land[i] = any ? 1 : 0;
        let link = 0;
        // Right border: some row where both sides of the seam are dry.
        const xr = x0 + CLUSTER - 1;
        for (let y = y0; y < y0 + CLUSTER; y++) if (dry(xr, y) && dry(xr + 1, y)) { link |= 1; break; }
        const yb = y0 + CLUSTER - 1;
        for (let x = x0; x < x0 + CLUSTER; x++) if (dry(x, yb) && dry(x, yb + 1)) { link |= 2; break; }
        this.links[i] = link;
      }
    }
  }

  private linked(a: number, b: number): boolean {
    const ax = a % this.cw;
    const bx = b % this.cw;
    if (b === a + 1 && bx === ax + 1) return ((this.links[a] ?? 0) & 1) !== 0;
    if (a === b + 1 && ax === bx + 1) return ((this.links[b] ?? 0) & 1) !== 0;
    if (b === a + this.cw) return ((this.links[a] ?? 0) & 2) !== 0;
    if (a === b + this.cw) return ((this.links[b] ?? 0) & 2) !== 0;
    return false;
  }

  private clusterOf(x: number, y: number): number {
    return ((y / CLUSTER) | 0) * this.cw + ((x / CLUSTER) | 0);
  }

  /**
   * Corridor of clusters for routes from every `starts` cell to `goal` (walkers; swimmers and short trips get none):
   * a breadth-first sweep of the cluster graph from the goal, then each start's downhill cluster chain, widened by
   * one cluster all round so the fine search has room to go round obstacles.
   */
  corridor(starts: readonly GridPoint[], goal: GridPoint, swim: boolean): Corridor | null {
    if (swim) return null;
    if (starts.every((s) => Math.max(Math.abs(s.x - goal.x), Math.abs(s.y - goal.y)) < SHORT_ROUTE)) return null;
    const n = this.cw * this.ch;
    const hop = new Int32Array(n).fill(-1);
    const g = this.clusterOf(goal.x, goal.y);
    hop[g] = 0;
    const queue = [g];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi] ?? 0;
      for (const d of [1, -1, this.cw, -this.cw]) {
        const nb = c + d;
        if (nb < 0 || nb >= n || hop[nb] !== -1 || !this.land[nb] || !this.linked(c, nb)) continue;
        hop[nb] = (hop[c] ?? 0) + 1;
        queue.push(nb);
      }
    }
    const mask = new Uint8Array(n);
    const mark = (c: number): void => {
      const cx = c % this.cw;
      const cy = (c / this.cw) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < this.cw && y < this.ch) mask[y * this.cw + x] = 1;
      }
    };
    let reached = false;
    for (const s of starts) {
      let c = this.clusterOf(s.x, s.y);
      if ((hop[c] ?? -1) < 0) continue;
      reached = true;
      mark(c);
      while ((hop[c] ?? 0) > 0) {
        let next = c;
        for (const d of [1, -1, this.cw, -this.cw]) {
          const nb = c + d;
          if (nb >= 0 && nb < n && (hop[nb] ?? -1) === (hop[c] ?? 0) - 1 && this.linked(c, nb)) {
            next = nb;
            break;
          }
        }
        if (next === c) break;
        c = next;
        mark(c);
      }
    }
    return reached ? { mask, width: this.cw, cluster: CLUSTER } : null;
  }

  /**
   * One route (synchronous). A single unit's A* is already goal-directed, so it runs on the full grid (measured: a
   * corridor only adds overhead there); corridors pay off for the group flow fields, which would otherwise flood the
   * whole map.
   */
  find(start: WorldPoint, goal: GridPoint, swim = false): WorldPoint[] {
    if (!this.map.inBounds(goal.x, goal.y)) return [];
    const key = this.map.index(goal.x, goal.y);
    const now = performance.now();
    // Many units keep asking for the same unreachable goal (stuck repaths, attack-move resumes, AI re-orders): every full
    // search floods the whole budget, so for a while a goal that just failed gets only a short partial search.
    const missKey = `${this.clusterOf(Math.floor(start.x / CELL_SIZE), Math.floor(start.y / CELL_SIZE))}:${key}`;
    const missedRecently = (this.missed.get(missKey) ?? 0) > now;
    const path = this.pathfinder.find(start, goal, swim, null, missedRecently ? MISS_EXPANSIONS : undefined);
    // The search gave up short of the goal (e.g. a mountain wall in the way, the route goes far round its end):
    // try once more with a much bigger budget. Still short (truly unreachable): the partial route is kept.
    const end = path[path.length - 1];
    if (end && Math.floor(end.x / CELL_SIZE) === goal.x && Math.floor(end.y / CELL_SIZE) === goal.y) {
      if (missedRecently) this.missed.delete(missKey);
      return path;
    }
    if (missedRecently) return path;
    if (this.missed.size > 1024) this.missed.clear();
    this.missed.set(missKey, now + MISS_RETRY_MS);
    const sx = Math.floor(start.x / CELL_SIZE);
    const sy = Math.floor(start.y / CELL_SIZE);
    if (Math.max(Math.abs(sx - goal.x), Math.abs(sy - goal.y)) < SHORT_ROUTE || !this.pathfinder.passable(goal.x, goal.y, swim)) return path;
    // The big search is slow (a frame hitch): never on another landmass (no walking route at all), never again for a
    // goal it just failed on, and at most one per DETOUR_GAP_MS (chases and group orders would otherwise stack them).
    if (!swim && !this.pathfinder.sameLandmass(sx, sy, goal.x, goal.y)) return path;
    if ((this.detourFailed.get(key) ?? 0) > now || now - this.lastDetour < DETOUR_GAP_MS) return path;
    this.lastDetour = now;
    // The long way round is searched only inside the cluster corridor to the goal (a few % of the planet instead of a
    // flood of up to DETOUR_EXPANSIONS cells, which froze the game for a quarter of a second in big late-game wars).
    const corridor = swim ? null : this.corridor([{ x: sx, y: sy }], goal, swim);
    const detour = swim || corridor ? this.pathfinder.find(start, goal, swim, corridor, DETOUR_EXPANSIONS / 10) : [];
    const dEnd = detour[detour.length - 1];
    if (!dEnd || Math.floor(dEnd.x / CELL_SIZE) !== goal.x || Math.floor(dEnd.y / CELL_SIZE) !== goal.y) {
      if (this.detourFailed.size > 256) this.detourFailed.clear();
      this.detourFailed.set(key, now + DETOUR_RETRY_MS);
    } else this.missed.delete(missKey); // reachable after all (the long way round): later searches get the full budget
    return detour.length > 0 ? detour : path;
  }

  // ------------------------------------------------------------------ layer 2: time-sliced jobs

  /** Queues route work; it runs a little every frame (see update). */
  schedule(job: Generator<void, void, void>): void {
    this.jobs.push(job);
  }

  /** Runs queued route work for at most PATH_BUDGET_MS (always at least one step, so nothing starves). */
  update(): void {
    const until = performance.now() + PATH_BUDGET_MS;
    let first = true;
    while (this.jobs.length > 0 && (first || performance.now() < until)) {
      first = false;
      const job = this.jobs[0];
      if (!job || job.next().done) this.jobs.shift();
    }
  }

  /** Units still waiting for a route. */
  get pending(): number {
    return this.jobs.length;
  }

  // ------------------------------------------------------------------ layer 3: shared flow field

  /**
   * A group order as a time-sliced job: one flow field towards `target` (inside the corridor of the whole group),
   * then every member reads its route off the field — downhill from its own cell — plus a short last leg to its own
   * slot. `apply` hands each finished route over (the caller checks the order is still current).
   */
  *groupJob(members: readonly GroupMember[], target: GridPoint, swim: boolean, apply: (m: GroupMember, path: WorldPoint[]) => void): Generator<void, void, void> {
    const starts = members.map((m) => ({ x: Math.floor(m.unit.px / CELL_SIZE), y: Math.floor(m.unit.py / CELL_SIZE) }));
    const corridor = this.corridor(starts, target, swim);
    yield;
    yield* this.buildField(target, swim, corridor);
    for (const m of members) {
      const from = { x: Math.floor(m.unit.px / CELL_SIZE), y: Math.floor(m.unit.py / CELL_SIZE) };
      let cells = this.descend(from);
      let path: WorldPoint[];
      if (cells) {
        // Last leg from the shared goal to this unit's own slot.
        const end = cells[cells.length - 1] ?? from;
        if (end.x !== m.cell.x || end.y !== m.cell.y) cells = [...cells, m.cell];
        const pts = this.pathfinder.smooth(from.x, from.y, cells, swim);
        const lastOk = pts.length < 2 || this.pathfinder.lineClear((pts[pts.length - 2] ?? from).x, (pts[pts.length - 2] ?? from).y, m.cell.x, m.cell.y, swim);
        path = lastOk ? pts.map((c) => ({ x: (c.x + 0.5) * CELL_SIZE, y: (c.y + 0.5) * CELL_SIZE })) : this.find({ x: m.unit.px, y: m.unit.py }, m.cell, swim);
      } else {
        // Outside the field (another corridor, cut off): its own search.
        path = this.find({ x: m.unit.px, y: m.unit.py }, m.cell, swim);
      }
      apply(m, path);
      yield;
    }
  }

  /** Dijkstra from `goal` over passable cells (inside the corridor, if any): the distance field, built in slices. */
  private *buildField(goal: GridPoint, swim: boolean, corridor: Corridor | null): Generator<void, void, void> {
    const { map, pathfinder } = this;
    const W = map.width;
    this.run++;
    const open = new MinHeap();
    const gi = map.index(goal.x, goal.y);
    this.stamp[gi] = this.run;
    this.dist[gi] = 0;
    open.push(gi, 0);
    const inside = (x: number, y: number): boolean => !corridor || corridor.mask[((y / CLUSTER) | 0) * this.cw + ((x / CLUSTER) | 0)] === 1;
    // Without a corridor (short trip) the field stays local.
    const limit = corridor ? Infinity : SHORT_ROUTE * 2;
    let pops = 0;
    while (open.size > 0) {
      if (++pops % FIELD_SLICE === 0) yield;
      const cur = open.pop();
      const cx = cur % W;
      const cy = (cur / W) | 0;
      const dc = this.dist[cur] ?? 0;
      for (const [dx, dy, step] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!pathfinder.passable(nx, ny, swim) || !inside(nx, ny)) continue;
        if (Math.max(Math.abs(nx - goal.x), Math.abs(ny - goal.y)) > limit) continue;
        if (dx !== 0 && dy !== 0 && (!pathfinder.passable(cx + dx, cy, swim) || !pathfinder.passable(cx, cy + dy, swim))) continue;
        const ni = ny * W + nx;
        const nd = dc + step * (map.mountain[ny * W + nx] === MOUNTAIN_PASS ? MOUNTAIN_PATH_COST : map.hasTrees(nx, ny) ? TREE_COST : 1);
        if (this.stamp[ni] === this.run && nd >= (this.dist[ni] ?? Infinity)) continue;
        this.stamp[ni] = this.run;
        this.dist[ni] = nd;
        open.push(ni, nd);
      }
    }
  }

  /** Cells from `from` down the field to its goal (not including `from`), or null when `from` is not on the field. */
  private descend(from: GridPoint): GridPoint[] | null {
    const W = this.map.width;
    let i = from.y * W + from.x;
    if (this.stamp[i] !== this.run) return null;
    const out: GridPoint[] = [];
    for (let guard = 0; guard < 20000 && (this.dist[i] ?? 0) > 0; guard++) {
      const x = i % W;
      const y = (i / W) | 0;
      let best = i;
      let bestD = this.dist[i] ?? 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.map.inBounds(nx, ny)) continue;
        const ni = ny * W + nx;
        if (this.stamp[ni] !== this.run) continue;
        if (dx !== 0 && dy !== 0 && (this.stamp[y * W + nx] !== this.run || this.stamp[ny * W + x] !== this.run)) continue;
        const d = this.dist[ni] ?? Infinity;
        if (d < bestD) {
          bestD = d;
          best = ni;
        }
      }
      if (best === i) break;
      i = best;
      out.push({ x: i % W, y: (i / W) | 0 });
    }
    return out;
  }
}
