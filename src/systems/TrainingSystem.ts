import { demoPrice } from '../core/Demo';
import { BUILD_LIMIT_SOLDIERS, MAX_SOLDIERS, INFANTRY_BASE, TECH_TIERS, eliteCap } from '../constants';
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
function trainOptions(faction: FactionId): TrainOption[] {
  const f = FACTIONS[faction];
  if (f.peaceful) return [];
  return (['regular', 'special', 'engineer', 'demolition', 'squatters'] as const).flatMap((tier) => {
    const profile = f.infantry[tier];
    return profile ? [{ tier, profile }] : [];
  }).map(({ tier, profile }) => ({
    tier,
    name: profile.name,
    description: profile.description,
    cost: demoPrice(Math.round((INFANTRY_BASE[tier].cost * f.stats.cost * (f.stats.infantryCost ?? 1)) / 10) * 10),
    trainSeconds: INFANTRY_BASE[tier].trainSeconds + f.stats.trainDelay,
  }));
}

export type TrainingState = 'idle' | 'training' | 'onHold' | 'noBarracks';

export type EnqueueResult = 'ok' | 'full' | 'noBarracks' | 'tech' | 'ratio' | 'cap' | 'noCapital';

/** Orders waiting (BuildLimit) and the elite ratio. */
export interface ArmyCount {
  /** Soldiers in the training queue, and the most that may wait there. */
  queued: number;
  limit: number;
  /** Regular and elite soldiers alive or on order, and how many elite soldiers the regulars allow (2 per 3). */
  regular: number;
  special: number;
  specialCap: number;
}

export interface TrainingQueue {
  /** Soldiers on order: every one of them trains at the same time (parallel production). */
  items: UnitTier[];
  /** TB paid so far for each order (same index as `items`). */
  paidEach: number[];
  state: TrainingState;
  /** 0..1 progress of the most advanced order. */
  progress: number;
  /** TB paid so far for every order together. */
  paid: number;
}

/** Old saves (one soldier at a time): the paid amount belonged to the first order. */
export function fixPaidEach(q: { items: unknown[]; paidEach?: number[]; paid: number }): void {
  if (Array.isArray(q.paidEach) && q.paidEach.length === q.items.length) return;
  const old = Array.isArray(q.paidEach) ? q.paidEach : [q.paid];
  q.paidEach = q.items.map((_, i) => old[i] ?? 0);
}

/**
 * Infantry production, independent from structure construction. Every soldier on order trains at the same time,
 * each on its own (parallel production); with too little TB the oldest orders are paid first. Requires a Barracks; cost is paid gradually from the
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
      this.queues.set(p.id, { items: [], paidEach: [], state: 'idle', progress: 0, paid: 0 });
      this.options.set(p.id, trainOptions(p.faction));
    }
  }

  queue(player: PlayerState): TrainingQueue {
    const q = this.queues.get(player.id);
    if (!q) throw new Error(`No training queue for player ${player.id}`);
    fixPaidEach(q);
    return q;
  }

  optionsFor(player: PlayerState): TrainOption[] {
    return this.options.get(player.id) ?? [];
  }

  /** First living Barracks of the player (soldiers exit there). */
  barracksOf(player: PlayerState): Building | null {
    const id = player.primaryBuilding?.barracks;
    const primary = id === undefined ? undefined : this.entities.buildings().find((b) => b.id === id && b.owner === player.id && b.alive);
    if (primary) return primary;
    return this.entities.buildings().find((b) => b.owner === player.id && b.alive && b.spec.type === 'barracks') ?? null;
  }

  /** Second-tier soldiers need a High-Tech Center. */
  hasTech(player: PlayerState): boolean {
    return this.entities.buildings().some((b) => b.owner === player.id && b.alive && b.spec.type === 'techCenter');
  }

  /** Pending orders, and the elite/regular counts. */
  army(player: PlayerState): ArmyCount {
    let regular = 0;
    let special = 0;
    const count = (tier: UnitTier): void => {
      if (tier === 'regular') regular++;
      else if (tier === 'special') special++;
    };
    for (const u of this.entities.units()) if (u.owner === player.id && u.alive) count(u.tier);
    const items = this.queue(player).items;
    for (const t of items) count(t);
    return { queued: items.length, limit: BUILD_LIMIT_SOLDIERS, regular, special, specialCap: eliteCap(regular) };
  }

  /**
   * Adds an order for any soldier type. Only the number of waiting orders is limited (BuildLimit): a new one is
   * accepted as soon as an earlier order has been completed, however many soldiers the nation already has.
   */
  enqueue(player: PlayerState, tier: UnitTier): EnqueueResult {
    const q = this.queue(player);
    if (player.capitalLost) return 'noCapital';
    if (FACTIONS[player.faction].peaceful) return 'full';
    if (!this.barracksOf(player)) return 'noBarracks';
    if (TECH_TIERS.includes(tier) && !this.hasTech(player)) return 'tech';
    if (q.items.length >= BUILD_LIMIT_SOLDIERS) return 'full';
    if (this.soldierCount(player) >= MAX_SOLDIERS) return 'cap';
    const army = this.army(player);
    // Elite soldiers never outnumber the regulars: 2 elite for every 3 regular (alive + already on order).
    if (tier === 'special' && army.special + 1 > army.specialCap) return 'ratio';
    q.items.push(tier);
    q.paidEach.push(0);
    if (q.state === 'idle') q.state = 'training';
    return 'ok';
  }

  /** Soldiers of the nation: alive (in the field, in buildings or aboard) plus those on order. */
  soldierCount(player: PlayerState): number {
    let n = this.queue(player).items.length;
    for (const u of this.entities.units()) if (u.owner === player.id && u.alive) n++;
    return n;
  }

  /** Removes the last queued soldier of `tier`; refunds if it was the one in training. */
  cancelOne(player: PlayerState, tier: UnitTier): boolean {
    const q = this.queue(player);
    const i = q.items.lastIndexOf(tier);
    if (i < 0) return false;
    this.removeAt(player, i);
    // Dropping a regular order may break the 2:3 rule: the newest elite orders that no longer fit go too.
    for (;;) {
      const a = this.army(player);
      const s = q.items.lastIndexOf('special');
      if (a.special <= a.specialCap || s < 0) break;
      this.removeAt(player, s);
    }
    if (q.items.length === 0) q.state = 'idle';
    return true;
  }

  /** Removes queue item `i`, refunding what was paid for it. */
  private removeAt(player: PlayerState, i: number): void {
    const q = this.queue(player);
    player.credits += q.paidEach[i] ?? 0;
    q.items.splice(i, 1);
    q.paidEach.splice(i, 1);
    q.paid = q.paidEach.reduce((s, v) => s + v, 0);
  }

  /** 0..1 progress of the most advanced order of `tier` (0 when none is on order). */
  progressOf(player: PlayerState, tier: UnitTier): number {
    const q = this.queue(player);
    const option = this.optionsFor(player).find((o) => o.tier === tier);
    if (!option) return 0;
    let best = 0;
    q.items.forEach((t, i) => {
      if (t === tier) best = Math.max(best, (q.paidEach[i] ?? 0) / option.cost);
    });
    return Math.min(1, best);
  }

  update(dt: number): void {
    for (const p of this.players) {
      const q = this.queue(p);
      if (q.items.length === 0) {
        q.state = 'idle';
        q.progress = 0;
        q.paid = 0;
        continue;
      }
      const barracks = this.barracksOf(p);
      if (!barracks) {
        q.state = 'noBarracks';
        continue;
      }
      const tech = this.hasTech(p);
      let short = false;
      const done: number[] = [];
      // Every order trains at once; the oldest are paid first when TB runs short.
      q.items.forEach((tier, i) => {
        // Without a High-Tech Center (destroyed meanwhile) second-tier soldiers wait, unpaid.
        if (TECH_TIERS.includes(tier) && !tech) {
          short = true;
          return;
        }
        const option = this.optionsFor(p).find((o) => o.tier === tier);
        if (!option) return;
        const paid = q.paidEach[i] ?? 0;
        const want = Math.min((option.cost / option.trainSeconds) * dt, option.cost - paid);
        const pay = p.capitalLost ? 0 : Math.max(0, Math.min(want, p.credits));
        p.credits -= pay;
        q.paidEach[i] = paid + pay;
        if (pay < want - 1e-6) short = true;
        if (q.paidEach[i]! >= option.cost - 1e-6) done.push(i);
      });
      for (const i of done.reverse()) {
        const tier = q.items[i]!;
        q.items.splice(i, 1);
        q.paidEach.splice(i, 1);
        this.spawn(p, tier, barracks);
      }
      q.paid = q.paidEach.reduce((s, v) => s + v, 0);
      q.progress = q.items.reduce((m, t) => Math.max(m, this.progressOf(p, t)), 0);
      q.state = q.items.length === 0 ? 'idle' : short ? 'onHold' : 'training';
    }
  }
}
