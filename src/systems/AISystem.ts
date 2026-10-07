import { CELL_SIZE, NEUTRAL_OWNER } from '../constants';
import type { Building } from '../entities/Building';
import type { Entity } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Infantry } from '../entities/Infantry';
import { Vehicle } from '../entities/Vehicle';
import type { Unit } from '../entities/Unit';
import { canTarget } from './CombatSystem';
import type { OilMarket } from './OilMarket';
import type { Pathfinder } from '../map/Pathfinder';
import type { TileMap } from '../map/TileMap';
import { mulberry32 } from '../core/Random';
import type { BuildingType, GridPoint, PlayerState, UnitTier, VehicleKind, WorldPoint } from '../types';
import { BUILD_OPTIONS, type BuildOption, type ConstructionSystem, buildCost, missingRequirement } from './ConstructionSystem';
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
  /** Sends an engineer to repair an own damaged building. */
  orderRepair(u: Infantry, b: Building): void;
  /** Soldiers / vehicles walk to a parked transport and climb aboard. */
  orderBoard(t: Vehicle, riders: Unit[]): boolean;
  /** Soldiers/vehicles walk to `target`, fighting everything on the way. */
  orderAttackMove(units: readonly Unit[], target: WorldPoint): void;
  /** Focus on an enemy structure or unit: soldiers and vehicles only attack buildings when told to. */
  orderAttackTarget(units: readonly Unit[], target: Entity): void;
}

/** Order in which an AI nation builds its base. */
const BUILD_PLAN: readonly BuildOption['id'][] = ['barracks', 'warFactory', 'hospital', 'airfield', 'techCenter'];
const THINK_PERIOD = 1.5;
/**
 * Economic policy. A Happy City is the best investment a nation can make — it pays HAPPY_CITY_TAX into the
 * budget every HAPPY_CITY_TAX_PERIOD seconds for as long as it stands — so the AI builds as many as it can
 * carry instead of on a fixed schedule. What holds it back is deliberate: it never borrows to invest, it
 * replaces battle losses before it invests, and it stops investing while its base is under attack.
 */
const MAX_CITIES = 10;
/** While saving for a city, units are only bought with money above this share of its price. */
const CITY_SAVE_SHARE = 0.7;
/** Below this many fighting units the AI ignores savings and rebuilds its army first. */
const MIN_ARMY = 8;
/** …and it only starts putting money aside for the next city once the army is this far above that floor. */
const INVEST_ARMY_FACTOR = 1.5;
/** Balanced army: about this many soldiers for every vehicle / aircraft. */
const SOLDIERS_PER_VEHICLE = 2;
/** Target vehicle mix (share of the vehicle fleet). */
const VEHICLE_MIX: readonly [VehicleKind, number][] = [['tank', 0.4], ['ifv', 0.25], ['light', 0.15], ['jet', 0.2]];
/** A structure below this share of its health is worth an engineer. */
const REPAIR_BELOW = 0.65;
/** A soldier below this share of its health goes to hospital once out of the fight. */
const HEAL_BELOW = 0.55;
/** Seconds without being hit before a wounded soldier leaves the fight for hospital. */
const HEAL_CALM = 4;
/** Overseas war: transport aircraft kept at home, and the smallest force worth sending across the ocean. */
const OVERSEAS_TRANSPORTS = 2;
const OVERSEAS_MIN_FORCE = 10;
/** Soldiers sent to fill one transport (its capacity for soldiers only). */
const TRANSPORT_LOAD = 12;

/**
 * Each AI nation gets a character so no two games play the same:
 *  - economist: builds cities sooner and saves harder, attacks later with bigger waves;
 *  - warlord: few cities, early and frequent attack waves, more vehicles;
 *  - balanced: in between.
 */
interface Personality {
  name: 'economist' | 'warlord' | 'balanced';
  /** How many Happy Cities this personality is willing to run, as a share of MAX_CITIES. */
  cityAppetite: number;
  /** Share of a city's price kept in reserve while saving. */
  save: number;
  /** Multiplies the time to the first wave and between waves. */
  waveGap: number;
  /** Soldiers per vehicle. */
  soldiersPerVehicle: number;
}

const PERSONALITIES: readonly Personality[] = [
  { name: 'economist', cityAppetite: 1, save: 0.85, waveGap: 1.3, soldiersPerVehicle: 2.5 },
  { name: 'warlord', cityAppetite: 0.5, save: 0.4, waveGap: 0.7, soldiersPerVehicle: 1.4 },
  { name: 'balanced', cityAppetite: 0.8, save: CITY_SAVE_SHARE, waveGap: 1, soldiersPerVehicle: SOLDIERS_PER_VEHICLE },
];
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
/** Army units this close (world px) to an enemy structure are told to destroy it. */
const SIEGE_RANGE = 16 * CELL_SIZE;

interface AIState {
  nextThink: number;
  /** Earliest game time the idle expedition decides what to do next. */
  nextRegroup: number;
  /** Earliest game time the nation offers oil to the World Bank again. */
  nextSell: number;
  nextWave: number;
  waveSize: number;
  rng: () => number;
  /** This nation's character (see PERSONALITIES). */
  style: Personality;
  /** The nearest enemy can only be reached across the sea: build and mass sea-crossing forces. */
  overseas: boolean;
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
    const rng = mulberry32(1000 + p.id * 77 + Math.floor(Math.random() * 1e6));
    const style = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)] ?? PERSONALITIES[2];
    const st: AIState = {
      nextThink: 2 + i * 0.5,
      nextRegroup: 40 + i * 5,
      nextSell: 20 + i * 7,
      nextWave: FIRST_WAVE_AT * style.waveGap + i * 25,
      waveSize: style.name === 'warlord' ? 6 : style.name === 'economist' ? 10 : 8,
      rng,
      style,
      overseas: false,
    };
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
    const threat = this.threat(p, capital);
    st.overseas = this.isOverseas(p, capital);
    this.sellOil(p, st);
    this.build(p, st, capital, owned, threat);
    this.train(p, st, owned, threat, false);
    this.keepPresidentSafe(p, capital);
    this.repairBase(p, owned);
    if (st.overseas) this.loadTransports(p, capital);
    this.healWounded(p);
    this.army(p, st, capital);
  }

  // ------------------------------------------------------------------ economy & base

  /** Making money comes first: sells oil whenever the Bank pays a fair price, or at any price when broke. */
  private sellOil(p: PlayerState, st: AIState): void {
    if (this.time < st.nextSell || p.oil < 2) return;
    const market = this.host.oilMarket;
    if (market.waitSeconds(p) > 0) return;
    // Sells at a fair price, at any price when short of cash, and at any price while it owes the Bank
    // (every sale pays the debt down first).
    if (p.credits < 3000 || p.debt > 0 || market.price >= 550) {
      market.sell(p);
      st.nextSell = this.time + 5;
    }
  }

  /** Happy Cities the nation owns (alive). */
  private cities(p: PlayerState): number {
    return this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'happyCity').length;
  }

  /**
   * Does the nation want another Happy City right now? It does whenever it can grow without weakening
   * itself: the High-Tech Center is up, it owes the World Bank nothing, and it still has an army on the
   * field. The cap is per personality — an economist runs the full MAX_CITIES, a warlord half of them.
   */
  private savingForCity(p: PlayerState, owned: Set<BuildingType>, st?: AIState): boolean {
    const city = BUILD_OPTIONS.find((o) => o.id === 'happyCity');
    if (!city || missingRequirement(city, owned) !== null) return false;
    // Growth is paid for out of income, never out of debt: clearing what it owes comes first.
    if (p.debt > 0 || p.creditFrozen) return false;
    const cap = Math.max(2, Math.round(MAX_CITIES * (st?.style.cityAppetite ?? 1)));
    if (this.cities(p) >= cap) return false;
    return this.forces(p).total >= MIN_ARMY;
  }

  /** Fighting units of the nation: soldiers (no President / engineers) and vehicles by kind. */
  private forces(p: PlayerState): { soldiers: number; vehicles: Map<VehicleKind, number>; total: number } {
    let soldiers = 0;
    const vehicles = new Map<VehicleKind, number>();
    for (const u of this.host.entities.fieldMovers()) {
      if (u.owner !== p.id || !u.alive) continue;
      if (u instanceof Infantry) {
        if (!u.isPresident && !u.isEngineer) soldiers++;
      } else if (u instanceof Vehicle && !u.isTransport) vehicles.set(u.type, (vehicles.get(u.type) ?? 0) + 1);
    }
    let total = soldiers;
    for (const n of vehicles.values()) total += n;
    return { soldiers, vehicles, total };
  }

  private build(p: PlayerState, st: AIState, capital: Building, owned: Set<BuildingType>, threat: number): void {
    const slot = this.host.construction.slot(p);
    if (slot.state === 'ready' && slot.option) {
      const site = this.findSite(p, st, capital, slot.option);
      if (site) this.host.placeReady(p, site.x, site.y);
      else this.host.construction.cancel(p); // nowhere to put it: refund and try the next plan step
      return;
    }
    if (slot.state !== 'idle') return;
    let next = BUILD_PLAN.map((id) => BUILD_OPTIONS.find((o) => o.id === id)).find(
      (o) => o && !owned.has(o.id as BuildingType) && missingRequirement(o, owned) === null,
    );
    // Base complete (or waiting): grow the economy with Happy Cities when nobody is attacking.
    if (!next && threat === 0 && this.savingForCity(p, owned, st)) next = BUILD_OPTIONS.find((o) => o.id === 'happyCity');
    if (next && p.credits >= buildCost(next, p.faction) * (next.id === 'happyCity' ? 1 : 0.3)) this.host.construction.start(p, next);
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
   * Keeps soldiers and vehicles coming, balanced: about SOLDIERS_PER_VEHICLE soldiers per vehicle and a vehicle
   * fleet close to VEHICLE_MIX. Money comes first: while saving for a Happy City only the surplus is spent,
   * unless the army is too small or the capital is under threat. `assist` (the player's auto-defence) never
   * trains a President or aircraft on its own.
   */
  private train(p: PlayerState, st: AIState, owned: Set<BuildingType>, threat: number, assist: boolean): void {
    const { training, production } = this.host;
    const depth = threat > 0 ? 4 : 2;
    const f = this.forces(p);
    const city = BUILD_OPTIONS.find((o) => o.id === 'happyCity');
    // Money is only put aside for the next city once the army is comfortably above its floor: battle losses
    // are replaced first, so investing never leaves the nation defenceless.
    const reserve =
      !assist && threat === 0 && f.total >= MIN_ARMY * INVEST_ARMY_FACTOR && city && this.savingForCity(p, owned, st)
        ? buildCost(city, p.faction) * st.style.save
        : 0;
    const budget = p.credits - reserve;
    let vehicleCount = 0;
    for (const n of f.vehicles.values()) vehicleCount += n;
    const canVehicles = owned.has('warFactory'); // every order (aircraft too) is placed at the War Factory
    // Which side is short: soldiers or vehicles?
    const wantVehicle = canVehicles && f.soldiers >= vehicleCount * st.style.soldiersPerVehicle;

    if (owned.has('barracks') && (!wantVehicle || threat > 0)) {
      const q = training.queue(p);
      if (q.items.length < depth && budget > (threat > 0 ? 120 : 250)) {
        const r = training.army(p);
        let tier: UnitTier = 'regular';
        if (!assist && !r.presidentTaken && p.credits > 1500) tier = 'president';
        else if (owned.has('techCenter') && r.special < r.specialCap && st.rng() < (threat > 0 ? 0.25 : st.overseas ? 0.75 : 0.4)) tier = 'special';
        training.enqueue(p, tier);
      }
    }
    if (canVehicles && (wantVehicle || threat > 0)) {
      const q = production.queue(p);
      if (q.items.length < depth && budget > (threat > 0 ? 500 : 700)) {
        // Pick the kind furthest below its share of the fleet, among those this base can build.
        const able = (k: VehicleKind): boolean =>
          k === 'jet' ? owned.has('warFactory') && owned.has('airfield') && !assist : k === 'ifv' ? owned.has('warFactory') && owned.has('techCenter') : owned.has('warFactory');
        let kind: VehicleKind | null = null;
        let worst = Infinity;
        // Across the sea only aircraft (and what transports carry) reach the enemy: favour jets, keep transports.
        const mix: readonly [VehicleKind, number][] = st.overseas ? [['tank', 0.25], ['ifv', 0.15], ['light', 0.1], ['jet', 0.5]] : VEHICLE_MIX;
        const transports = this.host.entities
          .fieldMovers()
          .filter((u) => u instanceof Vehicle && u.owner === p.id && u.alive && u.isTransport).length;
        const queuedTransports = q.items.filter((k) => k === 'transport').length;
        if (!assist && st.overseas && owned.has('warFactory') && owned.has('airfield') && transports + queuedTransports < OVERSEAS_TRANSPORTS) {
          production.enqueue(p, 'transport');
          return;
        }
        for (const [k, share] of mix) {
          if (!able(k)) continue;
          const have = (f.vehicles.get(k) ?? 0) / Math.max(1, vehicleCount);
          const score = have - share + st.rng() * 0.05;
          if (score < worst) {
            worst = score;
            kind = k;
          }
        }
        // Ground fleet at its cap: aircraft are not limited, so build a jet instead.
        if (kind && production.enqueue(p, kind) === 'cap' && able('jet')) production.enqueue(p, 'jet');
      }
    }
  }

  /** Own structures (not indestructible) below REPAIR_BELOW of their health. */
  private damaged(p: PlayerState): Building[] {
    return this.host.entities
      .buildings()
      .filter((b) => b.owner === p.id && b.alive && !b.indestructible && b.hp < b.maxHp * REPAIR_BELOW)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  }

  /**
   * Same rules as the player: an engineer walks into a damaged structure, restores it to 100% and is consumed.
   * The nation trains engineers when it has damaged buildings and none on the way (one per building, max 3),
   * the capital first since it is the most damaged in a siege.
   */
  private repairBase(p: PlayerState, owned: Set<BuildingType>): void {
    const hurt = this.damaged(p);
    if (hurt.length === 0) return;
    const engineers = this.host.entities.fieldUnits().filter((u): u is Infantry => u instanceof Infantry && u.owner === p.id && u.alive && u.isEngineer);
    const covered = new Set(engineers.filter((u) => u.task?.type === 'repair').map((u) => u.task?.buildingId));
    const free = engineers.filter((u) => u.task === null && !u.moving);
    for (const b of hurt) {
      if (covered.has(b.id)) continue;
      const u = free.shift();
      if (!u) break;
      this.host.orderRepair(u, b);
      covered.add(b.id);
    }
    if (!owned.has('barracks')) return;
    const queued = this.host.training.queue(p).items.filter((t) => t === 'engineer').length;
    const needed = Math.min(3, hurt.filter((b) => !covered.has(b.id)).length);
    if (queued < needed && free.length === 0 && p.credits > 600) this.host.training.enqueue(p, 'engineer');
  }

  /** Wounded soldiers who are out of the fight go to the nearest hospital with a free bed (same rule as the player). */
  private healWounded(p: PlayerState): void {
    const hospitals = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.garrison?.accepts !== 'president' && b.spec.garrison);
    if (hospitals.length === 0) return;
    const heading = new Map<number, number>();
    for (const u of this.host.entities.fieldUnits()) {
      if (u.owner === p.id && u.task?.type === 'enter') heading.set(u.task.buildingId, (heading.get(u.task.buildingId) ?? 0) + 1);
    }
    for (const u of this.host.entities.fieldUnits()) {
      if (!(u instanceof Infantry) || u.owner !== p.id || !u.alive || u.isPresident || u.task !== null) continue;
      if (u.hp >= u.maxHp * HEAL_BELOW || this.time - u.lastAttackedAt < HEAL_CALM) continue;
      let best: Building | null = null;
      let bestD = Infinity;
      for (const h of hospitals) {
        const cap = h.spec.garrison?.capacity ?? 0;
        if (!h.canEnter(u) || h.garrison.length + (heading.get(h.id) ?? 0) >= cap) continue;
        const c = h.centerWorld();
        const d = Math.hypot(c.x - u.px, c.y - u.py);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      if (!best) continue;
      u.attackMove = null;
      u.attackTarget = null;
      this.host.orderEnter(u, best);
      heading.set(best.id, (heading.get(best.id) ?? 0) + 1);
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
      (u) => u.owner === p.id && u.weapon !== null && u.alive && u.task?.type !== 'enter' && u.boardTarget === null && !(u instanceof Infantry && (u.isPresident || u.isEngineer)),
    );
    if (army.length === 0) return;

    // Defence: enemies close to the capital draw the whole army.
    const cx = (capital.x + capital.w / 2) * CELL_SIZE;
    const cy = (capital.y + capital.d / 2) * CELL_SIZE;
    // Only threats the army can actually fight count: an enemy jet over the sea must not send the ground army
    // (which can neither hit it nor reach it) on an unreachable route every think.
    let nearest: Unit | null = null;
    let nearestD = DEFENCE_RADIUS;
    for (const e of all) {
      if (e.owner === p.id || e.owner === NEUTRAL_OWNER) continue;
      const d = Math.hypot(e.px - cx, e.py - cy);
      if (d < nearestD && army.some((u) => canTarget(u, e))) {
        nearest = e;
        nearestD = d;
      }
    }
    if (nearest) {
      const threat = nearest;
      const responders = army.filter((u) => canTarget(u, threat) && (!u.attackMove || u.chasing === false));
      this.host.orderAttackMove(responders, { x: threat.px, y: threat.py });
      return;
    }

    // Units never shoot structures by themselves: the army is told which building to focus on.
    this.focusBuildings(p, army);

    // After the fight: nothing left to destroy here and nobody attacking → go home or conquer another land.
    this.regroup(p, st, army, capital, all);

    // Attack wave.
    if (st.overseas) {
      this.overseasWave(p, st, army, capital);
      return;
    }
    if (this.time < st.nextWave || army.length < st.waveSize) return;
    const target = this.pickTarget(p, capital.centerWorld());
    st.nextWave = this.time + WAVE_GAP * st.style.waveGap;
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

  /** True when the nearest enemy structure cannot be reached by land from the capital. */
  private isOverseas(p: PlayerState, capital: Building): boolean {
    const target = this.pickTarget(p, capital.centerWorld());
    if (!target) return false;
    const pf = this.host.pathfinder;
    const home = capital.centerWorld();
    const goal = target.centerWorld();
    const a = pf.nearestPassable(Math.floor(home.x / CELL_SIZE), Math.floor((home.y + 10) / CELL_SIZE), 10);
    const b = pf.nearestPassable(Math.floor(goal.x / CELL_SIZE), Math.floor((goal.y + 10) / CELL_SIZE), 10);
    return a !== null && b !== null && !pf.sameLandmass(a.x, a.y, b.x, b.y);
  }

  /** Own transport aircraft standing at home (parked) with room left. */
  private homeTransports(p: PlayerState): Vehicle[] {
    return this.host.entities
      .fieldMovers()
      .filter((u): u is Vehicle => u instanceof Vehicle && u.owner === p.id && u.alive && u.isTransport && u.flight === 'parked');
  }

  /** Overseas war: idle soldiers at home that cannot swim climb into the parked transports, ready to be flown over. */
  private loadTransports(p: PlayerState, capital: Building): void {
    const home = capital.centerWorld();
    const boarding = new Map<number, number>();
    for (const u of this.host.entities.fieldMovers()) {
      if (u.owner === p.id && u.boardTarget !== null) boarding.set(u.boardTarget, (boarding.get(u.boardTarget) ?? 0) + 1);
    }
    const pool = this.host.entities
      .fieldMovers()
      .filter(
        (u): u is Infantry =>
          u instanceof Infantry &&
          u.owner === p.id &&
          u.alive &&
          !u.swims &&
          !u.isPresident &&
          !u.isEngineer &&
          u.task === null &&
          u.boardTarget === null &&
          u.attackMove === null &&
          u.combatTarget === null &&
          u.hp >= u.maxHp * HEAL_BELOW &&
          Math.hypot(u.px - home.x, u.py - home.y) < HOME_RADIUS,
      );
    for (const t of this.homeTransports(p)) {
      const room = TRANSPORT_LOAD - t.cargo.length - (boarding.get(t.id) ?? 0);
      if (room <= 0 || pool.length === 0) continue;
      this.host.orderBoard(t, pool.splice(0, room));
    }
  }

  /**
   * Overseas attack: the AI masses everything that can cross the sea — fighter jets, swimming special forces
   * and loaded transports — and launches them together once the force is big enough. Land units stay home as guard.
   */
  private overseasWave(p: PlayerState, st: AIState, army: Unit[], capital: Building): void {
    if (this.time < st.nextWave) return;
    const target = this.pickTarget(p, capital.centerWorld());
    if (!target) return;
    const goal = target.centerWorld();
    const crossers = army.filter((u) => u.aircraft || u.swims);
    const loaded = this.homeTransports(p).filter((t) => t.cargo.length > 0);
    const boarding = this.host.entities.fieldMovers().some((u) => u.owner === p.id && u.boardTarget !== null);
    const force = crossers.length + loaded.reduce((s, t) => s + t.cargo.length, 0);
    const need = Math.max(OVERSEAS_MIN_FORCE, Math.min(st.waveSize, 24));
    // Wait for the transports to finish loading unless the force is already big enough without them.
    if (force < need || (boarding && force < need * 1.5)) return;
    st.nextWave = this.time + WAVE_GAP * st.style.waveGap;
    st.waveSize = Math.min(st.waveSize + 3, 30);
    // Fighters and swimmers go straight at the target; transports land next to it and unload.
    this.host.orderAttackMove(crossers, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
    if (loaded.length > 0) this.host.orderAttackMove(loaded, { x: goal.x, y: goal.y + CELL_SIZE * 9 });
  }

  /** Army units near an enemy structure (and not busy) get an explicit order to destroy the nearest one. */
  private focusBuildings(p: PlayerState, army: Unit[]): void {
    const targets = this.host.entities.buildings().filter((b) => b.alive && b.owner !== p.id && b.owner !== NEUTRAL_OWNER && !b.indestructible);
    if (targets.length === 0) return;
    const groups = new Map<number, { building: Building; units: Unit[] }>();
    for (const u of army) {
      if (u.attackTarget !== null || u.combatTarget !== null) continue;
      let best: Building | null = null;
      let bestD = SIEGE_RANGE;
      for (const b of targets) {
        const c = b.centerWorld();
        const d = Math.hypot(c.x - u.px, c.y - u.py) - (b.w * CELL_SIZE) / 2;
        if (d < bestD) {
          best = b;
          bestD = d;
        }
      }
      if (!best) continue;
      const g = groups.get(best.id);
      if (g) g.units.push(u);
      else groups.set(best.id, { building: best, units: [u] });
    }
    for (const g of groups.values()) this.host.orderAttackTarget(g.units, g.building);
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
