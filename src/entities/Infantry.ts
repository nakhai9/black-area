import { CELL_SIZE, INFANTRY_BASE, INFANTRY_MAX_RANGE_CELLS, SWIM_SPEED_FACTOR, WEAPONS } from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId, InfantryProfile, UnitTier, WorldPoint } from '../types';
import { Unit } from './Unit';

export type { UnitTask } from './Unit';

/** A foot soldier (regular, special forces, the President or an engineer). */
export class Infantry extends Unit {
  readonly profile: InfantryProfile;
  readonly speed: number;
  readonly radius = 1.1;
  readonly bodyHeight = 1.6;
  /** Price paid for it (faction cost applied). */
  readonly value: number;

  constructor(
    owner: number,
    faction: FactionId,
    readonly tier: UnitTier,
    at: WorldPoint,
  ) {
    const f = FACTIONS[faction];
    const base = INFANTRY_BASE[tier];
    super(owner, faction, at, Math.round(base.maxHp * f.stats.armor));
    this.profile = f.infantry[tier];
    this.speed = base.speed * f.stats.unitSpeed * CELL_SIZE;
    this.value = Math.round((base.cost * f.stats.cost) / 10) * 10;
    const w = this.profile.look.weapon;
    if (w === 'rifle' || w === 'smg' || w === 'sniper') {
      const spec = WEAPONS[w];
      this.weapon = { ...spec, damage: spec.damage * f.stats.firepower, range: Math.min(spec.range * f.stats.range, INFANTRY_MAX_RANGE_CELLS * CELL_SIZE) };
    }
  }

  /** Special forces can swim across water; regulars cannot. */
  override get swims(): boolean {
    return this.tier === 'special';
  }

  get isPresident(): boolean {
    return this.tier === 'president';
  }

  get isEngineer(): boolean {
    return this.tier === 'engineer';
  }

  get name(): string {
    return this.profile.name;
  }

  protected override speedFactor(): number {
    return this.inWater ? SWIM_SPEED_FACTOR : 1;
  }
}
