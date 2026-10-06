import type { EntityManager } from '../entities/EntityManager';
import type { PlacementBlocker, TileMap } from '../map/TileMap';

/** Max gap (in cells) between a new building and the nearest friendly building. */
export const BUILD_RADIUS = 3;

export type PlacementResult = { ok: true } | { ok: false; reason: PlacementBlocker | 'tooFar' };

export interface PlacementRequest {
  /** Player who is building. */
  owner: number;
  /** Top-left cell and footprint size (cells). */
  x: number;
  y: number;
  w: number;
  d: number;
  naval?: boolean;
}

/** Cells between two rectangles along the worst axis (0 = touching or overlapping). */
function cellGap(
  a: { x: number; y: number; w: number; d: number },
  b: { x: number; y: number; w: number; d: number },
): number {
  const gapX = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(0, b.y - (a.y + a.d), a.y - (b.y + b.d));
  return Math.max(gapX, gapY);
}

/**
 * Construction rules for new buildings (player or AI):
 * 1. every cell must be legal terrain and free — no trees, no water (naval: water only),
 *    no ice, never on top of an existing building;
 * 2. the footprint must lie within BUILD_RADIUS cells of one of the builder's own buildings.
 */
export class PlacementSystem {
  constructor(
    private readonly map: TileMap,
    private readonly entities: EntityManager,
  ) {}

  check(req: PlacementRequest): PlacementResult {
    const blocker = this.map.placementBlocker(req.x, req.y, req.w, req.d, req.naval === true);
    if (blocker) return { ok: false, reason: blocker };
    return this.nearOwnBase(req) ? { ok: true } : { ok: false, reason: 'tooFar' };
  }

  /** True when some living building of `owner` is within BUILD_RADIUS cells. */
  nearOwnBase(req: PlacementRequest): boolean {
    return this.entities
      .buildings()
      .some((b) => b.owner === req.owner && b.alive && cellGap(req, b) <= BUILD_RADIUS);
  }
}
