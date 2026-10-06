import { CELL_SIZE } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { CRUISE_ALTITUDE, type Vehicle } from '../entities/Vehicle';
import type { WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

/** Layout of an airfield in world px (derived from its sprite, scale and rotation). */
export interface AirfieldGeometry {
  /** Parking spots on the apron. */
  slots: readonly WorldPoint[];
  /** Ends of the runway centre line; take-off rolls from start towards end. */
  runwayStart: WorldPoint;
  runwayEnd: WorldPoint;
  /** Direction of the runway (radians). */
  heading: number;
  /** Point on the extended centre line where landing aircraft line up. */
  approach: WorldPoint;
}

export const PARKING_SLOTS = 6;
const TAXI_SPEED = 11;
const TAKEOFF_SECONDS = 2.4;
const LANDING_SECONDS = 2.2;
/** An aircraft parked at its airfield is serviced: it regains REPAIR_FRACTION of its health every REPAIR_INTERVAL seconds. */
const REPAIR_INTERVAL = 4;
const REPAIR_FRACTION = 0.02;
/** Seconds without orders before an airborne aircraft heads home. */
const RETURN_AFTER = 1;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/**
 * Aircraft life cycle. Fighters sit parked on their airfield's apron. When
 * given an order they taxi to the runway, roll for take-off (accelerating
 * before they lift off), fly to the target and, once they have nothing left
 * to do, return to the airfield, land and taxi back to their parking spot.
 */
export class AircraftSystem implements GameSystem {
  constructor(
    private readonly entities: EntityManager,
    private readonly geometry: (airfield: Building) => AirfieldGeometry,
  ) {}

  update(dt: number): void {
    for (const v of this.entities.vehicles()) {
      if (v.type !== 'jet' || !v.alive) continue;
      const base = this.home(v);
      v.drawDepth = base ? base.depth + 0.02 : null;
      switch (v.flight) {
        case 'parked':
          this.parked(v, dt);
          break;
        case 'taxi':
          this.taxi(v, dt);
          break;
        case 'takeoff':
          this.takeoff(v, dt);
          break;
        case 'airborne':
          this.airborne(v, dt);
          break;
        case 'approach':
          this.approach(v);
          break;
        case 'landing':
          this.landing(v, dt);
          break;
        case 'taxiHome':
          this.taxiHome(v, dt);
          break;
      }
    }
  }

  /** The airfield this aircraft belongs to (alive, same owner), if any. */
  private home(v: Vehicle): Building | null {
    const b = v.homeId === null ? undefined : this.entities.get(v.homeId);
    return b && b.alive && b.owner === v.owner && 'spec' in b ? (b as Building) : null;
  }

  /** Orders given while it cannot lift off yet are remembered. */
  private stashOrders(v: Vehicle): void {
    if (v.moving) {
      v.mission = [...v.waypoints()];
      v.stop();
    }
  }

  private place(v: Vehicle, x: number, y: number): void {
    v.px = x;
    v.py = y;
    v.x = x / CELL_SIZE;
    v.y = y / CELL_SIZE;
  }

  // ------------------------------------------------------------------ phases

  private parked(v: Vehicle, dt: number): void {
    v.altitude = 0;
    this.service(v, dt);
    const wantsOut = v.moving || v.attackTarget !== null || v.attackMove !== null;
    if (!wantsOut) return;
    this.stashOrders(v);
    const home = this.home(v);
    if (!home) {
      // Its airfield is gone: just take off from where it stands.
      v.flight = 'airborne';
      v.altitude = CRUISE_ALTITUDE;
      if (v.mission) v.follow(v.mission);
      v.mission = null;
      return;
    }
    v.flight = 'taxi';
  }

  /** Maintenance at the airfield: +2% health every 4 s while the aircraft stands on its apron. */
  private service(v: Vehicle, dt: number): void {
    if (v.hp >= v.maxHp || !this.home(v)) {
      v.repairClock = 0;
      return;
    }
    v.repairClock += dt;
    while (v.repairClock >= REPAIR_INTERVAL) {
      v.repairClock -= REPAIR_INTERVAL;
      v.hp = Math.min(v.maxHp, v.hp + v.maxHp * REPAIR_FRACTION);
    }
  }

  private taxi(v: Vehicle, dt: number): void {
    const home = this.home(v);
    if (!home) return this.abort(v);
    this.stashOrders(v);
    const g = this.geometry(home);
    if (this.moveTo(v, g.runwayStart, TAXI_SPEED, dt)) {
      v.flight = 'takeoff';
      v.phaseTime = 0;
      v.heading = g.heading;
    }
  }

  private takeoff(v: Vehicle, dt: number): void {
    const home = this.home(v);
    this.stashOrders(v);
    v.phaseTime += dt;
    const t = clamp01(v.phaseTime / TAKEOFF_SECONDS);
    // Rolling start: slow at first, full speed by the time the wheels leave the ground.
    const speed = lerp(3, v.speed, t ** 1.4);
    const heading = home ? this.geometry(home).heading : v.heading;
    v.heading = heading;
    v.facing = Math.cos(heading) < 0 ? -1 : 1;
    this.place(v, v.px + Math.cos(heading) * speed * dt, v.py + Math.sin(heading) * speed * dt);
    v.altitude = clamp01((t - 0.5) / 0.5) * CRUISE_ALTITUDE;
    v.walkPhase += speed * dt;
    if (t >= 1) {
      v.flight = 'airborne';
      v.altitude = CRUISE_ALTITUDE;
      v.idleFor = 0;
      if (v.mission) v.follow(v.mission);
      v.mission = null;
    }
  }

  private airborne(v: Vehicle, dt: number): void {
    v.altitude = CRUISE_ALTITUDE;
    const busy = v.moving || v.attackTarget !== null || v.attackMove !== null || v.combatTarget !== null;
    if (busy) {
      v.idleFor = 0;
      return;
    }
    v.idleFor += dt;
    if (v.idleFor < RETURN_AFTER) return;
    const home = this.home(v);
    if (!home) return; // no airfield left: circle where it is
    const slot = this.freeSlot(v, home);
    if (slot < 0) {
      // Apron full: wait over the airfield's approach point and try again in a moment.
      v.idleFor = RETURN_AFTER - 1.5;
      v.follow([this.geometry(home).approach]);
      return;
    }
    v.slot = slot;
    v.flight = 'approach';
    v.follow([this.geometry(home).approach]);
  }

  private approach(v: Vehicle): void {
    const home = this.home(v);
    if (!home) return this.abort(v);
    const g = this.geometry(home);
    const last = v.waypoints()[v.waypoints().length - 1];
    // A new order replaces the approach path: abort the landing.
    if (v.moving && last && Math.hypot(last.x - g.approach.x, last.y - g.approach.y) > 1) {
      v.flight = 'airborne';
      v.idleFor = 0;
      return;
    }
    if (!v.moving) {
      this.place(v, g.approach.x, g.approach.y);
      v.flight = 'landing';
      v.phaseTime = 0;
      v.heading = g.heading;
    }
  }

  private landing(v: Vehicle, dt: number): void {
    const home = this.home(v);
    if (!home) return this.abort(v);
    this.stashOrders(v);
    const g = this.geometry(home);
    v.phaseTime += dt;
    const t = clamp01(v.phaseTime / LANDING_SECONDS);
    const speed = lerp(v.speed * 0.8, 5, t);
    v.heading = g.heading;
    this.place(v, v.px + Math.cos(g.heading) * speed * dt, v.py + Math.sin(g.heading) * speed * dt);
    v.altitude = CRUISE_ALTITUDE * (1 - clamp01(t / 0.5));
    v.walkPhase += speed * dt;
    if (t >= 1) {
      v.altitude = 0;
      v.flight = 'taxiHome';
    }
  }

  private taxiHome(v: Vehicle, dt: number): void {
    const home = this.home(v);
    if (!home) return this.abort(v);
    this.stashOrders(v);
    const g = this.geometry(home);
    const spot = g.slots[v.slot] ?? g.slots[0];
    if (spot && this.moveTo(v, spot, TAXI_SPEED, dt)) {
      v.flight = 'parked';
      v.heading = g.heading;
      if (v.mission) v.follow(v.mission); // an order came in during the landing: off again
      v.mission = null;
    }
  }

  // ------------------------------------------------------------------ helpers

  /** Lowest free parking spot at `home` (the aircraft's own spot is kept if nobody took it). */
  private freeSlot(v: Vehicle, home: Building): number {
    const taken = new Set<number>();
    for (const o of this.entities.vehicles()) {
      if (o !== v && o.type === 'jet' && o.alive && o.homeId === home.id && o.flight !== 'airborne' && o.flight !== 'approach') taken.add(o.slot);
    }
    if (v.slot >= 0 && !taken.has(v.slot)) return v.slot;
    for (let i = 0; i < PARKING_SLOTS; i++) if (!taken.has(i)) return i;
    return -1;
  }

  /** Drives towards `target` at `speed` px/s; true once there. */
  private moveTo(v: Vehicle, target: WorldPoint, speed: number, dt: number): boolean {
    const dx = target.x - v.px;
    const dy = target.y - v.py;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) {
      this.place(v, target.x, target.y);
      return true;
    }
    const step = Math.min(d, speed * dt);
    // Turn gradually towards the direction of travel.
    let diff = Math.atan2(dy, dx) - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    v.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
    v.facing = dx < 0 ? -1 : 1;
    this.place(v, v.px + (dx / d) * step, v.py + (dy / d) * step);
    v.walkPhase += step;
    return false;
  }

  /** Lost its airfield mid-sortie: take to the air. */
  private abort(v: Vehicle): void {
    v.flight = 'airborne';
    v.altitude = CRUISE_ALTITUDE;
    v.idleFor = 0;
    if (v.mission) v.follow(v.mission);
    v.mission = null;
  }
}
