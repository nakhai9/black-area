import { FOOTPRINT_RADAR_TOWER, RADAR_TOWER_HP } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Radar Tower: a small 2 × 2 structure with a turning antenna. While one stands the nation's radar (minimap) is
 * online, showing every unit and structure; it is also needed before an Airfield can be built.
 */
export class RadarTower extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'radarTower',
      name: 'Radar Tower',
      footprint: FOOTPRINT_RADAR_TOWER,
      maxHp: RADAR_TOWER_HP,
      powerOutput: 0,
      powerDrain: 3,
      incomePerSecond: 0,
      spriteKey: `radarTower:${faction}`,
    });
  }
}
