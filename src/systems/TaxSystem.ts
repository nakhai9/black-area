import { HAPPY_CITY_TAX, HAPPY_CITY_TAX_PERIOD } from '../constants';
import type { EntityManager } from '../entities/EntityManager';
import { HappyCity } from '../entities/HappyCity';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';
import type { OilMarket } from './OilMarket';

/**
 * City taxes: every Happy City pays HAPPY_CITY_TAX TB to its nation every HAPPY_CITY_TAX_PERIOD seconds, on its own
 * clock (from when it was placed), so several cities pay at different moments. The money is income: it goes
 * through the World Bank, which takes any debt first.
 */
export class TaxSystem implements GameSystem {
  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
    private readonly bank: OilMarket,
    private readonly onTax: (player: PlayerState, city: HappyCity, amount: number) => void = () => undefined,
  ) {}

  update(dt: number): void {
    for (const b of this.entities.buildings()) {
      if (!(b instanceof HappyCity) || !b.alive) continue;
      const owner = this.players.find((p) => p.id === b.owner);
      if (!owner || owner.defeated) continue;
      b.taxClock -= dt;
      while (b.taxClock <= 0) {
        b.taxClock += HAPPY_CITY_TAX_PERIOD;
        this.bank.receive(owner, HAPPY_CITY_TAX);
        this.onTax(owner, b, HAPPY_CITY_TAX);
      }
    }
  }
}
