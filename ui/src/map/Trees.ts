import { CELL_SIZE } from '../constants';
import { tileRng } from '../core/Random';
import type { BiomeFields } from './Biomes';
import type { TileMap } from './TileMap';

/** Trees sit on a fixed 4 px sub-grid (several per gameplay cell). */
const TREE_SPACING = 4;
/**
 * The land is open for building: trees stand only in a few fixed groves close to the sea. The world is cut
 * into blocks of GROVE_BLOCK cells and at most one grove grows in a block, on a coastal spot picked by a seeded
 * hash (so it is always the same places).
 */
/** Trees are switched off for now (the surface is bare); set to true to bring the coastal groves back. */
const TREES_ENABLED = false;
const GROVE_BLOCK = 44;
const GROVE_CHANCE = 0.4;
const COAST_RANGE = 5;

/**
 * All trees on the map as gameplay data (not just decoration): each tree
 * marks its grid cell as wooded, which blocks construction. Stored per cell
 * (CSR layout) so renderers can query any rectangle quickly.
 */
export class TreeLayer {
  /** World-space centre and radius of each tree, grouped by cell. */
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly rs: Float32Array;
  /** 0/1 canopy tone variant. */
  readonly tones: Uint8Array;
  /** cellStart[i]..cellStart[i+1] = trees in cell i. */
  private readonly cellStart: Int32Array;

  constructor(
    private readonly map: TileMap,
    _biomes: BiomeFields,
    seed: number,
  ) {
    const perCell: { x: number; y: number; r: number; tone: number }[][] = Array.from(
      { length: map.width * map.height },
      () => [],
    );
    let total = 0;

    /** Dry, low, ice-free land with the sea within COAST_RANGE cells. */
    const coastal = (cx: number, cy: number): boolean => {
      const t = map.typeAt(cx, cy);
      if (t !== 'grass' && t !== 'forest' && t !== 'sand') return false;
      if (map.heightAt(cx, cy) > 350) return false;
      for (let dy = -COAST_RANGE; dy <= COAST_RANGE; dy += 2) {
        for (let dx = -COAST_RANGE; dx <= COAST_RANGE; dx += 2) if (map.isWater(cx + dx, cy + dy)) return true;
      }
      return false;
    };

    for (let by = 0; TREES_ENABLED && by * GROVE_BLOCK < map.height; by++) {
      for (let bx = 0; bx * GROVE_BLOCK < map.width; bx++) {
        const rng = tileRng(bx, by, seed + 3);
        if (rng() > GROVE_CHANCE) continue;
        let centre: { x: number; y: number } | null = null;
        for (let attempt = 0; attempt < 30 && !centre; attempt++) {
          const cx = Math.floor((bx + rng()) * GROVE_BLOCK);
          const cy = Math.floor((by + rng()) * GROVE_BLOCK);
          if (coastal(cx, cy)) centre = { x: (cx + 0.5) * CELL_SIZE, y: (cy + 0.5) * CELL_SIZE };
        }
        if (!centre) continue;
        const radius = (2.2 + rng() * 2.2) * CELL_SIZE;
        for (let y = centre.y - radius; y <= centre.y + radius; y += TREE_SPACING) {
          for (let x = centre.x - radius; x <= centre.x + radius; x += TREE_SPACING) {
            const dist = Math.hypot(x - centre.x, y - centre.y) / radius;
            if (dist > 1) continue;
            const cx = Math.floor(x / CELL_SIZE);
            const cy = Math.floor(y / CELL_SIZE);
            const t = map.typeAt(cx, cy);
            if (t !== 'grass' && t !== 'forest' && t !== 'sand') continue;
            const trng = tileRng(Math.floor(x), Math.floor(y), seed + 8);
            if (trng() > 0.62 * (1 - dist * dist)) continue; // dense in the middle, ragged at the edge
            const tx = x + (0.15 + trng() * 0.7) * TREE_SPACING;
            const ty = y + (0.2 + trng() * 0.7) * TREE_SPACING;
            const r = 1.3 + trng() * 1.1;
            const tone = trng() < 0.5 ? 0 : 1;
            // A tree belongs to the cell its trunk stands in.
            const cell = map.index(Math.min(map.width - 1, Math.floor(tx / CELL_SIZE)), Math.min(map.height - 1, Math.floor(ty / CELL_SIZE)));
            perCell[cell]?.push({ x: tx, y: ty, r, tone });
            total++;
          }
        }
      }
    }

    this.xs = new Float32Array(total);
    this.ys = new Float32Array(total);
    this.rs = new Float32Array(total);
    this.tones = new Uint8Array(total);
    this.cellStart = new Int32Array(perCell.length + 1);
    let k = 0;
    perCell.forEach((list, i) => {
      this.cellStart[i] = k;
      for (const t of list) {
        this.xs[k] = t.x;
        this.ys[k] = t.y;
        this.rs[k] = t.r;
        this.tones[k] = t.tone;
        k++;
      }
      if (list.length > 0) map.trees[i] = Math.min(255, list.length);
    });
    this.cellStart[perCell.length] = k;
  }

  /**
   * Removes every tree standing in a w×d cell area (map-authored structures
   * are pre-cleared, like trees removed in an RA2 map editor).
   */
  clearArea(x: number, y: number, w: number, d: number): void {
    for (let cy = y; cy < y + d; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (!this.map.inBounds(cx, cy)) continue;
        const cell = this.map.index(cx, cy);
        for (let i = this.cellStart[cell] ?? 0; i < (this.cellStart[cell + 1] ?? 0); i++) this.rs[i] = 0;
        this.map.trees[cell] = 0;
      }
    }
  }

  get count(): number {
    return this.xs.length;
  }

  /** Calls `fn(index)` for every tree whose cell intersects the world rect. */
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
