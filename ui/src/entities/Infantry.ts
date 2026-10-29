import { CELL_SIZE, GROUND_SPEED_SCALE, INFANTRY_BASE, INFANTRY_MARCH_CELLS, INFANTRY_MAX_RANGE_CELLS, INFANTRY_RECOVER_SECONDS, INFANTRY_REST_SECONDS, SWIM_SPEED_FACTOR, WEAPONS, NATION_STRENGTH, STRENGTH_REF } from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId, InfantryProfile, UnitTier, WorldPoint } from '../types';
import { Unit } from './Unit';

export type { UnitTask } from './Unit';

/**
 * A foot soldier (regular, special forces or an engineer), or a Squatters team: a flag bearer and his rifleman escort
 * drawn as two men that always move together — one entity, so they can never be selected or ordered apart.
 */
export class Infantry extends Unit {
  readonly profile: InfantryProfile;
  readonly speed: number;
  readonly radius = 1.1;
  readonly bodyHeight = 1.6;
  /** Price paid for it (faction cost applied). */
  readonly value: number;
  /** Squatters: has been flown in by a transport (it may only claim land it was airlifted to). */
  airlifted = false;
  /** Crazy Soldier: the enemy structure or unit he is running at to plant a charge on, and when he may plant again (game time). */
  charge: { targetId: number } | null = null;
  chargeReadyAt = 0;
  /** Heading the sprite is drawn with: follows `heading` with some hysteresis, so the picture does not flicker between two of its 8 directions. */
  viewHeading = this.heading;

  constructor(
    owner: number,
    faction: FactionId,
    readonly tier: UnitTier,
    at: WorldPoint,
  ) {
    const f = FACTIONS[faction];
    const base = INFANTRY_BASE[tier];
    // Land arm of NATION_STRENGTH: soldiers, tanks, air defence and every ground vehicle share one score.
    const strength = NATION_STRENGTH[faction].land / STRENGTH_REF;
    super(owner, faction, at, Math.round(base.maxHp * strength));
    this.profile = f.infantry[tier] ?? f.infantry.regular;
    this.turnRate = 9;
    this.speed = base.speed * f.stats.unitSpeed * (f.stats.infantrySpeed ?? 1) * CELL_SIZE * GROUND_SPEED_SCALE;
    this.value = Math.round((base.cost * f.stats.cost * (f.stats.infantryCost ?? 1)) / 10) * 10;
    // Everyone but special forces tires on a long march (see INFANTRY_MARCH_CELLS).
    if (tier !== 'special') {
      this.marchLimit = INFANTRY_MARCH_CELLS * CELL_SIZE;
      this.restSeconds = INFANTRY_REST_SECONDS;
      this.recoverSeconds = INFANTRY_RECOVER_SECONDS;
    }
    const w = this.profile.look.weapon;
    if (w === 'rifle' || w === 'smg' || w === 'sniper') {
      const spec = WEAPONS[w];
      this.weapon = { ...spec, damage: spec.damage * strength, range: Math.min(spec.range * f.stats.range, INFANTRY_MAX_RANGE_CELLS * CELL_SIZE) };
    }
  }

  override update(dt: number): void {
    super.update(dt);
    // Screen direction (iso projection) of the drawn and the true heading; switch only well past the boundary.
    const screen = (h: number) => Math.atan2((Math.cos(h) + Math.sin(h)) / 2, Math.cos(h) - Math.sin(h));
    let diff = screen(this.heading) - screen(this.viewHeading);
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > Math.PI / 8 + 0.14) this.viewHeading = this.heading;
  }

  /** Special forces can swim across water; regulars cannot. */
  override get swims(): boolean {
    return this.tier === 'special';
  }

  get isSpecial(): boolean {
    return this.tier === 'special';
  }

  get isSquatters(): boolean {
    return this.tier === 'squatters';
  }

  get isDemolition(): boolean {
    return this.tier === 'demolition';
  }

  get isEngineer(): boolean {
    return this.tier === 'engineer';
  }

  get name(): string {
    return this.profile.name;
  }

  protected override speedFactor(): number {
    return super.speedFactor() * (this.inWater ? SWIM_SPEED_FACTOR : 1);
  }

  protected override get earnsRank(): boolean {
    return this.tier !== 'squatters';
  }
}
