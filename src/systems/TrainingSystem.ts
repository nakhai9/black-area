import { INFANTRY_BASE, specialCapFor, TRAINING_QUEUE_MAX } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { FACTIONS } from '../factions';
import type { FactionId, PlayerState, UnitTier } from '../types';
import type { GameSystem } from './GameSystem';

/** A trainable soldier as offered on the Infantry tab. */
export interface TrainOption {
  tier: UnitTier;
  name: string;
  description: string;
  cost: number;
  trainSeconds: number;
}

/** Faction-specific infantry options (cost scaled by the faction's cost multiplier). */
export function trainOptions(faction: FactionId): TrainOption[] {
  const f = FACTIONS[faction];
  return (['regular', 'special', 'president', 'engineer'] as const).map((tier) => ({
    tier,
    name: f.infantry[tier].name,
    description: f.infantry[tier].description,
    cost: Math.round((INFANTRY_BASE[tier].cost * f.stats.cost) / 10) * 10,
    trainSeconds: INFANTRY_BASE[tier].trainSeconds + f.stats.trainDelay,
  }));
}

export type TrainingState = 'idle' | 'training' | 'onHold' | 'noBarracks' | 'ratio';

export type EnqueueResult = 'ok' | 'full' | 'noBarracks' | 'ratio' | 'unique';

/** Army composition counts (living soldiers + queued). */
export interface ArmyRatio {
  regular: number;
  special: number;
  /** Special soldiers allowed: 3 for every 5 regulars (see specialCapFor). */
  specialCap: number;
  /** A nation has exactly one President: alive (even inside a building) or queued. */
  presidentTaken: boolean;
}

export interface TrainingQueue {
  /** Waiting soldiers; the first one is in training. */
  items: UnitTier[];
  state: TrainingState;
  /** 0..1 progress of the first item. */
  progress: number;
  /** TB paid so far for the first item. */
  paid: number;
}

/**
 * Infantry production, independent from structure construction (RA2 has one
 * queue per category). Requires a Barracks; cost is paid gradually from the
 * treasury, and finished soldiers walk out of the barracks via `spawn`.
 */
export class TrainingSystem implements GameSystem {
  private readonly queues = new Map<number, TrainingQueue>();
  private readonly options = new Map<number, TrainOption[]>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
    private readonly spawn: (player: PlayerState, tier: UnitTier, barracks: Building) => void,
  ) {
    for (const p of players) {
      this.queues.set(p.id, { items: [], state: 'idle', progress: 0, paid: 0 });
      this.options.set(p.id, trainOptions(p.faction));
    }
  }

  queue(player: PlayerState): TrainingQueue {
    const q = this.queues.get(player.id);
    if (!q) throw new Error(`No training queue for player ${player.id}`);
    return q;
  }

  optionsFor(player: PlayerState): TrainOption[] {
    return this.options.get(player.id) ?? [];
  }

  /** First living Barracks of the player (soldiers exit there). */
  barracksOf(player: PlayerState): Building | null {
    return this.entities.buildings().find((b) => b.owner === player.id && b.alive && b.spec.type === 'barracks') ?? null;
  }

  /**
   * Composition rule: for every 5 regular soldiers the
   * nation may field one special-forces soldier. Living and queued soldiers count.
   */
  ratio(player: PlayerState): ArmyRatio {
    let regular = 0;
    let special = 0;
    let presidentTaken = false;
    const count = (tier: UnitTier): void => {
      if (tier === 'special') special++;
      else if (tier === 'regular') regular++;
      else if (tier === 'president') presidentTaken = true;
    };
    for (const u of this.entities.units()) if (u.owner === player.id && u.alive) count(u.tier);
    for (const t of this.queue(player).items) count(t);
    return { regular, special, presidentTaken, specialCap: specialCapFor(regular) };
  }

  /** Adds a soldier to the queue (special forces only within the 5:3 ratio). */
  enqueue(player: PlayerState, tier: UnitTier): EnqueueResult {
    const q = this.queue(player);
    if (!this.barracksOf(player)) return 'noBarracks';
    if (q.items.length >= TRAINING_QUEUE_MAX) return 'full';
    if (tier === 'special') {
      const r = this.ratio(player);
      if (r.special + 1 > r.specialCap) return 'ratio';
    }
    if (tier === 'president' && this.ratio(player).presidentTaken) return 'unique';
    q.items.push(tier);
    if (q.state === 'idle') q.state = 'training';
    return 'ok';
  }

  /** Removes the last queued soldier of `tier`; refunds if it was the one in training. */
  cancelOne(player: PlayerState, tier: UnitTier): boolean {
    const q = this.queue(player);
    const i = q.items.lastIndexOf(tier);
    if (i < 0) return false;
    this.removeAt(player, i);
    // Dropping a regular may break the ratio: drop the newest queued specials too.
    while (this.ratio(player).special > this.ratio(player).specialCap) {
      const s = q.items.lastIndexOf('special');
      if (s < 0) break;
      this.removeAt(player, s);
    }
    if (q.items.length === 0) q.state = 'idle';
    return true;
  }

  /** Removes queue item `i`, refunding the paid amount if it was in training. */
  private removeAt(player: PlayerState, i: number): void {
    const q = this.queue(player);
    q.items.splice(i, 1);
    if (i === 0) {
      player.credits += q.paid;
      q.paid = 0;
      q.progress = 0;
    }
  }

  update(dt: number): void {
    for (const p of this.players) {
      const q = this.queue(p);
      const tier = q.items[0];
      if (!tier) {
        q.state = 'idle';
        continue;
      }
      const barracks = this.barracksOf(p);
      if (!barracks) {
        q.state = 'noBarracks';
        continue;
      }
      // Losses can break the 5:3 ratio after queueing: hold the special until it is legal again.
      if (tier === 'special') {
        const r = this.ratio(p);
        if (r.special > r.specialCap) {
          q.state = 'ratio';
          continue;
        }
      }
      const option = this.optionsFor(p).find((o) => o.tier === tier);
      if (!option) continue;
      const want = Math.min((option.cost / option.trainSeconds) * dt, option.cost - q.paid);
      const pay = Math.max(0, Math.min(want, p.credits));
      p.credits -= pay;
      q.paid += pay;
      q.progress = Math.min(1, q.paid / option.cost);
      q.state = pay < want - 1e-6 ? 'onHold' : 'training';
      if (q.progress >= 1) {
        q.items.shift();
        q.paid = 0;
        q.progress = 0;
        q.state = q.items.length > 0 ? 'training' : 'idle';
        this.spawn(p, tier, barracks);
      }
    }
  }
}
