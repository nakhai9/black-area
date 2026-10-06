import { CELL_SIZE } from '../constants';
import type { Allegiance, BuildingSpec, FactionId, WorldPoint } from '../types';
import type { Infantry } from './Infantry';
import { Entity } from './Entity';

/**
 * A static structure occupying a fixed rectangle of grid cells (4×3 or 3×3).
 * The sprite is fitted to that footprint at draw time (see SpriteCache.fitScale).
 */
export class Building extends Entity {
  readonly kind = 'building' as const;
  /** Game time when the player placed it (drives the build-up animation); null for map-authored. */
  placedAt: number | null = null;
  /** People stationed inside (capital: the President; hospital: patients). */
  readonly garrison: Infantry[] = [];
  private spriteKeyOverride: string | null = null;

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

  get capturable(): boolean {
    return this.spec.uncapturable !== true;
  }

  /**
   * Transfers ownership (e.g. an engineer occupying it). Returns false for
   * protected buildings such as the World Bank.
   */
  capture(owner: number, faction: FactionId): boolean {
    if (!this.capturable || !this.alive) return false;
    this.owner = owner;
    this.faction = faction;
    // Team-coloured structures switch to the new owner's colours.
    const m = /^(oil|barracks|hospital|airfield|warFactory):/.exec(this.spec.spriteKey);
    if (m) this.spriteKeyOverride = `${m[1]}:${faction}`;
    return true;
  }

  /** Sprite registry key (follows the owner for team-coloured structures). */
  get spriteKey(): string {
    return this.spriteKeyOverride ?? this.spec.spriteKey;
  }

  /** May this person be stationed here? Owner, capacity and the building's rule must all allow it. */
  canEnter(u: Infantry): boolean {
    const g = this.spec.garrison;
    if (!g || !this.alive || u.owner !== this.owner || this.garrison.length >= g.capacity) return false;
    return g.accepts === 'president' ? u.isPresident : u.hp < u.maxHp;
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

  /** Footprint size in cells. */
  get w(): number {
    return this.spec.footprint.w;
  }

  get d(): number {
    return this.spec.footprint.d;
  }

  /** Top-down view: things lower on screen are in front. */
  get depth(): number {
    return this.y + this.d;
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
