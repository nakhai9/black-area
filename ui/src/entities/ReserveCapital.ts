import { FOOTPRINT_RESERVE_CAPITAL, RESERVE_CAPITAL_HP_SHARE } from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';
import type { Entity } from './Entity';

/**
 * Reserve Capital (Longoria / Nordursia, 3 × 4). An ordinary structure while its owner's capital stands; once the
 * capital falls the government picks one reserve (Game.evaluateNations) and moves there: `seat` is set and it takes
 * over the capital's jobs (see isSeat). Player and AI alike.
 */
export class ReserveCapital extends Building {
  /** The government sits here (own capital lost, this reserve chosen). */
  seat = false;
  /** Succession number once it inherits the seat (1 → I, 2 → II…); 0 while not a seat. */
  seatNo = 0;
  /** Players whose units have spotted it (it stays known to them). */
  spottedBy: number[] = [];

  /** Engineers cannot take a Reserve Capital over (it can only be destroyed). */
  override get capturable(): boolean {
    return false;
  }

  /** Hidden from `viewer` (a player id): not the seat yet, not the owner's, not spotted by that player. */
  hiddenFrom(viewer: number): boolean {
    return !this.seat && this.owner !== viewer && !this.spottedBy.includes(viewer);
  }

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'reserveCapital',
      name: 'Reserve Capital',
      footprint: FOOTPRINT_RESERVE_CAPITAL,
      maxHp: Math.round(FACTIONS[faction].capital.maxHp * RESERVE_CAPITAL_HP_SHARE),
      powerOutput: 0,
      powerDrain: 2,
      incomePerSecond: 0,
      spriteKey: `reserveCapital:${faction}`,
    });
  }
}

/** Is `b` a Reserve Capital still hidden from player `viewer`? */
/** Roman numeral (1 → I, 4 → IV, 14 → XIV…). */
export function roman(n: number): string {
  let out = '';
  for (const [v, s] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

export function concealedFrom(b: Entity, viewer: number): boolean {
  return b instanceof ReserveCapital && b.hiddenFrom(viewer);
}

/** The nation's seat of government: a capital, or the Reserve Capital the government moved to. */
export function isSeat(b: Entity): b is Building {
  return b instanceof Building && (b.spec.type === 'capital' || (b instanceof ReserveCapital && b.seat));
}
