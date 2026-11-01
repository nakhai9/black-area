import { FOOTPRINT_PARALLEL_GOV } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Parallel Government: the seat a nation sets up in a rival nation's name after one of its engineers entered that
 * nation's capital. Drawn in the rival's architecture (`faction` = the rival, its holder flies its flag beside the
 * rival's); while it stands the holder may build the rival's structures (see foreignBuildAllowed).
 */
export class ParallelGovernment extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'parallelGov',
      name: 'Parallel Government',
      footprint: FOOTPRINT_PARALLEL_GOV,
      maxHp: 3000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `parallelGov:${faction}`,
    });
  }
}
