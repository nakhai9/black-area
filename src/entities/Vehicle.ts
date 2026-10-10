import {
  CELL_SIZE,
  TRANSPORT_MIXED_SOLDIERS,
  TRANSPORT_SOLDIERS,
  TRANSPORT_VEHICLES,
  HELI_SOLDIERS,
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
import { TURBO_MULT, AIR_BOOST_FAR_CELLS, AIR_BOOST_NEAR_CELLS, AIR_SPEED_SCALE, GROUND_SPEED_SCALE, BOMBER_BOMBS, BOMB_LOAD_SLOWDOWN, CRUISE_ALTITUDE, JET_BOMBS, TRUCK_SOLDIERS, TRUCK_TANKS } from '../constants';
export { CRUISE_ALTITUDE };

/** Handling per vehicle kind: seconds to full speed, turn rate (rad/s), whether it must face where it drives. */
const HANDLING: Readonly<Record<VehicleKind, { accel: number; turn: number; pivot: boolean }>> = {
  light: { accel: 0.5, turn: 5, pivot: true },
  tank: { accel: 0.9, turn: 2.4, pivot: true },
  ifv: { accel: 0.7, turn: 3.2, pivot: true },
  jet: { accel: 0.6, turn: 2.2, pivot: false },
  heli: { accel: 0.7, turn: 2.8, pivot: false },
  transport: { accel: 0.9, turn: 1.6, pivot: false },
  tanker: { accel: 0.8, turn: 2.2, pivot: false },
  bomber: { accel: 1.0, turn: 1.4, pivot: false },
  repair: { accel: 1.0, turn: 2.0, pivot: true },
  truck: { accel: 0.6, turn: 3.0, pivot: true },
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
  /** Top speed empty (world px/s). */
  readonly baseSpeed: number;
  /** Top speed now: an aircraft carrying bombs flies slower, by its share of a full load (see BOMB_LOAD_SLOWDOWN). */
  get speed(): number {
    return this.fieldSpeed * this.cruiseBoost() * (this.turboLeft > 0 && this.flight === 'airborne' ? TURBO_MULT : 1);
  }
  /** Turbo: seconds of it left (0 = off), and how far it has recharged since it was last used (0..1, 1 = ready). */
  turboLeft = 0;
  turboCharge = 1;
  get turboReady(): boolean {
    return this.aircraft && this.turboLeft <= 0 && this.turboCharge >= 1;
  }
  /** Top speed without the long-haul boost: on the runway, circling, falling, and close to where it is going. */
  get fieldSpeed(): number {
    const max = this.maxBombs;
    return max > 0 && this.bombs > 0 ? this.baseSpeed * (1 - BOMB_LOAD_SLOWDOWN * (this.bombs / max)) : this.baseSpeed;
  }
  /**
   * Long-haul boost of an aircraft in the air: normal speed within AIR_BOOST_NEAR_CELLS of its destination, rising to
   * AIR_SPEED_SCALE from AIR_BOOST_FAR_CELLS out — it crosses oceans fast but slows down where the action is.
   */
  /** Lowest boost allowed right now (an escort keeps pace with the aircraft it guards); 1 otherwise. */
  boostFloor = 1;
  private cruiseBoost(): number {
    if (!this.aircraft || this.flight !== 'airborne') return 1;
    if (!this.destination) return this.boostFloor;
    const d = Math.hypot(this.destination.x - this.px, this.destination.y - this.py) / CELL_SIZE;
    const t = Math.min(1, Math.max(0, (d - AIR_BOOST_NEAR_CELLS) / (AIR_BOOST_FAR_CELLS - AIR_BOOST_NEAR_CELLS)));
    return Math.max(this.boostFloor, 1 + (AIR_SPEED_SCALE - 1) * t * t);
  }
  readonly radius: number;
  readonly bodyHeight: number;
  /** Price paid for it (faction cost applied): the yardstick for veteran ranks. */
  readonly value: number;

  // ---- aircraft state
  flight: Flight = 'airborne';
  /** Height above the ground in px: 0 on the ground, CRUISE_ALTITUDE in the air. */
  altitude = 0;
  /** 0..1: how far it has climbed above cruise height to pass over another aircraft head-on. */
  climb = 0;
  /** Airfield this aircraft belongs to, and its parking spot there. */
  homeId: number | null = null;
  slot = -1;
  /** Comes in to land from the runway's far end (flying against the take-off direction). */
  landReverse = false;
  /** Takes off from the runway's far end (against the usual direction) because the near end is jammed. */
  takeoffReverse = false;
  /** Parked aircraft sent to another airfield of its nation: it takes off, then lands there (airfield id). */
  transferTo: number | null = null;
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
  /** Bombers and fighters: bombs left aboard (refilled on the airfield's apron, paid per bomb). */
  bombs = 0;
  /** Bomber only: time towards loading the next bomb on the apron. */
  rearmClock = 0;
  /** Transport only: soldiers and vehicles aboard (hidden from the map while inside). */
  readonly cargo: Unit[] = [];
  /** Transport only: units on their way to climb aboard (recounted every tick). */
  incoming = 0;
  /** Transport only: standing on the ground and letting its passengers out one by one. */
  ejecting = false;
  /** Seconds until the next passenger steps out while ejecting. */
  ejectClock = 0;
  /** Transport: fuel left (0..1), it falls out of the sky at 0. Tanker: load left to hand over (0..1). */
  fuel = 1;
  /** Transport only: id of its escorting tanker. */
  tankerId: number | null = null;
  /** Aircraft: the pilot has already called mayday (going down, or badly hit in the air). */
  maydaySent = false;
  /** Fighter only: own transport / tanker / bomber it flies guard on (GUARD_TRAIL_CELLS behind it), or null. */
  guardId: number | null = null;
  /** Tanker only: id of the transport it escorts and refuels. */
  escortOf: number | null = null;
  /** Repair vehicle only: id of the friendly ground vehicle it was ordered to mend, or null. */
  repairTargetId: number | null = null;
  /** Repair vehicle only: seconds towards the next repair tick on its target. */
  mendClock = 0;
  /** Repair vehicle only: game time of its last route re-plan while following the target. */
  mendRepathAt = 0;
  /** Damaged ground vehicle sent to a repair vehicle: id of that repair vehicle, or null. */
  seekRepairId: number | null = null;
  /** Seconds towards the next repair tick while it is alongside the repair vehicle it was sent to. */
  patientClock = 0;
  /** Game time of its last route re-plan towards that repair vehicle. */
  seekRepathAt = 0;
  /** Repair vehicle only: alongside its target and working on it right now (drives the crane animation). */
  mending = false;
  /** Seconds left of a scramble: shot at while parked, it took off and circles away from danger until 0. */
  scramble = 0;

  constructor(
    owner: number,
    faction: FactionId,
    readonly type: VehicleKind,
    at: WorldPoint,
  ) {
    const f = FACTIONS[faction];
    const base = VEHICLE_BASE[type];
    super(owner, faction, at, Math.round(base.maxHp * f.stats.armor));
    this.profile = f.vehicles[type] ?? { name: type, description: '' };
    // Aircraft get their long-haul boost in flight (cruiseBoost); ground vehicles move GROUND_SPEED_SCALE faster.
    this.baseSpeed = base.speed * f.stats.unitSpeed * CELL_SIZE * (isAircraftKind(type) ? 1 : GROUND_SPEED_SCALE);
    this.radius = base.radius;
    this.value = Math.round((base.cost * f.stats.cost) / 10) * 10;
    // Aircraft art is flat seen from above: its bars and marks sit just over the fuselage, not high above it.
    this.bodyHeight = isAircraftKind(type) ? 2.2 : 1.8;
    const weapon = VEHICLE_WEAPON[type];
    if (weapon) {
      const spec = WEAPONS[weapon];
      this.weapon = { ...spec, damage: spec.damage * f.stats.firepower, range: spec.range * f.stats.range };
    }
    this.bombs = this.maxBombs;
    const h = HANDLING[type];
    this.accelTime = h.accel;
    this.turnRate = h.turn;
    this.turnsToMove = h.pivot;
    this.drivesForward = true;
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
    return this.isTransport || this.isTanker || this.isTruck;
  }

  /** Bombs a full load holds: the bomber's payload, a fighter's pair, none for anything else. */
  get maxBombs(): number {
    return this.type === 'bomber' ? BOMBER_BOMBS : this.type === 'jet' ? JET_BOMBS : 0;
  }

  get isTanker(): boolean {
    return this.type === 'tanker';
  }

  /** Armoured recovery vehicle: unarmed, mends friendly ground vehicles. */
  get isRepair(): boolean {
    return this.type === 'repair';
  }

  /** Army truck: unarmed ground carrier (soldiers, or one tank). */
  /** Attack helicopter: lands and waits anywhere on open ground, like a vehicle parks; needs no airfield after it is built. */
  get isHeli(): boolean {
    return this.type === 'heli';
  }

  get isTruck(): boolean {
    return this.type === 'truck';
  }

  override get canFight(): boolean {
    if (this.isTransport || this.isTanker || this.isRepair || this.isTruck) return false;
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

  /** Takes passengers: a transport aircraft, a helicopter (soldiers only), or an army truck on the ground. */
  get isCarrier(): boolean {
    return this.isTransport || this.isHeli || this.isTruck;
  }

  /** Standing where riders can climb in: a truck always (it stops for them), an aircraft only on the ground. */
  get boardable(): boolean {
    return this.isTruck || this.flight === 'parked' || this.flight === 'landed';
  }

  /** Could this unit ride in this carrier at all? A truck takes soldiers and tanks only; nothing carries aircraft. */
  accepts(u: Unit): boolean {
    if (!(u instanceof Vehicle)) return true;
    if (u.aircraft) return false;
    if (this.isHeli) return false;
    return !this.isTruck || u.type === 'tank';
  }

  get soldiersAboard(): number {
    return this.cargo.filter((u) => !(u instanceof Vehicle)).length;
  }

  get vehiclesAboard(): number {
    return this.cargo.length - this.soldiersAboard;
  }

  /** May `u` climb aboard right now? Only a transport standing on the ground takes passengers; fighters and transports never do. */
  canLoad(u: Unit): boolean {
    if (!this.isCarrier || !this.boardable || !this.alive || !this.accepts(u)) return false;
    const vehicle = u instanceof Vehicle;
    const s = this.soldiersAboard + (vehicle ? 0 : 1);
    const v = this.vehiclesAboard + (vehicle ? 1 : 0);
    return this.loadFits(s, v);
  }

  /** The load limits of this carrier: the truck's (soldiers or one tank) or the transport aircraft's. */
  private loadFits(soldiers: number, vehicles: number): boolean {
    if (this.isTruck) return vehicles === 0 ? soldiers <= TRUCK_SOLDIERS : soldiers === 0 && vehicles <= TRUCK_TANKS;
    if (this.isHeli) return vehicles === 0 && soldiers <= HELI_SOLDIERS;
    return transportFits(soldiers, vehicles);
  }

  /** Soldier seats with the vehicles now aboard (12 alone, 8 beside one vehicle, none beside two or more; a helicopter: 8). */
  get soldierCapacity(): number {
    if (this.isTruck) return this.vehiclesAboard > 0 ? 0 : TRUCK_SOLDIERS;
    if (this.isHeli) return HELI_SOLDIERS;
    const v = this.vehiclesAboard;
    return v === 0 ? TRANSPORT_SOLDIERS : v === 1 ? TRANSPORT_MIXED_SOLDIERS : 0;
  }

  /** Vehicle places with the soldiers now aboard (3 when empty of soldiers, 1 beside up to 8 soldiers, else none; a helicopter: none). */
  get vehicleCapacity(): number {
    if (this.isHeli) return 0;
    if (this.isTruck) return this.soldiersAboard > 0 ? 0 : TRUCK_TANKS;
    const s = this.soldiersAboard;
    return s === 0 ? TRANSPORT_VEHICLES : s <= TRANSPORT_MIXED_SOLDIERS ? 1 : 0;
  }

  /** Idle / loading / carrying / unloading (for the badge and the sidebar). */
  get carrierState(): CarrierState {
    if (!this.isCarrier) return 'idle';
    if (this.cargo.length > 0 && (this.ejecting || (this.flight === 'unloading' && !this.pickup))) return 'unloading';
    if (this.incoming > 0 && (this.boardable || (this.flight === 'unloading' && this.pickup))) return 'loading';
    return this.cargo.length > 0 ? 'carrying' : 'idle';
  }

  /** Would `soldiers` more soldiers and `vehicles` more vehicles still fit beside the current cargo? */
  fitsWith(soldiers: number, vehicles: number): boolean {
    return this.loadFits(this.soldiersAboard + soldiers, this.vehiclesAboard + vehicles);
  }

  /** Nothing more fits: another soldier and another vehicle would both break the load limits. */
  get full(): boolean {
    const s = this.soldiersAboard;
    const v = this.vehiclesAboard;
    return !this.loadFits(s + 1, v) && !this.loadFits(s, v + 1);
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
