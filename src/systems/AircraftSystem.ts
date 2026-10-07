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
export interface AircraftHooks {
  /** Nearest spot at or near (x, y) where a transport can set down, or null (open water, buildings…). */
  landingSpot(x: number, y: number, self: Vehicle): WorldPoint | null;
  /** The next passenger of `transport` steps out onto a free cell beside it; false when nobody could get out (no room). */
  unloadOne(transport: Vehicle): boolean;
  /** Does the owner have enough power? The airfield cannot launch aircraft without it. */
  powered(owner: number): boolean;
}

/** Result of an unload order (U key / Unload button). */
export type UnloadResult = 'ok' | 'empty' | 'noSpot' | 'busy';

/** Descent, unloading pause and climb-out of a transport at its drop-off point (seconds). */
const DESCEND_SECONDS = 1.2;
const UNLOAD_PAUSE = 1.2;
const CLIMB_SECONDS = 1.0;
/** Passengers step out one at a time, this many seconds apart (RA2). */
const EJECT_STEP = 0.3;
/** After the last one is out the transport waits this long before it climbs away (s). */
const AFTER_UNLOAD = 0.4;
/** An empty transport that has set down in the field waits this long for passengers, then flies home (s). */
const LANDED_WAIT = 40;

export class AircraftSystem implements GameSystem {
  constructor(
    private readonly entities: EntityManager,
    private readonly geometry: (airfield: Building) => AirfieldGeometry,
    private readonly hooks: AircraftHooks,
  ) {}

  update(dt: number): void {
    for (const v of this.entities.vehicles()) {
      if (!v.aircraft || !v.alive) continue;
      const base = this.home(v);
      // Drawn right after its airfield only while it is on the airfield's apron or runway.
      const onAirfield = v.flight === 'parked' || v.flight === 'taxi' || v.flight === 'takeoff' || v.flight === 'landing' || v.flight === 'taxiHome';
      v.drawDepth = base && onAirfield ? base.depth + 0.02 : null;
      if (v.ejecting && v.flight !== 'parked' && v.flight !== 'landed' && v.flight !== 'unloading') v.ejecting = false;
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
        case 'crashing':
          this.crash(v, dt);
          break;
        case 'unloading':
          this.unloading(v, dt);
          break;
        case 'landed':
          this.landed(v, dt);
          break;
        case 'liftoff':
          this.liftoff(v, dt);
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
    // Its airfield is gone: fly to another airfield of the nation, or crash if there is none.
    if (!this.home(v)) {
      this.abort(v);
      return;
    }
    // Letting passengers out on the apron: orders wait until the last one has stepped out.
    if (v.ejecting) {
      this.stashOrders(v);
      if (!this.eject(v, dt) && v.mission) {
        v.follow(v.mission);
        v.mission = null;
      }
      return;
    }
    const wantsOut = v.moving || v.attackTarget !== null || v.attackMove !== null;
    if (!wantsOut) return;
    this.stashOrders(v);
    const home = this.home(v);
    if (!home) {
      // Its airfield is gone: take off from where it stands and head for another one (or crash).
      this.abort(v);
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
    // One aircraft on the runway at a time: wait short of it while another one rolls or lands.
    const atThreshold = Math.hypot(v.px - g.runwayStart.x, v.py - g.runwayStart.y) < 12;
    if (atThreshold && this.runwayBusy(v, home)) return;
    // No power: the airfield cannot clear the aircraft for take-off, it waits at the runway threshold.
    if (atThreshold && !this.hooks.powered(v.owner)) return;
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
    // Lost its airfield: any other airfield of the nation will do; with none left the aircraft falls.
    if (!this.home(v) && !this.adoptHome(v)) {
      this.startCrash(v);
      return;
    }
    // A transport that has reached its destination sets down there on solid ground (never on the sea): a loaded
    // one unloads and lifts off again, an empty one waits on the spot to take passengers aboard.
    if (v.isTransport && !v.moving && v.mission === null && !v.returningHome && !this.nearOwnAirfield(v)) {
      const spot = this.hooks.landingSpot(v.px, v.py, v);
      if (spot) {
        v.dropSpot = spot;
        v.pickup = v.cargo.length === 0;
        v.landedIdle = 0;
        v.flight = 'unloading';
        v.phaseTime = 0;
        v.stop();
        return;
      }
    }
    const busy = v.moving || v.attackTarget !== null || v.attackMove !== null || v.combatTarget !== null;
    if (busy) {
      if (v.moving) v.returningHome = false;
      v.idleFor = 0;
      return;
    }
    v.idleFor += dt;
    if (v.idleFor < RETURN_AFTER) return;
    let home = this.home(v);
    if (!home) return; // no airfield left: circle where it is
    // An empty transport coming back from the field parks at whichever airfield of the nation still has room.
    if (v.isTransport && v.cargo.length === 0 && this.freeSlot(v, home) < 0) {
      const other = this.airfieldWithRoom(v);
      if (other) {
        v.homeId = other.id;
        v.slot = -1;
        home = other;
      }
    }
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
      // The runway is in use (another aircraft takes off or lands): keep circling over the approach point.
      if (this.runwayBusy(v, home)) return;
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

  /**
   * Lowest free parking spot at `home` (the aircraft's own spot is kept if nobody took it); -1 when the apron is full.
   * One spot holds one aircraft: every aircraft of the airfield that is not out flying (parked, taxiing, taking off,
   * approaching, landing…) keeps its spot reserved. Pass `v = null` for a brand-new aircraft.
   */
  freeSlot(v: Vehicle | null, home: Building): number {
    const taken = new Set<number>();
    for (const o of this.entities.vehicles()) {
      if (o !== v && o.aircraft && o.alive && o.homeId === home.id && o.flight !== 'airborne' && o.slot >= 0) taken.add(o.slot);
    }
    if (v && v.slot >= 0 && !taken.has(v.slot)) return v.slot;
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

  /** Lost its airfield while on the ground or landing: re-home at another airfield and take to the air, or crash. */
  private abort(v: Vehicle): void {
    if (!this.home(v) && !this.adoptHome(v)) {
      this.startCrash(v);
      return;
    }
    v.flight = 'airborne';
    v.altitude = CRUISE_ALTITUDE;
    v.idleFor = 0;
    if (v.mission) v.follow(v.mission);
    v.mission = null;
  }

  /** Is another aircraft of this airfield taking off or landing right now? */
  private runwayBusy(v: Vehicle, home: Building): boolean {
    return this.entities.vehicles().some((o) => o !== v && o.aircraft && o.alive && o.homeId === home.id && (o.flight === 'takeoff' || o.flight === 'landing'));
  }

  /** Makes the nearest living airfield of the owner the aircraft's new home. False when the nation has none. */
  private adoptHome(v: Vehicle): boolean {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.entities.buildings()) {
      if (b.owner !== v.owner || !b.alive || b.spec.type !== 'airfield') continue;
      const c = b.centerWorld();
      const d = Math.hypot(c.x - v.px, c.y - v.py);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return false;
    v.homeId = best.id;
    v.slot = -1;
    v.idleFor = RETURN_AFTER; // head for the new airfield as soon as there is nothing else to do
    return true;
  }

  /** Nearest living airfield of the owner with a free parking spot, or null. */
  private airfieldWithRoom(v: Vehicle): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.entities.buildings()) {
      if (b.owner !== v.owner || !b.alive || b.spec.type !== 'airfield' || this.freeSlot(v, b) < 0) continue;
      const c = b.centerWorld();
      const d = Math.hypot(c.x - v.px, c.y - v.py);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** No airfield to return to: the aircraft loses control and drops out of the sky. */
  private startCrash(v: Vehicle): void {
    v.flight = 'crashing';
    v.phaseTime = 0;
    v.mission = null;
    v.attackTarget = null;
    v.attackMove = null;
    v.combatTarget = null;
    v.stop();
  }

  /** Transport at its drop-off point: glides down, unloads everyone, lifts off again and heads home. */
  private unloading(v: Vehicle, dt: number): void {
    v.phaseTime += dt;
    const t = v.phaseTime;
    if (v.dropSpot && t < DESCEND_SECONDS) this.moveTo(v, v.dropSpot, 10, dt);
    if (t < DESCEND_SECONDS) {
      v.altitude = CRUISE_ALTITUDE * (1 - clamp01(t / DESCEND_SECONDS));
    } else if (v.pickup) {
      // Empty: stay down here and wait for soldiers / vehicles to walk up and climb aboard.
      v.altitude = 0;
      v.flight = 'landed';
      v.landedIdle = 0;
    } else if (t < DESCEND_SECONDS + UNLOAD_PAUSE) {
      v.altitude = 0;
      // Passengers jump out one at a time; the transport holds on the ground until the last one is out.
      if (v.cargo.length > 0) {
        if (this.eject(v, dt)) v.phaseTime = DESCEND_SECONDS + UNLOAD_PAUSE - AFTER_UNLOAD;
        else if (v.cargo.length > 0) v.phaseTime = DESCEND_SECONDS + UNLOAD_PAUSE; // no room here: the rest stay aboard
      }
    } else if (t < DESCEND_SECONDS + UNLOAD_PAUSE + CLIMB_SECONDS) {
      v.altitude = CRUISE_ALTITUDE * clamp01((t - DESCEND_SECONDS - UNLOAD_PAUSE) / CLIMB_SECONDS);
    } else {
      v.altitude = CRUISE_ALTITUDE;
      v.flight = 'airborne';
      v.dropSpot = null;
      v.returningHome = true;
      v.idleFor = RETURN_AFTER;
    }
  }

  /** Standing on solid ground away from an airfield: takes passengers, then flies off when given a destination. */
  private landed(v: Vehicle, dt: number): void {
    v.altitude = 0;
    // Letting passengers out: a new order waits until the last one has stepped out, then it lifts off.
    if (v.ejecting) {
      if (v.moving) {
        v.mission = [...v.waypoints()];
        v.stop();
      }
      if (!this.eject(v, dt) && v.mission) {
        v.flight = 'liftoff';
        v.phaseTime = 0;
      }
      return;
    }
    if (v.moving || v.attackTarget !== null) {
      v.mission = [...v.waypoints()];
      v.stop();
      v.flight = 'liftoff';
      v.phaseTime = 0;
      return;
    }
    // Empty and nobody on the way: after a while it flies home on its own.
    const boarding = this.entities.fieldMovers().some((u) => u.boardTarget === v.id);
    if (v.cargo.length === 0 && !boarding) {
      v.landedIdle += dt;
      if (v.landedIdle >= LANDED_WAIT) {
        v.flight = 'liftoff';
        v.phaseTime = 0;
      }
    } else v.landedIdle = 0;
  }

  /** One passenger out every EJECT_STEP seconds; true while more are waiting to get out (and there is room). */
  private eject(v: Vehicle, dt: number): boolean {
    v.ejecting = true;
    v.ejectClock -= dt;
    if (v.ejectClock > 0) return true;
    v.ejectClock = EJECT_STEP;
    if (v.cargo.length === 0 || !this.hooks.unloadOne(v) || v.cargo.length === 0) {
      v.ejecting = false;
      v.ejectClock = 0;
      return false;
    }
    return true;
  }

  /**
   * Unload order (U key / Unload button): on the ground the passengers step out one by one; in the air the
   * transport first sets down on the nearest solid ground below it (never on the sea).
   */
  requestUnload(v: Vehicle): UnloadResult {
    if (!v.isTransport || !v.alive || v.cargo.length === 0) return 'empty';
    if (v.flight === 'parked' || v.flight === 'landed') {
      v.ejecting = true;
      v.ejectClock = 0;
      return 'ok';
    }
    if (v.flight !== 'airborne' && v.flight !== 'approach') return 'busy';
    return this.setDown(v, false) ? 'ok' : 'noSpot';
  }

  /** An airborne transport lands right where it is to take passengers aboard (they walk up to it). False: no ground here. */
  setDownForPickup(v: Vehicle): boolean {
    if (!v.isTransport || !v.alive || (v.flight !== 'airborne' && v.flight !== 'approach')) return false;
    return this.setDown(v, true);
  }

  private setDown(v: Vehicle, pickup: boolean): boolean {
    const spot = this.hooks.landingSpot(v.px, v.py, v);
    if (!spot) return false;
    v.dropSpot = spot;
    v.pickup = pickup;
    v.landedIdle = 0;
    v.returningHome = false;
    v.mission = null;
    v.attackMove = null;
    v.flight = 'unloading';
    v.phaseTime = 0;
    v.stop();
    return true;
  }

  /** Climbs out of a landing on open ground and carries on with the order that was given (or heads home). */
  private liftoff(v: Vehicle, dt: number): void {
    v.phaseTime += dt;
    v.altitude = CRUISE_ALTITUDE * clamp01(v.phaseTime / CLIMB_SECONDS);
    if (v.phaseTime < CLIMB_SECONDS) return;
    v.altitude = CRUISE_ALTITUDE;
    v.flight = 'airborne';
    v.dropSpot = null;
    v.pickup = false;
    v.idleFor = RETURN_AFTER;
    if (v.mission) {
      v.returningHome = false;
      v.follow(v.mission);
      v.mission = null;
    } else v.returningHome = true;
  }

  /** The destination is the transport's own airfield: it comes home to park instead of setting down beside it. */
  private nearOwnAirfield(v: Vehicle): boolean {
    const home = this.home(v);
    if (!home) return false;
    const f = home.footprintWorld();
    const dx = Math.max(f.x - v.px, 0, v.px - (f.x + f.w));
    const dy = Math.max(f.y - v.py, 0, v.py - (f.y + f.h));
    return Math.hypot(dx, dy) < 4 * CELL_SIZE;
  }

  /** Spins and plunges, then explodes on impact (health reaches zero → the usual death blast). */
  private crash(v: Vehicle, dt: number): void {
    v.phaseTime += dt;
    v.heading += 3.2 * dt;
    v.facing = Math.cos(v.heading) < 0 ? -1 : 1;
    const forward = v.speed * 0.35;
    this.place(v, v.px + Math.cos(v.heading) * forward * dt, v.py + Math.sin(v.heading) * forward * dt);
    v.altitude = Math.max(0, v.altitude - (5 + v.phaseTime * 14) * dt);
    v.walkPhase += forward * dt;
    if (v.altitude <= 0) v.hp = 0;
  }
}
