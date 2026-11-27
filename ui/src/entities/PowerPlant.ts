import { FOOTPRINT_SMALL, POWER_PLANT_MAX_LEVEL, POWER_PLANT_OUTPUT, POWER_PLANT_STORAGE, POWER_PLANT_UPGRADE_COSTS, SUPER_PLANT_EQUIV } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Nuclear Power Plant (4×4): turns the nation's oil stock into power for every structure. It burns at most
 * POWER_PLANT_OUTPUT J/s worth of oil and buffers up to POWER_PLANT_STORAGE; a freshly built plant is empty.
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

  /** Upgrade level 1..POWER_PLANT_MAX_LEVEL (each level = one more plant; the top one is the Eternal Reactor). */
  level = 1;

  /** How many plants this one is worth (output and storage). */
  get plantsWorth(): number {
    return this.level >= POWER_PLANT_MAX_LEVEL ? SUPER_PLANT_EQUIV : this.level;
  }

  /** Price of the next level, or null at the top. */
  get upgradeCost(): number | null {
    return this.level >= POWER_PLANT_MAX_LEVEL ? null : (POWER_PLANT_UPGRADE_COSTS[this.level - 1] ?? null);
  }

  /** Raises the plant one level (the caller has charged the price). Upgrades are never refunded (sale: build price only). */
  upgrade(): void {
    if (this.level >= POWER_PLANT_MAX_LEVEL) return;
    this.level++;
    this.spec.powerOutput = POWER_PLANT_OUTPUT * this.plantsWorth;
    if (this.level >= POWER_PLANT_MAX_LEVEL) this.spec.name = 'Eternal Reactor';
  }

  /** Storage scales with health and level, like the output. */
  get capacity(): number {
    return POWER_PLANT_STORAGE * this.plantsWorth * this.hpRatio;
  }

  override get active(): boolean {
    return this.output > 0;
  }
}
