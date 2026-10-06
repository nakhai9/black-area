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

/** Pick radius around a soldier's body (world px). */
const UNIT_PICK_RADIUS = 2.2;

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

  /** Closest living soldier whose body is under `world`. */
  pickUnit(world: WorldPoint): Unit | null {
    let best: Unit | null = null;
    let bestScore = Infinity;
    const m = worldToIso(world.x, world.y);
    for (const u of this.entities.fieldMovers()) {
      if (!u.alive) continue;
      const iso = worldToIso(u.px, u.py);
      // Aircraft (even parked on the airfield) are big targets: clicking the plane selects it, no sweep needed.
      const reach = Math.max(UNIT_PICK_RADIUS, u.radius * (u.aircraft ? 2.2 : 1.25));
      const d = Math.hypot(m.x - iso.x, m.y - (iso.y - bodyLift(u)));
      if (d < reach && d / reach < bestScore) {
        best = u;
        bestScore = d / reach;
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

  /** Own living units whose picture centre is inside a rectangle given in iso (screen-plane) coordinates. */
  unitsInIsoRect(r: Rect, owner: number): Unit[] {
    return this.entities.fieldMovers().filter((u) => {
      if (!u.alive || u.owner !== owner) return false;
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
