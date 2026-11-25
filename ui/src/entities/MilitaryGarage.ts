import { FOOTPRINT_MILITARY_GARAGE, GARAGE_SOLDIERS, GARAGE_VEHICLES, MILITARY_GARAGE_HP } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Military Garage (6 × 4, long side along the front, every nation its own design): shelters up to GARAGE_VEHICLES vehicles (helicopters and
 * transport aircraft too) and GARAGE_SOLDIERS soldiers. Units go in like they board a transport aircraft; a
 * double-click or Unload lets everyone out. At half health it loses half of each (see Game.processGarages);
 * destroyed, the rest are pushed out alive.
 */
export class MilitaryGarage extends Building {
  /** Half the occupants were already lost to this round of damage (cleared once mended above half health). */
  lossTaken = false;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'militaryGarage',
      name: 'Military Garage',
      footprint: FOOTPRINT_MILITARY_GARAGE,
      maxHp: MILITARY_GARAGE_HP,
      powerOutput: 0,
      powerDrain: 2,
      incomePerSecond: 0,
      spriteKey: `militaryGarage:${faction}`,
      garrison: { capacity: GARAGE_SOLDIERS + GARAGE_VEHICLES, accepts: 'any', soldiers: GARAGE_SOLDIERS, vehicles: GARAGE_VEHICLES },
    });
  }
}
