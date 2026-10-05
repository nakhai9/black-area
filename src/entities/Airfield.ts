import { FOOTPRINT_AIRFIELD } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Airfield: T-shaped runway + 3×3 apron with a control tower (5×5 cells). */
export class Airfield extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'airfield',
      name: 'Airfield',
      footprint: FOOTPRINT_AIRFIELD,
      maxHp: 1500,
      powerOutput: 0,
      powerDrain: 40,
      incomePerSecond: 0,
      spriteKey: `airfield:${faction}`,
    });
  }
}
