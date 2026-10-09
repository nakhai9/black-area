import { CELL_SIZE, INFANTRY_BASE, INFANTRY_MAX_RANGE_CELLS, SWIM_SPEED_FACTOR, WEAPONS } from '../constants';
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

  constructor(
    owner: number,
    faction: FactionId,
    readonly tier: UnitTier,
    at: WorldPoint,
  ) {
    const f = FACTIONS[faction];
    const base = INFANTRY_BASE[tier];
    super(owner, faction, at, Math.round(base.maxHp * f.stats.armor));
    this.profile = f.infantry[tier] ?? f.infantry.regular;
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
    return this.inWater ? SWIM_SPEED_FACTOR : 1;
  }
}
