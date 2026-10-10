import { BOMB_COST, BOMB_LOAD_SECONDS, JET_BOMB_COST, CELL_SIZE, REFUEL_RANGE_CELLS, REFUEL_RATE, TANKER_ESCORT_DISTANCE, TANKER_LEAD_CELLS, TRANSPORT_FUEL_CELLS } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { CRUISE_ALTITUDE, type Vehicle } from '../entities/Vehicle';
import type { WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

/** Layout of an airfield in world px (derived from its sprite, scale and rotation). */
export interface AirfieldGeometry {
  /** Parking spots on the apron, numbered I…IX (index 0…8) in this order; not shown on screen. */
  slots: readonly WorldPoint[];
  /** Ends of the runway centre line; take-off rolls from start towards end. */
  runwayStart: WorldPoint;
  runwayEnd: WorldPoint;
  /** Direction of the runway (radians). */
  heading: number;
  /** Point on the extended centre line where landing aircraft line up. */
  approach: WorldPoint;
}

export const PARKING_SLOTS = 9;
/** Spots per apron row; within a row the next spot lies ahead (towards the runway end). */
const SLOTS_PER_ROW = 3;
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
 * before they lift off) and fly to the target. With nothing left to do, a
 * selected fighter circles on station waiting for its next order; an unselected
 * one returns to the airfield, lands and taxis back to its parking spot.
 */
export interface AircraftHooks {
  /** Nearest spot at or near (x, y) where a transport can set down, or null (open water, buildings…). */
  landingSpot(x: number, y: number, self: Vehicle): WorldPoint | null;
  /** The next passenger of `transport` steps out onto a free cell beside it; false when nobody could get out (no room). */
  unloadOne(transport: Vehicle): boolean;
  /** Is the aircraft currently selected by the player? */
  selected(v: Vehicle): boolean;
  /** Does the owner have enough power? The airfield cannot launch aircraft without it. */
  powered(owner: number): boolean;
  /** A transport parked at home without a tanker gets a new one on a free spot; false when there is no room. */
  newTanker(transport: Vehicle): boolean;
  /** Charges `owner` `amount` (a bomb reload); false, and nothing is charged, when it cannot pay. */
  pay(owner: number, amount: number): boolean;
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
/** Radius (px) of the circle an idle selected fighter flies while it waits for orders. */
const ORBIT_RADIUS = 3 * CELL_SIZE;
/** Aircraft closer than this (px) and closing in take avoiding action; the climber goes this share above cruise. */
const AVOID_RANGE = 3 * CELL_SIZE;
const AVOID_CLIMB = 0.6;
/** Seconds a parked aircraft that came under fire circles away from its airfield before it comes back. */
const SCRAMBLE_SECONDS = 20;

export class AircraftSystem implements GameSystem {
  /** Centre and current angle of the waiting circle of each idle selected fighter. */
  private readonly orbits = new Map<number, { cx: number; cy: number; angle: number }>();
  /** Health and position of each aircraft at the last tick: a drop in health means it was hit, a move burns fuel. */
  private readonly last = new Map<number, { hp: number; x: number; y: number }>();
  /** Runway queue of each airfield (aircraft ids, first come first served) for take-offs and landings. */
  private readonly runwayQueues = new Map<number, number[]>();

  constructor(
    private readonly entities: EntityManager,
    private readonly geometry: (airfield: Building) => AirfieldGeometry,
    private readonly hooks: AircraftHooks,
  ) {}

  update(dt: number): void {
    for (const v of this.entities.vehicles()) {
      if (!v.aircraft || !v.alive) {
        this.last.delete(v.id);
        continue;
      }
      const prev = this.last.get(v.id);
      this.last.set(v.id, { hp: v.hp, x: v.px, y: v.py });
      // Shot at while standing on its airfield: it scrambles into the air to save itself.
      if (prev && v.hp < prev.hp && v.flight === 'parked' && !v.ejecting) this.scrambleOff(v);
      if (v.isTransport) this.fuel(v, prev, dt);
      if (v.isTanker) this.escort(v, dt);
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
    // Its tanker was shot down: a replacement is only issued once the transport is back home on its spot.
    if (v.isTransport && this.home(v)) {
      const tanker = v.tankerId === null ? undefined : this.entities.get(v.tankerId);
      if (!tanker || !tanker.alive) {
        v.tankerId = null;
        this.hooks.newTanker(v);
      }
    }
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
    // A bomber may not take off without at least one bomb aboard: its order waits until one is loaded. (A fighter
    // still has its guns.)
    const unarmed = v.type === 'bomber' && v.bombs < 1;
    if (!unarmed && v.mission && !v.moving) {
      v.follow(v.mission);
      v.mission = null;
    }
    const wantsOut = v.moving || v.attackTarget !== null || v.attackMove !== null;
    if (!wantsOut) return;
    this.stashOrders(v);
    if (unarmed) return;
    const home = this.home(v);
    if (!home) {
      // Its airfield is gone: take off from where it stands and head for another one (or crash).
      this.abort(v);
      return;
    }
    v.flight = 'taxi';
  }

  /** Bombs are loaded on the apron one at a time, each paid for (BOMB_COST); without the money it waits. */
  private rearm(v: Vehicle, dt: number): void {
    if (v.bombs >= v.maxBombs) {
      v.rearmClock = 0;
      return;
    }
    v.rearmClock += dt;
    if (v.rearmClock < BOMB_LOAD_SECONDS) return;
    v.rearmClock = 0;
    if (this.hooks.pay(v.owner, v.type === 'jet' ? JET_BOMB_COST : BOMB_COST)) v.bombs++;
  }

  /** Maintenance at the airfield: +2% health every 4 s while the aircraft stands on its apron. */
  private service(v: Vehicle, dt: number): void {
    if (v.maxBombs > 0) this.rearm(v, dt);
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
    // One aircraft on the runway at a time, in queue order: wait short of it until cleared.
    const atThreshold = Math.hypot(v.px - g.runwayStart.x, v.py - g.runwayStart.y) < 12;
    if (atThreshold && !this.cleared(v, home)) return;
    if (this.moveTo(v, g.runwayStart, TAXI_SPEED, dt)) {
      this.leaveQueue(v);
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
    this.avoid(v, dt);
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
      this.orbits.delete(v.id);
      // A new order cancels the trip home; flying to its own airfield's approach point (waiting for room) does not.
      if (v.moving && !this.headingForApproach(v)) v.returningHome = false;
      v.idleFor = 0;
      return;
    }
    v.idleFor += dt;
    // Scrambled off its airfield under fire: keeps circling clear of it for a while before coming back.
    if (v.scramble > 0) {
      v.scramble -= dt;
      this.orbit(v, dt);
      return;
    }
    if (v.idleFor < RETURN_AFTER) return;
    // A selected fighter with nothing to do circles where it is, waiting for its next order; once deselected it heads home.
    if (!v.isTransport && !v.returningHome && this.hooks.selected(v)) {
      this.orbit(v, dt);
      return;
    }
    this.orbits.delete(v.id);
    let home = this.home(v);
    if (!home) return; // no airfield left: circle where it is
    // No spot left on its apron: it parks at whichever airfield of the nation still has room.
    if (this.freeSlot(v, home) < 0) {
      const other = this.airfieldWithRoom(v);
      if (other) {
        v.homeId = other.id;
        v.slot = -1;
        home = other;
      }
    }
    const slot = this.freeSlot(v, home);
    if (slot < 0) {
      // Every apron full: wait over the airfield's approach point and try again in a moment.
      v.returningHome = true;
      v.idleFor = RETURN_AFTER - 1.5;
      v.follow([this.approachFor(v, home).point]);
      return;
    }
    v.slot = slot;
    v.flight = 'approach';
    this.pickRunwayEnd(v, home);
    v.follow([this.approachFor(v, home).point]);
  }

  /**
   * Ordered to land on `airfield` (an own one): it becomes the aircraft's home if it has a free spot, and the aircraft
   * comes in over whichever runway end is nearer. False when it cannot land there.
   */
  land(v: Vehicle, airfield: Building): boolean {
    if (!v.aircraft || !v.alive || v.isTanker || airfield.owner !== v.owner || !airfield.alive || airfield.spec.type !== 'airfield') return false;
    if (v.flight !== 'airborne' && v.flight !== 'approach') return false;
    const slot = this.freeSlot(v.homeId === airfield.id ? v : null, airfield);
    if (slot < 0) return false;
    this.leaveQueue(v);
    v.homeId = airfield.id;
    v.slot = slot;
    v.attackTarget = null;
    v.attackMove = null;
    v.combatTarget = null;
    v.mission = null;
    v.scramble = 0;
    v.returningHome = true;
    v.flight = 'approach';
    this.orbits.delete(v.id);
    this.pickRunwayEnd(v, airfield);
    v.follow([this.approachFor(v, airfield).point]);
    return true;
  }

  /** Lands from the runway end nearer to the aircraft. */
  private pickRunwayEnd(v: Vehicle, home: Building): void {
    const g = this.geometry(home);
    v.landReverse = Math.hypot(v.px - g.runwayEnd.x, v.py - g.runwayEnd.y) < Math.hypot(v.px - g.runwayStart.x, v.py - g.runwayStart.y);
  }

  /** Approach point and landing direction for the runway end the aircraft has picked. */
  private approachFor(v: Vehicle, home: Building): { point: WorldPoint; heading: number } {
    const g = this.geometry(home);
    if (!v.landReverse) return { point: g.approach, heading: g.heading };
    const back = g.heading + Math.PI;
    const lead = Math.hypot(g.approach.x - g.runwayStart.x, g.approach.y - g.runwayStart.y);
    return { point: { x: g.runwayEnd.x - Math.cos(back) * lead, y: g.runwayEnd.y - Math.sin(back) * lead }, heading: back };
  }

  private approach(v: Vehicle): void {
    const home = this.home(v);
    if (!home) return this.abort(v);
    const a = this.approachFor(v, home);
    const last = v.waypoints()[v.waypoints().length - 1];
    // A new order replaces the approach path: abort the landing.
    if (v.moving && last && Math.hypot(last.x - a.point.x, last.y - a.point.y) > 1) {
      this.leaveQueue(v);
      v.flight = 'airborne';
      v.idleFor = 0;
      return;
    }
    if (!v.moving) {
      // Not cleared yet (runway in use or others ahead in the queue): hold over the approach point.
      if (!this.cleared(v, home)) return;
      this.leaveQueue(v);
      this.place(v, a.point.x, a.point.y);
      v.flight = 'landing';
      v.phaseTime = 0;
      v.heading = a.heading;
    }
  }

  private landing(v: Vehicle, dt: number): void {
    const home = this.home(v);
    if (!home) return this.abort(v);
    this.stashOrders(v);
    if (this.goAround(v)) return;
    const heading = this.approachFor(v, home).heading;
    v.phaseTime += dt;
    const t = clamp01(v.phaseTime / LANDING_SECONDS);
    const speed = lerp(v.speed * 0.8, 5, t);
    v.heading = heading;
    this.place(v, v.px + Math.cos(heading) * speed * dt, v.py + Math.sin(heading) * speed * dt);
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
    if (this.goAround(v)) return;
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
   * A new order (move / attack) arrived while landing or taxiing to its spot: it does not wait to park but climbs
   * straight back up from where it is and carries the order out. A bomber with no bomb aboard still has to park.
   */
  private goAround(v: Vehicle): boolean {
    if (v.mission === null && v.attackTarget === null && v.attackMove === null) return false;
    if (v.type === 'bomber' && v.bombs < 1) return false;
    v.flight = 'liftoff';
    v.phaseTime = CLIMB_SECONDS * clamp01(v.altitude / CRUISE_ALTITUDE);
    return true;
  }

  /** Parked aircraft under fire: takes off at once towards a point beyond the runway, then circles there a while. */
  private scrambleOff(v: Vehicle): void {
    if (v.moving || v.attackTarget !== null) return; // already on its way out
    const home = this.home(v);
    if (!home) return;
    const g = this.geometry(home);
    const away = 10 * CELL_SIZE;
    v.follow([{ x: g.runwayEnd.x + Math.cos(g.heading) * away, y: g.runwayEnd.y + Math.sin(g.heading) * away }]);
    v.scramble = SCRAMBLE_SECONDS;
  }

  /**
   * Transport fuel: every px flown burns a fixed share of the tank. Its tanker (close by, in the air or on the
   * ground) and the airfield's apron fill it back up. An empty tank in the air means a crash.
   */
  private fuel(v: Vehicle, prev: { x: number; y: number } | undefined, dt: number): void {
    if (prev && (v.flight === 'airborne' || v.flight === 'approach')) {
      v.fuel -= Math.hypot(v.px - prev.x, v.py - prev.y) / (TRANSPORT_FUEL_CELLS * CELL_SIZE);
    }
    const tanker = v.tankerId === null ? undefined : this.entities.get(v.tankerId);
    const tankerNear = tanker && tanker.alive && Math.hypot((tanker as Vehicle).px - v.px, (tanker as Vehicle).py - v.py) <= REFUEL_RANGE_CELLS * CELL_SIZE;
    // Parked on its airfield the tank is filled right up; in the field only the tanker tops it up.
    if (v.flight === 'parked') v.fuel = 1;
    else if (tankerNear) v.fuel += REFUEL_RATE * dt;
    v.fuel = Math.max(0, Math.min(1, v.fuel));
    if (v.fuel <= 0 && (v.flight === 'airborne' || v.flight === 'approach')) this.startCrash(v);
  }

  /**
   * Tanker: follows its transport everywhere. It takes off when the transport leaves, flies a little behind it, sets
   * down beside it wherever it lands in the field, and heads home to park when the transport does.
   */
  private escort(v: Vehicle, dt: number): void {
    // Nobody gives a tanker orders (the AI's attack groups included): it only ever follows its transport.
    v.attackTarget = null;
    v.attackMove = null;
    const t = v.escortOf === null ? undefined : (this.entities.get(v.escortOf) as Vehicle | undefined);
    if (!t || !t.alive) {
      v.escortOf = null; // transport lost: the tanker just goes home and stays there
      return;
    }
    const out = t.flight === 'taxi' || t.flight === 'takeoff' || t.flight === 'airborne' || t.flight === 'unloading' || t.flight === 'landed' || t.flight === 'liftoff';
    // Only a long sortie needs the tanker; on a short hop near home it stays parked (or flies back to park).
    const away = out && this.longSortie(t);
    if (v.flight === 'parked') {
      if (away && !v.moving) v.follow([{ x: t.px, y: t.py }]); // off after it
      return;
    }
    // Was coming in to land but the transport has set off again: break off the approach and catch up.
    if (v.flight === 'approach' && away) {
      this.leaveQueue(v);
      v.flight = 'airborne';
    }
    if (v.flight !== 'airborne' || !away) return; // on the runway, or the transport is heading home: normal flight
    // Station always ahead of the transport's nose — in the air and when it sets down in the field — never behind it.
    const lead = TANKER_LEAD_CELLS * CELL_SIZE;
    const goal = { x: t.px + Math.cos(t.heading) * lead, y: t.py + Math.sin(t.heading) * lead };
    // Flown here directly (not by waypoints, which brake on arrival and would leave it trailing): it closes on its
    // station well faster than the transport flies, then holds it, nose pointing the transport's way.
    if (v.moving) v.stop();
    const dx = goal.x - v.px;
    const dy = goal.y - v.py;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, Math.max(t.speed, v.speed) * 1.8 * dt);
    if (d > 0.01) this.place(v, v.px + (dx / d) * step, v.py + (dy / d) * step);
    v.walkPhase += step;
    v.heading = d > CELL_SIZE ? Math.atan2(dy, dx) : t.heading;
    v.facing = Math.cos(v.heading) < 0 ? -1 : 1;
    v.idleFor = 0;
    v.returningHome = false;
    this.orbits.delete(v.id);
  }

  /** Is the transport (or where it has been sent) farther than TANKER_ESCORT_DISTANCE from its airfield? */
  private longSortie(t: Vehicle): boolean {
    const home = this.home(t);
    if (!home) return true;
    const c = home.centerWorld();
    const far = (p: WorldPoint | undefined): boolean => p !== undefined && Math.hypot(p.x - c.x, p.y - c.y) > TANKER_ESCORT_DISTANCE;
    const path = t.mission ?? t.waypoints();
    return far({ x: t.px, y: t.py }) || far(path[path.length - 1]) || far(t.dropSpot ?? undefined);
  }

  /**
   * Two aircraft closing on each other: the one with the higher id climbs above cruise height until they have
   * passed, then eases back down (the other keeps its height).
   */
  private avoid(v: Vehicle, dt: number): void {
    let climb = false;
    const vx = Math.cos(v.heading);
    const vy = Math.sin(v.heading);
    for (const o of this.entities.vehicles()) {
      if (o === v || !o.aircraft || !o.alive || o.id > v.id || (o.flight !== 'airborne' && o.flight !== 'approach')) continue;
      const dx = o.px - v.px;
      const dy = o.py - v.py;
      if (Math.hypot(dx, dy) > AVOID_RANGE) continue;
      // Closing in: the gap shrinks along the relative velocity.
      const rvx = vx - Math.cos(o.heading);
      const rvy = vy - Math.sin(o.heading);
      if (dx * rvx + dy * rvy > 0 || Math.hypot(dx, dy) < AVOID_RANGE * 0.35) {
        climb = true;
        break;
      }
    }
    v.climb = Math.max(0, Math.min(1, v.climb + (climb ? 1.6 : -0.8) * dt));
    v.altitude = CRUISE_ALTITUDE * (1 + AVOID_CLIMB * v.climb);
    // A tanker whose transport has set down in the field comes down beside it (and climbs back with it).
    const t = v.isTanker && v.escortOf !== null ? (this.entities.get(v.escortOf) as Vehicle | undefined) : undefined;
    if (t && t.alive && (t.flight === 'unloading' || t.flight === 'landed' || t.flight === 'liftoff')) v.altitude = Math.min(v.altitude, t.altitude);
  }

  /** Flies a circle around the point where the fighter ran out of orders (clockwise, at cruise speed). */
  private orbit(v: Vehicle, dt: number): void {
    let o = this.orbits.get(v.id);
    if (!o) {
      // The circle starts at the aircraft's position, curving off its current heading.
      const side = v.heading + Math.PI / 2;
      o = { cx: v.px + Math.cos(side) * ORBIT_RADIUS, cy: v.py + Math.sin(side) * ORBIT_RADIUS, angle: side + Math.PI };
      this.orbits.set(v.id, o);
    }
    o.angle += ((v.speed * 0.7) / ORBIT_RADIUS) * dt;
    const x = o.cx + Math.cos(o.angle) * ORBIT_RADIUS;
    const y = o.cy + Math.sin(o.angle) * ORBIT_RADIUS;
    v.heading = Math.atan2(y - v.py, x - v.px);
    v.facing = Math.cos(v.heading) < 0 ? -1 : 1;
    v.walkPhase += Math.hypot(x - v.px, y - v.py);
    this.place(v, x, y);
  }

  /**
   * Lowest free parking spot at `home` (the aircraft's own spot is kept if nobody took it); -1 when the apron is full.
   * One spot holds one aircraft: every aircraft of the airfield keeps its spot reserved, also while it is out
   * flying, so it always lands back on its own numbered spot. Pass `v = null` for a brand-new aircraft.
   */
  freeSlot(v: Vehicle | null, home: Building, prefer = -1): number {
    const taken = this.takenSlots(v, home);
    if (v && v.slot >= 0 && !taken.has(v.slot)) return v.slot;
    // `prefer` is the spot ahead of another one: only meaningful within the same row.
    if (prefer > 0 && prefer < PARKING_SLOTS && prefer % SLOTS_PER_ROW !== 0 && !taken.has(prefer)) return prefer;
    for (let i = 0; i < PARKING_SLOTS; i++) if (!taken.has(i)) return i;
    return -1;
  }

  /**
   * Spot for a new transport that leaves the next spot of the same row (the one ahead of its nose, towards the runway
   * end) free for its tanker; any free spot when no such pair is left.
   */
  freeTransportSlot(home: Building): number {
    const taken = this.takenSlots(null, home);
    for (let i = 0; i < PARKING_SLOTS; i++) {
      if (i % SLOTS_PER_ROW < SLOTS_PER_ROW - 1 && !taken.has(i) && !taken.has(i + 1)) return i;
    }
    return this.freeSlot(null, home);
  }

  /** Spots of `home` held by its aircraft (other than `v`): a spot belongs to its aircraft even while it flies. */
  private takenSlots(v: Vehicle | null, home: Building): Set<number> {
    const taken = new Set<number>();
    for (const o of this.entities.vehicles()) {
      if (o !== v && o.aircraft && o.alive && o.homeId === home.id && o.slot >= 0) taken.add(o.slot);
    }
    return taken;
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
    // On its wheels an aircraft rolls the way its nose points: a sharp corner is turned on the spot first, so it
    // never slides sideways across the apron.
    if (Math.abs(diff) > 0.6) return false;
    this.place(v, v.px + Math.cos(v.heading) * step, v.py + Math.sin(v.heading) * step);
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

  /**
   * Joins the airfield's runway queue and reports whether the aircraft may use the runway now: the runway must be
   * free and nobody eligible may be ahead of it. Without power take-offs are held, but landings still go first.
   */
  private cleared(v: Vehicle, home: Building): boolean {
    // A transport never leads: the trip is measured before it rolls (longSortie), and on a long one it waits at the
    // threshold until its tanker's wheels are off the ground (whichever airfield the tanker stands on), so the tanker
    // is always out ahead of the transport's nose.
    if (v.isTransport && v.tankerId !== null && this.longSortie(v)) {
      const tk = this.entities.get(v.tankerId) as Vehicle | undefined;
      if (tk && tk.alive && (tk.flight === 'parked' || tk.flight === 'taxi' || tk.flight === 'takeoff' || tk.altitude < CRUISE_ALTITUDE * 0.5)) return false;
    }
    let q = this.runwayQueues.get(home.id);
    if (!q) this.runwayQueues.set(home.id, (q = []));
    // Drop aircraft that died, re-homed or stopped waiting for this runway.
    for (let i = q.length - 1; i >= 0; i--) {
      const o = this.entities.get(q[i]!) as Vehicle | undefined;
      if (!o || !o.alive || o.homeId !== home.id || (o.flight !== 'taxi' && o.flight !== 'approach')) q.splice(i, 1);
    }
    if (!q.includes(v.id)) q.push(v.id);
    if (this.runwayBusy(v, home)) return false;
    const powered = this.hooks.powered(v.owner);
    for (const id of q) {
      const o = this.entities.get(id) as Vehicle;
      if (o.flight === 'taxi' && !powered) continue; // held on the ground: lets the next one through
      return o === v;
    }
    return false;
  }

  private leaveQueue(v: Vehicle): void {
    for (const q of this.runwayQueues.values()) {
      const i = q.indexOf(v.id);
      if (i >= 0) q.splice(i, 1);
    }
  }

  /** Is another aircraft of this airfield taking off or landing right now? */
  private runwayBusy(v: Vehicle, home: Building): boolean {
    return this.entities.vehicles().some((o) => o !== v && o.aircraft && o.alive && o.homeId === home.id && (o.flight === 'takeoff' || o.flight === 'landing'));
  }

  /** Makes the nearest living airfield of the owner the aircraft's new home. False when the nation has none. */
  /** Is the aircraft flying to its own airfield's approach point? */
  private headingForApproach(v: Vehicle): boolean {
    const home = this.home(v);
    const pts = v.waypoints();
    const last = pts[pts.length - 1];
    if (!home || !last) return false;
    const a = this.approachFor(v, home).point;
    return Math.hypot(last.x - a.x, last.y - a.y) <= 1;
  }

  private adoptHome(v: Vehicle): boolean {
    // An airfield with a free spot first; a full one only when there is nothing else.
    const roomy = this.airfieldWithRoom(v);
    if (roomy) {
      v.homeId = roomy.id;
      v.slot = -1;
      v.idleFor = RETURN_AFTER;
      return true;
    }
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
    if (!v.isCarrier || !v.alive || v.cargo.length === 0) return 'empty';
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
    if (!v.isCarrier || !v.alive || (v.flight !== 'airborne' && v.flight !== 'approach')) return false;
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
    } else if (v.attackTarget !== null || v.attackMove !== null) v.returningHome = false;
    else v.returningHome = true;
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
