import { CELL_SIZE, TREE_DENSITY, TREE_HP, TREES_PER_CELL_MAX } from '../constants';
import { tileRng, ValueNoise } from '../core/Random';
import type { GridPoint } from '../types';
import type { BiomeFields } from './Biomes';
import type { TileMap } from './TileMap';

/** Weight of the terrain type 'forest' (climate-made woodland in WorldGenerator) towards a cell being wooded. */
const FOREST_TYPE_WEIGHT = 0.3;
/** Weight of the forest climate region (Biomes: Amazon, Congo, taiga…) at full strength. */
const CLIMATE_WEIGHT = 0.25;
/** Swing of the clumping noise (± half of it): it makes the dense hearts and the clearings of a forest. */
const CLUMP_WEIGHT = 0.9;
/** Noise scale in cells: the size of the clumps and clearings. */
const CLUMP_CELLS = 11;
/** A cell is wooded when its weight reaches this. */
const WOOD_THRESHOLD = 0.5;
/** No trees above this elevation (metres): bare alpine ground. */
const TREE_LINE_M = 1800;
/** Tree sprite varieties (columns of sprites/trees.png). */
export const TREE_VARIANTS = 14;

/**
 * All trees on the map as gameplay data (not just decoration): each tree marks its grid cell as wooded, which blocks
 * construction and ground vehicles (TileMap.trees holds the count of standing trees per cell). Stored per cell (CSR
 * layout) so renderers can query any rectangle quickly.
 *
 * Trees can be cut down by fire (damageCell / damageRadius / fellRadius, see the TREE_* rules in constants.ts): a felled
 * tree gets radius 0 (skipped by forEachIn) and leaves the cell count. Every felling is logged to `felledLog` (the
 * saved game keeps it: the forest itself is rebuilt from the seed, then the log is replayed with restoreFelled).
 */
export class TreeLayer {
  /** World-space centre and radius of each tree, grouped by cell (radius 0 = felled). */
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly rs: Float32Array;
  /** Sprite variety (0..TREE_VARIANTS-1). */
  readonly tones: Uint8Array;
  /** Health left of each tree. */
  readonly hp: Float32Array;
  /** Cell index of each tree. */
  private readonly cells: Int32Array;
  /** cellStart[i]..cellStart[i+1] = trees in cell i. */
  private readonly cellStart: Int32Array;
  /** Indices of the trees felled in play (in order), kept by the game in its save; null = not logged. */
  felledLog: number[] | null = null;
  /** Called when a tree falls in play (effects), with its world position. */
  onFell: ((x: number, y: number) => void) | null = null;
  /** Bumped on every change (felling, clearing): anything caching the woods compares it. */
  version = 0;

  constructor(
    private readonly map: TileMap,
    biomes: BiomeFields,
    seed: number,
  ) {
    const perCell: { x: number; y: number; r: number; tone: number }[][] = Array.from(
      { length: map.width * map.height },
      () => [],
    );
    let total = 0;
    const noise = new ValueNoise(seed + 11);
    for (let cy = 0; cy < map.height; cy++) {
      for (let cx = 0; cx < map.width; cx++) {
        const t = map.typeAt(cx, cy);
        if (t !== 'grass' && t !== 'forest') continue;
        const i = map.index(cx, cy);
        if ((map.mountain[i] ?? 0) !== 0 || map.heightAt(cx, cy) > TREE_LINE_M) continue;
        const climate = biomes.forest[i] ?? 0;
        const base = (t === 'forest' ? FOREST_TYPE_WEIGHT : 0) + climate * CLIMATE_WEIGHT;
        if (base + CLUMP_WEIGHT / 2 < WOOD_THRESHOLD) continue; // never wooded: skip the noise
        const w = base + (noise.fbm(cx / CLUMP_CELLS, cy / CLUMP_CELLS, 3) - 0.5) * CLUMP_WEIGHT;
        if (w < WOOD_THRESHOLD) continue;
        const rng = tileRng(cx, cy, seed + 8);
        // Denser in the heart of a forest (1 tree at its edge, up to TREES_PER_CELL_MAX inside).
        const count = 1 + Math.min(TREES_PER_CELL_MAX - 1, Math.floor((w - WOOD_THRESHOLD) * 5 + rng() * 1.4));
        const list = perCell[i];
        if (!list) continue;
        for (let k = 0; k < count; k++) {
          // Trees stand well inside their cell: the trunk never crosses into the next one.
          const x = (cx + 0.15 + rng() * 0.7) * CELL_SIZE;
          const y = (cy + 0.15 + rng() * 0.7) * CELL_SIZE;
          const r = 1.3 + rng() * 1.1;
          const tone = Math.floor(rng() * TREE_VARIANTS) % TREE_VARIANTS;
          if (rng() >= TREE_DENSITY) continue; // thinned out (TREE_DENSITY)
          list.push({ x, y, r, tone });
          total++;
        }
      }
    }

    this.xs = new Float32Array(total);
    this.ys = new Float32Array(total);
    this.rs = new Float32Array(total);
    this.tones = new Uint8Array(total);
    this.hp = new Float32Array(total);
    this.cells = new Int32Array(total);
    this.cellStart = new Int32Array(perCell.length + 1);
    let k = 0;
    perCell.forEach((list, i) => {
      this.cellStart[i] = k;
      for (const t of list) {
        this.xs[k] = t.x;
        this.ys[k] = t.y;
        this.rs[k] = t.r;
        this.tones[k] = t.tone;
        this.hp[k] = TREE_HP;
        this.cells[k] = i;
        k++;
      }
      if (list.length > 0) map.trees[i] = Math.min(255, list.length);
    });
    this.cellStart[perCell.length] = k;
  }

  /**
   * Removes every tree standing in a w×d cell area (map-authored structures are pre-cleared, like trees removed in an
   * RA2 map editor). Part of the world, not logged.
   */
  clearArea(x: number, y: number, w: number, d: number): void {
    for (let cy = y; cy < y + d; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (!this.map.inBounds(cx, cy)) continue;
        const cell = this.map.index(cx, cy);
        for (let i = this.cellStart[cell] ?? 0; i < (this.cellStart[cell + 1] ?? 0); i++) {
          this.rs[i] = 0;
          this.hp[i] = 0;
        }
        this.map.trees[cell] = 0;
      }
    }
    this.version++;
  }

  /** Removes every tree within `radius` cells (Chebyshev) of cell (cx, cy): the open ground round a starting base. */
  clearAround(cx: number, cy: number, radius: number): void {
    this.clearArea(cx - radius, cy - radius, radius * 2 + 1, radius * 2 + 1);
  }

  get count(): number {
    return this.xs.length;
  }

  /** Standing trees in cell (cx, cy). */
  standing(cx: number, cy: number): number {
    return this.map.inBounds(cx, cy) ? (this.map.trees[this.map.index(cx, cy)] ?? 0) : 0;
  }

  /** The wooded cell nearest to (cx, cy) within `spread` cells (Chebyshev), the centre first; null when all are clear. */
  nearestWooded(cx: number, cy: number, spread: number): GridPoint | null {
    let best: GridPoint | null = null;
    let bestD = Infinity;
    for (let dy = -spread; dy <= spread; dy++) {
      for (let dx = -spread; dx <= spread; dx++) {
        if (this.standing(cx + dx, cy + dy) === 0) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: cx + dx, y: cy + dy };
        }
      }
    }
    return best;
  }

  /** A tree falls in play: it leaves the map and the cell count, and is logged for the save. */
  private fell(i: number, log = true): void {
    if ((this.rs[i] ?? 0) <= 0) return;
    this.rs[i] = 0;
    this.hp[i] = 0;
    const cell = this.cells[i] ?? -1;
    if (cell >= 0 && (this.map.trees[cell] ?? 0) > 0) this.map.trees[cell] = (this.map.trees[cell] ?? 1) - 1;
    this.version++;
    if (log) {
      this.felledLog?.push(i);
      this.onFell?.(this.xs[i] ?? 0, this.ys[i] ?? 0);
    }
  }

  /**
   * A shot lands in cell (cx, cy): `amount` damage goes to its standing trees, the one nearest (fromX, fromY) first,
   * what is left of it carrying on to the next. Returns how many trees fell.
   */
  damageCell(cx: number, cy: number, amount: number, fromX: number, fromY: number): number {
    if (!this.map.inBounds(cx, cy) || amount <= 0) return 0;
    const cell = this.map.index(cx, cy);
    const order: number[] = [];
    for (let i = this.cellStart[cell] ?? 0; i < (this.cellStart[cell + 1] ?? 0); i++) if ((this.rs[i] ?? 0) > 0) order.push(i);
    const dist = (i: number): number => Math.hypot((this.xs[i] ?? 0) - fromX, (this.ys[i] ?? 0) - fromY);
    order.sort((a, b) => dist(a) - dist(b));
    let left = amount;
    let felled = 0;
    for (const i of order) {
      if (left <= 0) break;
      const hp = this.hp[i] ?? 0;
      if (left >= hp) {
        left -= hp;
        this.fell(i);
        felled++;
      } else {
        this.hp[i] = hp - left;
        left = 0;
      }
    }
    return felled;
  }

  /** Every standing tree within `radius` world px of (x, y) takes `amount` damage (Infinity flattens them all). Returns how many fell. */
  damageRadius(x: number, y: number, radius: number, amount: number): number {
    let felled = 0;
    const hits: number[] = [];
    this.forEachIn(x - radius, y - radius, x + radius, y + radius, (i) => {
      if (Math.hypot((this.xs[i] ?? 0) - x, (this.ys[i] ?? 0) - y) <= radius) hits.push(i);
    });
    for (const i of hits) {
      const hp = this.hp[i] ?? 0;
      if (amount >= hp) {
        this.fell(i);
        felled++;
      } else this.hp[i] = hp - amount;
    }
    return felled;
  }

  /** A bomb or charge goes off: every tree within `radius` world px of (x, y) is flattened. Returns how many fell. */
  fellRadius(x: number, y: number, radius: number): number {
    return this.damageRadius(x, y, radius, Infinity);
  }

  /** Every standing tree in cell (cx, cy) falls (the repair vehicle driving over it). Returns how many fell. */
  fellCell(cx: number, cy: number): number {
    const hits: number[] = [];
    const x0 = cx * CELL_SIZE;
    const y0 = cy * CELL_SIZE;
    this.forEachIn(x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE, (i) => {
      const x = this.xs[i] ?? -1;
      const y = this.ys[i] ?? -1;
      if (x >= x0 && x < x0 + CELL_SIZE && y >= y0 && y < y0 + CELL_SIZE && (this.hp[i] ?? 0) > 0) hits.push(i);
    });
    for (const i of hits) this.fell(i);
    return hits.length;
  }

  /** Replays a saved felling log (the forest was just rebuilt from the seed), without logging or effects. */
  restoreFelled(log: readonly number[]): void {
    for (const i of log) if (i >= 0 && i < this.xs.length) this.fell(i, false);
  }

  /** Calls `fn(index)` for every standing tree whose cell intersects the world rect. */
  forEachIn(x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void): void {
    const cx0 = Math.max(0, Math.floor(x0 / CELL_SIZE));
    const cy0 = Math.max(0, Math.floor(y0 / CELL_SIZE));
    const cx1 = Math.min(this.map.width - 1, Math.floor(x1 / CELL_SIZE));
    const cy1 = Math.min(this.map.height - 1, Math.floor(y1 / CELL_SIZE));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = cy * this.map.width + cx;
        for (let i = this.cellStart[cell] ?? 0; i < (this.cellStart[cell + 1] ?? 0); i++) {
          if ((this.rs[i] ?? 0) > 0) fn(i); // r = 0 → cleared
        }
      }
    }
  }
}
