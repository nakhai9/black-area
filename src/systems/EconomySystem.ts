import type { EntityManager } from '../entities/EntityManager';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/**
 * Oil economy: a nation's derricks (buildings with `incomePerSecond`) pump barrels of oil into its stock.
 * Output is halved while the owner is low on power (RA2-style penalty). The oil is turned into TB by
 * selling it to the World Bank (see OilMarket); a nation that has lost its capital pumps nothing.
 */
export class EconomySystem implements GameSystem {
  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
  ) {}

  /** Current oil output of a player in barrels per second. */
  oilRate(player: PlayerState): number {
    if (player.defeated) return 0;
    const lowPower = player.powerConsumed > player.powerProduced;
    let rate = 0;
    for (const b of this.entities.buildings()) {
      if (b.alive && b.owner === player.id) rate += b.income;
    }
    return lowPower ? rate / 2 : rate;
  }

  update(dt: number): void {
    for (const p of this.players) p.oil += this.oilRate(p) * dt;
  }
}
