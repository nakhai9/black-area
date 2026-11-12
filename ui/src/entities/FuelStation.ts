import { FOOTPRINT_FUEL_STATION, FUEL_STATION_HP } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Fuel Station (10 × 8): a fuel canopy over 3 pump islands and a shop, 3 aircraft parking spots, 2 helipads and a
 * 6-bay vehicle lot. For sale to every nation (player and AI alike); its job is defined later.
 */
export class FuelStation extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'fuelStation',
      name: 'Fuel Station',
      footprint: FOOTPRINT_FUEL_STATION,
      maxHp: FUEL_STATION_HP,
      powerOutput: 0,
      powerDrain: 2,
      incomePerSecond: 0,
      spriteKey: `fuelStation:${faction}`,
    });
  }
}
