import { FOOTPRINT_GMC, NEUTRAL_OWNER } from '../constants';
import type { WorldPoint } from '../types';
import { Building } from './Building';

/**
 * The Global Monitoring Center — a neutral landmark shared by every nation.
 * By rule it can never be destroyed, damaged, captured or occupied.
 */
export class WorldBank extends Building {
  readonly city = 'Zürich';
  readonly description = 'Neutral global finance hub shared by all nations. Cannot be destroyed or occupied.';

  constructor(center: WorldPoint) {
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'bank',
      name: 'Global Monitoring Center',
      footprint: FOOTPRINT_GMC,
      maxHp: 3000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: 'bank:world',
      indestructible: true,
      uncapturable: true,
    });
  }
}
