import { CELL_SIZE } from '../constants';
import type { EntityManager } from '../entities/EntityManager';
import type { Unit } from '../entities/Unit';
import type { TileMap } from '../map/TileMap';
import type { Pathfinder } from '../map/Pathfinder';
import type { WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

/** Side of a safe zone, in cells. */
export const SAFE_ZONE_SIZE = 5;
/** A zone stays open at least this long (s), so the retreating units have time to walk in. */
const MIN_LIFETIME = 20;
/**
 * Abandoned: a zone nobody has emptied within this many seconds (no airfield, no transport came) is lost —
 * every soldier and vehicle left inside it perishes, as if starved with no one to help.
 */
export const SAFE_ZONE_LIFETIME = 6 * 60;
/** An existing zone of the nation this close (cells, same landmass) is reused instead of opening another. */
const REUSE_RADIUS = 40;
/** A new zone opens at most this far (cells) from the enemy capital the retreating units fought near. */
export const MAX_FROM_ENEMY_CAPITAL = 25;

/**
 * Green safe zone (5 × 5 cells) opened by the Global Financial Center for a nation whose units fall back from a
 * land they can only leave by air: nobody may attack inside it, and the nation's transports land there to fly
 * the units home. It closes once none of the nation's units is inside it or still on the way to it. A zone not
 * emptied within SAFE_ZONE_LIFETIME is lost with everything still inside it.
 */
export interface SafeZone {
  readonly id: number;
  /** Nation the zone shelters. */
  readonly owner: number;
  /** Top-left cell. */
  readonly x: number;
  readonly y: number;
  readonly openedAt: number;
  /** Units sent to the zone that have not arrived yet. */
  readonly expected: Set<number>;
}

/** Why a zone closed: everyone got out, or time ran out and those left inside perished. */
export type SafeZoneEnd = { kind: 'emptied' } | { kind: 'lost'; perished: number };

export class SafeZoneSystem implements GameSystem {
  readonly zones: SafeZone[] = [];
  private time = 0;
  private nextId = 1;

  constructor(
    private readonly map: TileMap,
    private readonly pathfinder: Pathfinder,
    private readonly entities: EntityManager,
    private readonly onClose: (zone: SafeZone, end: SafeZoneEnd) => void,
  ) {}

  /** Seconds left before the zone is lost. */
  timeLeft(z: SafeZone): number {
    return Math.max(0, z.openedAt + SAFE_ZONE_LIFETIME - this.time);
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (!z) continue;
      // Forget units that arrived, died, or boarded a transport.
      for (const id of z.expected) {
        const u = this.entities.get(id) as Unit | undefined;
        if (!u || !u.alive || u.insideId !== null || this.contains(z, u.px, u.py) || (!u.moving && u.boardTarget === null)) z.expected.delete(id);
      }
      const left = this.timeLeft(z);
      if (left <= 0) {
        // Nobody came: everything still in the zone (soldiers, vehicles, grounded aircraft and their passengers)
        // perishes and the zone is gone. No one is credited with the loss.
        const doomed = this.entities.fieldMovers().filter((u) => u.alive && u.owner === z.owner && !u.flies && this.contains(z, u.px, u.py));
        let perished = 0;
        for (const u of doomed) {
          perished += 1 + ('cargo' in u && Array.isArray(u.cargo) ? u.cargo.length : 0);
          u.lastAttackerId = null;
          u.hp = 0;
        }
        this.zones.splice(i, 1);
        this.onClose(z, { kind: 'lost', perished });
        continue;
      }
      if (this.time - z.openedAt < MIN_LIFETIME) continue;
      if (z.expected.size > 0 || this.occupants(z).length > 0) continue;
      this.zones.splice(i, 1);
      this.onClose(z, { kind: 'emptied' });
    }
  }

  /** Is (x, y) (world px) inside any safe zone? */
  isSafe(x: number, y: number): boolean {
    // Asked per armed unit per tick: no zones (the usual case) answers at once, without a closure.
    for (const z of this.zones) if (this.contains(z, x, y)) return true;
    return false;
  }

  contains(z: SafeZone, x: number, y: number): boolean {
    const x0 = z.x * CELL_SIZE;
    const y0 = z.y * CELL_SIZE;
    const s = SAFE_ZONE_SIZE * CELL_SIZE;
    return x >= x0 && x < x0 + s && y >= y0 && y < y0 + s;
  }

  /** Centre of the zone (world px). */
  center(z: SafeZone): WorldPoint {
    return { x: (z.x + SAFE_ZONE_SIZE / 2) * CELL_SIZE, y: (z.y + SAFE_ZONE_SIZE / 2) * CELL_SIZE };
  }

  /** The zone's own nation's soldiers and ground vehicles standing in it (aircraft and passengers aboard do not count). */
  occupants(z: SafeZone): Unit[] {
    return this.entities.fieldMovers().filter((u) => u.alive && u.owner === z.owner && !u.aircraft && this.contains(z, u.px, u.py));
  }

  zonesOf(owner: number): SafeZone[] {
    return this.zones.filter((z) => z.owner === owner);
  }

  /**
   * A zone of `owner` for units falling back near `near`: an open one close by on the same landmass, or a new 5 × 5
   * area of free land (no water, ice, trees or buildings). The new zone stays within MAX_FROM_ENEMY_CAPITAL of the
   * enemy capital the units fought near (`enemyCapital`), as close to them as that allows. Null: no room found.
   */
  open(owner: number, near: WorldPoint, enemyCapital: WorldPoint | null): { zone: SafeZone; created: boolean } | null {
    const ux = Math.floor(near.x / CELL_SIZE);
    const uy = Math.floor(near.y / CELL_SIZE);
    for (const z of this.zones) {
      if (z.owner !== owner) continue;
      const zx = z.x + 2;
      const zy = z.y + 2;
      if (Math.hypot(zx - ux, zy - uy) < REUSE_RADIUS && this.pathfinder.sameLandmass(ux, uy, zx, zy)) return { zone: z, created: false };
    }
    // Search around the units, pulled towards the enemy capital when they are farther than MAX_FROM_ENEMY_CAPITAL.
    let cx = ux;
    let cy = uy;
    if (enemyCapital) {
      const ex = enemyCapital.x / CELL_SIZE;
      const ey = enemyCapital.y / CELL_SIZE;
      const d = Math.hypot(ux - ex, uy - ey);
      if (d > MAX_FROM_ENEMY_CAPITAL) {
        const px = Math.floor(ex + ((ux - ex) * MAX_FROM_ENEMY_CAPITAL) / d);
        const py = Math.floor(ey + ((uy - ey) * MAX_FROM_ENEMY_CAPITAL) / d);
        if (this.map.inBounds(px, py) && this.pathfinder.sameLandmass(ux, uy, px, py)) {
          cx = px;
          cy = py;
        }
      }
    }
    const half = Math.floor(SAFE_ZONE_SIZE / 2);
    for (let r = 0; r <= 30; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx - half;
          const y = cy + dy - half;
          if (this.map.placementBlocker(x, y, SAFE_ZONE_SIZE, SAFE_ZONE_SIZE) !== null) continue;
          if (!this.pathfinder.sameLandmass(ux, uy, x + half, y + half)) continue;
          if (this.zones.some((z) => Math.abs(z.x - x) < SAFE_ZONE_SIZE && Math.abs(z.y - y) < SAFE_ZONE_SIZE)) continue;
          const zone: SafeZone = { id: this.nextId++, owner, x, y, openedAt: this.time, expected: new Set() };
          this.zones.push(zone);
          return { zone, created: true };
        }
      }
    }
    return null;
  }
}
