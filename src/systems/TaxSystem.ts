import { HAPPY_CITY_TAX, HAPPY_CITY_TAX_BONUS, HAPPY_CITY_TAX_PERIOD } from '../constants';
import type { EntityManager } from '../entities/EntityManager';
import { HappyCity } from '../entities/HappyCity';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';
import type { OilMarket } from './OilMarket';

/**
 * City taxes: every Happy City pays HAPPY_CITY_TAX TB to its nation every HAPPY_CITY_TAX_PERIOD seconds, on its own
 * clock (from when it was placed), so several cities pay at different moments. The money is income: it goes
 * through the Global Financial Center, which takes any debt first. A damaged city pays in proportion to its health.
 * The more cities a nation runs, the more each one pays: +HAPPY_CITY_TAX_BONUS of the base tax for every other city.
 */
export class TaxSystem implements GameSystem {
  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
    private readonly bank: OilMarket,
    private readonly onTax: (player: PlayerState, city: HappyCity, amount: number) => void = () => undefined,
  ) {}

  update(dt: number): void {
    const cities = new Map<number, number>();
    for (const b of this.entities.buildings()) if (b instanceof HappyCity && b.alive) cities.set(b.owner, (cities.get(b.owner) ?? 0) + 1);
    for (const b of this.entities.buildings()) {
      if (!(b instanceof HappyCity) || !b.alive) continue;
      const owner = this.players.find((p) => p.id === b.owner);
      if (!owner || owner.defeated) continue;
      b.taxClock -= dt;
      while (b.taxClock <= 0) {
        b.taxClock += HAPPY_CITY_TAX_PERIOD;
        // A damaged city pays less: taxes scale with its remaining health.
        const network = 1 + HAPPY_CITY_TAX_BONUS * ((cities.get(b.owner) ?? 1) - 1);
        const amount = Math.round(HAPPY_CITY_TAX * network * Math.max(0, b.hp / b.maxHp));
        if (amount <= 0) continue;
        this.bank.receive(owner, amount);
        this.onTax(owner, b, amount);
      }
    }
  }
}
