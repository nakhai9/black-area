/** R-12 Dvina missile in flight (world px; `lift` = height above the ground in iso px; heading hx, hy). */
export interface DvinaMissile {
  launcher: DvinaLauncher;
  targetId: number;
  x: number;
  y: number;
  lift: number;
  hx: number;
  hy: number;
  point: WorldPoint;
  air: boolean;
  done: boolean;
  /** Reached its cruise height after the vertical climb: from then on it flies level, then dives onto the target. */
  climbed?: boolean;
  /** Combat time at which an enemy air-defence missile meets it (it bursts harmlessly in the air then); unset while untouched. */
  killAt?: number;
  /** Shot down in flight: no warhead damage. */
  shotDown?: boolean;
}

import type { FactionId } from '../types';
import type { Mobility } from '../map/Pathfinder';
import { demoActive, mayAttack } from '../core/Demo';
import { movesRight } from '../core/IsoView';
import { BM21_INTERCEPT_CHANCE, BM21_MIN_SALVO, BM21_SHOCK_CELLS, BM21_SHOCK_PEAK, bm21Flight, DVINA_MISSILE_SPEED, DVINA_SLOW_FACTOR, DVINA_STEER_RATE, DVINA_SNAP_DIST, DVINA_AIR_GROUND_SHARE, SILO_BLAST_CELLS, SILO_DAMAGE, SILO_LID_HOLD, SILO_LID_MOVE, SILO_RELOAD, SILO_SCIENTISTS, SILO_MISS_PX, NUKE_RAD_SECONDS, NUKE_RAD_KILL_SECONDS, NUKE_RAD_KILL_SECONDS_INFANTRY, NUKE_RAD_RADIUS_SCALE, nukeRadDose, icbmFlight, DVINA_INTERCEPT_FLIGHT, DVINA_AIM_TOLERANCE, DVINA_GROUP_CELLS, DVINA_GROUP_SOLDIERS, DVINA_GROUP_VEHICLES, DVINA_RELOAD, DVINA_TURN_RATE, BOMB_FALL_SECONDS, CRUISE_ALTITUDE, HIGH_GROUND_DAMAGE, HIGH_GROUND_RANGE, LOW_GROUND_DAMAGE, MANTIS_HIT_SHARE, MANTIS_RANGE_CELLS, MANTIS_RANK_BONUS, MANTIS_EVADE_CELLS, HELI_VS_MANTIS_SHARE, JET_VS_MANTIS_SHARE, MANTIS_VS_JET_SHARE, MANTIS_VS_HELI_SHARE, MANTIS_RELOAD, MANTIS_GUN_NATIONS, PGZ_RELOAD, PGZ_HIT_FACTOR, JET_BOMB_VS_STRUCTURE, JET_BOMB_VS_VEHICLE, ACQUIRE_PERIOD, RANK_FIREPOWER, RANK_RELOAD, BOMB_GROUP_RADIUS_CELLS, BOMB_GROUP_SIZE, BOMB_TOUGH_DAMAGE, BOMB_TOUGH_STRUCTURES, BOMBS_PER_DROP, CELL_SIZE, CHASE_GIVE_UP_SECONDS, CHASE_LIMIT_CELLS, CHASE_PERIOD, FIGHT_MEMORY_SECONDS, GUARD_VISION_FACTOR, TWIN_TANK_AIR_RANGE_CELLS, NEUTRAL_OWNER, RETALIATE_RANGE_FACTOR, WEAPONS, FIGHTER_DRONE_ALERT, FELL_SPREAD_CELLS, TREE_BOMB_RADIUS_CELLS, TREE_STICK_RADIUS_CELLS } from '../constants';
import { Building } from '../entities/Building';
import { Bunker } from '../entities/Bunker';
import { LdewEmplacement } from '../entities/LdewEmplacement';
import { DvinaLauncher } from '../entities/DvinaLauncher';
import { MissileSilo } from '../entities/MissileSilo';
import type { Entity } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Infantry } from '../entities/Infantry';
import { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import type { Pathfinder } from '../map/Pathfinder';
import type { TreeLayer } from '../map/Trees';
import type { GridPoint, WeaponSpec, WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

export interface CombatHooks {
  /** A shot was fired: draw tracers and play the sound. `impact` is where it lands (world px). */
  onFire(shooter: Unit, target: Entity, weapon: WeaponSpec, impact: WorldPoint): void;
  /** A bunker's machine gun fired at `target`: tracer and muzzle flash. */
  onBunkerFire(bunker: Bunker, target: Unit | Building): void;
  /** An R-12 Dvina warhead goes off at `at` (on `target` when it is still there). */
  onDvinaBurst(at: WorldPoint, air: boolean, target: Unit | Building | null): void;
  /** An air-defence vehicle fires at a Dvina missile in flight; its missile meets it at `meet` after `flight` s. */
  onDvinaIntercept(guard: Vehicle, meet: WorldPoint, lift: number, flight: number): void;
  /** A Dvina missile shot down: it bursts in the air at `at`, `lift` px up, harming nobody. */
  onDvinaShotDown(at: WorldPoint, lift: number): void;
  /** An RS-24 Yars ICBM leaves its silo for `to` (world px), arriving after `flight` s. */
  onIcbmLaunch(silo: MissileSilo, to: WorldPoint, flight: number): void;
  /** The ICBM's nuclear burst at `at`, blast radius `radius` world px. */
  onNuke(at: WorldPoint, radius: number): void;
  /** A silo's missile is loaded and ready (the owner may be told). */
  onSiloReady(silo: MissileSilo): void;
  /** An R-12 Dvina missile leaves the rail (Game draws it from the live missile state). */
  onDvinaLaunch(m: DvinaMissile): void;
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
  /** Engineers the owner has in its Tech Center (nuclear programme): a silo runs only with SILO_SCIENTISTS of them. */
  scientists(owner: number): number;
  /** Nation under a nuclear embargo: its silos stay empty and idle. */
  nuclearBanned(owner: number): boolean;
  /** Route planner with the shared caches (an unreachable goal is not flooded again and again). */
  findPath(start: WorldPoint, goal: GridPoint, swim: Mobility): WorldPoint[];
  /** The forest: trees take damage from clearing orders, bombs, charges and splash (TREE_* in constants). */
  readonly trees: TreeLayer;
  /** A shot was fired on the trees (clearing order): draw it landing at `at` (world px) and play the sound. */
  onFellFire(shooter: Unit, weapon: WeaponSpec, at: WorldPoint): void;
  /** An air-defence vehicle shot down a BM-21 rocket bound for `impact` (it would have flown `flight` s): draw both. */
  onIntercept(guard: Vehicle, launcher: Vehicle, target: Entity, impact: WorldPoint, flight: number): void;
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
/** Defeated nations (whatever is left of them — walls, gates — is a ruin) and the AI nations, which leave ruins alone (Game.enforceEmbargoes). */
let ruins: ReadonlySet<number> = new Set();
let aiOwners: ReadonlySet<number> = new Set();
export function setRuins(defeated: ReadonlySet<number>, ai: ReadonlySet<number>): void {
  ruins = defeated;
  aiOwners = ai;
}
export function isRuin(owner: number): boolean {
  return ruins.has(owner);
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
  // AI nations no longer attack what is left of a defeated nation.
  if (ruins.has(b.owner) && aiOwners.has(a.owner)) return false;
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
  // An independent nation's capital (Japan, Korea, Cuba…): unheld (neutral) it is never a target (isHostile); once
  // occupied, enemies may shoot / bomb it — never destroyed, knocked down it goes back to neutral (NationCapital.damage).
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
  // Air-defence vehicle (Patriot / SAMP/T NG / S-400 / HQ-9 / PGZ-09): any enemy aircraft off the ground (altitude > 0), whatever it is doing —
  // cruising, hovering, lifting off, climbing, descending. Never one standing on the ground.
  if (shooter instanceof Vehicle && shooter.type === 'mantis') return target instanceof Vehicle && (target.aircraft || target.isDrone) && target.altitude > 0;
  // Twins Shots Tank: its guns elevate at helicopters and fixed-wing aircraft off the ground (never drones) —
  // whatever they are doing (cruising, taking off, climbing, landing). Aircraft standing on the ground are
  // ground targets as for any tank.
  if (shooter instanceof Vehicle && shooter.type === 'twinTank' && target instanceof Vehicle && (target.aircraft || target.isDrone) && target.altitude > 0)
    return target.aircraft && !target.isDrone && w.hitsAir;
  // BM-21 Grad: its rockets also reach aircraft in flight.
  if (target instanceof Unit && target.flies) return (shooter.aircraft || (shooter instanceof Vehicle && (shooter.type === 'bm21' || shooter.type === 'kub'))) && w.hitsAir;
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
  /**
   * Bomb hits still falling: each lands (deals its damage) at `at` — a bomber's stick or one fighter bomb on an enemy
   * (`target`), or the same dropped on the trees of a clearing order ('treeStick' / 'treeBomb', no target). Plain data (saved games).
   */
  /** R-12 Dvina missiles in the air: each bursts on its target (where it is then) when it arrives at `at`. */
  private readonly dvinaShots: DvinaMissile[] = [];
  /**
   * Aircraft each R-12 Dvina has picked on its own (launcher id -> target id): an aircraft inside the overlapping
   * ranges of several of one owner's launchers is taken by one of them only (no salvo); the others pass it by while
   * that launcher holds it or its missile is in the air. Player and AI alike.
   */
  private readonly dvinaAir = new Map<number, number>();
  /** RS-24 Yars ICBMs in the air: each bursts at `to` once `t` reaches `flight`. */
  /** Fallout circles left by nuclear bursts: ground vehicles inside are irradiated until `left` runs out. */
  private readonly fallout: { x: number; y: number; r: number; left: number }[] = [];
  private readonly icbms: { silo: MissileSilo; owner: number; to: WorldPoint; t: number; flight: number }[] = [];
  private readonly falling: { at: number; kind: 'stick' | 'jet' | 'treeStick' | 'treeBomb' | 'rocket'; shooter: Vehicle; target: Entity | null; impact: WorldPoint }[] = [];

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
    if (this.dvinaShots.length > 0) {
      for (const m of this.dvinaShots) {
        this.flyDvina(m, dt);
        if (m.done) continue;
        if (m.killAt !== undefined) {
          if (this.time >= m.killAt) [m.done, m.shotDown] = [true, true];
        } else this.interceptDvina(m);
      }
      const hits = this.dvinaShots.filter((m) => m.done);
      if (hits.length > 0) {
        this.dvinaShots.splice(0, this.dvinaShots.length, ...this.dvinaShots.filter((m) => !m.done));
        for (const m of hits) this.dvinaBurst(m);
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
      if (s.weapon && s.canFight && mayAttack(s.owner)) this.think(s, grid);
      // A repair vehicle flattens every tree in the cell it drives over (player and AI alike).
      if (s instanceof Vehicle && s.isRepair && !s.flies && s.insideId === null) this.hooks.trees.fellCell(Math.floor(s.px / CELL_SIZE), Math.floor(s.py / CELL_SIZE));
    }
    this.bunkers(dt, grid, key);
    this.silos(dt);
    this.irradiate(dt);
    this.reap();
  }

  // ------------------------------------------------------------------ bunkers

  /** Self-firing bunkers: each shoots the nearest enemy soldier or ground vehicle in range (never aircraft). */
  private bunkers(dt: number, grid: Map<number, Unit[]>, key: (cx: number, cy: number) => number): void {
    for (const b of this.entities.buildings()) {
      if (!(b instanceof Bunker) || !b.alive || b.owner === NEUTRAL_OWNER) continue;
      if (!mayAttack(b.owner)) continue; // DEMO all factions: only the active nation fires
      b.cooldown = Math.max(0, b.cooldown - dt);
      b.firing = Math.max(0, b.firing - dt);
      if (b instanceof DvinaLauncher) {
        this.dvina(b, dt);
        continue;
      }
      if (b.cooldown > 0) continue;
      // The laser emplacement runs on the grid: with the nation short of power it cannot fire.
      if (b instanceof LdewEmplacement && this.hooks.powerShort(b.owner)) continue;
      const c = b.centerWorld();
      if (this.hooks.safeAt(c.x, c.y)) continue;
      const f = b.footprintWorld();
      let best: Unit | undefined;
      let bestD = Infinity;
      // Ordered target (R-12 Dvina, like a vehicle's attack order): kept while alive, hostile and in reach.
      let forced: Unit | Building | undefined;
      if (b.forcedTarget !== null) {
        const o = this.entities.get(b.forcedTarget);
        const ok = (o instanceof Unit || o instanceof Building) && o.alive && isHostile(b, o) && !(o instanceof Unit && ((o.flies && !b.hitsAir) || this.sheltered(o))) && !(o instanceof Building && !b.hitsStructures && !(o instanceof Bunker));
        const g = ok ? (o instanceof Building ? o.footprintWorld() : { x: o.px, y: o.py, w: 0, h: 0 }) : null;
        const d = g ? Math.hypot(Math.max(g.x - (f.x + f.w), 0, f.x - (g.x + g.w)), Math.max(g.y - (f.y + f.h), 0, f.y - (g.y + g.h))) : Infinity;
        if (ok && d <= b.range) forced = o;
        else b.forcedTarget = null;
      }
      const r = forced ? -1 : Math.ceil((b.range + f.w) / HASH);
      const hx = Math.floor(c.x / HASH);
      const hy = Math.floor(c.y / HASH);
      for (let gy = hy - r; gy <= hy + r; gy++) {
        for (let gx = hx - r; gx <= hx + r; gx++) {
          for (const o of grid.get(key(gx, gy)) ?? []) {
            if ((o.flies && !b.hitsAir) || !isHostile(b, o) || this.sheltered(o)) continue;
            // Range is measured from the bunker's edge.
            const d = Math.hypot(Math.max(f.x - o.px, 0, o.px - (f.x + f.w)), Math.max(f.y - o.py, 0, o.py - (f.y + f.h)));
            if (d <= b.range && d < bestD) {
              bestD = d;
              best = o;
            }
          }
        }
      }
      // With no unit in reach: an enemy bunker inside its range (any bunker, player and AI alike); the missile
      // launcher (R-12 Dvina) take any enemy structure. Nearest first, edge to edge.
      let site: Building | undefined;
      if (!best && !forced) {
        for (const o of this.entities.buildings()) {
          if (o === b || !isHostile(b, o) || !(b.hitsStructures || o instanceof Bunker)) continue;
          const g = o.footprintWorld();
          const d = Math.hypot(Math.max(g.x - (f.x + f.w), 0, f.x - (g.x + g.w)), Math.max(g.y - (f.y + f.h), 0, f.y - (g.y + g.h)));
          if (d <= b.range && d < bestD) {
            bestD = d;
            site = o;
          }
        }
      }
      const target = forced ?? best ?? site;
      if (!target) continue;
      b.cooldown = b.shotCooldown;
      b.firing = 0.3;
      const tc = target instanceof Building ? target.centerWorld() : { x: target.px, y: target.py };
      b.aimHeading = Math.atan2(tc.y - c.y, tc.x - c.x);
      target.damage(b.shotDamage * (target instanceof Vehicle ? b.vsVehicle : 1));
      target.lastAttackerId = b.id;
      target.lastAttackedAt = this.time;
      if (target instanceof Unit) target.fightingWith.set(b.owner, this.time);
      this.hooks.onBunkerFire(b, target);
    }
  }

  /**
   * R-12 Dvina, driven like a vehicle: the launcher turns (DVINA_TURN_RATE) to its locked target (kept until it dies,
   * fired on once in range), else the nearest enemy in range, else the direction it was turned to. It fires only when
   * laid on the target with a missile on the rail; each new missile is paid for (DvinaLauncher.payMissile) and loaded
   * in DVINA_RELOAD s. The warhead hits everything hostile within the blast radius (full at the centre). Player and AI.
   */
  private dvina(b: DvinaLauncher, dt: number): void {
    if (!b.armed && b.cooldown <= 0 && DvinaLauncher.payMissile(b)) {
      b.armed = true;
      b.cooldown = DVINA_RELOAD;
    }
    const c = b.centerWorld();
    const f = b.footprintWorld();
    const gap = (o: Unit | Building): number => {
      const g = o instanceof Building ? o.footprintWorld() : { x: o.px, y: o.py, w: 0, h: 0 };
      return Math.hypot(Math.max(g.x - (f.x + f.w), 0, f.x - (g.x + g.w)), Math.max(g.y - (f.y + f.h), 0, f.y - (g.y + g.h)));
    };
    const fair = (o: Entity | undefined): o is Unit | Building =>
      (o instanceof Unit || o instanceof Building) && o.alive && o !== b && isHostile(b, o) && !this.hooks.shielded(o) && !(o instanceof Unit && this.sheltered(o));
    // Only massed ground targets are worth a missile (anything flying is always one): a ground unit is a target only inside a group of more than DVINA_GROUP_SOLDIERS
    // soldiers or more than DVINA_GROUP_VEHICLES vehicles of its owner within DVINA_GROUP_CELLS of it (structures: on order).
    const massed = (o: Unit | Building): boolean => {
      if (o instanceof Building) return true;
      // Aircraft and helicopters in the air are fair game even alone.
      if (o.flies) return true;
      const soldier = o instanceof Infantry;
      const r = DVINA_GROUP_CELLS * CELL_SIZE;
      let n = 0;
      for (const u of this.entities.fieldMovers()) {
        if (u.alive && u.owner === o.owner && (u instanceof Infantry) === soldier && Math.hypot(u.px - o.px, u.py - o.py) <= r) n++;
      }
      return n > (soldier ? DVINA_GROUP_SOLDIERS : DVINA_GROUP_VEHICLES);
    };
    // An aircraft another launcher of the same owner already holds (or has a missile on) is left to that one.
    const claimed = (o: Unit | Building): boolean => {
      if (!(o instanceof Unit && o.flies)) return false;
      if (this.dvinaShots.some((m) => m.targetId === o.id && m.launcher.owner === b.owner && !m.done)) return true;
      for (const [id, tid] of this.dvinaAir) {
        if (tid !== o.id || id === b.id) continue;
        const other = this.entities.get(id);
        if (other instanceof DvinaLauncher && other.alive && other.owner === b.owner) return true;
      }
      return false;
    };
    let target: Unit | Building | undefined;
    const ai = aiOwners.has(b.owner);
    if (b.forcedTarget !== null) {
      const o = this.entities.get(b.forcedTarget);
      // Its own pick (no order) is only ever an aircraft in the air: once it lands or is gone, it is dropped, so a
      // player's launcher never turns on a ground target by itself.
      if (fair(o) && (b.ordered || ai || (o instanceof Unit && o.flies))) target = o;
      else [b.forcedTarget, b.ordered] = [null, false];
    }
    // On its own it fires only at aircraft / helicopters in the air (player and AI); ground units and structures need an
    // order. The AI gives itself that order too (a massed group in range). One missile per order or pick.
    if (!target && b.loaded && !this.hooks.safeAt(c.x, c.y)) {
      let bestD = Infinity;
      for (const o of this.entities.fieldMovers()) {
        if (!fair(o) || (!ai && !o.flies)) continue;
        const d = gap(o);
        if (d <= b.range && d < bestD && massed(o) && !claimed(o)) [bestD, target] = [d, o];
      }
      if (target) [b.forcedTarget, b.ordered] = [target.id, false];
      // Structures are hit only on an attack order (forcedTarget), never picked on its own.
    }
    if (target instanceof Unit && target.flies) this.dvinaAir.set(b.id, target.id);
    else this.dvinaAir.delete(b.id);
    const tc = target ? (target instanceof Building ? target.centerWorld() : { x: target.px, y: target.py }) : null;
    const want = tc ? Math.atan2(tc.y - c.y, tc.x - c.x) : (b.aimOrder ?? b.restHeading);
    const off = (): number => Math.atan2(Math.sin(want - b.aimHeading), Math.cos(want - b.aimHeading));
    const step = DVINA_TURN_RATE * dt;
    const diff = off();
    b.aimHeading = Math.abs(diff) <= step ? want : b.aimHeading + Math.sign(diff) * step;
    if (!target || !tc || !b.loaded || gap(target) > b.range || this.hooks.safeAt(c.x, c.y) || Math.abs(off()) > DVINA_AIM_TOLERANCE) return;
    b.armed = false;
    b.cooldown = 0;
    b.firing = 0.3;
    // One shot ends the order: the launcher holds this heading and waits for a new order.
    b.forcedTarget = null;
    b.ordered = false;
    b.aimOrder = b.aimHeading;
    this.dvinaAir.delete(b.id);
    // The missile chases its target (flyDvina) and only bursts when it touches it: nothing is hit before that.
    const m: DvinaMissile = { launcher: b, targetId: target.id, x: c.x, y: c.y, lift: 0, hx: Math.cos(b.aimHeading), hy: Math.sin(b.aimHeading), point: { ...tc }, air: target instanceof Unit && target.flies, done: false };
    this.dvinaShots.push(m);
    this.hooks.onBunkerFire(b, target);
    this.hooks.onDvinaLaunch(m);
  }

  /**
   * A Dvina missile arrives: it bursts on its target where the target is now (it homes in), or, if the target is
   * already gone, where it was aimed. Warhead: the target and everything hostile round it (aircraft only by a direct hit).
   */
  /**
   * One step of a Dvina missile: it steers at its target where the target is now (an aircraft however it turns, at its
   * height) and keeps chasing until it touches it; a target gone meanwhile leaves it to burst where it was last seen.
   */
  private flyDvina(m: DvinaMissile, dt: number): void {
    const o = this.entities.get(m.targetId);
    const target = (o instanceof Unit || o instanceof Building) && o.alive ? o : null;
    if (target) {
      m.point = target instanceof Building ? target.centerWorld() : { x: target.px, y: target.py };
      m.air = target instanceof Unit && target.flies;
    }
    const goalLift = target instanceof Vehicle && target.flies ? target.altitude : 0;
    const dx = m.point.x - m.x;
    const dy = m.point.y - m.y;
    const d = Math.hypot(dx, dy);
    const step = DVINA_MISSILE_SPEED * this.dvinaPace(m) * dt;
    const reach = (target instanceof Unit ? target.radius : target instanceof Building ? 4 : 0) + 1;
    if (d <= step + reach) {
      m.x = m.point.x;
      m.y = m.point.y;
      m.lift = goalLift;
      m.done = true;
      return;
    }
    // Smooth steering: turn at most DVINA_STEER_RATE rad/s while far (no twitching at every target step);
    // inside DVINA_SNAP_DIST it locks straight on so it can never orbit its target.
    const want0 = Math.atan2(dy, dx);
    const cur = Math.atan2(m.hy, m.hx);
    let turn = want0 - cur;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    // Lofted flight: straight up off the rail to the cruise height first (no ground track yet), then level.
    const cruise = Math.max(goalLift, Math.min(CRUISE_ALTITUDE, goalLift + d * 0.12));
    if (!m.climbed) {
      if (m.lift < cruise - 0.5) {
        m.lift = Math.min(cruise, m.lift + step * 0.6);
        return;
      }
      m.climbed = true;
    }
    const maxTurn = d < DVINA_SNAP_DIST ? Math.PI : DVINA_STEER_RATE * dt;
    const h = cur + Math.max(-maxTurn, Math.min(maxTurn, turn));
    m.hx = Math.cos(h);
    m.hy = Math.sin(h);
    m.x += m.hx * step;
    m.y += m.hy * step;
    // Level at the cruise height while far (it never climbs again once level), diving (or rising) onto the target at the end.
    const want = cruise < m.lift || goalLift > m.lift ? cruise : m.lift;
    m.lift += (want - m.lift) * Math.min(1, dt * 3);
  }

  /**
   * An enemy air-defence vehicle (any mantis kind) with a Dvina missile inside its range, reloaded and powered, fires
   * at it: its missile meets the Dvina DVINA_INTERCEPT_FLIGHT s later, where the Dvina will be then, and brings it down.
   * Every such vehicle in range at that moment fires together (each uses up its reload). Player and AI alike.
   */
  private interceptDvina(m: DvinaMissile): void {
    for (const v of this.entities.vehicles()) {
      if (v.type !== 'mantis' || !v.alive || v.cooldown > 0 || !v.weapon || !isHostile(v, m.launcher)) continue;
      if (Math.hypot(v.px - m.x, v.py - m.y) > v.weapon.range || this.hooks.powerShort(v.owner)) continue;
      v.cooldown = MANTIS_GUN_NATIONS.includes(v.faction as FactionId) ? PGZ_RELOAD : MANTIS_RELOAD;
      v.aimHeading = Math.atan2(m.y - v.py, m.x - v.px);
      m.killAt = this.time + DVINA_INTERCEPT_FLIGHT;
      const ahead = DVINA_MISSILE_SPEED * this.dvinaPace(m) * DVINA_INTERCEPT_FLIGHT;
      this.hooks.onDvinaIntercept(v, { x: m.x + m.hx * ahead, y: m.y + m.hy * ahead }, m.lift, DVINA_INTERCEPT_FLIGHT);
    }
  }

  /** Dvina speed factor: DVINA_SLOW_FACTOR against a structure or a ground unit standing still, full speed otherwise. */
  private dvinaPace(m: DvinaMissile): number {
    const o = this.entities.get(m.targetId);
    if (o instanceof Building && o.alive) return DVINA_SLOW_FACTOR;
    if (o instanceof Unit && o.alive && !o.flies && !o.moving) return DVINA_SLOW_FACTOR;
    return 1;
  }

  // ------------------------------------------------------------------ RS-24 Yars silos

  /**
   * Missile silos: a missile is paid (MissileSilo.payMissile) and loaded in SILO_RELOAD s while the owner has power;
   * a loaded silo with an order (strike point in range) opens its lid, launches after SILO_LID_MOVE s, holds the lid
   * open, then closes it. An AI silo picks its own target: the enemy point within range with the most enemy structures
   * round it. ICBMs in flight burst on arrival (nuke). Player and AI alike.
   */
  private silos(dt: number): void {
    for (const b of this.entities.buildings()) {
      if (!(b instanceof MissileSilo) || !b.alive || b.owner === NEUTRAL_OWNER) continue;
      // DEMO: a silo is always ready (no payment, no loading, no power needed).
      if (demoActive && !b.loaded) [b.loading, b.loaded] = [false, true];
      // Manned and powered: SILO_SCIENTISTS engineers in the Tech Center and no power shortage, or the silo stands
      // idle (no loading, no launch; a launch already under way finishes).
      // Nuclear embargo: the silo is emptied and does nothing (no paying, loading or launch) until it ends.
      if (!demoActive && this.hooks.nuclearBanned(b.owner) && b.launchClock === null) {
        [b.loaded, b.loading, b.loadClock, b.missilePaid, b.strike] = [false, false, 0, 0, null];
        continue;
      }
      const manned = demoActive || (this.hooks.scientists(b.owner) >= SILO_SCIENTISTS && !this.hooks.powerShort(b.owner));
      if (!b.loaded && manned) {
        if (!b.loading) {
          if (MissileSilo.payMissile(b)) [b.loading, b.loadClock] = [true, SILO_RELOAD];
        } else if ((b.loadClock -= dt) <= 0) {
          [b.loading, b.loaded] = [false, true];
          this.hooks.onSiloReady(b);
        }
      }
      if (b.loaded && b.strike === null && b.launchClock === null && aiOwners.has(b.owner)) b.strike = this.siloTarget(b);
      if (b.launchClock === null && manned && b.loaded && b.strike !== null && mayAttack(b.owner)) [b.launchClock, b.launched] = [0, false];
      if (b.launchClock === null) continue;
      b.launchClock += dt;
      if (!b.launched && b.launchClock >= SILO_LID_MOVE && b.strike) {
        const c = b.centerWorld();
        // Burst point: up to SILO_MISS_PX (10 m) off the aim point, pseudo-random from the silo and the clock.
        const r1 = ((b.id * 7919 + Math.floor(this.time * 20) * 104729) % 1000) / 1000;
        const r2 = ((b.id * 15485863 + Math.floor(this.time * 20) * 131) % 1000) / 1000;
        const miss = SILO_MISS_PX * Math.sqrt(r1);
        const to = { x: b.strike.x + Math.cos(r2 * Math.PI * 2) * miss, y: b.strike.y + Math.sin(r2 * Math.PI * 2) * miss };
        const flight = icbmFlight(Math.hypot(to.x - c.x, to.y - c.y));
        this.icbms.push({ silo: b, owner: b.owner, to, t: 0, flight });
        this.hooks.onIcbmLaunch(b, to, flight);
        [b.launched, b.loaded, b.strike] = [true, false, null];
      }
      if (b.launchClock >= SILO_LID_MOVE * 2 + SILO_LID_HOLD) b.launchClock = null;
    }
    if (this.icbms.length > 0) {
      for (const m of this.icbms) m.t += dt;
      const due = this.icbms.filter((m) => m.t >= m.flight);
      if (due.length > 0) {
        this.icbms.splice(0, this.icbms.length, ...this.icbms.filter((m) => m.t < m.flight));
        for (const m of due) this.nuke(m.silo, m.to);
      }
    }
  }

  /** Fallout: every soldier and ground vehicle inside a live radiation circle loses maxHp / NUKE_RAD_KILL_SECONDS per second. */
  private irradiate(dt: number): void {
    if (this.fallout.length === 0) return;
    for (const z of this.fallout) z.left -= dt;
    if (this.fallout.some((z) => z.left <= 0)) this.fallout.splice(0, this.fallout.length, ...this.fallout.filter((z) => z.left > 0));
    // Soldiers and ground vehicles alike (aircraft in the air and units inside a building / transport are spared).
    for (const v of this.entities.fieldMovers()) {
      if (!v.alive || v.flies || v.insideId !== null) continue;
      // Dose: strongest at ground zero, weakest at the rim (strongest circle wins where they overlap).
      let dose = 0;
      for (const z of this.fallout) {
        const d = Math.hypot(v.px - z.x, v.py - z.y);
        if (d <= z.r) dose = Math.max(dose, nukeRadDose(d / z.r));
      }
      if (dose <= 0) continue;
      v.damage((v.maxHp / (v instanceof Vehicle ? NUKE_RAD_KILL_SECONDS : NUKE_RAD_KILL_SECONDS_INFANTRY)) * dose * dt);
    }
  }

  /** AI silo: the enemy structure within range with the most enemy structures inside the blast round it. */
  private siloTarget(s: MissileSilo): WorldPoint | null {
    const c = s.centerWorld();
    const r = SILO_BLAST_CELLS * CELL_SIZE;
    const foes = this.entities.buildings().filter((o) => o.alive && isHostile(s, o) && Math.hypot(o.centerWorld().x - c.x, o.centerWorld().y - c.y) <= s.range);
    let best: WorldPoint | null = null;
    let bestN = 0;
    for (const o of foes) {
      const p = o.centerWorld();
      let n = 0;
      for (const q of foes) if (distanceTo(p.x, p.y, q) <= r) n++;
      if (n > bestN) [best, bestN] = [{ ...p }, n];
    }
    return best;
  }

  /** Nuclear burst: SILO_DAMAGE at the centre falling off to nothing at SILO_BLAST_CELLS, on everything hostile on the ground. */
  private nuke(s: MissileSilo, at: WorldPoint): void {
    const radius = SILO_BLAST_CELLS * CELL_SIZE;
    this.hooks.onNuke(at, radius);
    this.fallout.push({ x: at.x, y: at.y, r: radius * NUKE_RAD_RADIUS_SCALE, left: NUKE_RAD_SECONDS });
    const blast = (d: number): number => SILO_DAMAGE * Math.max(0, 1 - d / radius);
    const hit = (o: Unit | Building, amount: number): void => {
      if (!o.alive || !isHostile(s, o) || amount <= 0) return;
      o.damage(amount);
      if (!s.alive) return;
      o.lastAttackerId = s.id;
      o.lastAttackedAt = this.time;
      if (o instanceof Unit) o.fightingWith.set(s.owner, this.time);
    };
    this.hooks.trees.damageRadius(at.x, at.y, radius, SILO_DAMAGE);
    for (const o of this.entities.fieldMovers()) if (!o.flies) hit(o, blast(Math.hypot(o.px - at.x, o.py - at.y)));
    for (const o of this.entities.buildings()) hit(o, blast(distanceTo(at.x, at.y, o)));
  }

  /**
   * A Dvina warhead bursting in the air (on an aircraft, or shot down): every hostile ground unit and structure inside
   * the blast radius below takes DVINA_AIR_GROUND_SHARE of the blast (falling off from the centre). Player and AI alike.
   */
  private dvinaGroundSplash(b: DvinaLauncher, at: WorldPoint, skip: Unit | Building | null): void {
    const radius = b.blastRadius;
    const amount = (dist: number): number => b.shotDamage * DVINA_AIR_GROUND_SHARE * Math.max(0, 1 - dist / radius);
    const hit = (o: Unit | Building, n: number): void => {
      if (o === skip || !o.alive || !isHostile(b, o) || n <= 0) return;
      o.damage(n);
      if (!b.alive) return;
      o.lastAttackerId = b.id;
      o.lastAttackedAt = this.time;
      if (o instanceof Unit) o.fightingWith.set(b.owner, this.time);
    };
    for (const o of this.entities.fieldMovers()) if (!o.flies && !this.sheltered(o)) hit(o, amount(Math.hypot(o.px - at.x, o.py - at.y)));
    for (const o of this.entities.buildings()) if (!this.sheltered(o)) hit(o, amount(distanceTo(at.x, at.y, o)));
  }

  private dvinaBurst(d: DvinaMissile): void {
    if (d.shotDown) {
      this.hooks.onDvinaShotDown({ x: d.x, y: d.y }, d.lift);
      // Brought down in the air: its warhead showers the ground below (DVINA_AIR_GROUND_SHARE) only when it was already
      // close to its target (within the blast radius of the aim point); shot down far out it harms nobody.
      if (Math.hypot(d.x - d.point.x, d.y - d.point.y) <= d.launcher.blastRadius) this.dvinaGroundSplash(d.launcher, { x: d.x, y: d.y }, null);
      return;
    }
    const b = d.launcher;
    const o = this.entities.get(d.targetId);
    const target = (o instanceof Unit || o instanceof Building) && o.alive ? o : null;
    const tc = d.point;
    const air = d.air;
    this.hooks.onDvinaBurst(tc, air, target);
    const radius = b.blastRadius;
    const hit = (o: Unit | Building, amount: number): void => {
      if (!o.alive || !isHostile(b, o) || amount <= 0) return;
      o.damage(amount);
      if (!b.alive) return;
      o.lastAttackerId = b.id;
      o.lastAttackedAt = this.time;
      if (o instanceof Unit) o.fightingWith.set(b.owner, this.time);
    };
    if (target) hit(target, b.shotDamage);
    if (air) {
      // Air burst: the blast still reaches the ground below at DVINA_AIR_GROUND_SHARE of its strength.
      this.dvinaGroundSplash(b, tc, target);
    } else {
      const blast = (d: number): number => b.shotDamage * Math.max(0, 1 - d / radius);
      this.hooks.trees.damageRadius(tc.x, tc.y, radius, b.shotDamage);
      for (const o of this.entities.fieldMovers()) if (o !== target && !o.flies && !this.sheltered(o)) hit(o, blast(Math.hypot(o.px - tc.x, o.py - tc.y)));
      for (const o of this.entities.buildings()) if (o !== target && !this.sheltered(o)) hit(o, blast(distanceTo(tc.x, tc.y, o)));
    }
  }

  // ------------------------------------------------------------------ per-unit logic

  private think(s: Unit, grid: Map<number, Unit[]>): void {
    const w = s.weapon;
    if (!w) return;
    // LDEW laser vehicles: no power on the grid, no laser (they may still drive where they are sent).
    if (s instanceof Vehicle && (s.type === 'ldew' || s.type === 'ldewTruck') && this.hooks.powerShort(s.owner)) {
      s.combatTarget = null;
      s.engaged = false;
      return;
    }
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
        s.fellTarget = null;
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
      s.fellTarget = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }
    if (!s.moving) {
      s.chasing = false;
      s.retreating = false;
    }
    // A bomber never bombs on its own: only on an order (an attack order or an attack-move).
    if (s instanceof Vehicle && s.type === 'bomber' && s.attackTarget === null && s.attackMove === null && s.fellTarget === null) {
      s.combatTarget = null;
      s.engaged = false;
      return;
    }
    let target = this.currentTarget(s);
    // A helicopter never attacks on its own: only on an order (attack order / attack-move) or to hit back at whoever
    // shot it (player and AI alike).
    if (s instanceof Vehicle && s.isHeli && s.attackTarget === null && s.attackMove === null && s.fellTarget === null) {
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
    if (target && s.attackTarget === null && distanceTo(s.px, s.py, target) > (holdsSpot ? this.reachOn(s, w, target) : Math.max(w.range * GUARD_VISION_FACTOR * 1.25, this.reachOn(s, w, target)))) target = undefined;

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
    // BM-21 mid-salvo (player and AI alike): the whole salvo goes at the target it started on; a new target is picked
    // only once the tubes are empty. A new explicit attack order still takes over.
    if (s instanceof Vehicle && s.type === 'bm21' && s.salvo && s.salvoTarget !== null && (s.attackTarget === null || s.attackTarget === s.salvoTarget)) {
      const locked = this.entities.get(s.salvoTarget);
      if (locked && locked.alive) target = locked;
      else {
        // Target gone: the rest of the salvo still lands on its last position.
        s.combatTarget = null;
        s.engaged = true;
        if (s.cooldown <= 0) this.fireSalvoAtPoint(s, w, { x: s.salvoAimX, y: s.salvoAimY });
        return;
      }
    }
    s.combatTarget = target?.id ?? null;
    if (s instanceof Vehicle && s.type === 'twinTank') s.gunsUp = target instanceof Vehicle && target.aircraft && !target.isDrone && target.altitude > 0;

    if (!target) {
      // BM-21: nothing left to shoot ends the salvo (the next one needs BM21_MIN_SALVO rockets again).
      if (s instanceof Vehicle && s.type === 'bm21') s.salvo = false;
      // Nobody to fight: a clearing order goes on (the trees are shot once the enemies are gone).
      if (s.fellTarget !== null && this.fell(s, w)) return;
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
    // Too close for this weapon (BM-21 rockets fire at long range only): hold fire, let the target go (an explicit
    // attack order waits until it is far enough).
    if (w.minRange !== undefined && d < w.minRange) {
      if (s instanceof Vehicle && s.type === 'bm21') s.salvo = false;
      s.combatTarget = null;
      s.engaged = false;
      if (s.attackTarget === null) this.resumeAttackMove(s);
      return;
    }
    const tx = target instanceof Unit ? target.px : target instanceof Building ? target.centerWorld().x : s.px;
    const ty = target instanceof Unit ? target.py : target instanceof Building ? target.centerWorld().y : s.py;
    s.aimHeading = Math.atan2(ty - s.py, tx - s.px);
    if (d <= this.reachOn(s, w, target) * this.heightReach(s)) {
      // A unit on its way somewhere (plain move order) shoots on the move: only its gun turns to the target (aimHeading),
      // the hull keeps steering along its route (turning it to the target every tick pinned it in place).
      // A tank (or air-defence vehicle) keeps its hull where it is: only the turret / launcher turns to the target (it fires once laid).
      const tank = s instanceof Vehicle && (s.type === 'tank' || s.type === 'mantis');
      if (!tank && (!s.moving || s.attackTarget !== null || s.attackMove)) {
        s.facing = movesRight(tx - s.px, ty - s.py) ? 1 : -1;
        s.heading = Math.atan2(ty - s.py, tx - s.px);
      }
      // Units on attack orders stand and fight; ones just passing through keep walking and shooting.
      if (s.attackTarget !== null || s.attackMove) s.stop();
      // The air-defence launcher is fixed to the hull and fires straight up: it needs no laying.
      const laid = !tank || (s as Vehicle).type === 'mantis' || (s as Vehicle).turretOnTarget;
      if (s.cooldown <= 0 && laid && this.canHit(s, w, target)) this.fire(s, target, w);
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
    if (e instanceof Vehicle && e.stowed) return true; // below a carrier's deck
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
    const ground = holdsSpot ? w.range : w.range * GUARD_VISION_FACTOR;
    // Twins Shots Tank: helicopters in the air are seen out to its raised-gun reach (TWIN_TANK_AIR_RANGE_CELLS).
    const sight = s instanceof Vehicle && s.type === 'twinTank' ? Math.max(ground, TWIN_TANK_AIR_RANGE_CELLS * CELL_SIZE) : ground;
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
          if (d > Math.max(ground, this.reachOn(s, w, o))) continue;
          if (w.minRange !== undefined && d < w.minRange) continue; // too close for it (BM-21)
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
    // AI nations fight free of this rule: they may chase a retreating enemy.
    if (aiOwners.has(s.owner)) return false;
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
  private land(f: { kind: 'stick' | 'jet' | 'treeStick' | 'treeBomb' | 'rocket'; shooter: Vehicle; target: Entity | null; impact: WorldPoint }): void {
    const { shooter: s, target: t } = f;
    if (!s) return; // (a saved game whose bomber no longer exists)
    // On the trees (clearing order): every tree within the blast falls.
    if (f.kind === 'treeStick' || f.kind === 'treeBomb') {
      this.hooks.trees.fellRadius(f.impact.x, f.impact.y, (f.kind === 'treeStick' ? TREE_STICK_RADIUS_CELLS : TREE_BOMB_RADIUS_CELLS) * CELL_SIZE);
      return;
    }
    if (f.kind === 'rocket' && !t) {
      this.rocketLands(s, null, f.impact); // rest of a salvo whose target is gone: blast on the ground only
      return;
    }
    if (!t) return; // (a saved game whose target no longer exists)
    if (f.kind === 'stick') {
      this.bombsLand(s, t, f.impact);
      return;
    }
    if (f.kind === 'rocket') {
      this.rocketLands(s, t, f.impact);
      return;
    }
    // The trees round the impact fall too.
    this.hooks.trees.fellRadius(f.impact.x, f.impact.y, TREE_BOMB_RADIUS_CELLS * CELL_SIZE);
    if (!t.alive) return;
    // On an air-defence vehicle a fighter's bomb takes JET_VS_MANTIS_SHARE of its full health.
    const vsVehicle = t instanceof Vehicle && t.type === 'mantis' ? JET_VS_MANTIS_SHARE : JET_BOMB_VS_VEHICLE;
    t.damage(t instanceof Building ? t.maxHp * JET_BOMB_VS_STRUCTURE : t instanceof Vehicle ? t.maxHp * vsVehicle : Infinity); // a soldier: dead, veteran or not
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
  }

  /**
   * A BM-21 rocket comes down: its target (still alive) takes the hit; on the ground the blast also hurts the enemy
   * soldiers and vehicles within the splash and the trees there. An aircraft is hit alone (an air burst).
   */
  private rocketLands(s: Vehicle, t: Entity | null, impact: WorldPoint): void {
    const w = s.weapon;
    if (!w) return;
    const dmg = w.damage * RANK_FIREPOWER[s.rank];
    const hit = (o: Entity, amount: number): void => {
      if (!o.alive || !isHostile(s, o)) return;
      o.damage(amount);
      o.lastAttackerId = s.id;
      o.lastAttackedAt = this.time;
    };
    const air = t instanceof Unit && t.flies;
    if (t) hit(t, dmg * (t instanceof Building ? w.vsBuilding : 1) * (air ? 1 : this.heightFactor(s, t)));
    if (air) return;
    // Shock wave: BM21_SHOCK_CELLS round the impact, strongest at the centre (BM21_SHOCK_PEAK × the rocket), none at the edge.
    const at = t instanceof Unit ? { x: t.px, y: t.py } : impact;
    const radius = BM21_SHOCK_CELLS * CELL_SIZE;
    const shock = (d: number): number => dmg * BM21_SHOCK_PEAK * Math.max(0, 1 - d / radius);
    this.hooks.trees.damageRadius(at.x, at.y, radius, dmg * BM21_SHOCK_PEAK);
    for (const o of this.entities.fieldMovers()) {
      if (o === t || o.flies || this.sheltered(o)) continue;
      const d = Math.hypot(o.px - at.x, o.py - at.y);
      if (d < radius) hit(o, shock(d));
    }
    for (const b of this.entities.buildings()) {
      if (b === t || this.sheltered(b)) continue;
      const d = distanceTo(at.x, at.y, b);
      if (d < radius) hit(b, shock(d) * w.vsBuilding);
    }
  }

  /** The bomber's stick explodes: a structure is flattened (tough ones lose half), or the troops round the impact die. */
  private bombsLand(s: Vehicle, t: Entity, impact: WorldPoint): void {
    // The trees round the impact are flattened.
    this.hooks.trees.fellRadius(impact.x, impact.y, TREE_STICK_RADIUS_CELLS * CELL_SIZE);
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

  /**
   * The enemy air-defence vehicle that shoots down a BM-21 rocket from `s` landing at `impact`, if any: one that is
   * hostile to `s`, ready to fire (reloaded, radar powered) and has the landing spot within its range. Every one that
   * tries uses up its reload; each succeeds with BM21_INTERCEPT_CHANCE (deterministic, so all clients agree).
   */
  private interceptor(s: Vehicle, impact: WorldPoint): Vehicle | null {
    for (const v of this.entities.vehicles()) {
      if (v.type !== 'mantis' || !v.alive || v.cooldown > 0 || !v.weapon || !isHostile(v, s)) continue;
      const d = Math.hypot(v.px - impact.x, v.py - impact.y);
      if (d > v.weapon.range || this.hooks.powerShort(v.owner)) continue;
      const flakGun = MANTIS_GUN_NATIONS.includes(v.faction as FactionId);
      v.cooldown = flakGun ? PGZ_RELOAD : MANTIS_RELOAD;
      v.aimHeading = Math.atan2(impact.y - v.py, impact.x - v.px);
      const roll = ((v.id * 7919 + s.id * 104729 + s.rockets * 131 + Math.floor(this.time * 20)) % 1000) / 1000;
      if (roll < BM21_INTERCEPT_CHANCE) return v;
    }
    return null;
  }

  /** BM-21: one rocket of a salvo whose target is gone, at the point it was last aimed at. */
  private fireSalvoAtPoint(s: Vehicle, w: WeaponSpec, impact: WorldPoint): void {
    s.rockets--;
    s.salvo = s.rockets > 0;
    if (!s.salvo) s.salvoTarget = null;
    s.cooldown = w.cooldown;
    s.aimHeading = Math.atan2(impact.y - s.py, impact.x - s.px);
    const flight = bm21Flight(Math.hypot(impact.x - s.px, impact.y - s.py));
    this.falling.push({ at: this.time + flight, kind: 'rocket', shooter: s, target: null, impact });
    this.hooks.onFellFire(s, w, impact); // launch flash, rocket arc and sound, landing on the ground there
  }

  private fire(s: Unit, t: Entity, w: WeaponSpec): void {
    // VT 1-2 (player and AI alike): soldiers within its machine gun's reach get rapid fire from the coaxial gun, anything
    // else (vehicles, structures, soldiers farther off) one round at a time from the cannons.
    if (s instanceof Vehicle && s.coaxGun && t instanceof Infantry && distanceTo(s.px, s.py, t) <= s.coaxGun.range) w = s.coaxGun;
    // The air-defence vehicle reloads in MANTIS_RELOAD (one missile at a time, so it never keeps firing at an aircraft it
    // has already brought down).
    // has already brought down); the gun-armed PGZ-09 keeps firing every PGZ_RELOAD instead, lighter rounds.
    const flakGun = s instanceof Vehicle && s.type === 'mantis' && MANTIS_GUN_NATIONS.includes(s.faction as FactionId);
    s.cooldown = flakGun ? PGZ_RELOAD : s instanceof Vehicle && s.type === 'mantis' ? MANTIS_RELOAD : w.cooldown * RANK_RELOAD[s.rank];
    s.fightingWith.set(t.owner, this.time);
    if (t instanceof Unit) t.fightingWith.set(s.owner, this.time);
    const impact = this.impactPoint(t);
    if (s instanceof Vehicle && s.type === 'bm21') {
      // A salvo starts only with BM21_MIN_SALVO rockets or more, then ripples one rocket per cooldown until empty.
      if (!s.salvo && s.rockets < BM21_MIN_SALVO) {
        s.cooldown = 0;
        return;
      }
      s.rockets--;
      s.salvo = s.rockets > 0;
      s.salvoTarget = s.salvo ? t.id : null;
      s.salvoAimX = impact.x;
      s.salvoAimY = impact.y;
      s.cooldown = w.cooldown;
      const flight = bm21Flight(distanceTo(s.px, s.py, t));
      // Enemy air defence round the landing spot may shoot it down on the way (BM21_INTERCEPT_CHANCE).
      const guard = this.interceptor(s, impact);
      if (guard) {
        s.engaged = true;
        this.hooks.onIntercept(guard, s, t, impact, flight);
        return;
      }
      // The rocket only hits when it comes down at the end of its arc.
      this.falling.push({ at: this.time + flight, kind: 'rocket', shooter: s, target: t, impact });
      s.engaged = true;
      this.hooks.onFire(s, t, w, impact);
      return;
    }
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
    const dmg = flak ? t.maxHp * flakShare * (1 + MANTIS_RANK_BONUS * s.rank) * (flakGun ? PGZ_HIT_FACTOR : 1) : heliOnFlak ? t.maxHp * HELI_VS_MANTIS_SHARE : w.damage * RANK_FIREPOWER[s.rank] * (t instanceof Building ? w.vsBuilding : 1) * this.heightFactor(s, t);
    t.damage(dmg);
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
    if (w.splash > 0) {
      // The trees in the splash are hurt too (a tank gun clears the woods round its target).
      this.hooks.trees.damageRadius(impact.x, impact.y, w.splash, dmg * 0.5);
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

  // ------------------------------------------------------------------ clearing the woods

  /**
   * Clearing order (Unit.fellTarget): with no enemy to fight, the unit fires on the nearest wooded cell within
   * FELL_SPREAD_CELLS of the cell it was sent to, first moving within weapon range of it; the order ends once every
   * cell there is clear, or when the unit can get no nearer. Returns false once the order is over (the caller then
   * carries on with its usual idle handling). Player and AI alike.
   */
  private fell(s: Unit, w: WeaponSpec): boolean {
    const order = s.fellTarget;
    if (!order) return false;
    // Air defence shoots aircraft only; drones dive; neither clears trees.
    if (s instanceof Vehicle && (s.type === 'mantis' || s.isDrone)) {
      s.fellTarget = null;
      return false;
    }
    const cell = this.hooks.trees.nearestWooded(order.x, order.y, FELL_SPREAD_CELLS);
    if (!cell) {
      s.fellTarget = null;
      s.engaged = false;
      return false;
    }
    const tx = (cell.x + 0.5) * CELL_SIZE;
    const ty = (cell.y + 0.5) * CELL_SIZE;
    const d = Math.hypot(tx - s.px, ty - s.py);
    s.aimHeading = Math.atan2(ty - s.py, tx - s.px);
    if (d <= w.range * this.heightReach(s)) {
      // A tank keeps its hull where it is: only the turret turns to the trees (it fires once laid).
      const tank = s instanceof Vehicle && s.type === 'tank';
      if (!tank) {
        s.facing = movesRight(tx - s.px, ty - s.py) ? 1 : -1;
        s.heading = Math.atan2(ty - s.py, tx - s.px);
      }
      s.stop();
      const laid = !tank || (s as Vehicle).turretOnTarget;
      if (s.cooldown <= 0 && laid) this.fireAtTrees(s, w, cell, tx, ty);
      s.engaged = true;
      return true;
    }
    return this.approachCell(s, tx, ty, w);
  }

  /** The shot on the trees: a bomber drops a stick, a fighter with a bomb left drops one, everyone else uses the gun. */
  private fireAtTrees(s: Unit, w: WeaponSpec, cell: GridPoint, tx: number, ty: number): void {
    s.cooldown = w.cooldown * RANK_RELOAD[s.rank];
    const impact = { x: tx, y: ty };
    if (s instanceof Vehicle && s.type === 'bomber') {
      s.bombs = Math.max(0, s.bombs - BOMBS_PER_DROP);
      this.falling.push({ at: this.time + BOMB_FALL_SECONDS, kind: 'treeStick', shooter: s, target: null, impact });
      this.hooks.onFellFire(s, w, impact);
      return;
    }
    if (s instanceof Vehicle && s.type === 'jet' && s.bombs > 0) {
      s.bombs--;
      this.falling.push({ at: this.time + BOMB_FALL_SECONDS, kind: 'treeBomb', shooter: s, target: null, impact });
      this.hooks.onFellFire(s, { ...w, kind: 'bomb' }, impact);
      return;
    }
    this.hooks.trees.damageCell(cell.x, cell.y, w.damage * RANK_FIREPOWER[s.rank], s.px, s.py);
    this.hooks.onFellFire(s, w, impact);
  }

  /**
   * Moves within weapon range of world point (tx, ty), a few route searches per tick like chase. Returns false (and
   * ends the clearing order) when the unit stands still and can get no nearer (walled in, across water…).
   */
  private approachCell(s: Unit, tx: number, ty: number, w: WeaponSpec): boolean {
    if ((this.chaseAt.get(s.id) ?? 0) > this.time) return true;
    if (!s.aircraft && this.chaseBudget-- <= 0) return true;
    this.chaseAt.set(s.id, this.time + CHASE_PERIOD + (s.id % 8) * 0.05);
    if (s.aircraft) {
      const dx = tx - s.px;
      const dy = ty - s.py;
      const d = Math.hypot(dx, dy) || 1;
      const stop = Math.max(0, d - w.range * 0.7);
      s.follow([{ x: s.px + (dx / d) * stop, y: s.py + (dy / d) * stop }]);
      return true;
    }
    const cell = this.pathfinder.nearestPassable(Math.floor(tx / CELL_SIZE), Math.floor(ty / CELL_SIZE), 12, undefined, s.mobility);
    const path = cell ? this.hooks.findPath({ x: s.px, y: s.py }, cell, s.mobility) : [];
    if (path.length <= 1 && !s.moving) {
      s.fellTarget = null;
      s.engaged = false;
      return false;
    }
    if (path.length > 1) s.follow(path);
    return true;
  }

  /** A ground unit on a mountain ledge (high ground) reaches HIGH_GROUND_RANGE farther. */
  /** Weapon reach of `s` on `t`: a Twins Shots Tank's raised guns reach TWIN_TANK_AIR_RANGE_CELLS at a helicopter in the air. */
  private reachOn(s: Unit, w: WeaponSpec, t: Entity): number {
    if (s instanceof Vehicle && s.type === 'twinTank' && t instanceof Vehicle && t.aircraft && !t.isDrone && t.altitude > 0) return Math.max(w.range, TWIN_TANK_AIR_RANGE_CELLS * CELL_SIZE);
    return w.range;
  }

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
