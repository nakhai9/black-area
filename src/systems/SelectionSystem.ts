import type { EventBus } from '../core/EventBus';
import { worldToIso } from '../core/IsoView';
import { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import type { Unit } from '../entities/Unit';
import type { SpriteCache } from '../render/SpriteCache';
import type { GameEvents, Rect, WorldPoint } from '../types';

/** Tracks hovered / selected entities and resolves pointer picks. */
/** Screen-space height of a unit's body centre above its ground point (aircraft: their altitude). */
function bodyLift(u: Unit): number {
  const altitude = (u as { altitude?: number }).altitude;
  return u.aircraft ? (altitude ?? 0) : u.bodyHeight;
}

/** Tankers fly escort on their own: they are never picked or selected. */
const isEscort = (u: Unit): boolean => (u as { isTanker?: boolean }).isTanker === true;

/** Smallest pick radius of an aircraft (iso px). */
const UNIT_PICK_RADIUS = 3.5;
/** A soldier's clickable figure (iso px): half its width, how far below the feet and how high above them. */
const SOLDIER_PICK_HALF_W = 1.3;
const SOLDIER_PICK_BELOW = 0.4;
const SOLDIER_PICK_HEIGHT = 4.6;
/** Squatters team (two men and a flag): wider and taller than a single soldier. */
const SQUATTERS_PICK_HALF_W = 2.2;
const SQUATTERS_PICK_HEIGHT = 6.2;
/** Units at least this big (world px radius) are vehicles; their hull is clickable within these radius factors. */
const VEHICLE_RADIUS = 3;
const VEHICLE_PICK_X = 0.75;
const VEHICLE_PICK_Y = 0.5;
/** Aircraft hit area: an ellipse over the airframe (× radius, iso px). */
const AIRCRAFT_PICK_X = 1.5;
const AIRCRAFT_PICK_Y = 0.9;

export class SelectionSystem {
  selectedId: number | null = null;
  hoveredId: number | null = null;
  /** Selected soldiers (RA2: units and a building are never selected together). */
  readonly selectedUnits = new Set<number>();
  hoveredUnitId: number | null = null;

  constructor(
    private readonly entities: EntityManager,
    private readonly sprites: SpriteCache,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  /** Front-most building whose sprite has an opaque pixel under `world`. */
  pick(world: WorldPoint): Building | null {
    const m = worldToIso(world.x, world.y);
    const list = this.entities.byDepth();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!(e instanceof Building) || !e.alive) continue;
      // Both points in iso space: the sprite is drawn upright around the footprint centre.
      const cw = e.centerWorld();
      const c = worldToIso(cw.x, cw.y);
      const scale = this.sprites.fitScale(e.spriteKey);
      if (this.sprites.hitTest(e.spriteKey, e.rotated, m.x - c.x, m.y - c.y, scale)) return e;
    }
    return null;
  }

  /**
   * The unit whose drawn body is under `world` (front-most when several overlap). Only a click on the body itself
   * counts — a soldier's figure, a vehicle's hull — not the ground around it. Aircraft stay big targets.
   */
  pickUnit(world: WorldPoint): Unit | null {
    let best: Unit | null = null;
    let bestY = -Infinity;
    const m = worldToIso(world.x, world.y);
    for (const u of this.entities.fieldMovers()) {
      if (!u.alive || isEscort(u)) continue;
      const iso = worldToIso(u.px, u.py);
      const dx = Math.abs(m.x - iso.x);
      let hit: boolean;
      if (u.aircraft) {
        // Only a click on the airframe itself selects the plane (even parked on the airfield), not the space around it.
        const rx = Math.max(UNIT_PICK_RADIUS, u.radius * AIRCRAFT_PICK_X);
        const ry = Math.max(UNIT_PICK_RADIUS * 0.6, u.radius * AIRCRAFT_PICK_Y);
        hit = (dx / rx) ** 2 + ((m.y - (iso.y - bodyLift(u))) / ry) ** 2 <= 1;
      } else if (u.radius >= VEHICLE_RADIUS) {
        // Ground vehicle: its hull, an ellipse a little wider than tall around the body centre.
        const rx = u.radius * VEHICLE_PICK_X;
        const ry = u.radius * VEHICLE_PICK_Y;
        const dy = m.y - (iso.y - u.bodyHeight * 0.5);
        hit = (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
      } else {
        // Soldier: the standing figure, from the feet up to the head. A Squatters team is two men side by side under
        // a raised flag: its box covers both of them and the flag.
        const team = (u as { isSquatters?: boolean }).isSquatters === true;
        hit =
          dx <= (team ? SQUATTERS_PICK_HALF_W : SOLDIER_PICK_HALF_W) &&
          m.y <= iso.y + SOLDIER_PICK_BELOW &&
          m.y >= iso.y - (team ? SQUATTERS_PICK_HEIGHT : SOLDIER_PICK_HEIGHT);
      }
      // Overlapping units: the one drawn in front (lower on screen) wins.
      if (hit && iso.y > bestY) {
        best = u;
        bestY = iso.y;
      }
    }
    return best;
  }

  updateHover(world: WorldPoint | null): void {
    const unit = world ? this.pickUnit(world) : null;
    this.hoveredUnitId = unit?.id ?? null;
    this.hoveredId = world && !unit ? (this.pick(world)?.id ?? null) : null;
  }

  /** Replaces (or extends, with `add`) the unit selection; clears any selected building. */
  selectUnits(ids: Iterable<number>, add = false): void {
    if (!add) this.selectedUnits.clear();
    for (const id of ids) this.selectedUnits.add(id);
    if (this.selectedId !== null) this.select(null);
    this.bus.emit('selection:changed', { entityId: null });
  }

  /** Shift+click (RA2): adds the unit to the group, or takes it out if it is already in. */
  toggleUnit(id: number): void {
    if (this.selectedUnits.has(id)) this.selectedUnits.delete(id);
    else this.selectedUnits.add(id);
    if (this.selectedId !== null) this.select(null);
    this.bus.emit('selection:changed', { entityId: null });
  }

  /** Own living units whose picture centre is inside a rectangle given in iso (screen-plane) coordinates. */
  unitsInIsoRect(r: Rect, owner: number): Unit[] {
    return this.entities.fieldMovers().filter((u) => {
      if (!u.alive || u.owner !== owner || isEscort(u)) return false;
      const iso = worldToIso(u.px, u.py);
      const y = iso.y - bodyLift(u);
      return iso.x >= r.x && iso.x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });
  }

  selectedUnitList(): Unit[] {
    return this.entities.fieldMovers().filter((u) => this.selectedUnits.has(u.id) && u.alive);
  }

  clearAll(): void {
    this.selectedUnits.clear();
    this.select(null);
  }

  select(id: number | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.bus.emit('selection:changed', { entityId: id });
  }
}
