import type { EntityManager } from '../entities/EntityManager';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/**
 * TB economy: a nation earns money only from its oil derricks (buildings with
 * `incomePerSecond`). Income is halved while the owner is low on power
 * (RA2-style penalty). Fractions accumulate and are paid out in whole TB.
 */
export class EconomySystem implements GameSystem {
  private readonly pending = new Map<number, number>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
  ) {}

  /** Current income of a player in TB per second. */
  incomeRate(player: PlayerState): number {
    const lowPower = player.powerConsumed > player.powerProduced;
    let rate = 0;
    for (const b of this.entities.buildings()) {
      if (b.alive && b.owner === player.id) rate += b.income;
    }
    return lowPower ? rate / 2 : rate;
  }

  update(dt: number): void {
    for (const p of this.players) {
      const earned = (this.pending.get(p.id) ?? 0) + this.incomeRate(p) * dt;
      const whole = Math.floor(earned);
      p.credits += whole;
      this.pending.set(p.id, earned - whole);
    }
  }
}
