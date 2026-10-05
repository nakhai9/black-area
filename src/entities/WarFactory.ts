import { FOOTPRINT_LARGE } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** War Factory: builds light vehicles, tanks and armoured vehicles (5×4 cells). */
export class WarFactory extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'warFactory',
      name: 'War Factory',
      footprint: FOOTPRINT_LARGE,
      maxHp: 1800,
      powerOutput: 0,
      powerDrain: 50,
      incomePerSecond: 0,
      spriteKey: `warFactory:${faction}`,
    });
  }
}
