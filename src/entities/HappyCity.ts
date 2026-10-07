import { FOOTPRINT_CITY, HAPPY_CITY_TAX_PERIOD } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Happy City (8×8 cells): a crowded city in the nation's own style. A nation may build as many as it likes;
 * every city pays HAPPY_CITY_TAX TB into the budget once a minute, counted from the moment it was placed.
 */
export class HappyCity extends Building {
  /** Seconds until this city's next tax payment. */
  taxClock = HAPPY_CITY_TAX_PERIOD;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'happyCity',
      name: 'Happy City',
      footprint: FOOTPRINT_CITY,
      maxHp: 4000,
      powerOutput: 0,
      powerDrain: 8,
      incomePerSecond: 0,
      spriteKey: `happyCity:${faction}`,
    });
  }
}
