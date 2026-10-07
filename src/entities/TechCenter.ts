import { FOOTPRINT_SMALL } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * High-Tech Center: a high-rise research complex. Once it stands, the nation can train second-tier
 * soldiers and build second-tier vehicles.
 */
export class TechCenter extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'techCenter',
      name: 'High-Tech Center',
      footprint: FOOTPRINT_SMALL,
      maxHp: 2500,
      powerOutput: 0,
      powerDrain: 6,
      incomePerSecond: 0,
      spriteKey: `techCenter:${faction}`,
    });
  }
}
