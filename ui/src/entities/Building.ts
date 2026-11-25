import { CELL_SIZE, DEFAULT_DAMAGE_STAGES } from '../constants';
import type { Allegiance, BuildingSpec, BuildingType, FactionId, WorldPoint } from '../types';

/** Structures with damage art of their own (wall / bridge levels, bunker sheet) or none (a flag pole): no `~stage` key. */
const OWN_DAMAGE_ART: ReadonlySet<BuildingType> = new Set(['wall', 'bridge', 'bunker', 'flagpole']);
import type { Infantry } from './Infantry';
import type { Unit } from './Unit';
import { Entity } from './Entity';

/**
 * A static structure occupying a fixed rectangle of grid cells (4×3 or 3×3).
 * The sprite is fitted to that footprint at draw time (see SpriteCache.fitScale).
 */
export class Building extends Entity {
  readonly kind = 'building' as const;
  /** Game time when the player placed it (drives the build-up animation); null for map-authored. */
  placedAt: number | null = null;
  /** Game time a Crazy Soldier's charge was planted on it: it flashes once (see Renderer.drawBuilding). */
  blinkAt: number | null = null;
  /** Units stationed inside: soldiers, and vehicles too in a Military Garage. */
  readonly garrison: Unit[] = [];
  /** Engineers inside repairing it (they walk out at 100%, and die with it if it is destroyed meanwhile). */
  readonly crew: Infantry[] = [];
  private spriteKeyOverride: string | null = null;
  /** Nation whose design it is, when that differs from its current faction (set on its first capture; null = `faction`). */
  originFaction: Allegiance | null = null;
  /** Last special-forces bomb that went off on it (who planted it, game time): a second one from another soldier soon after destroys it. */
  specialBomb: { planterId: number; at: number } | null = null;

  constructor(
    owner: number,
    faction: Allegiance,
    /** Approximate centre in world px; snapped so the footprint aligns with the grid. */
    center: WorldPoint,
    readonly spec: BuildingSpec,
  ) {
    super(owner, faction, 0, 0, spec.maxHp);
    this.x = Math.round(center.x / CELL_SIZE - this.w / 2);
    this.y = Math.round(center.y / CELL_SIZE - this.d / 2);
  }

  /** Whether the building is currently working (drives its animation). */
  get active(): boolean {
    return true;
  }

  /** Current barrels of oil per second produced for the owner. */
  get income(): number {
    return this.spec.incomePerSecond;
  }

  override get indestructible(): boolean {
    return this.spec.indestructible === true;
  }

  /** Nation that designed it: a captured Barracks / War Factory / Airfield still makes that nation's units. */
  get origin(): Allegiance {
    return this.originFaction ?? this.faction;
  }

  /** Rally point (world px) of a Barracks / War Factory / Airfield: everything it turns out heads there. */
  rally: { x: number; y: number } | null = null;

  get capturable(): boolean {
    return this.spec.uncapturable !== true;
  }

  /**
   * Transfers ownership (e.g. an engineer occupying it). Returns false for
   * protected buildings such as the Global Monitoring Center.
   */
  capture(owner: number, faction: FactionId): boolean {
    if (!this.capturable || !this.alive) return false;
    this.originFaction ??= this.faction;
    this.changeHands(owner, faction);
    return true;
  }

  /**
   * Its nation fell: the structure stays standing as a neutral one (NEUTRAL_OWNER = 0, its own art, no flag) that any
   * other nation's engineer may take over.
   */
  release(): void {
    this.originFaction ??= this.faction;
    this.owner = 0;
    this.faction = 'neutral';
    this.spriteKeyOverride = null;
    this.rally = null;
  }

  /** Hands it to `owner` / `faction`, whatever its protection (a lease, a lease ending), team colours included. */
  protected changeHands(owner: number, faction: FactionId): void {
    this.owner = owner;
    this.faction = faction;
    // A taken structure keeps its design: only the flag changes. Ones whose art flies a flag of its own are redrawn
    // with the new owner's (`kind:design@flag`); the rest keep their art and fly the owner's flag on a pole (Renderer).
    const f = /^(capital|parallelGov|nation|barracks|warFactory|flagpole|happyCity):(\w+)$/.exec(this.spec.spriteKey);
    if (f) this.spriteKeyOverride = f[2] === faction ? null : `${f[1]}:${f[2]}@${faction}`;
  }

  /** Damage art stage from HP left (spec.damageStages): 0 intact, n = the n-th mark reached. */
  get damageStage(): number {
    const stages = this.spec.damageStages ?? (OWN_DAMAGE_ART.has(this.spec.type) ? undefined : DEFAULT_DAMAGE_STAGES);
    if (!stages || !this.alive) return 0;
    const r = this.hpRatio;
    return stages.filter((s) => r <= s).length;
  }

  /** Sprite registry key (follows the owner for team-coloured structures; `~stage` once damaged, see damageStage). */
  get spriteKey(): string {
    const key = this.spriteKeyOverride ?? this.spec.spriteKey;
    const stage = this.damageStage;
    return stage ? `${key}~${stage}` : key;
  }

  /** May this unit be stationed here? Owner, capacity and the building's rule must all allow it. */
  canEnter(u: Unit, promised = { soldiers: 0, vehicles: 0 }): boolean {
    const g = this.spec.garrison;
    if (!g || !this.alive || u.owner !== this.owner || this.garrison.includes(u)) return false;
    if (g.accepts === 'wounded') return !isVehicleUnit(u) && this.garrison.length < g.capacity && u.hp < u.maxHp;
    if (!garageAccepts(u)) return false;
    const { soldiers, vehicles } = this.garrisonCounts();
    return isVehicleUnit(u) ? vehicles + promised.vehicles < (g.vehicles ?? 0) : soldiers + promised.soldiers < (g.soldiers ?? 0);
  }

  /** Soldiers and vehicles stationed inside. */
  garrisonCounts(): { soldiers: number; vehicles: number } {
    const vehicles = this.garrison.filter(isVehicleUnit).length;
    return { soldiers: this.garrison.length - vehicles, vehicles };
  }

  /** Every place taken (soldiers and vehicles): nobody more fits. */
  get garrisonFull(): boolean {
    const g = this.spec.garrison;
    if (!g) return false;
    if (g.accepts === 'wounded') return this.garrison.length >= g.capacity;
    const { soldiers, vehicles } = this.garrisonCounts();
    return soldiers >= (g.soldiers ?? 0) && vehicles >= (g.vehicles ?? 0);
  }

  get naval(): boolean {
    return this.spec.naval === true;
  }

  /** Moves the footprint so its top-left cell is (x, y). Callers update occupancy. */
  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Buildings always stand square to the grid: edges parallel to the grid lines, never turned. */
  get angleRad(): number {
    return 0;
  }

  /**
   * Turned 90° on the grid: the footprint becomes d × w and the art is shown mirrored (the same building seen
   * from the other side). Always square to the grid lines.
   */
  rotated = false;

  /** Footprint size in cells. */
  get w(): number {
    return this.rotated ? this.spec.footprint.d : this.spec.footprint.w;
  }

  get d(): number {
    return this.rotated ? this.spec.footprint.w : this.spec.footprint.d;
  }

  /** Isometric view: things with a larger x + y (cells, taken at the centre) are in front. */
  /** Draw depth set by the renderer for a small piece (wall, gate…) standing right against a large structure. */
  depthOverride: number | null = null;

  get depth(): number {
    return this.depthOverride ?? this.x + this.w / 2 + (this.y + this.d / 2);
  }

  containsCell(tx: number, ty: number): boolean {
    return tx >= this.x && ty >= this.y && tx < this.x + this.w && ty < this.y + this.d;
  }

  /** Centre of the footprint in world px. */
  centerWorld(): WorldPoint {
    return { x: (this.x + this.w / 2) * CELL_SIZE, y: (this.y + this.d / 2) * CELL_SIZE };
  }

  /** Footprint rectangle in world px. */
  footprintWorld(): { x: number; y: number; w: number; h: number } {
    return { x: this.x * CELL_SIZE, y: this.y * CELL_SIZE, w: this.w * CELL_SIZE, h: this.d * CELL_SIZE };
  }
}

/** A vehicle (it can carry cargo), as opposed to a soldier. */
export function isVehicleUnit(u: Unit): boolean {
  return 'cargo' in u;
}

/**
 * What a Military Garage takes: any soldier; any vehicle on land (helicopters and transport aircraft too), never a
 * ship nor a fixed-wing combat aircraft (they belong on an airfield).
 */
function garageAccepts(u: Unit): boolean {
  if (!isVehicleUnit(u)) return true;
  const v = u as Unit & { isHeli: boolean; isTransport: boolean; isAircraftCarrier: boolean };
  if (u.naval || v.isAircraftCarrier) return false;
  return !u.aircraft || v.isHeli || v.isTransport;
}
