import type { Mobility } from '../map/Pathfinder';
import { demoActive } from '../core/Demo';
import { movesRight } from '../core/IsoView';
import { BOMB_FALL_SECONDS, HIGH_GROUND_DAMAGE, HIGH_GROUND_RANGE, LOW_GROUND_DAMAGE, BUNKER_COOLDOWN, BUNKER_DAMAGE, BUNKER_RANGE, BUNKER_VS_VEHICLE, MANTIS_HIT_SHARE, MANTIS_RANGE_CELLS, MANTIS_RANK_BONUS, MANTIS_EVADE_CELLS, HELI_VS_MANTIS_SHARE, JET_VS_MANTIS_SHARE, MANTIS_VS_JET_SHARE, MANTIS_VS_HELI_SHARE, MANTIS_RELOAD, JET_BOMB_VS_STRUCTURE, JET_BOMB_VS_VEHICLE, ACQUIRE_PERIOD, RANK_FIREPOWER, RANK_RELOAD, BOMB_GROUP_RADIUS_CELLS, BOMB_GROUP_SIZE, BOMB_TOUGH_DAMAGE, BOMB_TOUGH_STRUCTURES, BOMBS_PER_DROP, CELL_SIZE, CHASE_GIVE_UP_SECONDS, CHASE_LIMIT_CELLS, CHASE_PERIOD, FIGHT_MEMORY_SECONDS, GUARD_VISION_FACTOR, NEUTRAL_OWNER, RETALIATE_RANGE_FACTOR, WEAPONS, FIGHTER_DRONE_ALERT } from '../constants';
import { Building } from '../entities/Building';
import { Bunker } from '../entities/Bunker';
import type { Entity } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Infantry } from '../entities/Infantry';
import { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import type { Pathfinder } from '../map/Pathfinder';
import type { GridPoint, WeaponSpec, WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

export interface CombatHooks {
  /** A shot was fired: draw tracers and play the sound. `impact` is where it lands (world px). */
  onFire(shooter: Unit, target: Entity, weapon: WeaponSpec, impact: WorldPoint): void;
  /** A bunker's machine gun fired at `target`: tracer and muzzle flash. */
  onBunkerFire(bunker: Bunker, target: Unit): void;
  /** An entity ran out of health: remove it and show the explosion. */
  onDeath(entity: Entity, killer: Entity | undefined): void;
  /** `nation` let the retreating `fugitive` go instead of chasing it (once per nation per retreat). */
  onSpare(nation: number, fugitive: Unit): void;
  /** Is (x, y) inside a safe zone of the Global Monitoring Center? Nobody fights there. */
  safeAt(x: number, y: number): boolean;
  /** Structure that may not be attacked right now (the player's derricks during their grace period). */
  shielded(target: Entity): boolean;
  /** Is this nation's grid short of power (weak or blackout)? Its air-defence vehicles then lose their radar signal. */
  powerShort(owner: number): boolean;
  /** Route planner with the shared caches (an unreachable goal is not flooded again and again). */
  findPath(start: WorldPoint, goal: GridPoint, swim: Mobility): WorldPoint[];
}

/** Two entities are enemies when they belong to different nations (neutral ones are never targets). */
/** Ceasefire (the peace part of the war cycle): no nation may attack or take over another's. */
let truce = false;
export function setTruce(on: boolean): void {
  truce = on;
}
export function inTruce(): boolean {
  return truce;
}
/** Units breaking the ceasefire right now (see Game.updateViolators): fair game for every other nation, harmless themselves. */
let violators: ReadonlySet<number> = new Set();
export function setViolators(ids: ReadonlySet<number>): void {
  violators = ids;
}
export function isViolator(id: number): boolean {
  return violators.has(id);
}
/** Nations under a military embargo (Game.enforceEmbargoes): their units cannot attack anyone. */
let disarmed: ReadonlySet<number> = new Set();
export function setDisarmed(owners: ReadonlySet<number>): void {
  disarmed = owners;
}

/**
 * DEMO test games only: force fire. A unit given an explicit attack order on one of its own side's structures or units
 * (Ctrl+click) shoots it like an enemy.
 */
export function forceFire(a: Entity, b: Entity): boolean {
  return demoActive && a instanceof Unit && a.attackTarget === b.id && a.owner === b.owner && b.alive && !b.indestructible;
}

export function isHostile(a: Entity, b: Entity): boolean {
  if (disarmed.has(a.owner)) return false;
  // Ceasefire: nobody fights, except that a unit breaking it may be attacked by every other nation (and cannot hit back,
  // bar a tank's self-defence).
  if (truce) {
    // Self-defence: a tank caught in the ceasefire zone may shoot back at whoever fired on it first.
    if (a instanceof Vehicle && a.type === 'tank' && violators.has(a.id) && a.lastAttackerId === b.id && b.alive && a.owner !== b.owner) return true;
    return b instanceof Unit && violators.has(b.id) && !violators.has(a.id) && b.alive && a.owner !== b.owner && a.owner !== NEUTRAL_OWNER && b.owner !== NEUTRAL_OWNER;
  }
  // An engineer on his way to lease a derrick is a customer, not a target, for the derrick's owner.
  if (b instanceof Unit && b.task?.type === 'lease' && b.task.lessor === a.owner) return false;
  // A contested nation capital knocked down (no health left, never destroyed) is no longer worth a shot.
  if ('down' in b && b.down === true) return false;
  return a.owner !== b.owner && a.owner !== NEUTRAL_OWNER && b.owner !== NEUTRAL_OWNER && !b.indestructible && b.alive;
}

/**
 * Can `shooter` hurt `target` at all? Aircraft in flight can only be hit by other aircraft
 * (with a weapon that reaches the air); soldiers and ground vehicles never shoot at them.
 */
export function canTarget(shooter: Unit, target: Entity): boolean {
  const w = shooter.weapon;
  if (!w || !(isHostile(shooter, target) || forceFire(shooter, target))) return false;
  if (shooter.unarmedTransport) return false; // transports never attack anything
  // An independent nation's capital (Japan, Korea, Cuba…) may never be attacked, only taken by an engineer.
  if (target instanceof Building && target.spec.type === 'nationCapital') return false;
  // An aircraft already going down (out of fuel, no airfield) is as good as dead: nobody wastes shots on it.
  if (target instanceof Vehicle && target.flight === 'crashing') return false;
  // An air-defence vehicle is hit from the air by bombs (bomber, fighter with a bomb left; never a fighter's guns)
  // or by an attack helicopter (HELI_VS_MANTIS_SHARE of its health per hit).
  if (shooter instanceof Vehicle && shooter.aircraft && target instanceof Vehicle && target.type === 'mantis')
    return shooter.type === 'bomber' || shooter.isHeli || (shooter.type === 'jet' && shooter.bombs > 0);
  // Attack helicopters hunt soldiers and ground vehicles (HELI_FIREPOWER keeps each hit under a tank's): no structures
  // or aircraft. Self-defence: also the ground attacker that shot it while it stood landed.
  if (shooter instanceof Vehicle && shooter.isHeli)
    return (target instanceof Vehicle && !target.aircraft) || (target instanceof Infantry && !target.flies) || (shooter.heliRevenge === target.id && target instanceof Unit && !target.flies);
  // Air-defence vehicle (NOMADS / Buk-M3): any enemy aircraft off the ground (altitude > 0), whatever it is doing —
  // cruising, hovering, lifting off, climbing, descending. Never one standing on the ground.
  if (shooter instanceof Vehicle && shooter.type === 'mantis') return target instanceof Vehicle && (target.aircraft || target.isDrone) && target.altitude > 0;
  if (target instanceof Unit && target.flies) return shooter.aircraft && w.hitsAir;
  // Special forces never shoot ground vehicles: they plant a bomb on them instead (Game.processDemolition).
  if (shooter instanceof Infantry && shooter.isSpecial && target instanceof Vehicle) return false;
  return true;
}

/** Distance (world px) from point (x, y) to an entity (to the nearest edge for buildings). */
export function distanceTo(x: number, y: number, e: Entity): number {
  if (e instanceof Building) {
    const f = e.footprintWorld();
    return Math.hypot(Math.max(f.x - x, 0, x - (f.x + f.w)), Math.max(f.y - y, 0, y - (f.y + f.h)));
  }
  if (e instanceof Unit) return Math.hypot(e.px - x, e.py - y);
  return Infinity;
}

const HASH = 48;
/** Seconds between two tries of a unit to resume its attack-move (each try is a full path search). */
const RESUME_RETRY = 1;
/** Most attack-move route searches (resumeAttackMove) run in one tick. */
const RESUME_SEARCHES_PER_TICK = 2;
/** Longest weapon range in the game (world px, before faction multipliers), with room for them. */
const MAX_WEAPON_RANGE = Math.max(...Object.values(WEAPONS).map((w) => w.range)) * 1.5;
/** A retreating unit's group (one order = one group), or the unit alone. */
const retreatKey = (u: Unit): string => (u.retreatGroup > 0 ? `g${u.retreatGroup}` : `u${u.id}`);

/**
 * Fighting: every armed unit shoots the nearest enemy in range (soldiers,
 * vehicles and aircraft — never structures on their own), hits back at attackers, obeys
 * explicit attack orders and attack-move, and chases when ordered to.
 * Damage, splash and kills are resolved here; effects/sound/removal are
 * delegated to `hooks`.
 */
/** Chase / evade route searches per combat tick at most (each is a full A*). */
const CHASE_ROUTES_PER_TICK = 3;

export class CombatSystem implements GameSystem {
  private time = 0;
  private readonly chaseAt = new Map<number, number>();
  /** Unit id → game time of its next attack-move resume try. */
  private readonly resumeAt = new Map<number, number>();
  /** Attack-move route searches run this tick (see RESUME_SEARCHES_PER_TICK). */
  private resumeSearches = 0;
  private readonly grid = new Map<number, Unit[]>();
  private readonly pool: Unit[][] = [];
  /**
   * Retreating groups still caught among a nation's units this tick, as `group:nation` keys: at least one member of the
   * group stands within weapon range of one of that nation's units. Rebuilt every tick (see markEntangled).
   */
  private readonly entangled = new Set<string>();
  /** Bomb hits still falling: each lands (deals its damage) at `at` — a bomber's stick, or one fighter bomb. Plain data (saved games). */
  private readonly falling: { at: number; kind: 'stick' | 'jet'; shooter: Vehicle; target: Entity; impact: WorldPoint }[] = [];

  constructor(
    private readonly entities: EntityManager,
    private readonly pathfinder: Pathfinder,
    private readonly hooks: CombatHooks,
  ) {}

  /** Route searches still allowed this tick (see chase). */
  private chaseBudget = 0;

  update(dt: number): void {
    this.resumeSearches = 0;
    this.time += dt;
    this.chaseBudget = CHASE_ROUTES_PER_TICK;
    if (this.falling.length > 0) {
      const due = this.falling.filter((f) => f.at <= this.time);
      if (due.length > 0) {
        this.falling.splice(0, this.falling.length, ...this.falling.filter((f) => f.at > this.time));
        for (const f of due) this.land(f);
      }
    }
    const movers = this.entities.fieldMovers();
    // Spatial hash reused every tick: emptied bucket arrays go back to a pool instead of becoming garbage.
    const grid = this.grid;
    for (const list of grid.values()) {
      list.length = 0;
      this.pool.push(list);
    }
    grid.clear();
    const key = (cx: number, cy: number): number => cx * 100003 + cy;
    for (const u of movers) {
      if (!u.alive) continue;
      const k = key(Math.floor(u.px / HASH), Math.floor(u.py / HASH));
      const list = grid.get(k);
      if (list) list.push(u);
      else {
        const fresh = this.pool.pop() ?? [];
        fresh.push(u);
        grid.set(k, fresh);
      }
    }
    this.markEntangled(movers, grid, key);
    for (const s of movers) {
      if (!s.alive) continue;
      s.cooldown = Math.max(0, s.cooldown - dt);
      if (s.weapon && s.canFight) this.think(s, grid);
    }
    this.bunkers(dt, grid, key);
    this.reap();
  }

  // ------------------------------------------------------------------ bunkers

  /** Self-firing bunkers: each shoots the nearest enemy soldier or ground vehicle in range (never aircraft). */
  private bunkers(dt: number, grid: Map<number, Unit[]>, key: (cx: number, cy: number) => number): void {
    for (const b of this.entities.buildings()) {
      if (!(b instanceof Bunker) || !b.alive || b.owner === NEUTRAL_OWNER) continue;
      b.cooldown = Math.max(0, b.cooldown - dt);
      b.firing = Math.max(0, b.firing - dt);
      if (b.cooldown > 0) continue;
      const c = b.centerWorld();
      if (this.hooks.safeAt(c.x, c.y)) continue;
      const f = b.footprintWorld();
      let best: Unit | undefined;
      let bestD = Infinity;
      const r = Math.ceil((BUNKER_RANGE + f.w) / HASH);
      const hx = Math.floor(c.x / HASH);
      const hy = Math.floor(c.y / HASH);
      for (let gy = hy - r; gy <= hy + r; gy++) {
        for (let gx = hx - r; gx <= hx + r; gx++) {
          for (const o of grid.get(key(gx, gy)) ?? []) {
            if (o.flies || !isHostile(b, o) || this.sheltered(o)) continue;
            // Range is measured from the bunker's edge.
            const d = Math.hypot(Math.max(f.x - o.px, 0, o.px - (f.x + f.w)), Math.max(f.y - o.py, 0, o.py - (f.y + f.h)));
            if (d <= BUNKER_RANGE && d < bestD) {
              bestD = d;
              best = o;
            }
          }
        }
      }
      if (!best) continue;
      b.cooldown = BUNKER_COOLDOWN;
      b.firing = 0.3;
      b.aimHeading = Math.atan2(best.py - c.y, best.px - c.x);
      best.damage(BUNKER_DAMAGE * (best instanceof Vehicle ? BUNKER_VS_VEHICLE : 1));
      best.lastAttackerId = b.id;
      best.lastAttackedAt = this.time;
      best.fightingWith.set(b.owner, this.time);
      this.hooks.onBunkerFire(b, best);
    }
  }

  // ------------------------------------------------------------------ per-unit logic

  private think(s: Unit, grid: Map<number, Unit[]>): void {
    const w = s.weapon;
    if (!w) return;
    // Air-defence vehicle: every veteran star adds one cell of range (its own weapon copy, set from the current rank).
    if (s instanceof Vehicle && s.type === 'mantis') {
      // It runs on the radar signal: with the nation's power weak it cannot fire (it may still drive where it is sent).
      if (this.hooks.powerShort(s.owner)) {
        s.combatTarget = null;
        s.engaged = false;
        return;
      }
      w.range = (MANTIS_RANGE_CELLS + s.rank) * CELL_SIZE;
      if (this.mantisUnderFire(s, w)) return;
    }
    // Out of bombs: a bomber is done and flies home at once to rearm; a fighter sent against a structure (which
    // only bombs can hit) does the same, otherwise it keeps fighting with its guns.
    const bombingOrder = s.attackTarget !== null && this.entities.get(s.attackTarget) instanceof Building;
    if (s instanceof Vehicle && s.maxBombs > 0 && s.bombs <= 0 && (s.type === 'bomber' || bombingOrder)) {
      if (s.flies && !s.returningHome) {
        s.combatTarget = null;
        s.attackTarget = null;
        s.attackMove = null;
        s.engaged = false;
        s.stop();
        s.returningHome = true; // even while selected it does not wait for orders
        s.idleFor = Number.POSITIVE_INFINITY;
      }
      return;
    }
    // Safe zone: units inside it never fight.
    if (this.hooks.safeAt(s.px, s.py)) {
      s.combatTarget = null;
      s.attackTarget = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }
    if (!s.moving) {
      s.chasing = false;
      s.retreating = false;
    }
    // A bomber never bombs on its own: only on an order (an attack order or an attack-move).
    if (s instanceof Vehicle && s.type === 'bomber' && s.attackTarget === null && s.attackMove === null) {
      s.combatTarget = null;
      s.engaged = false;
      return;
    }
    let target = this.currentTarget(s);
    // A helicopter never attacks on its own: only on an order (attack order / attack-move) or to hit back at whoever
    // shot it (player and AI alike).
    if (s instanceof Vehicle && s.isHeli && s.attackTarget === null && s.attackMove === null) {
      const foe = this.heliFoe(s, w, target);
      s.combatTarget = foe?.id ?? null;
      if (!foe) {
        s.engaged = false;
        return;
      }
      target = foe;
    }

    // Explicit attack order beats everything else.
    if (s.attackTarget !== null) {
      const ordered = this.entities.get(s.attackTarget);
      if (!ordered || !ordered.alive || !(isHostile(s, ordered) || forceFire(s, ordered)) || !this.canHit(s, w, ordered) || this.sheltered(ordered)) s.attackTarget = null;
      else target = ordered;
    }

    // A fighter without an explicit order goes after an enemy kamikaze drone diving at its own nation first (danger).
    if (s instanceof Vehicle && s.type === 'jet' && s.attackTarget === null) {
      const drone = this.dangerousDrone(s, w);
      if (drone) target = drone;
    }

    // Auto targets are dropped when they walk too far away. An air-defence vehicle drops an aircraft as soon as it leaves its range,
    // so it is always free to engage whatever is in range.
    // Ground units without an attack order (explicit target or attack-move) hold their ground too: they shoot what is in
    // range but never set off after an enemy on their own.
    const holdsSpot = (s instanceof Vehicle && s.type === 'mantis') || (!s.flies && s.attackTarget === null && s.attackMove === null);
    if (target && s.attackTarget === null && distanceTo(s.px, s.py, target) > (holdsSpot ? w.range : w.range * GUARD_VISION_FACTOR * 1.25)) target = undefined;

    // An air-defence vehicle sweeps its range every tick: an aircraft entering it is locked at once (no search delay),
    // and it always switches to the nearest aircraft in range unless it has an explicit attack order.
    const sweeps = s instanceof Vehicle && s.type === 'mantis';
    if (sweeps && s.attackTarget === null) target = this.acquire(s, w, grid) ?? target;
    else if (!target && this.time >= s.nextThink) {
      target = this.acquire(s, w, grid);
      s.nextThink = this.time + ACQUIRE_PERIOD + (s.id % 4) * 0.04;
    }
    // Busy with a building but an enemy soldier / vehicle shows up: deal with that first.
    if (target instanceof Building && s.attackTarget === null && this.time >= s.nextThink) {
      const better = this.acquire(s, w, grid);
      s.nextThink = this.time + ACQUIRE_PERIOD + (s.id % 4) * 0.04;
      if (better) target = better;
    }
    // Shot by an enemy bunker with no enemy soldier / vehicle to fight: go and attack that bunker (player and AI alike).
    const bunkerFoe = !target || target instanceof Building ? this.bunkerAttacker(s, w) : undefined;
    if (bunkerFoe) target = bunkerFoe;
    s.combatTarget = target?.id ?? null;

    if (!target) {
      // Back home (or stopped) with nobody to fight: the next chase measures from here.
      if (!s.moving) s.chaseFrom = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }

    const d = distanceTo(s.px, s.py, target);
    // A retreating enemy may be shot while in range, but never chased on a unit's own initiative. An explicit attack
    // order on it (the player's or the AI's choice) is carried out: the unit goes after it.
    if (target instanceof Unit && s.attackTarget !== target.id && this.protectedFrom(s, target) && d > w.range) {
      if (!target.sparedBy.has(s.owner)) {
        target.sparedBy.add(s.owner);
        this.hooks.onSpare(s.owner, target);
      }
      s.combatTarget = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }
    const tx = target instanceof Unit ? target.px : target instanceof Building ? target.centerWorld().x : s.px;
    const ty = target instanceof Unit ? target.py : target instanceof Building ? target.centerWorld().y : s.py;
    s.aimHeading = Math.atan2(ty - s.py, tx - s.px);
    if (d <= w.range * this.heightReach(s)) {
      // A unit on its way somewhere (plain move order) shoots on the move: only its gun turns to the target (aimHeading),
      // the hull keeps steering along its route (turning it to the target every tick pinned it in place).
      // A tank keeps its hull where it is: only the turret turns to the target (it fires once the gun is laid).
      const tank = s instanceof Vehicle && s.type === 'tank';
      if (!tank && (!s.moving || s.attackTarget !== null || s.attackMove)) {
        s.facing = movesRight(tx - s.px, ty - s.py) ? 1 : -1;
        s.heading = Math.atan2(ty - s.py, tx - s.px);
      }
      // Units on attack orders stand and fight; ones just passing through keep walking and shooting.
      if (s.attackTarget !== null || s.attackMove) s.stop();
      if (s.cooldown <= 0 && (!tank || (s as Vehicle).turretOnTarget) && this.canHit(s, w, target)) this.fire(s, target, w);
      return;
    }

    // Idle units, attack-movers, attack orders and retaliators move in; units on a plain move order keep walking.
    // An air-defence vehicle holds its firing spot: it only shoots what comes into range and moves only when ordered (a move or an
    // explicit attack order), never chasing on its own.
    if (holdsSpot && s.attackTarget === null && !bunkerFoe) return;
    // An aircraft on a plain move order flies there: it shoots what passes in range but is not pulled off course.
    const plainFlight = s.flies && s.moving && !s.chasing && !(s instanceof Vehicle && (s.returningHome || s.guardId !== null));
    const mayChase = s.chasing || (s.flies && !plainFlight) || s.attackTarget !== null || s.attackMove !== null || !!bunkerFoe;
    if (mayChase) this.chase(s, target, w);
  }

  /**
   * Idle air-defence vehicle just hit (no orders, standing still): an aircraft it can shoot but that is out of range is
   * driven at until in range; anything it cannot shoot back (ground units, a grounded aircraft) makes it pull back
   * MANTIS_EVADE_CELLS away from the attacker. Returns true when it moved this tick (player and AI alike).
   */
  private mantisUnderFire(s: Vehicle, w: WeaponSpec): boolean {
    if (s.moving || s.attackTarget !== null || s.attackMove !== null || s.lastAttackerId === null) return false;
    if (this.time - s.lastAttackedAt > 1) return false;
    const a = this.entities.get(s.lastAttackerId);
    if (!a || !a.alive || !isHostile(s, a) || !(a instanceof Unit)) return false;
    const d = distanceTo(s.px, s.py, a);
    if (this.canHit(s, w, a)) {
      if (d <= w.range) return false; // in range: the normal sweep shoots it
      this.chase(s, a, w);
      return true;
    }
    if ((this.chaseAt.get(s.id) ?? 0) > this.time) return true;
    if (this.chaseBudget-- <= 0) return true;
    this.chaseAt.set(s.id, this.time + CHASE_PERIOD + (s.id % 8) * 0.05);
    const dx = s.px - a.px;
    const dy = s.py - a.py;
    const len = Math.hypot(dx, dy) || 1;
    const to = this.pathfinder.nearestPassable(
      Math.floor((s.px + (dx / len) * MANTIS_EVADE_CELLS * CELL_SIZE) / CELL_SIZE),
      Math.floor((s.py + (dy / len) * MANTIS_EVADE_CELLS * CELL_SIZE) / CELL_SIZE),
      6,
      undefined,
      s.mobility,
    );
    if (!to) return false;
    s.follow(this.hooks.findPath({ x: s.px, y: s.py }, to, s.mobility));
    return true;
  }

  /**
   * The enemy bunker that shot `s` in the last 6 s, when `s` is free to hit back: no attack order, not on a plain move
   * order, not retreating, a ground weapon able to hit it. Ground units go after it even though they otherwise hold their spot.
   */
  private bunkerAttacker(s: Unit, w: WeaponSpec): Bunker | undefined {
    if (s.attackTarget !== null || s.lastAttackerId === null || s.retreating) return undefined;
    if (s.moving && s.attackMove === null && !s.chasing) return undefined;
    if (this.time - s.lastAttackedAt >= 6) return undefined;
    const a = this.entities.get(s.lastAttackerId);
    if (!(a instanceof Bunker) || !a.alive || !isHostile(s, a) || this.sheltered(a) || !this.canHit(s, w, a)) return undefined;
    return a;
  }

  /** The enemy an order-less helicopter may fight: the one it is already hitting back at, or whoever shot it in the last 6 s. */
  private heliFoe(s: Vehicle, w: WeaponSpec, current: Entity | undefined): Entity | undefined {
    if (current && (current.id === s.heliRevenge || current.id === s.lastAttackerId)) return current;
    if (s.lastAttackerId === null || this.time - s.lastAttackedAt >= 6) return undefined;
    const a = this.entities.get(s.lastAttackerId);
    if (!a || !a.alive || !isHostile(s, a) || !this.canHit(s, w, a) || this.sheltered(a)) return undefined;
    if (a instanceof Unit && !a.visible) return undefined;
    return a;
  }

  private currentTarget(s: Unit): Entity | undefined {
    if (s.combatTarget === null) return undefined;
    const e = this.entities.get(s.combatTarget);
    if (!e || !e.alive || !isHostile(s, e) || !s.weapon || !this.canHit(s, s.weapon, e)) return undefined;
    if (e instanceof Unit && !e.visible) return undefined;
    if (this.sheltered(e)) return undefined;
    return e;
  }

  /** A unit standing (or flying) inside a safe zone may not be attacked. */
  private sheltered(e: Entity): boolean {
    if (e instanceof Unit) return this.hooks.safeAt(e.px, e.py);
    return this.hooks.shielded(e);
  }

  private canHit(s: Unit, _w: WeaponSpec, t: Entity): boolean {
    // Aircraft hit structures only with bombs; a fighter fights every other unit with its guns.
    if (s instanceof Vehicle && s.type === 'jet' && t instanceof Building && s.bombs <= 0) return false;
    return canTarget(s, t);
  }

  /**
   * Nearest enemy soldier, vehicle or aircraft in sight; an attacker that hit us counts too. Structures are never
   * picked here: a unit only attacks a building when it has been ordered to focus on it (attackTarget).
   */
  /**
   * Nearest enemy kamikaze drone in the air, diving at a structure or unit of `s`'s nation, within
   * FIGHTER_DRONE_ALERT × its weapon range: a fighter sees it as a danger and shoots it down before anything else.
   */
  private dangerousDrone(s: Vehicle, w: WeaponSpec): Vehicle | undefined {
    let best: Vehicle | undefined;
    let bestD = w.range * FIGHTER_DRONE_ALERT;
    for (const d of this.entities.vehicles()) {
      if (!d.isDrone || !d.alive || !d.flies || d.diveTargetId === null || !isHostile(s, d) || !this.canHit(s, w, d)) continue;
      const aim = this.entities.get(d.diveTargetId);
      if (!aim || aim.owner !== s.owner) continue;
      const dist = Math.hypot(d.px - s.px, d.py - s.py);
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  private acquire(s: Unit, w: WeaponSpec, grid: Map<number, Unit[]>): Entity | undefined {
    const cx = Math.floor(s.px / HASH);
    const cy = Math.floor(s.py / HASH);
    // An air-defence vehicle, or a ground unit without an attack order, never chases: it only looks inside its range.
    const holdsSpot = (s instanceof Vehicle && s.type === 'mantis') || (!s.flies && s.attackTarget === null && s.attackMove === null);
    const sight = holdsSpot ? w.range : w.range * GUARD_VISION_FACTOR;
    const reach = Math.ceil(sight / HASH);
    let best: Entity | undefined;
    let bestD = sight;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const cell = grid.get((cx + dx) * 100003 + cy + dy);
        if (!cell) continue;
        for (const o of cell) {
          if (!isHostile(s, o) || !this.canHit(s, w, o)) continue;
          const d = Math.hypot(o.px - s.px, o.py - s.py);
          if ((this.protectedFrom(s, o) && d > w.range) || this.sheltered(o)) continue;
          if (d > w.range && (s.ignoreUntil.get(o.id) ?? 0) > this.time) continue;
          if (d < bestD) {
            best = o;
            bestD = d;
          }
        }
      }
    }
    if (best || holdsSpot) return best;
    // Hit back at whoever shot us recently, even from beyond our range.
    if (s.lastAttackerId !== null && this.time - s.lastAttackedAt < 6) {
      const a = this.entities.get(s.lastAttackerId);
      if (a && a.alive && isHostile(s, a) && this.canHit(s, w, a) && !this.sheltered(a) && (s.ignoreUntil.get(a.id) ?? 0) <= this.time && distanceTo(s.px, s.py, a) < w.range * RETALIATE_RANGE_FACTOR) return a;
    }
    return undefined;
  }

  /**
   * Does `s` have to let the retreating `o` go (shoot only while in range, never chase)? Only for nations `o` was
   * fighting: a nation that stayed out of that fight may attack a retreating unit passing by like any other enemy.
   */
  private protectedFrom(s: Unit, o: Unit): boolean {
    if (!o.retreating) return false;
    const at = o.fightingWith.get(s.owner);
    if (at === undefined || this.time - at > FIGHT_MEMORY_SECONDS) return false;
    // Still caught among that nation's units: while any unit of the retreating group is within weapon range of one of
    // them, the whole group may be fought (and chased) by that nation. The retreat protects it only once every unit of
    // the group is out of that nation's range.
    return !this.entangled.has(`${retreatKey(o)}:${s.owner}`);
  }

  /** Finds the retreating groups still within weapon range of some unit of each hostile nation (see `entangled`). */
  private markEntangled(movers: readonly Unit[], grid: Map<number, Unit[]>, key: (cx: number, cy: number) => number): void {
    this.entangled.clear();
    const reach = Math.ceil(MAX_WEAPON_RANGE / HASH);
    for (const o of movers) {
      if (!o.alive || !o.retreating || this.sheltered(o)) continue;
      const cx = Math.floor(o.px / HASH);
      const cy = Math.floor(o.py / HASH);
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        for (let gy = cy - reach; gy <= cy + reach; gy++) {
          for (const m of grid.get(key(gx, gy)) ?? []) {
            const w = m.weapon;
            if (!w || !m.alive || !m.canFight || !isHostile(m, o) || !this.canHit(m, w, o)) continue;
            if (Math.hypot(m.px - o.px, m.py - o.py) <= w.range) this.entangled.add(`${retreatKey(o)}:${m.owner}`);
          }
        }
      }
    }
  }

  /**
   * A bomber's drop (BOMBS_PER_DROP bombs): a structure is destroyed outright (cities and airfields lose
   * BOMB_TOUGH_DAMAGE of their max health instead); on troops the whole group around the impact is hit — a group
   * smaller than BOMB_GROUP_SIZE is wiped out, a bigger one loses a third (nearest the impact first).
   */
  private dropBombs(s: Vehicle, t: Entity, impact: WorldPoint): void {
    s.bombs = Math.max(0, s.bombs - BOMBS_PER_DROP); // the last bomb is dropped alone
    // Nothing is hit until the bombs reach the ground and explode.
    this.falling.push({ at: this.time + BOMB_FALL_SECONDS, kind: 'stick', shooter: s, target: t, impact });
  }

  /** A falling bomb reaches the ground. */
  private land(f: { kind: 'stick' | 'jet'; shooter: Vehicle; target: Entity; impact: WorldPoint }): void {
    const { shooter: s, target: t } = f;
    if (!s || !t) return; // (a saved game whose bomber or target no longer exists)
    if (f.kind === 'stick') {
      this.bombsLand(s, t, f.impact);
      return;
    }
    if (!t.alive) return;
    // On an air-defence vehicle a fighter's bomb takes JET_VS_MANTIS_SHARE of its full health.
    const vsVehicle = t instanceof Vehicle && t.type === 'mantis' ? JET_VS_MANTIS_SHARE : JET_BOMB_VS_VEHICLE;
    t.damage(t instanceof Building ? t.maxHp * JET_BOMB_VS_STRUCTURE : t instanceof Vehicle ? t.maxHp * vsVehicle : Infinity); // a soldier: dead, veteran or not
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
  }

  /** The bomber's stick explodes: a structure is flattened (tough ones lose half), or the troops round the impact die. */
  private bombsLand(s: Vehicle, t: Entity, impact: WorldPoint): void {
    const hit = (o: Entity, amount: number): void => {
      if (!o.alive) return;
      o.damage(amount);
      o.lastAttackerId = s.id;
      o.lastAttackedAt = this.time;
    };
    if (t instanceof Building) {
      hit(t, BOMB_TOUGH_STRUCTURES.includes(t.spec.type) ? t.maxHp * BOMB_TOUGH_DAMAGE : t.hp);
      return;
    }
    const at = t instanceof Unit ? { x: t.px, y: t.py } : impact;
    const group = this.entities
      .fieldMovers()
      .filter((o) => o.alive && !o.flies && isHostile(s, o) && !this.sheltered(o) && Math.hypot(o.px - at.x, o.py - at.y) <= BOMB_GROUP_RADIUS_CELLS * CELL_SIZE)
      .sort((a, b) => Math.hypot(a.px - at.x, a.py - at.y) - Math.hypot(b.px - at.x, b.py - at.y));
    const dead = group.length < BOMB_GROUP_SIZE ? group.length : Math.round(group.length / 3);
    for (const o of group.slice(0, dead)) hit(o, Infinity);
  }

  private fire(s: Unit, t: Entity, w: WeaponSpec): void {
    // The air-defence vehicle reloads in MANTIS_RELOAD (one missile at a time, so it never keeps firing at an aircraft it
    // has already brought down).
    s.cooldown = s instanceof Vehicle && s.type === 'mantis' ? MANTIS_RELOAD : w.cooldown * RANK_RELOAD[s.rank];
    s.fightingWith.set(t.owner, this.time);
    if (t instanceof Unit) t.fightingWith.set(s.owner, this.time);
    const impact = this.impactPoint(t);
    if (s instanceof Vehicle && s.type === 'bomber') {
      this.dropBombs(s, t, impact);
      s.engaged = true;
      this.hooks.onFire(s, t, w, impact);
      return;
    }
    if (s instanceof Vehicle && s.type === 'jet' && s.bombs > 0 && !(t instanceof Unit && t.flies)) {
      // Fighter on a ground target with a bomb left: a tenth of a structure, 60% of a vehicle, a soldier dead.
      // (Aircraft, and ground units once the bombs are gone, get the guns below.)
      s.bombs--;
      // The damage lands when the bomb explodes, BOMB_FALL_SECONDS after release.
      this.falling.push({ at: this.time + BOMB_FALL_SECONDS, kind: 'jet', shooter: s, target: t, impact });
      s.engaged = true;
      this.hooks.onFire(s, t, { ...w, kind: 'bomb' }, impact);
      return;
    }
    // Air-defence missile on an aircraft: MANTIS_HIT_SHARE of its full health per hit (MANTIS_VS_JET_SHARE on a
    // fighter, MANTIS_VS_HELI_SHARE on a helicopter), +MANTIS_RANK_BONUS per veteran star.
    const flak = s instanceof Vehicle && s.type === 'mantis' && t instanceof Vehicle && t.aircraft;
    const flakShare = !(t instanceof Vehicle) ? MANTIS_HIT_SHARE : t.type === 'jet' ? MANTIS_VS_JET_SHARE : t.isHeli ? MANTIS_VS_HELI_SHARE : MANTIS_HIT_SHARE;
    // Attack helicopter on an air-defence vehicle: HELI_VS_MANTIS_SHARE of its full health per hit.
    const heliOnFlak = s instanceof Vehicle && s.isHeli && t instanceof Vehicle && t.type === 'mantis';
    const dmg = flak ? t.maxHp * flakShare * (1 + MANTIS_RANK_BONUS * s.rank) : heliOnFlak ? t.maxHp * HELI_VS_MANTIS_SHARE : w.damage * RANK_FIREPOWER[s.rank] * (t instanceof Building ? w.vsBuilding : 1) * this.heightFactor(s, t);
    t.damage(dmg);
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
    if (w.splash > 0) {
      for (const o of this.entities.fieldMovers()) {
        if (o === t || !isHostile(s, o) || !this.canHit(s, w, o) || this.sheltered(o)) continue;
        if (Math.hypot(o.px - impact.x, o.py - impact.y) <= w.splash) {
          o.damage(dmg * 0.5);
          o.lastAttackerId = s.id;
          o.lastAttackedAt = this.time;
        }
      }
    }
    s.engaged = true;
    this.hooks.onFire(s, t, w, impact);
  }

  /** A ground unit on a mountain ledge (high ground) reaches HIGH_GROUND_RANGE farther. */
  private heightReach(s: Unit): number {
    return !s.flies && this.pathfinder.highGround(s.px, s.py) ? HIGH_GROUND_RANGE : 1;
  }

  /**
   * High ground: a ground shooter on a ledge firing at a target below hits HIGH_GROUND_DAMAGE harder; a ground shooter
   * below firing at a unit on a ledge does LOW_GROUND_DAMAGE. Aircraft are not affected.
   */
  private heightFactor(s: Unit, t: Entity): number {
    if (s.flies || !(t instanceof Unit) || t.flies) return 1;
    const up = this.pathfinder.highGround(s.px, s.py);
    const targetUp = this.pathfinder.highGround(t.px, t.py);
    if (up && !targetUp) return HIGH_GROUND_DAMAGE;
    if (!up && targetUp) return LOW_GROUND_DAMAGE;
    return 1;
  }

  private impactPoint(t: Entity): WorldPoint {
    if (t instanceof Unit) return { x: t.px, y: t.py - t.bodyHeight * 0.6 };
    if (t instanceof Building) {
      const c = t.centerWorld();
      return { x: c.x + ((t.id * 7) % 9) - 4, y: c.y - 6 };
    }
    return { x: 0, y: 0 };
  }

  /** Walks (or flies) towards the target until it is in range. */
  private chase(s: Unit, t: Entity, w: WeaponSpec): void {
    // Ground vehicles never hunt a fleeing enemy far: CHASE_LIMIT_CELLS from where the chase began they give up and
    // head back there on their own (an explicit order to attack that target is exempt).
    if (s instanceof Vehicle && !s.aircraft && s.attackTarget === null) {
      // The spot is kept while it switches from one target to the next: the limit counts from where the fighting began.
      if (!s.chaseFrom) s.chaseFrom = { x: s.px, y: s.py, target: t.id };
      const from = s.chaseFrom;
      if (Math.hypot(s.px - from.x, s.py - from.y) > CHASE_LIMIT_CELLS * CELL_SIZE) {
        s.ignoreUntil.set(t.id, this.time + CHASE_GIVE_UP_SECONDS);
        s.chaseFrom = null;
        s.combatTarget = null;
        s.engaged = false;
        s.chasing = false;
        const back = this.pathfinder.nearestPassable(Math.floor(from.x / CELL_SIZE), Math.floor(from.y / CELL_SIZE), 6, undefined, s.mobility);
        if (back) s.follow(this.pathfinder.find({ x: s.px, y: s.py }, back, s.mobility));
        else s.stop();
        return;
      }
    }
    if ((this.chaseAt.get(s.id) ?? 0) > this.time) return;
    // A few route searches per tick at most (a big battle would otherwise plan every chaser in the same tick): the
    // rest try again next tick. The period is spread by id so chasers do not stay in step.
    if (!s.aircraft && this.chaseBudget-- <= 0) return;
    this.chaseAt.set(s.id, this.time + CHASE_PERIOD + (s.id % 8) * 0.05);
    s.chasing = true;
    const target = t instanceof Unit ? { x: t.px, y: t.py } : t instanceof Building ? t.centerWorld() : null;
    if (!target) return;
    if (s.aircraft) {
      const dx = target.x - s.px;
      const dy = target.y - s.py;
      const d = Math.hypot(dx, dy) || 1;
      const stop = Math.max(0, d - w.range * 0.7);
      s.follow([{ x: s.px + (dx / d) * stop, y: s.py + (dy / d) * stop }]);
      return;
    }
    // Nearest standable cell to a point just inside weapon range of the target.
    const cell = this.pathfinder.nearestPassable(Math.floor(target.x / CELL_SIZE), Math.floor(target.y / CELL_SIZE), 12, undefined, s.mobility);
    if (!cell) return;
    s.follow(this.hooks.findPath({ x: s.px, y: s.py }, cell, s.mobility));
  }

  /** After a fight, an attack-moving unit carries on to its destination. */
  private resumeAttackMove(s: Unit): void {
    const dest = s.attackMove;
    if (!dest || s.moving || s.routePending) return;
    if (Math.hypot(dest.x - s.px, dest.y - s.py) < CELL_SIZE * 2) {
      s.attackMove = null;
      return;
    }
    if (s.aircraft) {
      s.follow([dest]);
      return;
    }
    // A full A* search per call: at most one try per RESUME_RETRY seconds per unit (it used to run every tick), and
    // at most RESUME_SEARCHES_PER_TICK of them in one tick (a whole army resuming at once froze the game a moment):
    // the rest simply try on the following ticks.
    if ((this.resumeAt.get(s.id) ?? 0) > this.time) return;
    if (this.resumeSearches >= RESUME_SEARCHES_PER_TICK) return;
    this.resumeSearches++;
    this.resumeAt.set(s.id, this.time + RESUME_RETRY);
    const cell = this.pathfinder.nearestPassable(Math.floor(dest.x / CELL_SIZE), Math.floor(dest.y / CELL_SIZE), 10, undefined, s.mobility);
    const sx = Math.floor(s.px / CELL_SIZE);
    const sy = Math.floor(s.py / CELL_SIZE);
    // No standable cell there, or across the sea for a unit that cannot swim: the destination cannot be reached.
    if (!cell || (!s.swims && !this.pathfinder.sameLandmass(sx, sy, cell.x, cell.y))) {
      s.attackMove = null;
      return;
    }
    const path = this.hooks.findPath({ x: s.px, y: s.py }, cell, s.mobility);
    // Already as close as it can get: the order is done (instead of searching again and again on the spot).
    if (path.length <= 1) {
      s.attackMove = null;
      return;
    }
    s.follow(path);
  }

  /** Housekeeping: forgets chase timers that have run out or belong to units that no longer exist. */
  sweep(): void {
    for (const [id, until] of [...this.chaseAt]) {
      if (until <= this.time || !this.entities.get(id)) this.chaseAt.delete(id);
    }
    for (const [id, at] of [...this.resumeAt]) if (at <= this.time) this.resumeAt.delete(id);
  }

  /** Removes everything that ran out of health. */
  private reap(): void {
    const dead: Entity[] = [];
    for (const e of this.entities.all()) if (!e.alive) dead.push(e);
    for (const e of dead) {
      const killer = e.lastAttackerId !== null ? this.entities.get(e.lastAttackerId) : undefined;
      this.hooks.onDeath(e, killer);
    }
  }
}
