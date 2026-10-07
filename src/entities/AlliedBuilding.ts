import { FOOTPRINT_SMALL } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Allied Building: the seat of an allied nation, raised on land claimed by a Squatters team and drawn in the
 * architecture of the nation it follows. For now it is only a structure (no allied economy yet).
 */
export class AlliedBuilding extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'alliedBuilding',
      name: 'Allied Building',
      footprint: FOOTPRINT_SMALL,
      maxHp: 2000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `alliedBuilding:${faction}`,
    });
  }
}
