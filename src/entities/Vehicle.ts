import { CELL_SIZE, VEHICLE_BASE, VEHICLE_WEAPON, WEAPONS } from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId, VehicleKind, VehicleProfile, WorldPoint } from '../types';
import { Unit } from './Unit';

/**
 * Where an aircraft is in its sortie:
 * parked on the apron → taxiing to the runway → take-off roll → airborne →
 * approach → landing roll → taxiing back to its parking spot.
 */
export type Flight = 'parked' | 'taxi' | 'takeoff' | 'airborne' | 'approach' | 'landing' | 'taxiHome' | 'crashing';

/** Cruise height of an aircraft above the ground (world px, drawn offset). */
export const CRUISE_ALTITUDE = 7;

/** Handling per vehicle kind: seconds to full speed, turn rate (rad/s), whether it must face where it drives. */
const HANDLING: Readonly<Record<VehicleKind, { accel: number; turn: number; pivot: boolean }>> = {
  light: { accel: 0.5, turn: 5, pivot: true },
  tank: { accel: 0.9, turn: 2.4, pivot: true },
  ifv: { accel: 0.7, turn: 3.2, pivot: true },
  jet: { accel: 0.6, turn: 2.2, pivot: false },
};

/** A land vehicle (light car, tank, armoured vehicle) or a fighter aircraft. */
export class Vehicle extends Unit {
  readonly profile: VehicleProfile;
  readonly speed: number;
  readonly radius: number;
  readonly bodyHeight: number;

  // ---- aircraft state (jets only)
  flight: Flight = 'airborne';
  /** Height above the ground in px: 0 on the ground, CRUISE_ALTITUDE in the air. */
  altitude = 0;
  /** Airfield this aircraft belongs to, and its parking spot there. */
  homeId: number | null = null;
  slot = -1;
  /** Seconds into the current take-off / landing roll. */
  phaseTime = 0;
  /** Seconds the aircraft has had nothing to do while airborne. */
  idleFor = 0;
  /** Seconds since the last repair tick while parked at its airfield. */
  repairClock = 0;
  /** Draw-order override while on its airfield: drawn right after the airfield so it is not hidden behind it. */
  drawDepth: number | null = null;
  /** Orders given while it was busy on the ground; carried out once it is airborne. */
  mission: WorldPoint[] | null = null;

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
    this.bodyHeight = type === 'jet' ? 7 : 1.8;
    const spec = WEAPONS[VEHICLE_WEAPON[type]];
    this.weapon = { ...spec, damage: spec.damage * f.stats.firepower, range: spec.range * f.stats.range };
    const h = HANDLING[type];
    this.accelTime = h.accel;
    this.turnRate = h.turn;
    this.turnsToMove = h.pivot;
    if (type === 'jet') this.altitude = CRUISE_ALTITUDE;
  }

  /** In the air: cruising or on the final approach. */
  override get flies(): boolean {
    return this.type === 'jet' && (this.flight === 'airborne' || this.flight === 'approach' || this.flight === 'crashing');
  }

  override get aircraft(): boolean {
    return this.type === 'jet';
  }

  /** Parked, taxiing, rolling for take-off or landing: moved by the AircraftSystem, never shoved. */
  override get fixed(): boolean {
    return this.type === 'jet' && !this.flies;
  }

  override get canFight(): boolean {
    return this.type !== 'jet' || this.flight === 'airborne';
  }

  override get depth(): number {
    return this.fixed && this.drawDepth !== null ? this.drawDepth : this.py / CELL_SIZE;
  }

  get name(): string {
    return this.profile.name;
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
