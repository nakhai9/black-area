import type { EntityManager } from '../entities/EntityManager';
import { BUNKER_BUILD_RADIUS, CELL_SIZE, GRID_HEIGHT } from '../constants';
import type { PlacementBlocker, TileMap } from '../map/TileMap';

/** Max gap (in cells) between a new building and the nearest friendly building. */
export const BUILD_RADIUS = 3;

/** How far (cells) from an own structure's edge a structure of this kind may be placed. */
export function buildRadius(type: string): number {
  return type === 'bunker' ? BUNKER_BUILD_RADIUS : BUILD_RADIUS;
}

export type PlacementResult = { ok: true } | { ok: false; reason: PlacementBlocker | 'units' | 'tooFar' | 'claimed' | 'nearOil' };

/** Free cells every new structure (any nation) must leave between itself and the edge of any oil derrick. */
export const OIL_DERRICK_CLEARANCE = 4;

/** Antarctica (south of 60°S) can never be claimed. */
const ANTARCTIC_ROW = Math.floor(((90 + 60) / 180) * GRID_HEIGHT);

/**
 * Land nobody owns yet, where a Squatters team may plant its flag and an Allied Building may stand: dry land outside
 * every nation's home territory, never water, ice or Antarctica.
 */
export function isClaimable(map: TileMap, x: number, y: number): boolean {
  const t = map.typeAt(x, y);
  return t !== undefined && t !== 'water' && t !== 'snow' && y < ANTARCTIC_ROW && map.territory[map.index(x, y)] === 0;
}

export interface PlacementRequest {
  /** Player who is building. */
  owner: number;
  /** Top-left cell and footprint size (cells). */
  x: number;
  y: number;
  w: number;
  d: number;
  naval?: boolean;
  /** Allied Building: every cell must be unclaimed land (see isClaimable). */
  unclaimedOnly?: boolean;
  /** Cells it may stand from an own structure's edge (default BUILD_RADIUS). */
  radius?: number;
}

/** Cells between two rectangles along the worst axis (0 = touching or overlapping). */
export function cellGap(
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
 *    no soldier or vehicle (parked aircraft included) may stand on any of its cells;
 * 2. the footprint must lie within BUILD_RADIUS cells (a bunker: BUNKER_BUILD_RADIUS) of one of the builder's own buildings;
 * 3. an Allied Building stands on unclaimed land only (land claimed by a Squatters team, see isClaimable);
 * 4. at least OIL_DERRICK_CLEARANCE free cells between it and the edge of every oil derrick (anyone's).
 */
export class PlacementSystem {
  constructor(
    private readonly map: TileMap,
    private readonly entities: EntityManager,
  ) {}

  check(req: PlacementRequest): PlacementResult {
    const blocker = this.map.placementBlocker(req.x, req.y, req.w, req.d, req.naval === true);
    if (blocker) return { ok: false, reason: blocker };
    if (req.unclaimedOnly && !this.allClaimable(req)) return { ok: false, reason: 'claimed' };
    if (this.nearDerrick(req)) return { ok: false, reason: 'nearOil' };
    if (this.unitsInside(req)) return { ok: false, reason: 'units' };
    return this.nearOwnBase(req) ? { ok: true } : { ok: false, reason: 'tooFar' };
  }

  /** True when some living building of `owner` is within BUILD_RADIUS cells. */
  nearOwnBase(req: PlacementRequest): boolean {
    return this.entities
      .buildings()
      .some((b) => b.owner === req.owner && b.alive && cellGap(req, b) <= (req.radius ?? BUILD_RADIUS));
  }

  /** Is any living oil derrick closer than OIL_DERRICK_CLEARANCE cells to the footprint? */
  private nearDerrick(req: PlacementRequest): boolean {
    return this.entities.buildings().some((b) => b.alive && b.spec.type === 'oilDerrick' && cellGap(req, b) < OIL_DERRICK_CLEARANCE);
  }

  private allClaimable(req: PlacementRequest): boolean {
    for (let y = req.y; y < req.y + req.d; y++) for (let x = req.x; x < req.x + req.w; x++) if (!isClaimable(this.map, x, y)) return false;
    return true;
  }

  /** Does any living soldier or ground vehicle (anyone's) stand on one of the footprint's cells? */
  private unitsInside(req: PlacementRequest): boolean {
    const x0 = req.x * CELL_SIZE;
    const y0 = req.y * CELL_SIZE;
    const x1 = (req.x + req.w) * CELL_SIZE;
    const y1 = (req.y + req.d) * CELL_SIZE;
    return this.entities
      .fieldMovers()
      .some((u) => u.alive && !u.flies && u.px + u.radius > x0 && u.px - u.radius < x1 && u.py + u.radius > y0 && u.py - u.radius < y1);
  }
}
