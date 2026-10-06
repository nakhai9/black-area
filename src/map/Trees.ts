import { CELL_SIZE } from '../constants';
import { smoothstep } from '../core/MathUtils';
import { ValueNoise, tileRng } from '../core/Random';
import { type BiomeFields, sampleField } from './Biomes';
import type { TileMap } from './TileMap';

/** Trees sit on a fixed 4 px sub-grid (several per gameplay cell). */
const TREE_SPACING = 4;
const DENSITY_FOREST = 0.07;
/** Trees only grow inside a few scattered groves: the rest of the land stays open for building. */
const GROVE_SCALE = 45;
const GROVE_FROM = 0.66;
const GROVE_TO = 0.74;

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
    biomes: BiomeFields,
    seed: number,
  ) {
    const clumps = new ValueNoise(seed + 33);
    const groves = new ValueNoise(seed + 77);
    const perCell: { x: number; y: number; r: number; tone: number }[][] = Array.from(
      { length: map.width * map.height },
      () => [],
    );
    let total = 0;

    for (let y = 0; y < map.height * CELL_SIZE; y += TREE_SPACING) {
      for (let x = 0; x < map.width * CELL_SIZE; x += TREE_SPACING) {
        const cx = Math.floor(x / CELL_SIZE);
        const cy = Math.floor(y / CELL_SIZE);
        const t = map.typeAt(cx, cy);
        if (t !== 'forest' && t !== 'grass') continue;
        const forest = sampleField(biomes.forest, map.width, map.height, x / CELL_SIZE, y / CELL_SIZE);
        const clump = clumps.fbm(x / 20, y / 20, 2);
        // No lone trees on open grass; forest tiles only grow trees inside a grove.
        if (t !== 'forest') continue;
        const grove = smoothstep(GROVE_FROM, GROVE_TO, groves.fbm(x / GROVE_SCALE, y / GROVE_SCALE, 2));
        const density = DENSITY_FOREST * smoothstep(0.42, 0.6, clump) * grove;
        const rng = tileRng(x, y, seed + 3);
        if (rng() > density * (0.6 + forest * 0.6)) continue;
        const tx = x + (0.15 + rng() * 0.7) * TREE_SPACING;
        const ty = y + (0.2 + rng() * 0.7) * TREE_SPACING;
        const r = 1.3 + rng() * 1.1;
        const tone = rng() < 0.5 ? 0 : 1;
        // A tree belongs to the cell its trunk stands in.
        const cell = map.index(Math.min(map.width - 1, Math.floor(tx / CELL_SIZE)), Math.min(map.height - 1, Math.floor(ty / CELL_SIZE)));
        perCell[cell]?.push({ x: tx, y: ty, r, tone });
        total++;
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
