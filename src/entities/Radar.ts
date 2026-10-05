import { FOOTPRINT_SMALL } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Radar Station: lets the owner see enemy units and buildings on the sidebar radar. */
export class Radar extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'radar',
      name: 'Radar Station',
      footprint: FOOTPRINT_SMALL,
      maxHp: 900,
      powerOutput: 0,
      powerDrain: 40,
      incomePerSecond: 0,
      spriteKey: `radar:${faction}`,
    });
  }
}
