import type { EntityManager } from '../entities/EntityManager';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

/** Recomputes each player's power grid from their living buildings. */
export class PowerSystem implements GameSystem {
  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
  ) {}

  update(): void {
    const byId = new Map(this.players.map((p) => [p.id, p]));
    for (const p of this.players) {
      p.powerProduced = 0;
      p.powerConsumed = 0;
    }
    for (const b of this.entities.buildings()) {
      const owner = byId.get(b.owner);
      if (!owner || !b.alive) continue;
      // Damaged power producers output proportionally less (RA2 behaviour).
      owner.powerProduced += Math.round(b.spec.powerOutput * b.hpRatio);
      owner.powerConsumed += b.spec.powerDrain;
    }
  }
}
