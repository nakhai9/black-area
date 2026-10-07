import { FOOTPRINT_FLAGPOLE } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** National flagpole on its own small plinth: a single cell, no power, no income. */
export class Flagpole extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'flagpole',
      name: 'Flagpole',
      footprint: FOOTPRINT_FLAGPOLE,
      maxHp: 300,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `flagpole:${faction}`,
    });
  }
}
