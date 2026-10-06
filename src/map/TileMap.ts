import { CELL_SIZE } from '../constants';
import type { GridPoint, TerrainType } from '../types';

export type PlacementBlocker = 'outOfBounds' | 'occupied' | 'water' | 'ice' | 'trees' | 'needsWater';

const TERRAIN_TYPES: readonly TerrainType[] = ['water', 'sand', 'grass', 'forest', 'desert', 'rock', 'snow'];
const TERRAIN_INDEX = Object.fromEntries(TERRAIN_TYPES.map((t, i) => [t, i])) as Record<TerrainType, number>;

/** Outer ring of a footprint (cells) that other buildings may overlap. 0 = buildings never overlap (they may touch). */
export const PLACEMENT_MARGIN = 0;

/**
 * Gameplay grid (pathing, placement, territories) stored in flat typed arrays.
 * Every cell is the same size (CELL_SIZE × CELL_SIZE world px); buildings
 * occupy whole cells (3×3 or 4×3).
 */
export class TileMap {
  private readonly types: Uint8Array;
  /** Metres above sea level (negative = water depth). */
  readonly heights: Float32Array;
  /** Building id per cell, 0 = free. */
  private readonly occupied: Int32Array;
  /** Territory index + 1 per cell (0 = neutral), see map/Territories.ts. */
  readonly territory: Uint8Array;
  /** Number of trees standing in each cell (0 = clear), filled by TreeLayer. */
  readonly trees: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const n = width * height;
    this.types = new Uint8Array(n);
    this.heights = new Float32Array(n);
    this.occupied = new Int32Array(n);
    this.territory = new Uint8Array(n);
    this.trees = new Uint8Array(n);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  typeAt(x: number, y: number): TerrainType | undefined {
    return this.inBounds(x, y) ? TERRAIN_TYPES[this.types[this.index(x, y)]] : undefined;
  }

  /** Terrain code of a cell (index into TERRAIN_TYPES); anything outside the map counts as sea. */
  codeAt(x: number, y: number): number {
    return this.inBounds(x, y) ? (this.types[this.index(x, y)] ?? 0) : 0;
  }

  setType(x: number, y: number, type: TerrainType): void {
    if (this.inBounds(x, y)) this.types[this.index(x, y)] = TERRAIN_INDEX[type];
  }

  heightAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.heights[this.index(x, y)] : 0;
  }

  isWater(x: number, y: number): boolean {
    return this.typeAt(x, y) === 'water';
  }

  occupantAt(x: number, y: number): number | null {
    const id = this.inBounds(x, y) ? this.occupied[this.index(x, y)] : 0;
    return id === 0 ? null : id;
  }

  /** Cell under a world-space point. */
  cellAt(wx: number, wy: number): GridPoint | null {
    const x = Math.floor(wx / CELL_SIZE);
    const y = Math.floor(wy / CELL_SIZE);
    return this.inBounds(x, y) ? { x, y } : null;
  }

  hasTrees(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.trees[this.index(x, y)] > 0;
  }

  /**
   * Why a w×d footprint at (x, y) cannot be built, or null if it can.
   * Land buildings need clear, dry, non-glacial cells without trees;
   * naval buildings need every cell to be water.
   */
  placementBlocker(
    x: number,
    y: number,
    w: number,
    d: number,
    naval = false,
    ignoreTrees = false,
  ): PlacementBlocker | null {
    for (let ty = y; ty < y + d; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const t = this.typeAt(tx, ty);
        if (!t) return 'outOfBounds';
        // Only the new building's core may not touch an existing building's core; the
        // 1-cell outer ring of both is just margin around the artwork and may overlap.
        if (this.inCore(tx, ty, x, y, w, d) && this.occupantAt(tx, ty) !== null) return 'occupied';
        if (naval) {
          if (t !== 'water') return 'needsWater';
          continue;
        }
        if (t === 'water') return 'water';
        if (t === 'snow') return 'ice';
        if (!ignoreTrees && this.hasTrees(tx, ty)) return 'trees';
      }
    }
    return null;
  }

  isAreaBuildable(x: number, y: number, w: number, d: number, naval = false, ignoreTrees = false): boolean {
    return this.placementBlocker(x, y, w, d, naval, ignoreTrees) === null;
  }

  /**
   * Nearest buildable top-left cell to (x, y), searching outward ring by ring
   * up to `maxRadius` cells. Returns null if nothing fits.
   */
  findBuildableSite(
    x: number,
    y: number,
    w: number,
    d: number,
    { naval = false, ignoreTrees = false, maxRadius = 24 }: { naval?: boolean; ignoreTrees?: boolean; maxRadius?: number } = {},
  ): GridPoint | null {
    for (let r = 0; r <= maxRadius; r++) {
      let best: GridPoint | null = null;
      let bestDist = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
          const dist = dx * dx + dy * dy;
          if (dist < bestDist && this.isAreaBuildable(x + dx, y + dy, w, d, naval, ignoreTrees)) {
            best = { x: x + dx, y: y + dy };
            bestDist = dist;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Marks (or clears, with `id = null`) building occupancy over an area. */
  occupy(x: number, y: number, w: number, d: number, id: number | null): void {
    for (let ty = y; ty < y + d; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (this.inBounds(tx, ty) && this.inCore(tx, ty, x, y, w, d)) this.occupied[this.index(tx, ty)] = id ?? 0;
      }
    }
  }

  /** Is (tx, ty) inside the core of the footprint (x, y, w, d), i.e. not in its margin ring? */
  private inCore(tx: number, ty: number, x: number, y: number, w: number, d: number): boolean {
    const inset = Math.min(PLACEMENT_MARGIN, Math.floor((Math.min(w, d) - 1) / 2));
    return tx >= x + inset && tx < x + w - inset && ty >= y + inset && ty < y + d - inset;
  }
}
