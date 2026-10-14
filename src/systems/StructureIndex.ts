import type { Building } from '../entities/Building';

/** Bucket size (cells) of the grid the structures are filed under. */
const BUCKET = 16;

/**
 * Structures filed in a coarse grid, so "is there another nation's structure within R cells of this point" looks at a
 * few nearby buckets instead of every building (walls make that list long).
 */
export class StructureIndex {
  private readonly grid = new Map<number, Building[]>();

  constructor(buildings: readonly Building[]) {
    for (const b of buildings) {
      const x0 = Math.floor(b.x / BUCKET);
      const y0 = Math.floor(b.y / BUCKET);
      const x1 = Math.floor((b.x + b.w) / BUCKET);
      const y1 = Math.floor((b.y + b.d) / BUCKET);
      for (let gy = y0; gy <= y1; gy++)
        for (let gx = x0; gx <= x1; gx++) {
          const k = gx * 65536 + gy;
          const list = this.grid.get(k);
          if (list) list.push(b);
          else this.grid.set(k, [b]);
        }
    }
  }

  /** True when a structure not owned by `owner` has its edge within `r` cells of (cx, cy). */
  foreignWithin(owner: number, cx: number, cy: number, r: number): boolean {
    const x0 = Math.floor((cx - r) / BUCKET);
    const x1 = Math.floor((cx + r) / BUCKET);
    const y0 = Math.floor((cy - r) / BUCKET);
    const y1 = Math.floor((cy + r) / BUCKET);
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++) {
        const list = this.grid.get(gx * 65536 + gy);
        if (!list) continue;
        for (const b of list) {
          if (b.owner === owner) continue;
          const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w));
          const dy = Math.max(b.y - cy, 0, cy - (b.y + b.d));
          if (dx <= r && dy <= r && dx * dx + dy * dy <= r * r) return true;
        }
      }
    return false;
  }
}
