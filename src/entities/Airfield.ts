import { FOOTPRINT_AIRFIELD } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Airfield: runway + apron with a control tower, filling 4×4 cells. */
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
