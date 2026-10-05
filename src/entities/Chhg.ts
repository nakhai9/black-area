import { FOOTPRINT_LARGE, NEUTRAL_OWNER } from '../constants';
import type { WorldPoint } from '../types';
import { Building } from './Building';

/**
 * CHHG — neutral Antarctic landmark. Belongs to no nation; by rule it can
 * never be destroyed, damaged, captured or occupied.
 */
export class Chhg extends Building {
  readonly city = 'Antarctica';
  readonly description = 'Neutral modern complex at the South Pole. Cannot be destroyed or occupied.';

  constructor(center: WorldPoint) {
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'chhg',
      name: 'CHHG',
      footprint: FOOTPRINT_LARGE,
      maxHp: 5000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: 'chhg:world',
      indestructible: true,
      uncapturable: true,
    });
  }
}
