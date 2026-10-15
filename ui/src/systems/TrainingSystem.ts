import { demoPrice } from '../core/Demo';
import { BUILD_LIMIT_SOLDIERS, MAX_SOLDIERS, INFANTRY_BASE, INFANTRY_TRAIN_FACTOR, TECH_TIERS, eliteCap } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { FACTIONS } from '../factions';
import type { FactionId, PlayerState, UnitTier } from '../types';
import type { GameSystem } from './GameSystem';
import { type ForeignKey, splitKey, takenNations } from './Foreign';

/** A soldier order: `tier` (own nation) or `tier@faction` (from a captured foreign Ministry of Defence). */
export type TrainKey = ForeignKey<UnitTier>;

/** A trainable soldier as offered on the Infantry tab. */
export interface TrainOption {
  /** Order key: the tier, or `tier@faction` for another nation's soldier. */
  key: TrainKey;
  tier: UnitTier;
  /** Nation that designed (and trains) the soldier. */
  faction: FactionId;
  name: string;
  description: string;
  cost: number;
  trainSeconds: number;
}

/** Faction-specific infantry options (cost scaled by the faction's cost multiplier). */
function trainOptions(faction: FactionId, foreign = false): TrainOption[] {
  const f = FACTIONS[faction];
  if (f.peaceful) return [];
  return (['regular', 'special', 'engineer', 'demolition', 'squatters'] as const).flatMap((tier) => {
    const profile = f.infantry[tier];
    return profile ? [{ tier, profile }] : [];
  }).map(({ tier, profile }) => ({
    key: foreign ? (`${tier}@${faction}` as TrainKey) : tier,
    tier,
    faction,
    name: profile.name,
    description: profile.description,
    cost: demoPrice(Math.round((INFANTRY_BASE[tier].cost * f.stats.cost * (f.stats.infantryCost ?? 1)) / 10) * 10),
    trainSeconds: (INFANTRY_BASE[tier].trainSeconds + f.stats.trainDelay) * INFANTRY_TRAIN_FACTOR,
  }));
}

/** Another nation's soldiers, as offered to whoever holds one of its Ministries of Defence. */
const FOREIGN = new Map<FactionId, TrainOption[]>();
function foreignOptions(faction: FactionId): TrainOption[] {
  let list = FOREIGN.get(faction);
  if (!list) FOREIGN.set(faction, (list = trainOptions(faction, true)));
  return list;
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
  items: TrainKey[];
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
    private readonly spawn: (player: PlayerState, tier: UnitTier, barracks: Building, faction: FactionId) => void,
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

  /** Own soldiers, then those of every nation whose Ministry of Defence the player has captured. */
  optionsFor(player: PlayerState): TrainOption[] {
    const own = this.options.get(player.id) ?? [];
    const taken = takenNations(this.entities, player, 'barracks');
    return taken.length === 0 || own.length === 0 ? own : [...own, ...taken.flatMap((f) => foreignOptions(f))];
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
    for (const t of items) count(splitKey(t).base);
    return { queued: items.length, limit: BUILD_LIMIT_SOLDIERS, regular, special, specialCap: eliteCap(regular) };
  }

  /**
   * Adds an order for any soldier type. Only the number of waiting orders is limited (BuildLimit): a new one is
   * accepted as soon as an earlier order has been completed, however many soldiers the nation already has.
   */
  enqueue(player: PlayerState, key: TrainKey): EnqueueResult {
    const q = this.queue(player);
    const tier = splitKey(key).base;
    if (player.capitalLost) return 'noCapital';
    if (FACTIONS[player.faction].peaceful) return 'full';
    if (!this.barracksOf(player) || !this.optionsFor(player).some((o) => o.key === key)) return 'noBarracks';
    if (TECH_TIERS.includes(tier) && !this.hasTech(player)) return 'tech';
    if (q.items.length >= BUILD_LIMIT_SOLDIERS) return 'full';
    if (this.soldierCount(player) >= MAX_SOLDIERS) return 'cap';
    const army = this.army(player);
    // Elite soldiers never outnumber the regulars: 2 elite for every 3 regular (alive + already on order).
    if (tier === 'special' && army.special + 1 > army.specialCap) return 'ratio';
    q.items.push(key);
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

  /** Removes the last queued soldier of `key`; refunds if it was the one in training. */
  cancelOne(player: PlayerState, key: TrainKey): boolean {
    const q = this.queue(player);
    const i = q.items.lastIndexOf(key);
    if (i < 0) return false;
    this.removeAt(player, i);
    // Dropping a regular order may break the 2:3 rule: the newest elite orders that no longer fit go too.
    for (;;) {
      const a = this.army(player);
      let s = q.items.length - 1;
      while (s >= 0 && splitKey(q.items[s]!).base !== 'special') s--;
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

  /** 0..1 progress of the most advanced order of `key` (0 when none is on order). */
  progressOf(player: PlayerState, key: TrainKey, options = this.optionsFor(player)): number {
    const q = this.queue(player);
    const option = options.find((o) => o.key === key);
    if (!option) return 0;
    let best = 0;
    q.items.forEach((t, i) => {
      if (t === key) best = Math.max(best, (q.paidEach[i] ?? 0) / option.cost);
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
      const options = this.optionsFor(p);
      // Another nation's soldiers whose captured Ministry of Defence is gone: the order is dropped and refunded.
      for (let i = q.items.length - 1; i >= 0; i--) if (!options.some((o) => o.key === q.items[i])) this.removeAt(p, i);
      let short = false;
      const done: number[] = [];
      // Every order trains at once; the oldest are paid first when TB runs short.
      q.items.forEach((key, i) => {
        const tier = splitKey(key).base;
        // Without a High-Tech Center (destroyed meanwhile) second-tier soldiers wait, unpaid.
        if (TECH_TIERS.includes(tier) && !tech) {
          short = true;
          return;
        }
        const option = options.find((o) => o.key === key);
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
        const { base, faction } = splitKey(q.items[i]!);
        q.items.splice(i, 1);
        q.paidEach.splice(i, 1);
        this.spawn(p, base, barracks, faction ?? p.faction);
      }
      q.paid = q.paidEach.reduce((s, v) => s + v, 0);
      q.progress = q.items.reduce((m, t) => Math.max(m, this.progressOf(p, t, options)), 0);
      q.state = q.items.length === 0 ? 'idle' : short ? 'onHold' : 'training';
    }
  }
}
