import { FOOTPRINT_SMALL } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Infantry training facility, built from the sidebar (3×3 cells). */
export class Barracks extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'barracks',
      name: 'Ministry of Defence',
      footprint: FOOTPRINT_SMALL,
      maxHp: 1000,
      powerOutput: 0,
      powerDrain: 1,
      incomePerSecond: 0,
      spriteKey: `barracks:${faction}`,
    });
  }
}
