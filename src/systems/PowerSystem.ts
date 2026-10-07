import { OIL_GRID_MARKUP, POWER_PER_BARREL } from '../constants';
import type { EntityManager } from '../entities/EntityManager';
import { PowerPlant } from '../entities/PowerPlant';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';
import type { OilMarket } from './OilMarket';

/**
 * National power grids. Every tick each nation:
 *  1. drains power for all its structures (spec.powerDrain per second);
 *  2. its nuclear plants burn oil from the stock (1 barrel = POWER_PER_BARREL power) to cover the drain and
 *     refill their storage, each at most spec.powerOutput × health per second;
 *  3. anything still missing is bought from the World Bank as oil, at OIL_GRID_MARKUP × the posted price;
 *  4. what the treasury cannot pay for leaves the nation in a blackout.
 * A nation whose plants cannot cover its drain (or in a blackout) is short of power: the Bank keeps its
 * structures running, but construction (except power plants), vehicle production and take-offs stop.
 */
export class PowerSystem implements GameSystem {
  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
    private readonly market: OilMarket,
  ) {}

  update(dt: number): void {
    const byId = new Map(this.players.map((p) => [p.id, p]));
    const plants = new Map<number, PowerPlant[]>();
    for (const p of this.players) p.powerConsumed = 0;
    for (const b of this.entities.buildings()) {
      const owner = byId.get(b.owner);
      if (!owner || !b.alive) continue;
      owner.powerConsumed += b.spec.powerDrain;
      if (b instanceof PowerPlant) {
        let list = plants.get(owner.id);
        if (!list) plants.set(owner.id, (list = []));
        list.push(b);
      }
    }
    for (const p of this.players) this.run(p, plants.get(p.id) ?? [], dt);
  }

  private run(p: PlayerState, plants: readonly PowerPlant[], dt: number): void {
    let need = p.defeated ? 0 : p.powerConsumed * dt;
    let produced = 0;
    let capacity = 0;
    let supply = 0;
    for (const plant of plants) {
      supply += plant.spec.powerOutput * plant.hpRatio;
      // Storage shrinks with damage: whatever no longer fits is lost.
      plant.stored = Math.min(plant.stored, plant.capacity);
      capacity += plant.capacity;
      // Burn oil for this plant's share of the drain plus a refill, within its rate and the stock.
      const room = plant.capacity - plant.stored;
      const want = Math.min(plant.spec.powerOutput * plant.hpRatio * dt, need + room);
      const made = p.defeated ? 0 : Math.min(want, Math.max(0, p.oil) * POWER_PER_BARREL);
      p.oil -= made / POWER_PER_BARREL;
      plant.output = made / dt;
      produced += made;
      const used = Math.min(need, made);
      need -= used;
      plant.stored += made - used;
    }
    // Still short: draw on the plants' storage.
    for (const plant of plants) {
      if (need <= 0) break;
      const used = Math.min(need, plant.stored);
      plant.stored -= used;
      need -= used;
    }
    // Still short: the World Bank must sell the nation the missing oil.
    if (need > 0) need -= this.market.sellForGrid(p, need / POWER_PER_BARREL, OIL_GRID_MARKUP) * POWER_PER_BARREL;
    p.blackout = need > 1e-6;
    p.powerProduced = produced / dt;
    p.powerCapacity = capacity;
    p.powerSupply = supply;
    p.powerShort = p.blackout || supply + 1e-6 < p.powerConsumed;
    p.powerStored = plants.reduce((sum, plant) => sum + plant.stored, 0);
  }
}
