import { demoPrice } from '../core/Demo';
import { AVAILABLE_VEHICLES, BUILD_LIMIT_VEHICLES, MAX_GROUND_VEHICLES, MAX_TRANSPORTS, TECH_VEHICLES, VEHICLE_BASE, needsAirfield } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { FACTIONS } from '../factions';
import type { BuildingType, FactionId, PlayerState, VehicleKind } from '../types';
import { PARKING_SLOTS } from './AircraftSystem';
import type { GameSystem } from './GameSystem';
import { fixPaidEach } from './TrainingSystem';
import { type ForeignKey, splitKey, takenNations } from './Foreign';

/** A vehicle order: `kind` (own nation) or `kind@faction` (from a captured foreign War Factory / Airfield). */
export type VehicleKey = ForeignKey<VehicleKind>;

/** A vehicle or aircraft as offered on the Vehicles tab. */
export interface VehicleOption {
  /** Order key: the kind, or `kind@faction` for another nation's machine. */
  key: VehicleKey;
  kind: VehicleKind;
  /** Nation that designed (and builds) the machine. */
  faction: FactionId;
  name: string;
  description: string;
  cost: number;
  trainSeconds: number;
  /** Where it is built: the War Factory for ground vehicles, the Airfield for aircraft. */
  requires: BuildingType;
  /** Aircraft: built (and parked) at an Airfield; no War Factory involved. */
  needsAirfield: boolean;
}

const KINDS: readonly VehicleKind[] = ['light', 'tank', 'ifv', 'jet', 'heli', 'bomber', 'transport', 'repair', 'truck', 'mantis', 'drone'];

function vehicleOptions(faction: FactionId, foreign = false): VehicleOption[] {
  const f = FACTIONS[faction];
  if (f.peaceful) return [];
  // National specials (the bomber) are offered only to the nations that list them.
  return KINDS.filter((kind) => AVAILABLE_VEHICLES.includes(kind) && f.vehicles[kind as keyof typeof f.vehicles]).map((kind) => ({
    key: foreign ? (`${kind}@${faction}` as VehicleKey) : kind,
    kind,
    faction,
    name: f.vehicles[kind as keyof typeof f.vehicles]?.name ?? kind,
    description: f.vehicles[kind as keyof typeof f.vehicles]?.description ?? '',
    cost: demoPrice(Math.round((VEHICLE_BASE[kind].cost * f.stats.cost) / 10) * 10),
    trainSeconds: VEHICLE_BASE[kind].trainSeconds + f.stats.trainDelay,
    requires: needsAirfield(kind) ? 'airfield' : 'warFactory',
    needsAirfield: needsAirfield(kind),
  }));
}

/** Another nation's machines, as offered to whoever holds its War Factory / Airfield. */
const FOREIGN = new Map<FactionId, VehicleOption[]>();
function foreignOptions(faction: FactionId): VehicleOption[] {
  let list = FOREIGN.get(faction);
  if (!list) FOREIGN.set(faction, (list = vehicleOptions(faction, true)));
  return list;
}

export type VehicleQueueState = 'idle' | 'building' | 'onHold' | 'noFactory' | 'noAirfield' | 'noPower' | 'exitBlocked';
export type VehicleEnqueueResult = 'ok' | 'full' | 'noFactory' | 'noAirfield' | 'noParking' | 'tech' | 'cap' | 'transportCap' | 'noCapital';

export interface VehicleQueue {
  /** Vehicles on order: every one of them is built at the same time (parallel production). */
  items: VehicleKey[];
  /** TB paid so far for each order (same index as `items`). */
  paidEach: number[];
  state: VehicleQueueState;
  /** 0..1 progress of the most advanced order. */
  progress: number;
  /** TB paid so far for every order together. */
  paid: number;
}

/**
 * Vehicle and aircraft production: one queue per nation, separate from
 * structures and infantry. Ground vehicles are built at the War Factory, aircraft
 * at the Airfield (the War Factory plays no part in them). Cost is paid
 * gradually from the treasury; a finished vehicle rolls out of the War Factory
 * and a finished aircraft is parked on an Airfield (both via `spawn`).
 */
export class VehicleSystem implements GameSystem {
  private readonly queues = new Map<number, VehicleQueue>();
  private readonly options = new Map<number, VehicleOption[]>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
    private readonly spawn: (player: PlayerState, kind: VehicleKind, producer: Building, faction: FactionId) => void,
    /** Is the War Factory's exit clear for a new ground vehicle? (RA2: a finished vehicle waits while it is blocked.) */
    private readonly exitClear: (producer: Building) => boolean = () => true,
  ) {
    for (const p of players) {
      this.queues.set(p.id, { items: [], paidEach: [], state: 'idle', progress: 0, paid: 0 });
      this.options.set(p.id, vehicleOptions(p.faction));
    }
  }

  queue(player: PlayerState): VehicleQueue {
    const q = this.queues.get(player.id);
    if (!q) throw new Error(`No vehicle queue for player ${player.id}`);
    fixPaidEach(q);
    return q;
  }

  /**
   * Own machines, then another nation's: its ground vehicles from a captured War Factory of that nation, its aircraft
   * from a captured Airfield of that nation.
   */
  optionsFor(player: PlayerState): VehicleOption[] {
    const own = this.options.get(player.id) ?? [];
    if (own.length === 0) return own;
    const ground = takenNations(this.entities, player, 'warFactory');
    const air = takenNations(this.entities, player, 'airfield');
    if (ground.length === 0 && air.length === 0) return own;
    const foreign = [...new Set([...ground, ...air])].sort().flatMap((f) =>
      foreignOptions(f).filter((o) => (o.needsAirfield ? air : ground).includes(f)),
    );
    return [...own, ...foreign];
  }

  /** First living building of `type` owned by the player. */
  producerOf(player: PlayerState, type: BuildingType): Building | null {
    const id = player.primaryBuilding?.[type];
    const primary = id === undefined ? undefined : this.entities.buildings().find((b) => b.id === id && b.owner === player.id && b.alive && b.spec.type === type);
    if (primary) return primary;
    return this.entities.buildings().find((b) => b.owner === player.id && b.alive && b.spec.type === type) ?? null;
  }

  /** Why `kind` cannot be ordered right now (ground vehicle without a War Factory / aircraft without an Airfield), or null. */
  private missingBuilding(player: PlayerState, kind: VehicleKind): 'noFactory' | 'noAirfield' | null {
    if (needsAirfield(kind)) {
      if (!this.producerOf(player, 'airfield')) return 'noAirfield';
    } else if (!this.producerOf(player, 'warFactory')) return 'noFactory';
    return null;
  }

  /** Where the finished machine appears: the War Factory for vehicles, an Airfield for aircraft. */
  private deliveryPoint(player: PlayerState, kind: VehicleKind): Building | null {
    return this.producerOf(player, needsAirfield(kind) ? 'airfield' : 'warFactory');
  }

  /** Aircraft parking spots: PARKING_SLOTS per living airfield. */
  parkingCapacity(player: PlayerState): number {
    return this.entities.buildings().filter((b) => b.owner === player.id && b.alive && b.spec.type === 'airfield').length * PARKING_SLOTS;
  }


  /**
   * Parking spots still free for new aircraft orders: spots on the nation's airfields minus the aircraft it owns
   * (parked or flying) and the aircraft already on order. A destroyed aircraft gives its spot back.
   */
  /** Free parking spots (helicopters take none: they land wherever they like). */
  parkingFree(player: PlayerState): number {
    const ordered = this.queue(player).items.reduce((n, key) => {
      const k = splitKey(key).base;
      return n + (needsAirfield(k) && k !== 'heli' ? 1 : 0);
    }, 0);
    return this.parkingCapacity(player) - this.aircraftOwned(player) - ordered;
  }

  private aircraftOwned(player: PlayerState): number {
    return this.entities.vehicles().filter((v) => v.owner === player.id && v.alive && needsAirfield(v.type) && v.type !== 'heli').length;
  }

  /** Second-tier vehicles need a High-Tech Center. */
  hasTech(player: PlayerState): boolean {
    return this.entities.buildings().some((b) => b.owner === player.id && b.alive && b.spec.type === 'techCenter');
  }

  enqueue(player: PlayerState, key: VehicleKey): VehicleEnqueueResult {
    if (player.capitalLost) return 'noCapital';
    if (FACTIONS[player.faction].peaceful) return 'full';
    const q = this.queue(player);
    const kind = splitKey(key).base;
    const missing = this.missingBuilding(player, kind);
    if (missing) return missing;
    if (!this.optionsFor(player).some((o) => o.key === key)) return needsAirfield(kind) ? 'noAirfield' : 'noFactory';
    if (TECH_VEHICLES.includes(kind) && !this.hasTech(player)) return 'tech';
    // BuildLimit: only the orders waiting are limited, not the vehicles the nation owns.
    if (!AVAILABLE_VEHICLES.includes(kind) || q.items.length >= BUILD_LIMIT_VEHICLES) return 'full';
    if (needsAirfield(kind) && kind !== 'heli' && this.parkingFree(player) < (kind === 'transport' || kind === 'drone' ? 2 : 1)) return 'noParking';
    if (!needsAirfield(kind) && this.groundCount(player) >= MAX_GROUND_VEHICLES) return 'cap';
    if (kind === 'transport' && this.transportCount(player) >= MAX_TRANSPORTS) return 'transportCap';
    q.items.push(key);
    q.paidEach.push(0);
    if (q.state === 'idle') q.state = 'building';
    return 'ok';
  }

  /** Transport aircraft of the nation: alive ones plus those still on order. */
  transportCount(player: PlayerState): number {
    let n = this.queue(player).items.filter((k) => splitKey(k).base === 'transport').length;
    for (const v of this.entities.vehicles()) if (v.owner === player.id && v.alive && v.type === 'transport') n++;
    return n;
  }

  /** Ground vehicles of the nation (alive anywhere, aboard transports too) plus those on order; airfield aircraft excluded. */
  groundCount(player: PlayerState): number {
    let n = this.queue(player).items.filter((k) => !needsAirfield(splitKey(k).base)).length;
    for (const v of this.entities.vehicles()) if (v.owner === player.id && v.alive && !needsAirfield(v.type)) n++;
    return n;
  }

  /** Removes the last queued vehicle of `key`, refunding what was paid for it. */
  cancelOne(player: PlayerState, key: VehicleKey): boolean {
    const q = this.queue(player);
    const i = q.items.lastIndexOf(key);
    if (i < 0) return false;
    this.removeAt(player, i);
    return true;
  }

  /** Removes queue item `i`, refunding what was paid for it. */
  private removeAt(player: PlayerState, i: number): void {
    const q = this.queue(player);
    player.credits += q.paidEach[i] ?? 0;
    q.items.splice(i, 1);
    q.paidEach.splice(i, 1);
    q.paid = q.paidEach.reduce((s, v) => s + v, 0);
    if (q.items.length === 0) q.state = 'idle';
  }

  /** 0..1 progress of the most advanced order of `key` (0 when none is on order). */
  progressOf(player: PlayerState, key: VehicleKey, options = this.optionsFor(player)): number {
    const q = this.queue(player);
    const option = options.find((o) => o.key === key);
    if (!option) return 0;
    let best = 0;
    q.items.forEach((k, i) => {
      if (k === key) best = Math.max(best, (q.paidEach[i] ?? 0) / option.cost);
    });
    return Math.min(1, best);
  }

  /** Why the orders of `kind` are stuck right now (no producer, no tech), or null. */
  private blocked(player: PlayerState, kind: VehicleKind): VehicleQueueState | null {
    const missing = this.missingBuilding(player, kind);
    if (missing || !this.deliveryPoint(player, kind)) return missing ?? 'noFactory';
    // Without a High-Tech Center (destroyed meanwhile) second-tier vehicles wait, unpaid.
    if (TECH_VEHICLES.includes(kind) && !this.hasTech(player)) return 'onHold';
    return null;
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
      const options = this.optionsFor(p);
      // Another nation's machines whose captured War Factory / Airfield is gone: the order is dropped and refunded.
      for (let i = q.items.length - 1; i >= 0; i--) if (!options.some((o) => o.key === q.items[i])) this.removeAt(p, i);
      let state: VehicleQueueState | null = null;
      let short = false;
      const done: number[] = [];
      // Every order is built at once; the oldest are paid first when TB runs short. Power no longer stops production.
      q.items.forEach((key, i) => {
        const stuck = this.blocked(p, splitKey(key).base);
        if (stuck) {
          state ??= stuck;
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
      // Finished machines come out; at a War Factory only one rolls out at a time, the next waits for a clear exit (RA2).
      const outOf = new Set<number>();
      let blockedExit = false;
      for (const i of done) {
        const { base: kind, faction } = splitKey(q.items[i]!);
        const producer = this.deliveryPoint(p, kind);
        if (!producer) continue;
        if (!needsAirfield(kind) && (outOf.has(producer.id) || !this.exitClear(producer))) {
          blockedExit = true;
          continue;
        }
        if (!needsAirfield(kind)) outOf.add(producer.id);
        this.spawn(p, kind, producer, faction ?? p.faction);
        q.items[i] = undefined as unknown as VehicleKey;
      }
      for (let i = q.items.length - 1; i >= 0; i--) {
        if (q.items[i] !== undefined) continue;
        q.items.splice(i, 1);
        q.paidEach.splice(i, 1);
      }
      q.paid = q.paidEach.reduce((s, v) => s + v, 0);
      q.progress = q.items.reduce((m, k) => Math.max(m, this.progressOf(p, k, options)), 0);
      q.state = q.items.length === 0 ? 'idle' : blockedExit ? 'exitBlocked' : (state ?? (short ? 'onHold' : 'building'));
    }
  }
}
