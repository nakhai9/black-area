import { FOOTPRINT_AIRFIELD } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Airfield: 12×8 cells with nine parking spots; aircraft that land here are repaired. */
export class Airfield extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'airfield',
      name: 'Airfield',
      footprint: FOOTPRINT_AIRFIELD,
      maxHp: 1500,
      powerOutput: 0,
      powerDrain: 4,
      incomePerSecond: 0,
      spriteKey: `airfield:${faction}`,
    });
  }
}
