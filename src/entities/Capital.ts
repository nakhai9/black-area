import { FOOTPRINT_CAPITAL } from '../constants';
import type { FactionConfig, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * A faction's capital landmark (Washington, Moscow, Beijing, Paris). Acts
 * as the player's HQ and is the primary objective to defend.
 */
export class Capital extends Building {
  readonly city: string;
  readonly description: string;

  constructor(faction: FactionConfig, owner: number, center: WorldPoint) {
    super(owner, faction.id, center, {
      type: 'capital',
      name: faction.capital.name,
      footprint: FOOTPRINT_CAPITAL,
      maxHp: faction.capital.maxHp,
      powerOutput: faction.capital.powerOutput,
      powerDrain: 1,
      incomePerSecond: 0,
      spriteKey: `capital:${faction.id}`,
    });
    this.city = faction.capital.city;
    this.description = faction.capital.description;
  }
}
