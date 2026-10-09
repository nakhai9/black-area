import type { EntityManager } from '../entities/EntityManager';
import { OilDerrick } from '../entities/OilDerrick';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/**
 * Oil economy: a nation's derricks (buildings with `incomePerSecond`) pump barrels of oil into its stock.
 * Output is halved while the owner is low on power (RA2-style penalty). The oil is turned into TB by
 * selling it to the Global Financial Center (see OilMarket); a nation that has lost its capital pumps nothing.
 */
export class EconomySystem implements GameSystem {
  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
    /** Output multiplier per nation (the oil cartel's production policy). */
    private readonly outputFactor: (player: PlayerState) => number = () => 1,
  ) {}

  /** Current oil output of a player in barrels per second (its own derricks plus any it leases). */
  oilRate(player: PlayerState): number {
    return this.ownRate(player) + this.leasedRate(player);
  }

  /** Output of the player's own derricks (not leased out). */
  private ownRate(player: PlayerState): number {
    if (player.defeated) return 0;
    let rate = 0;
    for (const b of this.entities.buildings()) {
      if (!b.alive || b.owner !== player.id) continue;
      if (b instanceof OilDerrick && b.lessee !== null) continue;
      rate += b.income;
    }
    rate *= this.outputFactor(player);
    return player.blackout ? rate / 2 : rate;
  }

  /** Output of derricks the player leases from another nation. */
  leasedRate(player: PlayerState): number {
    if (player.defeated) return 0;
    let rate = 0;
    for (const b of this.entities.buildings()) if (b instanceof OilDerrick && b.alive && b.lessee === player.id) rate += b.income;
    return player.blackout ? rate / 2 : rate;
  }

  update(dt: number): void {
    for (const p of this.players) {
      const leased = this.leasedRate(p) * dt;
      p.oil += this.ownRate(p) * dt + leased;
      // Leased barrels stay a share of the stock (oil burned for power takes its part of them too).
      p.leasedOil = Math.max(0, Math.min(p.oil, (p.leasedOil ?? 0) + leased));
    }
  }
}
