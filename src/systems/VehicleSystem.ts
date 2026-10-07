import { AVAILABLE_VEHICLES, BUILD_LIMIT_VEHICLES, MAX_GROUND_VEHICLES, MAX_TRANSPORTS, TECH_VEHICLES, VEHICLE_BASE, isAircraftKind } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { FACTIONS } from '../factions';
import type { BuildingType, FactionId, PlayerState, VehicleKind } from '../types';
import { PARKING_SLOTS } from './AircraftSystem';
import type { GameSystem } from './GameSystem';

/** A vehicle or aircraft as offered on the Vehicles tab. */
export interface VehicleOption {
  kind: VehicleKind;
  name: string;
  description: string;
  cost: number;
  trainSeconds: number;
  /** Where it is built: the War Factory for ground vehicles, the Airfield for aircraft. */
  requires: BuildingType;
  /** Aircraft: built (and parked) at an Airfield; no War Factory involved. */
  needsAirfield: boolean;
}

const KINDS: readonly VehicleKind[] = ['light', 'tank', 'ifv', 'jet', 'transport'];

function vehicleOptions(faction: FactionId): VehicleOption[] {
  const f = FACTIONS[faction];
  return KINDS.filter((kind) => AVAILABLE_VEHICLES.includes(kind)).map((kind) => ({
    kind,
    name: f.vehicles[kind].name,
    description: f.vehicles[kind].description,
    cost: Math.round((VEHICLE_BASE[kind].cost * f.stats.cost) / 10) * 10,
    trainSeconds: VEHICLE_BASE[kind].trainSeconds + f.stats.trainDelay,
    requires: isAircraftKind(kind) ? 'airfield' : 'warFactory',
    needsAirfield: isAircraftKind(kind),
  }));
}

export type VehicleQueueState = 'idle' | 'building' | 'onHold' | 'noFactory' | 'noAirfield' | 'noPower';
export type VehicleEnqueueResult = 'ok' | 'full' | 'noFactory' | 'noAirfield' | 'noParking' | 'tech' | 'cap' | 'transportCap';

export interface VehicleQueue {
  /** Waiting vehicles; the first one is in production. */
  items: VehicleKind[];
  state: VehicleQueueState;
  /** 0..1 progress of the first item. */
  progress: number;
  /** TB paid so far for the first item. */
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
    private readonly spawn: (player: PlayerState, kind: VehicleKind, producer: Building) => void,
  ) {
    for (const p of players) {
      this.queues.set(p.id, { items: [], state: 'idle', progress: 0, paid: 0 });
      this.options.set(p.id, vehicleOptions(p.faction));
    }
  }

  queue(player: PlayerState): VehicleQueue {
    const q = this.queues.get(player.id);
    if (!q) throw new Error(`No vehicle queue for player ${player.id}`);
    return q;
  }

  optionsFor(player: PlayerState): VehicleOption[] {
    return this.options.get(player.id) ?? [];
  }

  /** First living building of `type` owned by the player. */
  producerOf(player: PlayerState, type: BuildingType): Building | null {
    return this.entities.buildings().find((b) => b.owner === player.id && b.alive && b.spec.type === type) ?? null;
  }

  /** Why `kind` cannot be ordered right now (ground vehicle without a War Factory / aircraft without an Airfield), or null. */
  private missingBuilding(player: PlayerState, kind: VehicleKind): 'noFactory' | 'noAirfield' | null {
    if (isAircraftKind(kind)) {
      if (!this.producerOf(player, 'airfield')) return 'noAirfield';
    } else if (!this.producerOf(player, 'warFactory')) return 'noFactory';
    return null;
  }

  /** Where the finished machine appears: the War Factory for vehicles, an Airfield for aircraft. */
  private deliveryPoint(player: PlayerState, kind: VehicleKind): Building | null {
    return this.producerOf(player, isAircraftKind(kind) ? 'airfield' : 'warFactory');
  }

  /** Aircraft parking spots: PARKING_SLOTS per living airfield. */
  parkingCapacity(player: PlayerState): number {
    return this.entities.buildings().filter((b) => b.owner === player.id && b.alive && b.spec.type === 'airfield').length * PARKING_SLOTS;
  }


  /**
   * Parking spots still free for new aircraft orders: spots on the nation's airfields minus the aircraft it owns
   * (parked or flying) and the aircraft already on order. A destroyed aircraft gives its spot back.
   */
  parkingFree(player: PlayerState): number {
    return this.parkingCapacity(player) - this.aircraftOwned(player) - this.queue(player).items.filter(isAircraftKind).length;
  }

  private aircraftOwned(player: PlayerState): number {
    return this.entities.vehicles().filter((v) => v.owner === player.id && v.alive && v.aircraft).length;
  }

  /** Second-tier vehicles need a High-Tech Center. */
  hasTech(player: PlayerState): boolean {
    return this.entities.buildings().some((b) => b.owner === player.id && b.alive && b.spec.type === 'techCenter');
  }

  enqueue(player: PlayerState, kind: VehicleKind): VehicleEnqueueResult {
    const q = this.queue(player);
    const missing = this.missingBuilding(player, kind);
    if (missing) return missing;
    if (TECH_VEHICLES.includes(kind) && !this.hasTech(player)) return 'tech';
    // BuildLimit: only the orders waiting are limited, not the vehicles the nation owns.
    if (!AVAILABLE_VEHICLES.includes(kind) || q.items.length >= BUILD_LIMIT_VEHICLES) return 'full';
    if (isAircraftKind(kind) && this.parkingFree(player) <= 0) return 'noParking';
    if (!isAircraftKind(kind) && this.groundCount(player) >= MAX_GROUND_VEHICLES) return 'cap';
    if (kind === 'transport' && this.transportCount(player) >= MAX_TRANSPORTS) return 'transportCap';
    q.items.push(kind);
    if (q.state === 'idle') q.state = 'building';
    return 'ok';
  }

  /** Transport aircraft of the nation: alive ones plus those still on order. */
  transportCount(player: PlayerState): number {
    let n = this.queue(player).items.filter((k) => k === 'transport').length;
    for (const v of this.entities.vehicles()) if (v.owner === player.id && v.alive && v.type === 'transport') n++;
    return n;
  }

  /** Ground vehicles of the nation (alive anywhere, aboard transports too) plus those on order; aircraft excluded. */
  groundCount(player: PlayerState): number {
    let n = this.queue(player).items.filter((k) => !isAircraftKind(k)).length;
    for (const v of this.entities.vehicles()) if (v.owner === player.id && v.alive && !v.aircraft) n++;
    return n;
  }

  /** Removes the last queued vehicle of `kind`; refunds if it was the one in production. */
  cancelOne(player: PlayerState, kind: VehicleKind): boolean {
    const q = this.queue(player);
    const i = q.items.lastIndexOf(kind);
    if (i < 0) return false;
    q.items.splice(i, 1);
    if (i === 0) {
      player.credits += q.paid;
      q.paid = 0;
      q.progress = 0;
    }
    if (q.items.length === 0) q.state = 'idle';
    return true;
  }

  update(dt: number): void {
    for (const p of this.players) {
      const q = this.queue(p);
      const kind = q.items[0];
      if (!kind) {
        q.state = 'idle';
        continue;
      }
      // Its War Factory / Airfield is gone (destroyed meanwhile): the order waits, unpaid.
      const missing = this.missingBuilding(p, kind);
      const producer = this.deliveryPoint(p, kind);
      if (missing || !producer) {
        q.state = missing ?? 'noFactory';
        continue;
      }
      // Without a High-Tech Center (destroyed meanwhile) second-tier vehicles wait, unpaid.
      if (TECH_VEHICLES.includes(kind) && !this.hasTech(p)) {
        q.state = 'onHold';
        continue;
      }
      // Factories and airfields do not run without power.
      if (p.powerShort) {
        q.state = 'noPower';
        continue;
      }
      const option = this.optionsFor(p).find((o) => o.kind === kind);
      if (!option) continue;
      const want = Math.min((option.cost / option.trainSeconds) * dt, option.cost - q.paid);
      const pay = Math.max(0, Math.min(want, p.credits));
      p.credits -= pay;
      q.paid += pay;
      q.progress = Math.min(1, q.paid / option.cost);
      q.state = pay < want - 1e-6 ? 'onHold' : 'building';
      if (q.progress >= 1) {
        q.items.shift();
        q.paid = 0;
        q.progress = 0;
        q.state = q.items.length > 0 ? 'building' : 'idle';
        this.spawn(p, kind, producer);
      }
    }
  }
}
