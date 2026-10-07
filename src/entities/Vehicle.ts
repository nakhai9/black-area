import {
  CELL_SIZE,
  TRANSPORT_MIXED_SOLDIERS,
  TRANSPORT_SOLDIERS,
  TRANSPORT_VEHICLES,
  VEHICLE_BASE,
  VEHICLE_WEAPON,
  WEAPONS,
  isAircraftKind,
} from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId, VehicleKind, VehicleProfile, WorldPoint } from '../types';
import { Unit } from './Unit';

/**
 * Where an aircraft is in its sortie:
 * parked on the apron → taxiing to the runway → take-off roll → airborne →
 * approach → landing roll → taxiing back to its parking spot. A transport
 * that reaches its drop-off point sets down there ('unloading') and lifts off again; an empty one stays
 * 'landed' on the spot to take passengers on board ('liftoff' to leave again).
 */
export type Flight = 'parked' | 'taxi' | 'takeoff' | 'airborne' | 'approach' | 'landing' | 'taxiHome' | 'crashing' | 'unloading' | 'landed' | 'liftoff';

/**
 * What a carrier (transport) is doing with its passengers, RA2 style:
 * idle (empty) → loading (units walking up to climb aboard) → carrying → unloading (they step out one by one).
 */
export type CarrierState = 'idle' | 'loading' | 'carrying' | 'unloading';

/** Cruise height of an aircraft above the ground (world px, drawn offset). */
import { CRUISE_ALTITUDE } from '../constants';
export { CRUISE_ALTITUDE };

/** Handling per vehicle kind: seconds to full speed, turn rate (rad/s), whether it must face where it drives. */
const HANDLING: Readonly<Record<VehicleKind, { accel: number; turn: number; pivot: boolean }>> = {
  light: { accel: 0.5, turn: 5, pivot: true },
  tank: { accel: 0.9, turn: 2.4, pivot: true },
  ifv: { accel: 0.7, turn: 3.2, pivot: true },
  jet: { accel: 0.6, turn: 2.2, pivot: false },
  transport: { accel: 0.9, turn: 1.6, pivot: false },
};

/** Can `soldiers` soldiers and `vehicles` vehicles travel together in one transport? */
function transportFits(soldiers: number, vehicles: number): boolean {
  if (vehicles === 0) return soldiers <= TRANSPORT_SOLDIERS;
  if (vehicles === 1) return soldiers <= TRANSPORT_MIXED_SOLDIERS;
  return vehicles <= TRANSPORT_VEHICLES && soldiers === 0;
}

/** A land vehicle (light car, tank, armoured vehicle) or an aircraft (fighter, transport). */
export class Vehicle extends Unit {
  readonly profile: VehicleProfile;
  readonly speed: number;
  readonly radius: number;
  readonly bodyHeight: number;
  /** Price paid for it (faction cost applied): the yardstick for veteran ranks. */
  readonly value: number;

  // ---- aircraft state
  flight: Flight = 'airborne';
  /** Height above the ground in px: 0 on the ground, CRUISE_ALTITUDE in the air. */
  altitude = 0;
  /** Airfield this aircraft belongs to, and its parking spot there. */
  homeId: number | null = null;
  slot = -1;
  /** Seconds into the current take-off / landing roll (or the unloading stop). */
  phaseTime = 0;
  /** Seconds the aircraft has had nothing to do while airborne. */
  idleFor = 0;
  /** Seconds since the last repair tick while parked at its airfield. */
  repairClock = 0;
  /** Draw-order override while on its airfield: drawn right after the airfield so it is not hidden behind it. */
  drawDepth: number | null = null;
  /** Orders given while it was busy on the ground; carried out once it is airborne. */
  mission: WorldPoint[] | null = null;
  /** Transport only: where it sets down to unload / wait for passengers. */
  dropSpot: WorldPoint | null = null;
  /** Transport only: set down empty to pick units up (stays landed until ordered away). */
  pickup = false;
  /** Seconds a landed, empty transport has waited for nobody. */
  landedIdle = 0;
  /** Transport only: on its way back to the airfield — does not set down again on the way. */
  returningHome = false;
  /** Transport only: soldiers and vehicles aboard (hidden from the map while inside). */
  readonly cargo: Unit[] = [];
  /** Transport only: units on their way to climb aboard (recounted every tick). */
  incoming = 0;
  /** Transport only: standing on the ground and letting its passengers out one by one. */
  ejecting = false;
  /** Seconds until the next passenger steps out while ejecting. */
  ejectClock = 0;

  constructor(
    owner: number,
    faction: FactionId,
    readonly type: VehicleKind,
    at: WorldPoint,
  ) {
    const f = FACTIONS[faction];
    const base = VEHICLE_BASE[type];
    super(owner, faction, at, Math.round(base.maxHp * f.stats.armor));
    this.profile = f.vehicles[type];
    this.speed = base.speed * f.stats.unitSpeed * CELL_SIZE;
    this.radius = base.radius;
    this.value = Math.round((base.cost * f.stats.cost) / 10) * 10;
    this.bodyHeight = isAircraftKind(type) ? 7 : 1.8;
    const weapon = VEHICLE_WEAPON[type];
    if (weapon) {
      const spec = WEAPONS[weapon];
      this.weapon = { ...spec, damage: spec.damage * f.stats.firepower, range: spec.range * f.stats.range };
    }
    const h = HANDLING[type];
    this.accelTime = h.accel;
    this.turnRate = h.turn;
    this.turnsToMove = h.pivot;
    if (isAircraftKind(type)) this.altitude = CRUISE_ALTITUDE;
  }

  /** In the air: cruising or on the final approach. */
  override get flies(): boolean {
    return this.aircraft && (this.flight === 'airborne' || this.flight === 'approach' || this.flight === 'crashing');
  }

  override get aircraft(): boolean {
    return isAircraftKind(this.type);
  }

  /** Parked, taxiing, rolling for take-off or landing: moved by the AircraftSystem, never shoved. */
  override get fixed(): boolean {
    return this.aircraft && !this.flies;
  }

  override get unarmedTransport(): boolean {
    return this.isTransport;
  }

  override get canFight(): boolean {
    if (this.isTransport) return false;
    return !this.aircraft ||(this.flight === 'airborne' && this.weapon !== null);
  }

  override get depth(): number {
    return this.fixed && this.drawDepth !== null ? this.drawDepth : (this.px + this.py) / CELL_SIZE;
  }

  get name(): string {
    return this.profile.name;
  }

  // ---- transport cargo

  get isTransport(): boolean {
    return this.type === 'transport';
  }

  get soldiersAboard(): number {
    return this.cargo.filter((u) => !(u instanceof Vehicle)).length;
  }

  get vehiclesAboard(): number {
    return this.cargo.length - this.soldiersAboard;
  }

  /** May `u` climb aboard right now? Only a transport standing on the ground takes passengers; fighters and transports never do. */
  canLoad(u: Unit): boolean {
    if (!this.isTransport || (this.flight !== 'parked' && this.flight !== 'landed') || !this.alive) return false;
    const vehicle = u instanceof Vehicle;
    if (vehicle && u.aircraft) return false;
    const s = this.soldiersAboard + (vehicle ? 0 : 1);
    const v = this.vehiclesAboard + (vehicle ? 1 : 0);
    return transportFits(s, v);
  }

  /** Soldier seats with the vehicles now aboard (12 alone, 8 beside one vehicle, none beside two or more). */
  get soldierCapacity(): number {
    const v = this.vehiclesAboard;
    return v === 0 ? TRANSPORT_SOLDIERS : v === 1 ? TRANSPORT_MIXED_SOLDIERS : 0;
  }

  /** Vehicle places with the soldiers now aboard (3 when empty of soldiers, 1 beside up to 8 soldiers, else none). */
  get vehicleCapacity(): number {
    const s = this.soldiersAboard;
    return s === 0 ? TRANSPORT_VEHICLES : s <= TRANSPORT_MIXED_SOLDIERS ? 1 : 0;
  }

  /** Idle / loading / carrying / unloading (for the badge and the sidebar). */
  get carrierState(): CarrierState {
    if (!this.isTransport) return 'idle';
    if (this.cargo.length > 0 && (this.ejecting || (this.flight === 'unloading' && !this.pickup))) return 'unloading';
    if (this.incoming > 0 && (this.flight === 'parked' || this.flight === 'landed' || (this.flight === 'unloading' && this.pickup))) return 'loading';
    return this.cargo.length > 0 ? 'carrying' : 'idle';
  }

  /** Would `soldiers` more soldiers and `vehicles` more vehicles still fit beside the current cargo? */
  fitsWith(soldiers: number, vehicles: number): boolean {
    return transportFits(this.soldiersAboard + soldiers, this.vehiclesAboard + vehicles);
  }

  /** Nothing more fits: another soldier and another vehicle would both break the load limits. */
  get full(): boolean {
    const s = this.soldiersAboard;
    const v = this.vehiclesAboard;
    return !transportFits(s + 1, v) && !transportFits(s, v + 1);
  }

  override update(dt: number): void {
    if (this.fixed) {
      // On the airfield the AircraftSystem drives the aircraft; keep the grid position in sync.
      this.x = this.px / CELL_SIZE;
      this.y = this.py / CELL_SIZE;
      return;
    }
    super.update(dt);
  }
}
