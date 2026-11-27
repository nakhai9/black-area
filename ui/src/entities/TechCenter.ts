import { techCenterFootprint } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * High-Tech Center: a high-rise research complex. Once it stands, the nation can train second-tier
 * soldiers and build second-tier vehicles.
 */
export class TechCenter extends Building {
  /** Its nuclear-programme engineers are mending it (Game.scientistsMend). */
  mending = false;
  /** Nuclear-programme engineers working in THIS Tech Center (they stay in it; a silo needs SILO_SCIENTISTS in one). */
  scientists = 0;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'techCenter',
      name: 'High-Tech Center',
      footprint: techCenterFootprint(faction),
      maxHp: 2500,
      powerOutput: 0,
      powerDrain: 6,
      incomePerSecond: 0,
      spriteKey: `techCenter:${faction}`,
    });
  }
}
