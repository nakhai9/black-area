import { CELL_SIZE, NEUTRAL_OWNER } from '../constants';
import type { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { Infantry } from '../entities/Infantry';
import type { Unit } from '../entities/Unit';
import type { OilMarket } from './OilMarket';
import type { Pathfinder } from '../map/Pathfinder';
import type { TileMap } from '../map/TileMap';
import { mulberry32 } from '../core/Random';
import type { BuildingType, GridPoint, PlayerState, UnitTier, VehicleKind, WorldPoint } from '../types';
import { BUILD_OPTIONS, type BuildOption, type ConstructionSystem, buildCost } from './ConstructionSystem';
import type { GameSystem } from './GameSystem';
import type { PlacementSystem } from './PlacementSystem';
import type { TrainingSystem } from './TrainingSystem';
import type { VehicleSystem } from './VehicleSystem';

/** What the AI needs from the game: read access plus a few commands. */
export interface AIHost {
  readonly entities: EntityManager;
  readonly map: TileMap;
  readonly pathfinder: Pathfinder;
  readonly construction: ConstructionSystem;
  readonly training: TrainingSystem;
  readonly production: VehicleSystem;
  readonly placement: PlacementSystem;
  readonly oilMarket: OilMarket;
  /** Puts the finished structure of `player`'s construction queue down at (x, y). */
  placeReady(player: PlayerState, x: number, y: number): boolean;
  ownedTypesOf(player: PlayerState): Set<BuildingType>;
  /** Sends a person into a building (President → capital). */
  orderEnter(u: Infantry, b: Building): void;
  /** Soldiers/vehicles walk to `target`, fighting everything on the way. */
  orderAttackMove(units: readonly Unit[], target: WorldPoint): void;
}

/** Order in which an AI nation builds its base. */
const BUILD_PLAN: readonly BuildOption['id'][] = ['barracks', 'warFactory', 'hospital', 'airfield', 'techCenter'];
const THINK_PERIOD = 1.5;
/** No attack waves before this game time (s); the first wave also needs enough soldiers. */
const FIRST_WAVE_AT = 210;
const WAVE_GAP = 110;
/** Enemies this close (world px) to the capital trigger a full defence. */
const DEFENCE_RADIUS = 38 * CELL_SIZE;
/** Units idle farther than this from their capital have finished a campaign. */
const HOME_RADIUS = 30 * CELL_SIZE;
/** An idle unit sees enemies this close (world px); none → the area is cleared. */
const CLEARED_RADIUS = 9 * CELL_SIZE;
/** Chance that a finished expedition goes on to conquer another land instead of marching home. */
const INVADE_CHANCE = 0.45;

interface AIState {
  nextThink: number;
  /** Earliest game time the idle expedition decides what to do next. */
  nextRegroup: number;
  /** Earliest game time the nation offers oil to the World Bank again. */
  nextSell: number;
  nextWave: number;
  waveSize: number;
  rng: () => number;
}

/**
 * Computer-controlled nations. Each one builds its base in a fixed order
 * (Barracks → War Factory → Hospital → Airfield → High-Tech Center), keeps its training
 * and vehicle queues running with the same rules as the player (5:3 special
 * forces, one President kept safe in the capital), defends against nearby
 * enemies and sends periodic attack waves at the closest reachable opponent.
 */
export class AISystem implements GameSystem {
  private time = 0;
  private readonly state = new Map<number, AIState>();
  /** Human players who switched on automatic defence: they only get the auto-training part. */
  private readonly assisted = new Map<number, PlayerState>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly host: AIHost,
  ) {
    players.forEach((p, i) => this.addState(p, i));
  }

  private addState(p: PlayerState, i: number): AIState {
    const st: AIState = { nextThink: 2 + i * 0.5, nextRegroup: 40 + i * 5, nextSell: 20 + i * 7, nextWave: FIRST_WAVE_AT + i * 25, waveSize: 8, rng: mulberry32(1000 + p.id * 77) };
    this.state.set(p.id, st);
    return st;
  }

  /** Automatic defence for a human player: keeps training soldiers and vehicles to protect the base. */
  setAssist(p: PlayerState, on: boolean): void {
    if (on) {
      this.assisted.set(p.id, p);
      if (!this.state.has(p.id)) this.addState(p, 0);
    } else this.assisted.delete(p.id);
  }

  isAssisted(p: PlayerState): boolean {
    return this.assisted.has(p.id);
  }

  update(dt: number): void {
    this.time += dt;
    for (const p of [...this.players, ...this.assisted.values()]) {
      const st = this.state.get(p.id);
      if (!st || this.time < st.nextThink) continue;
      st.nextThink = this.time + THINK_PERIOD;
      if (this.assisted.has(p.id)) this.thinkAssist(p, st);
      else this.think(p, st);
    }
  }

  /** The human's auto-defence: only keeps the production queues busy (no building, no attacks). */
  private thinkAssist(p: PlayerState, st: AIState): void {
    const capital = this.host.entities.buildings().find((b) => b.owner === p.id && b.alive && b.spec.type === 'capital');
    if (!capital) return;
    this.train(p, st, this.host.ownedTypesOf(p), this.threat(p, capital), true);
  }

  /** Number of enemy units within reach of the capital. */
  private threat(p: PlayerState, capital: Building): number {
    const cx = (capital.x + capital.w / 2) * CELL_SIZE;
    const cy = (capital.y + capital.d / 2) * CELL_SIZE;
    let n = 0;
    for (const e of this.host.entities.fieldMovers()) {
      if (e.owner === p.id || e.owner === NEUTRAL_OWNER || !e.alive) continue;
      if (Math.hypot(e.px - cx, e.py - cy) < DEFENCE_RADIUS * 1.6) n++;
    }
    return n;
  }

  private think(p: PlayerState, st: AIState): void {
    const capital = this.host.entities.buildings().find((b) => b.owner === p.id && b.alive && b.spec.type === 'capital');
    if (!capital || p.defeated) return;
    const owned = this.host.ownedTypesOf(p);
    this.sellOil(p, st);
    this.build(p, st, capital, owned);
    this.train(p, st, owned, this.threat(p, capital), false);
    this.keepPresidentSafe(p, capital);
    this.army(p, st, capital);
  }

  // ------------------------------------------------------------------ economy & base

  /** Offers oil to the World Bank when money is short or the price is good. */
  private sellOil(p: PlayerState, st: AIState): void {
    if (this.time < st.nextSell || p.oil < 4) return;
    if (p.credits < 2500 || this.host.oilMarket.price >= 750) {
      this.host.oilMarket.sell(p);
      st.nextSell = this.time + 25;
    }
  }

  private build(p: PlayerState, st: AIState, capital: Building, owned: Set<BuildingType>): void {
    const slot = this.host.construction.slot(p);
    if (slot.state === 'ready' && slot.option) {
      const site = this.findSite(p, st, capital, slot.option);
      if (site) this.host.placeReady(p, site.x, site.y);
      else this.host.construction.cancel(p); // nowhere to put it: refund and try the next plan step
      return;
    }
    if (slot.state !== 'idle') return;
    const next = BUILD_PLAN.map((id) => BUILD_OPTIONS.find((o) => o.id === id)).find(
      (o) => o && !owned.has(o.id as BuildingType) && (!o.requires || owned.has(o.requires)),
    );
    if (next && p.credits >= buildCost(next, p.faction) * 0.3) this.host.construction.start(p, next);
  }

  /** A legal spot near the capital (preferring close ones, with some randomness). */
  private findSite(p: PlayerState, st: AIState, capital: Building, option: BuildOption): GridPoint | null {
    const { w, d } = option.footprint;
    const found: { x: number; y: number; dist: number }[] = [];
    for (let dy = -22; dy <= 22; dy++) {
      for (let dx = -26; dx <= 26; dx++) {
        const x = capital.x + dx;
        const y = capital.y + dy;
        if (!this.host.placement.check({ owner: p.id, x, y, w, d }).ok) continue;
        // Keep one free cell all around so AI buildings never crowd into each other.
        if (!this.host.map.isAreaBuildable(x - 1, y - 1, w + 2, d + 2, false, true)) continue;
        found.push({ x, y, dist: Math.hypot(dx, dy) });
      }
    }
    if (found.length === 0) return null;
    found.sort((a, b) => a.dist - b.dist);
    return found[Math.floor(st.rng() * Math.min(found.length, 10))] ?? found[0] ?? null;
  }

  /**
   * Keeps soldiers and vehicles coming. With enemies near the capital the
   * queues run deeper and favour cheap regulars and tanks; `assist` (the
   * player's auto-defence) never trains a President or aircraft on its own.
   */
  private train(p: PlayerState, st: AIState, owned: Set<BuildingType>, threat: number, assist: boolean): void {
    const { training, production } = this.host;
    const depth = threat > 0 ? 4 : 2;
    if (owned.has('barracks')) {
      const q = training.queue(p);
      if (q.items.length < depth && p.credits > (threat > 0 ? 120 : 250)) {
        const r = training.army(p);
        let tier: UnitTier = 'regular';
        if (!assist && !r.presidentTaken && p.credits > 1500) tier = 'president';
        else if (owned.has('techCenter') && st.rng() < (threat > 0 ? 0.25 : 0.4)) tier = 'special';
        training.enqueue(p, tier);
      }
    }
    if (owned.has('warFactory') || owned.has('airfield')) {
      const q = production.queue(p);
      if (q.items.length < depth && p.credits > (threat > 0 ? 500 : 700)) {
        let kind: VehicleKind = st.rng() < 0.6 || !owned.has('techCenter') ? 'tank' : 'ifv';
        if (!assist && owned.has('airfield') && p.credits > 1700 && st.rng() < 0.3) kind = 'jet';
        if (!owned.has('warFactory') && kind !== 'jet') kind = 'jet';
        if (!assist || kind !== 'jet') production.enqueue(p, kind);
      }
    }
  }

  /** The President goes into the capital and stays there. */
  private keepPresidentSafe(p: PlayerState, capital: Building): void {
    for (const u of this.host.entities.fieldUnits()) {
      if (u.owner === p.id && u.isPresident && !u.moving && u.task === null && capital.canEnter(u)) {
        this.host.orderEnter(u, capital);
      }
    }
  }

  // ------------------------------------------------------------------ army

  private army(p: PlayerState, st: AIState, capital: Building): void {
    const all = this.host.entities.fieldMovers();
    const army = all.filter(
      (u) => u.owner === p.id && u.weapon !== null && u.alive && !(u instanceof Infantry && (u.isPresident || u.isEngineer)),
    );
    if (army.length === 0) return;

    // Defence: enemies close to the capital draw the whole army.
    const cx = (capital.x + capital.w / 2) * CELL_SIZE;
    const cy = (capital.y + capital.d / 2) * CELL_SIZE;
    let nearest: Unit | null = null;
    let nearestD = DEFENCE_RADIUS;
    for (const e of all) {
      if (e.owner === p.id || e.owner === NEUTRAL_OWNER) continue;
      const d = Math.hypot(e.px - cx, e.py - cy);
      if (d < nearestD) {
        nearest = e;
        nearestD = d;
      }
    }
    if (nearest) {
      const reachable = army.filter((u) => !u.attackMove || u.chasing === false);
      this.host.orderAttackMove(reachable, { x: nearest.px, y: nearest.py });
      return;
    }

    // After the fight: nothing left to destroy here and nobody attacking → go home or conquer another land.
    this.regroup(p, st, army, capital, all);

    // Attack wave.
    if (this.time < st.nextWave || army.length < st.waveSize) return;
    const target = this.pickTarget(p, capital.centerWorld());
    st.nextWave = this.time + WAVE_GAP;
    if (!target) return;
    const goal = target.centerWorld();
    const cell = this.host.pathfinder.nearestPassable(Math.floor(goal.x / CELL_SIZE), Math.floor((goal.y + 10) / CELL_SIZE), 10);
    const wave = army.filter((u) => {
      if (u.aircraft || u.swims) return true; // aircraft and special forces can cross the sea
      return cell !== null && this.host.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y);
    });
    // Always leave a home guard behind: the strongest units go, a third of the army stays.
    const sent = wave.slice(0, Math.max(0, Math.min(wave.length, army.length - Math.max(4, Math.ceil(army.length / 3)))));
    if (sent.length < Math.min(4, st.waveSize)) return;
    st.waveSize = Math.min(st.waveSize + 3, 30);
    this.host.orderAttackMove(sent, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
  }

  /**
   * Units far from home that stand idle, with no enemy in sight and nobody having hit them lately, have
   * cleared their area. The group then marches back to its own land or sets out to take another one
   * (the nearest enemy structure reachable by land; aircraft and swimmers can go anywhere).
   */
  private regroup(p: PlayerState, st: AIState, army: Unit[], capital: Building, all: readonly Unit[]): void {
    if (this.time < st.nextRegroup) return;
    const home = capital.centerWorld();
    const buildings = this.host.entities.buildings();
    const hostileNear = (u: Unit): boolean => {
      for (const e of all) {
        if (e.owner === p.id || e.owner === NEUTRAL_OWNER || !e.alive) continue;
        if (Math.hypot(e.px - u.px, e.py - u.py) < CLEARED_RADIUS) return true;
      }
      for (const b of buildings) {
        if (!b.alive || b.owner === p.id || b.owner === NEUTRAL_OWNER || b.indestructible) continue;
        const c = b.centerWorld();
        if (Math.hypot(c.x - u.px, c.y - u.py) < CLEARED_RADIUS + (b.w * CELL_SIZE) / 2) return true;
      }
      return false;
    };
    const idle = army.filter(
      (u) =>
        !u.aircraft &&
        !u.moving &&
        u.attackMove === null &&
        u.attackTarget === null &&
        u.combatTarget === null &&
        this.time - u.lastAttackedAt > 6 &&
        Math.hypot(u.px - home.x, u.py - home.y) > HOME_RADIUS &&
        !hostileNear(u),
    );
    if (idle.length === 0) return;
    st.nextRegroup = this.time + 15;

    const cx = idle.reduce((s, u) => s + u.px, 0) / idle.length;
    const cy = idle.reduce((s, u) => s + u.py, 0) / idle.length;
    const target = st.rng() < INVADE_CHANCE ? this.pickTarget(p, { x: cx, y: cy }) : null;
    if (target) {
      const goal = target.centerWorld();
      const cell = this.host.pathfinder.nearestPassable(Math.floor(goal.x / CELL_SIZE), Math.floor((goal.y + 10) / CELL_SIZE), 10);
      const going = idle.filter(
        (u) => u.swims || (cell !== null && this.host.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y)),
      );
      if (going.length >= Math.min(3, idle.length)) {
        this.host.orderAttackMove(going, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
        return;
      }
    }
    // Back to the homeland, to the parade ground in front of the capital.
    this.host.orderAttackMove(idle, { x: home.x, y: home.y + CELL_SIZE * 8 });
  }

  /** Closest enemy capital by distance; falls back to any enemy building. */
  private pickTarget(p: PlayerState, from: WorldPoint | Building): Building | null {
    const mine = 'spec' in from ? from.centerWorld() : from;
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.host.entities.buildings()) {
      if (!b.alive || b.owner === p.id || b.owner === NEUTRAL_OWNER) continue;
      const c = b.centerWorld();
      const d = Math.hypot(c.x - mine.x, c.y - mine.y) * (b.spec.type === 'capital' ? 1 : 1.6);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }
}
