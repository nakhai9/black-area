import { FOOTPRINT_SMALL, POWER_PLANT_OUTPUT, POWER_PLANT_STORAGE } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Nuclear Power Plant (4×4): turns the nation's oil stock into power for every structure. It burns at most
 * POWER_PLANT_OUTPUT power/s worth of oil and buffers up to POWER_PLANT_STORAGE; a freshly built plant is empty.
 */
export class PowerPlant extends Building {
  /** Power stored in this plant (0 when built). */
  stored = 0;
  /** Power generated during the last tick (drives the cooling-tower steam). */
  output = 0;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'powerPlant',
      name: 'Nuclear Power Plant',
      footprint: FOOTPRINT_SMALL,
      maxHp: 1500,
      powerOutput: POWER_PLANT_OUTPUT,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `powerPlant:${faction}`,
    });
  }

  /** Storage scales with health, like the output. */
  get capacity(): number {
    return POWER_PLANT_STORAGE * this.hpRatio;
  }

  override get active(): boolean {
    return this.output > 0;
  }
}
