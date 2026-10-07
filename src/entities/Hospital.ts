import { FOOTPRINT_LARGE, HOSPITAL_CAPACITY, HOSPITAL_HEAL_PER_SECOND } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Hospital: holds up to HOSPITAL_CAPACITY wounded people (soldiers and the
 * President); they heal inside and walk out on their own once fully healed.
 */
export class Hospital extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'hospital',
      name: 'Hospital',
      footprint: FOOTPRINT_LARGE,
      maxHp: 1200,
      powerOutput: 0,
      powerDrain: 2,
      incomePerSecond: 0,
      spriteKey: `hospital:${faction}`,
      garrison: { capacity: HOSPITAL_CAPACITY, accepts: 'wounded', healPerSecond: HOSPITAL_HEAL_PER_SECOND },
    });
  }
}
