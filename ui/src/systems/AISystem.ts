import { AI_AIR_DEFENCE, AI_AIR_DEFENCE_PER_CITIES, AI_AIR_DEFENCE_RING, AI_BUNKERS, AI_WALL_ALERT_SECONDS, AI_WALL_ENEMY_UNITS, AI_WALL_GAP, AI_WALL_WATCH_CELLS, AI_WALL_RING, AI_WALL_SEGMENT, BUNKER_RANGE, CELL_SIZE, INFANTRY_BASE, INFANTRY_MARCH_CELLS, EMBASSY_CAPITAL_CELLS, MAX_ALLIES, NATION_GARRISON, NATION_GARRISON_CELLS, NEUTRAL_OWNER, OIL_DERRICK_OUTPUT, OIL_LEASE_CARTEL_SHARE, OIL_LEASE_SECONDS, TECH_VEHICLES, TRUCE_ZONE_CELLS, TRUCK_MIN_RIDERS, TRUCK_SOLDIERS } from '../constants';
import { FACTIONS } from '../factions';
import { StructureIndex } from './StructureIndex';
import { OilDerrick } from '../entities/OilDerrick';
import { NationCapital } from '../entities/NationCapital';
import { Gate } from '../entities/Gate';
import type { Building } from '../entities/Building';
import type { Entity } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Infantry } from '../entities/Infantry';
import { Vehicle } from '../entities/Vehicle';
import type { Unit } from '../entities/Unit';
import { canTarget, inTruce, isHostile } from './CombatSystem';
import type { OilMarket } from './OilMarket';
import type { Pathfinder } from '../map/Pathfinder';
import type { TileMap } from '../map/TileMap';
import { mulberry32 } from '../core/Random';
import type { BuildingType, GridPoint, PlayerState, UnitTier, VehicleKind, WorldPoint } from '../types';
import { BUILD_OPTIONS, type BuildOption, type ConstructionSystem, buildCost, missingRequirement } from './ConstructionSystem';
import type { GameSystem } from './GameSystem';
import { type PlacementSystem, buildRadius, isClaimable } from './PlacementSystem';
import type { SafeZone, SafeZoneSystem } from './SafeZoneSystem';
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
  placeReady(player: PlayerState, id: BuildOption['id'], x: number, y: number, rotated?: boolean): boolean;
  ownedTypesOf(player: PlayerState): Set<BuildingType>;
  /** Sends a person into a building (wounded → hospital). */
  orderEnter(u: Infantry, b: Building): void;
  /** Sends an engineer to lease one of the oil cartel's derricks (false if it cannot: limit reached, no path...). */
  orderLease(u: Infantry, b: OilDerrick): boolean;
  /** Sends an engineer to repair an own damaged building. */
  orderRepair(u: Infantry, b: Building): void;
  /** Sends repair vehicles (ARV) among `units` to mend a damaged friendly ground vehicle. */
  orderMend(target: Vehicle, units: readonly Unit[]): boolean;
  /** Soldiers / vehicles walk to a parked transport and climb aboard. */
  orderBoard(t: Vehicle, riders: Unit[]): boolean;
  /** Sends a kamikaze drone (B-767) to dive into an enemy structure. */
  launchDrone(d: Vehicle, b: Entity): void;
  /** Plain move (no fighting on the way) — trucks driving a convoy. */
  orderMoveUnits(units: readonly Unit[], target: WorldPoint): void;
  /** A truck lets everyone out where it stands. */
  unloadTruck(t: Vehicle): void;
  /** Soldiers/vehicles walk to `target`, fighting everything on the way. */
  orderAttackMove(units: readonly Unit[], target: WorldPoint): void;
  /** Focus on an enemy structure or unit: soldiers and vehicles only attack buildings when told to. */
  orderAttackTarget(units: readonly Unit[], target: Entity): void;
  /** Falls back to `target` without stopping to fight; enemies may not chase retreating units. */
  orderRetreat(units: readonly Unit[], target: WorldPoint): void;
  /** Green safe zones of the Global Monitoring Center (units stranded abroad wait there to be flown home). */
  readonly safeZones: SafeZoneSystem;
  /** Structure that may not be attacked right now (the player's derricks during their grace period). */
  isShielded(b: Building): boolean;
  /** A Squatters team plants its flag where it stands (null = planted, else why not). */
  plantFlag(u: Infantry): string | null;
  /** Allies the nation leads (Allied Buildings standing + one under construction). */
  alliesOf(player: PlayerState): number;
  /** Sends an engineer to take over a contested nation's capital (false if it cannot get there). */
  orderCapture(u: Infantry, b: Building): boolean;
}

/** Order in which an AI nation builds its base. */
const BUILD_PLAN: readonly BuildOption['id'][] = ['powerPlant', 'barracks', 'warFactory', 'hospital', 'airfield', 'techCenter'];
const THINK_PERIOD = 1.5;
/** Ceasefire: the AI keeps its units this many cells further out than the zone itself (a safety margin). */
const TRUCE_SAFETY_CELLS = 2;
/** Production buildings the AI raises next to each Allied Building, and how near (cells) counts as "next to". */
const FORWARD_TYPES = ['barracks', 'warFactory'] as const;
const FORWARD_RANGE = 14;
/**
 * Economic policy. A Happy City is the best investment a nation can make — it pays HAPPY_CITY_TAX into the
 * budget every HAPPY_CITY_TAX_PERIOD seconds for as long as it stands — so the AI builds as many as it can
 * carry instead of on a fixed schedule. What holds it back is deliberate: it never borrows to invest, it
 * replaces battle losses before it invests, and it stops investing while its base is under attack.
 */
const MAX_CITIES = 30;
/** While saving for a city, units are only bought with money above this share of its price. */
const CITY_SAVE_SHARE = 0.7;
/** Below this many fighting units the AI ignores savings and rebuilds its army first. */
const MIN_ARMY = 8;
/** …and it only starts putting money aside for the next city once the army is this far above that floor. */
const INVEST_ARMY_FACTOR = 1.5;
/** Balanced army: about this many soldiers for every vehicle / aircraft. */
const SOLDIERS_PER_VEHICLE = 2;
/**
 * Base weight of each combat vehicle in the fleet the AI aims for; train() reshapes it from what the enemy fields
 * (see fleetWeights). Kinds the nation cannot build are simply skipped.
 */
/** AI drone targets, best first: structures that make money (0), the capital (1), military structures (2), any other
 * (civil) structure (3); unit groups are tiers 4-8 (see sendDrones). */
const DRONE_BUILDING_TIER: Partial<Record<BuildingType, number>> = {
  refinery: 0,
  bank: 0,
  happyCity: 0,
  capital: 1,
  nationCapital: 1,
  barracks: 2,
  warFactory: 2,
  airfield: 2,
  techCenter: 2,
  bunker: 2,
  wall: 2,
  gate: 2,
};
const DRONE_TIER_CIVIL = 3;
/** Enemy units within this many cells of each other count as one group for the AI's drones. */
const DRONE_GROUP_CELLS = 2.5;
const VEHICLE_WEIGHT: Readonly<Partial<Record<VehicleKind, number>>> = {
  tank: 0.34,
  ifv: 0.12,
  light: 0.06,
  jet: 0.16,
  heli: 0.1,
  bomber: 0.1,
  repair: 0.04,
  mantis: 0.05,
  drone: 0.06,
};
/** Repairs come first: any structure below this share of its health gets an engineer. */
const REPAIR_BELOW = 0.98;
/** Seconds a structure must go unhit before an engineer is sent inside to repair it. */
const REPAIR_CALM = 3;
/** A soldier below this share of its health goes to the nearest hospital. */
const HEAL_BELOW = 0.85;
/** Seconds without being hit before a wounded soldier leaves the fight for hospital. */
const HEAL_CALM = 1.5;
/** Repair vehicles look for damaged friendly ground vehicles within this many cells. */
const MEND_SEARCH_CELLS = 60;
/** Overseas war: transport aircraft kept at home, and the smallest force worth sending across the ocean. */
const OVERSEAS_TRANSPORTS = 2;
/** Army trucks: at most this many per nation, one per TRUCK_SEATS soldiers; soldiers within TRUCK_PICKUP_CELLS of an
 * idle truck ride it, and it lets them out UNLOAD_SHORT_CELLS short of the target. */
const MAX_TRUCKS = Number.POSITIVE_INFINITY;
const TRUCK_SEATS = TRUCK_SOLDIERS;
const TRUCK_PICKUP_CELLS = 25;
const UNLOAD_SHORT_CELLS = 8;
const OVERSEAS_MIN_FORCE = 10;
/** Soldiers sent to fill one transport (its capacity for soldiers only). */
const TRANSPORT_LOAD = 12;
/**
 * Claiming new land for allies: from this game time on, with a calm home front and this much cash, the nation
 * flies a Squatters team to unclaimed land and raises an Allied Building there (at most MAX_ALLIES).
 */
const CLAIM_FROM = 120;
const CLAIM_MIN_CREDITS = 2500;
/** A claim is kept at least this far (cells) from any enemy structure, and from every other claim. */
const CLAIM_ENEMY_GAP = 18;
const CLAIM_SPACING = 30;
/** Cells between sampled candidate sites when looking for land to claim. */
const CLAIM_SAMPLE = 5;
/** An Allied Building goes up within this many cells of the nation's claim flag. */
const ALLIED_SEARCH = 9;
/** Rival structures that make a claim next to them a threat to that rival's economy. */
const ECONOMY_TYPES: ReadonlySet<BuildingType> = new Set(['oilDerrick', 'happyCity', 'powerPlant']);
/** From this game time on the nation goes after the contested nations' capitals (one at a time). */
const NATION_FROM = 90;
/** Prizes anyone's engineer may take and the AI goes after / garrisons: contested capitals and Antarctic derricks. */
const isPrize = (b: Building): boolean => b instanceof NationCapital || (b instanceof OilDerrick && b.antarctic);
/** Transports look this many cells around their goal for the landing spot least exposed to enemy fire. */
const SAFE_DROP_CELLS = 24;

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
  /** Multiplies the target weight of money-making structures (lower = hit them sooner). */
  economicFocus: number;
  /** Multiplies the target weight of military structures (lower = hit them sooner). */
  militaryFocus: number;
}

const PERSONALITIES: readonly Personality[] = [
  { name: 'economist', cityAppetite: 1, save: 0.85, waveGap: 1.3, soldiersPerVehicle: 2.5, economicFocus: 0.8, militaryFocus: 1.2 },
  { name: 'warlord', cityAppetite: 0.7, save: 0.4, waveGap: 0.7, soldiersPerVehicle: 1.4, economicFocus: 1.15, militaryFocus: 0.8 },
  { name: 'balanced', cityAppetite: 0.8, save: CITY_SAVE_SHARE, waveGap: 1, soldiersPerVehicle: SOLDIERS_PER_VEHICLE, economicFocus: 1, militaryFocus: 1 },
];
/** Overseas war: no crossing before this game time (s), and the pause between crossings. */
const FIRST_WAVE_AT = 210;
const WAVE_GAP = 110;
/** Share of the army kept at home as the guard; the rest is always on the offensive. */
const GUARD_SHARE = 1 / 3;
/** Idle attackers set out together once at least this many are ready (or all of them are). */
const STRIKE_GROUP = 3;
/** Enemies this close (world px) to the capital call out the home guard. */
const DEFENCE_RADIUS = 38 * CELL_SIZE;
/** Derrick under attack: the attacker is looked for within DERRICK_THREAT_CELLS of it, and up to DERRICK_DEFENDERS
 * units within DERRICK_HELP_CELLS go to fight it. */
const DERRICK_THREAT_CELLS = 14;
const DERRICK_HELP_CELLS = 70;
const DERRICK_DEFENDERS = 6;
/** Oil leases: at most AI_LEASES per nation; only derricks within LEASE_RANGE_CELLS of the engineer; one lease must
 * bring in LEASE_MIN_RETURN x the engineer's price. */
const AI_LEASES = 2;
const LEASE_RANGE_CELLS = 120;
const LEASE_MIN_RETURN = 2;
/** Fights are judged within this distance (world px) of an engaged attacker. */
const BATTLE_RADIUS = 12 * CELL_SIZE;
/** Attackers fall back home when the enemy force around them is this many times stronger. */
const RETREAT_ODDS = 1.5;
/** Seconds a unit that fell back rests at home before it may attack again. */
const RETREAT_REST = 30;
/** A guard idle farther than this from the capital walks back to it. */
const HOME_RADIUS = 14 * CELL_SIZE;
/** Soldiers this close (world px) to the capital count as at home for boarding transports. */
const BASE_RADIUS = 30 * CELL_SIZE;
/** Army units this close (world px) to an enemy structure are told to destroy it. */
const SIEGE_RANGE = 16 * CELL_SIZE;

/**
 * War aims (lower weight = attacked sooner; a target's score is its distance × weight). Each government first
 * cripples the enemy's economy — the structures that earn money or keep the grid running — then its army, and
 * goes for the capital only when nothing else is left. Distance, damage and the nation's personality still
 * reorder the list, so every AI picks its own plan.
 */
// Derricks are worth more taken than burnt (engineers capture them, see captureOil): the army leaves them for last.
const ECONOMIC_TARGETS: Partial<Record<BuildingType, number>> = { oilDerrick: 1.5, happyCity: 0.5, powerPlant: 0.6 };
/** Oil first for the engineers: an unowned derrick counts this much nearer than a contested capital. */
const FREE_OIL_PULL = 0.4;
/** captureOil: enemy derricks within this many cells of a free engineer are taken over (one engineer at a time). */
const OIL_CAPTURE_CELLS = 70;
const MILITARY_TARGETS: Partial<Record<BuildingType, number>> = { barracks: 0.75, warFactory: 0.8, airfield: 0.85, techCenter: 0.9 };
/** Any other structure (hospital…). */
const OTHER_TARGET = 1.1;
/** Seconds between re-weighing which nation to make war on. */
const RIVAL_PERIOD = 60;
/** The chosen rival's structures count as this much closer, so the offensive concentrates on one nation. */
const RIVAL_FOCUS = 0.55;
/**
 * Each other government already at war with a nation makes it this much less attractive as a rival, so the AIs
 * spread their wars across every nation (each other included) instead of all piling onto the same one.
 */
const RIVAL_PILE_UP = 0.6;
/** No nation (AI or player) is made war on by more than this many governments at once. */
const MAX_ATTACKERS = 2;

interface AIState {
  nextThink: number;
  /** Ids of the units kept at home as the guard (GUARD_SHARE of the army). */
  guard: Set<number>;
  /** Unit id → game time it fell back from a lost fight (rests RETREAT_REST s before attacking again). */
  retreated: Map<number, number>;
  /** Earliest game time the nation offers oil to the Global Monitoring Center again. */
  nextSell: number;
  nextWave: number;
  waveSize: number;
  rng: () => number;
  /** This nation's character (see PERSONALITIES). */
  style: Personality;
  /** The nearest enemy can only be reached across the sea: build and mass sea-crossing forces. */
  overseas: boolean;
  /** Where the current Squatters is headed (cell), or null while none is picked. */
  claimSite: GridPoint | null;
  /** Truck id → where it carries its soldiers (they would have to rest on the march on foot). */
  convoys: Map<number, WorldPoint>;
  /** Own derrick id -> its health at the last think (a drop means it is under attack). */
  derrickHp: Map<number, number>;
  /** The nation this government has chosen to make war on (AI or the player), re-weighed every RIVAL_PERIOD s. */
  rival: number | null;
  nextRival: number;
  /** Contested capital this nation is trying to take, and the engineer sent for it. */
  nationTarget: number | null;
  nationEngineer: number | null;
  /** Contested capital id -> ids of the units stationed there (held ones) or escorting the engineer (the target). */
  nationGuard: Map<number, Set<number>>;
}

/**
 * Computer-controlled nations: every AI nation has its own government (its own state, personality and plans)
 * that weighs the situation and makes the best decisions it can for its nation. Each one builds its base in a fixed order
 * (Barracks → War Factory → Hospital → Airfield → High-Tech Center), keeps its training
 * and vehicle queues running with the same rules as the player (5:3 special
 * forces), keeps a third of its army at home as the guard and sends the other two thirds
 * on a non-stop offensive against the closest reachable opponent.
 */
export class AISystem implements GameSystem {
  private time = 0;
  private readonly state = new Map<number, AIState>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly host: AIHost,
    /** Multiplayer: shared seed, so every machine gives each AI the same personality; solo games pick at random. */
    private readonly seed: number | null = null,
  ) {
    players.forEach((p, i) => this.addState(p, i));
    this.claimCandidates(); // built while the game loads, not as a hitch in the middle of a war
  }

  /** Sample cells (CLAIM_SAMPLE grid) whose claim footprint is not on water or ice: those never change. Packed y*W+x. */
  private claimCells: Int32Array | null = null;

  private claimCandidates(): Int32Array {
    if (this.claimCells) return this.claimCells;
    const map = this.host.map;
    const out: number[] = [];
    const dry = (x: number, y: number): boolean => {
      const t = map.typeAt(x, y);
      return t !== undefined && t !== 'water' && t !== 'snow';
    };
    for (let y = 2; y < map.height - 8; y += CLAIM_SAMPLE) {
      for (let x = 2; x < map.width - 8; x += CLAIM_SAMPLE) {
        let ok = dry(x + 5, y + 5);
        for (let ty = y - 1; ok && ty < y + 6; ty++) for (let tx = x - 1; ok && tx < x + 6; tx++) ok = dry(tx, ty);
        if (ok) out.push(y * map.width + x);
      }
    }
    return (this.claimCells = Int32Array.from(out));
  }

  private addState(p: PlayerState, i: number): AIState {
    const rng = mulberry32(1000 + p.id * 77 + (this.seed ?? Math.floor(Math.random() * 1e6)));
    const style = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)] ?? PERSONALITIES[2];
    const st: AIState = {
      nextThink: 2 + i * 0.5,
      guard: new Set(),
      retreated: new Map(),
      nextSell: 20 + i * 7,
      nextWave: FIRST_WAVE_AT * style.waveGap + i * 25,
      waveSize: style.name === 'warlord' ? 6 : style.name === 'economist' ? 10 : 8,
      rng,
      style,
      overseas: false,
      claimSite: null,
      convoys: new Map(),
      derrickHp: new Map(),
      rival: null,
      nextRival: 0,
      nationTarget: null,
      nationEngineer: null,
      nationGuard: new Map(),
    };
    this.state.set(p.id, st);
    return st;
  }

  /**
   * A save made by an older version has no value for state added since (e.g. `convoys`): it gets its default here, so
   * an old game loads and plays on.
   */
  private fillMissing(st: AIState): void {
    if (!(st.convoys instanceof Map)) st.convoys = new Map();
    if (!(st.guard instanceof Set)) st.guard = new Set();
    if (!(st.retreated instanceof Map)) st.retreated = new Map();
    if (!(st.derrickHp instanceof Map)) st.derrickHp = new Map();
    st.claimSite ??= null;
    st.overseas ??= false;
    st.rival ??= null;
    st.nextRival ??= 0;
    st.nationTarget ??= null;
    st.nationEngineer ??= null;
    if (!(st.nationGuard instanceof Map)) st.nationGuard = new Map();
  }

  update(dt: number): void {
    this.time += dt;
    for (const p of this.players) {
      const st = this.state.get(p.id);
      if (!st) continue;
      this.fillMissing(st);
      if (this.time < st.nextThink) continue;
      st.nextThink = this.time + THINK_PERIOD;
      this.think(p, st);
    }
  }

  /**
   * Does the nation need its wall ring now? Enemies at the capital (threat), a structure of its own hit within
   * AI_WALL_ALERT_SECONDS, or a hostile ground force (AI_WALL_ENEMY_UNITS soldiers / vehicles) within AI_WALL_WATCH_CELLS
   * cells — that last one only when its enemies can reach it by land (walls stop no one landing from the air or sea).
   */
  private needsWalls(p: PlayerState, st: AIState, capital: Building, threat: number): boolean {
    if (threat > 0) return true;
    for (const b of this.host.entities.buildings()) {
      if (b.owner === p.id && b.alive && this.time - b.lastAttackedAt < AI_WALL_ALERT_SECONDS) return true;
    }
    if (st.overseas) return false;
    const cx = (capital.x + capital.w / 2) * CELL_SIZE;
    const cy = (capital.y + capital.d / 2) * CELL_SIZE;
    let near = 0;
    for (const e of this.host.entities.fieldMovers()) {
      if (e.owner === p.id || e.owner === NEUTRAL_OWNER || !e.alive || e.flies) continue;
      if (Math.hypot(e.px - cx, e.py - cy) < AI_WALL_WATCH_CELLS * CELL_SIZE && ++near >= AI_WALL_ENEMY_UNITS) return true;
    }
    return false;
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
    if (this.time >= st.nextRival) {
      st.nextRival = this.time + RIVAL_PERIOD;
      st.rival = this.chooseRival(p, st, capital);
    }
    st.overseas = this.isOverseas(p, capital);
    this.sellOil(p, st);
    this.build(p, st, capital, owned, threat);
    this.train(p, st, owned, threat);
    this.repairBase(p, owned);
    this.mendFleet(p);
    this.claimLand(p, st, capital, owned, threat);
    // Ceasefire: the nation only builds up (economy, base, army) and launches no attack until the war resumes.
    if (inTruce()) {
      this.leaseOil(p, owned, threat);
      this.healWounded(p);
      this.keepCeasefire(p, st, capital);
      return;
    }
    this.contestNations(p, st, capital, owned, threat);
    this.sendDrones(p, st, capital);
    if (st.overseas) this.loadTransports(p, st, capital);
    this.leaseOil(p, owned, threat);
    this.captureOil(p, threat);
    this.healWounded(p);
    this.driveConvoys(st);
    this.evacuate(p, capital);
    this.army(p, st, capital);
  }

  // ------------------------------------------------------------------ economy & base

  /** Making money comes first: sells oil whenever the Center pays a fair price, or at any price when broke. */
  private sellOil(p: PlayerState, st: AIState): void {
    const market = this.host.oilMarket;
    this.steerOilPrice(p, market);
    if (this.time < st.nextSell || p.oil < 2) return;
    if (market.waitSeconds(p) > 0) return;
    // Sells at a fair price, at any price when short of cash, and at any price while it owes the Center
    // (every sale pays the debt down first).
    if (p.credits < 3000 || p.debt > 0 || market.price >= 330) {
      market.sell(p);
      st.nextSell = this.time + 5;
    }
  }

  /** An AI oil cartel steers the world price like OPEC: cuts output when oil is cheap, floods the market when it is dear. */
  private steerOilPrice(p: PlayerState, market: OilMarket): void {
    if (!market.isCartel(p) || market.policyWait() > 0) return;
    const price = market.price;
    const want = price < 270 ? 'cut' : price > 630 ? 'flood' : price >= 390 && price <= 540 ? 'hold' : market.policy;
    if (want !== market.policy) market.setPolicy(p, want);
  }

  /** Happy Cities the nation owns (alive). */
  private cities(p: PlayerState): number {
    return this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'happyCity').length;
  }

  /**
   * Does the nation want another Happy City right now? It does whenever it can grow without weakening
   * itself: the High-Tech Center is up, it owes the Global Monitoring Center nothing, and it still has an army on the
   * field. The cap is per personality — an economist runs the full MAX_CITIES, a warlord 70% of them.
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

  /** Fighting units of the nation: soldiers (no engineers) and vehicles by kind. */
  private forces(p: PlayerState): { soldiers: number; vehicles: Map<VehicleKind, number>; total: number } {
    let soldiers = 0;
    const vehicles = new Map<VehicleKind, number>();
    for (const u of this.host.entities.fieldMovers()) {
      if (u.owner !== p.id || !u.alive) continue;
      if (u instanceof Infantry) {
        if (!u.isEngineer && !u.isSquatters) soldiers++;
      } else if (u instanceof Vehicle && !u.isTransport) vehicles.set(u.type, (vehicles.get(u.type) ?? 0) + 1);
    }
    let total = soldiers;
    for (const n of vehicles.values()) total += n;
    return { soldiers, vehicles, total };
  }

  private build(p: PlayerState, st: AIState, capital: Building, owned: Set<BuildingType>, threat: number): void {
    // Every structure has its own order slot (parallel construction): place whatever is finished.
    for (const slot of this.host.construction.active(p)) {
      if (slot.state !== 'ready' || !slot.option) continue;
      const option = slot.option;
      if (option.id === 'gate') {
        const g = this.findGateSite(p, capital);
        if (g) this.host.placeReady(p, 'gate', g.x, g.y, g.rotated);
        else this.host.construction.cancel(p, 'gate');
        continue;
      }
      const forward = this.forwardAnchor(p, option.id);
      const site =
        option.id === 'alliedBuilding' ? this.findAlliedSite(p, option, capital) : option.id === 'wall' ? this.findWallSite(p, capital) : this.findSite(p, st, forward ?? capital, option);
      if (site) this.host.placeReady(p, option.id, site.x, site.y);
      else this.host.construction.cancel(p, option.id); // nowhere to put it: refund and try the next plan step
    }
    const busy = (id: BuildOption['id']): boolean => this.host.construction.slot(p, id).state !== 'idle';
    // Another nuclear plant once the drain outgrows what the plants can generate (oil from the Center is dear).
    const plants = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'powerPlant').length;
    const plant = BUILD_OPTIONS.find((o) => o.id === 'powerPlant');
    if (plant && !busy('powerPlant') && plants > 0 && p.powerConsumed > p.powerSupply && p.credits >= buildCost(plant, p.faction) * 0.3) {
      this.host.construction.start(p, plant);
      return;
    }
    let next = BUILD_PLAN.map((id) => BUILD_OPTIONS.find((o) => o.id === id)).find(
      (o) => o && !busy(o.id) && !owned.has(o.id as BuildingType) && missingRequirement(o, owned) === null,
    );
    // Walls and gates round the capital, first of the defences, but only while the nation needs them (see needsWalls).
    const walls = owned.has('barracks') && this.needsWalls(p, st, capital, threat);
    if (!next && walls && !busy('wall') && this.findWallSite(p, capital)) next = BUILD_OPTIONS.find((o) => o.id === 'wall');
    if (!next && walls && !busy('gate') && this.findGateSite(p, capital)) next = BUILD_OPTIONS.find((o) => o.id === 'gate');
    // Base core done: a couple of machine-gun bunkers round the base.
    if (!next && owned.has('barracks')) {
      const bunkers = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'bunker').length;
      if (bunkers < AI_BUNKERS + Math.floor(this.cities(p) / 3)) next = BUILD_OPTIONS.find((o) => o.id === 'bunker');
    }
    // A claim flag stands on new land without its ally yet: raise the Allied Building next to it.
    if (!next && threat === 0 && this.embassyAnchors(p, capital).length > 0 && this.host.alliesOf(p) < MAX_ALLIES) {
      const allied = BUILD_OPTIONS.find((o) => o.id === 'alliedBuilding');
      if (allied && missingRequirement(allied, owned) === null) next = allied;
    }
    // Forward base: a Barracks and a War Factory next to each Allied Building, so troops come out on the new land.
    if (!next && threat === 0) {
      for (const id of FORWARD_TYPES) {
        if (!owned.has(id) || !this.forwardAnchor(p, id)) continue;
        next = BUILD_OPTIONS.find((o) => o.id === id);
        break;
      }
    }
    // Base complete (or waiting): grow the economy with Happy Cities when nobody is attacking.
    if (!next && threat === 0 && this.savingForCity(p, owned, st)) next = BUILD_OPTIONS.find((o) => o.id === 'happyCity');
    if (next && busy(next.id)) next = undefined;
    if (next && p.credits >= buildCost(next, p.faction) * (next.id === 'happyCity' ? 1 : next.id === 'alliedBuilding' ? 0.6 : 0.3)) this.host.construction.start(p, next);
  }

  // ------------------------------------------------------------------ allies (new land)

  /** An own Allied Building with no `type` (Barracks / War Factory) of the nation standing near it yet. */
  private forwardAnchor(p: PlayerState, type: BuildOption['id']): Building | null {
    if (!(FORWARD_TYPES as readonly string[]).includes(type)) return null;
    const mine = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive);
    return (
      mine.find(
        (a) => a.spec.type === 'alliedBuilding' && !mine.some((b) => b.spec.type === type && Math.hypot(b.x - a.x, b.y - a.y) <= FORWARD_RANGE),
      ) ?? null
    );
  }

  /** The nation's flags planted on unclaimed land. */
  private claimFlags(p: PlayerState): Building[] {
    return this.host.entities
      .buildings()
      .filter((b) => b.owner === p.id && b.alive && b.spec.type === 'flagpole' && isClaimable(this.host.map, b.x, b.y));
  }

  /** Claim flags with no Allied Building of the nation beside them yet. */
  private openClaims(p: PlayerState): Building[] {
    const allied = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'alliedBuilding');
    return this.claimFlags(p).filter((f) => !allied.some((a) => Math.hypot(a.x - f.x, a.y - f.y) < ALLIED_SEARCH + 4));
  }

  /**
   * Where the nation may raise an embassy, same rule as the player: beside an open claim flag, or beside any own structure
   * out beyond EMBASSY_CAPITAL_CELLS of its capital (a Pro-<nation> regime there) that has no embassy near it yet.
   */
  private embassyAnchors(p: PlayerState, capital: Building): Building[] {
    const mine = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive);
    const allied = mine.filter((b) => b.spec.type === 'alliedBuilding');
    const far = mine.filter(
      (b) =>
        !['alliedBuilding', 'flagpole', 'wall', 'gate'].includes(b.spec.type) &&
        Math.hypot(b.x - capital.x, b.y - capital.y) > EMBASSY_CAPITAL_CELLS &&
        !allied.some((a) => Math.hypot(a.x - b.x, a.y - b.y) < ALLIED_SEARCH + 4),
    );
    return [...this.openClaims(p), ...far];
  }

  /** Legal spot for the Allied Building beside one of the nation's embassy anchors (closest to it). */
  private findAlliedSite(p: PlayerState, option: BuildOption, capital: Building): GridPoint | null {
    const { w, d } = option.footprint;
    for (const flag of this.embassyAnchors(p, capital)) {
      let best: GridPoint | null = null;
      let bestD = Infinity;
      for (let dy = -ALLIED_SEARCH; dy <= ALLIED_SEARCH; dy++) {
        for (let dx = -ALLIED_SEARCH; dx <= ALLIED_SEARCH; dx++) {
          const x = flag.x + dx;
          const y = flag.y + dy;
          if (!this.host.placement.check({ owner: p.id, x, y, w, d, radius: buildRadius(option.id) }).ok) continue;
          const dist = Math.hypot(x + w / 2 - flag.x, y + d / 2 - flag.y);
          if (dist < bestD) {
            bestD = dist;
            best = { x, y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Claiming land for a new ally, step by step (one Squatters team at a time):
   *  1. pick the site: unclaimed land close to a rival's money-makers (derricks, cities, power plants) so the
   *     new ally threatens that rival's economy, yet CLAIM_ENEMY_GAP cells clear of its structures, CLAIM_SPACING
   *     from every other claim, and not too far to fly;
   *  2. train a Squatters team (and a transport if the nation has none);
   *  3. the team boards a parked transport, which flies it to the site, lands and lets it out;
   *  4. the team plants the flag (walking onto the claimable land first if the transport set down beside it).
   * The Allied Building itself is queued by build() once the flag stands.
   */
  private claimLand(p: PlayerState, st: AIState, capital: Building, owned: Set<BuildingType>, threat: number): void {
    const teams = this.host.entities
      .fieldMovers()
      .filter((u): u is Infantry => u instanceof Infantry && u.owner === p.id && u.alive && u.isSquatters);
    const aboard = this.host.entities
      .vehicles()
      .filter((v) => v.owner === p.id && v.alive && v.isTransport && v.cargo.some((c) => c instanceof Infantry && c.isSquatters));
    // Teams in the field: walk to a site on their own landmass and plant the flag there; a site across the sea
    // (they cannot swim) means flying in by transport.
    for (const u of teams) {
      st.claimSite ??= this.pickClaimSite(p, st, capital);
      const site = st.claimSite;
      const cx = Math.floor(u.px / CELL_SIZE);
      const cy = Math.floor(u.py / CELL_SIZE);
      if (!u.airlifted && site && (u.swims || this.host.pathfinder.sameLandmass(cx, cy, site.x, site.y))) {
        if (u.moving || u.boardTarget !== null) continue;
        if (Math.hypot(site.x - cx, site.y - cy) <= 2 && this.host.plantFlag(u) === null) {
          st.claimSite = null;
          continue;
        }
        if (isClaimable(this.host.map, cx, cy) && this.host.plantFlag(u) === null) {
          st.claimSite = null;
          continue;
        }
        this.host.orderAttackMove([u], { x: (site.x + 0.5) * CELL_SIZE, y: (site.y + 0.5) * CELL_SIZE });
        continue;
      }
      if (u.airlifted) {
        if (u.moving || u.boardTarget !== null) continue;
        if (this.host.plantFlag(u) === null) {
          st.claimSite = null;
          continue;
        }
        // Set down on claimed ground: walk onto the chosen site (or the nearest claimable cell) and try again.
        const site = st.claimSite ?? this.nearestClaimable(u);
        if (site) this.host.orderAttackMove([u], { x: (site.x + 0.5) * CELL_SIZE, y: (site.y + 0.5) * CELL_SIZE });
        continue;
      }
      if (u.boardTarget !== null || u.task !== null) continue;
      const t = this.homeTransports(p).find((v) => v.cargo.length === 0 && v.incoming === 0);
      if (t) this.host.orderBoard(t, [u]);
    }
    // Loaded transports still at home take off for the site.
    for (const t of aboard) {
      if (t.flight !== 'parked' || t.incoming > 0) continue;
      st.claimSite ??= this.pickClaimSite(p, st, capital);
      if (!st.claimSite) continue;
      this.host.orderAttackMove([t], this.safeDrop(p, { x: (st.claimSite.x + 0.5) * CELL_SIZE, y: (st.claimSite.y + 0.5) * CELL_SIZE }));
    }
    const wanted = this.host.alliesOf(p) + this.openClaims(p).length < MAX_ALLIES;
    if (!wanted || teams.length > 0 || aboard.length > 0 || threat > 0 || this.time < CLAIM_FROM) return;
    if (!owned.has('barracks') || p.credits < CLAIM_MIN_CREDITS || p.debt > 0) return;
    if (this.host.training.queue(p).items.includes('squatters')) return;
    st.claimSite = this.pickClaimSite(p, st, capital);
    if (!st.claimSite) return;
    // Overseas site: a transport is needed to fly the team over (a site on the home landmass is reached on foot).
    const door = this.host.pathfinder.nearestPassable(capital.x + Math.floor(capital.w / 2), capital.y + capital.d, 8);
    const overland = door !== null && this.host.pathfinder.sameLandmass(door.x, door.y, st.claimSite.x, st.claimSite.y);
    if (!overland) {
      if (!owned.has('airfield')) return;
      const transports = this.host.entities.vehicles().filter((v) => v.owner === p.id && v.alive && v.isTransport).length;
      if (transports === 0 && !this.host.production.queue(p).items.includes('transport')) this.host.production.enqueue(p, 'transport');
    }
    this.host.training.enqueue(p, 'squatters');
  }

  /** Nearest claimable cell to a unit (within 12 cells), or null. */
  private nearestClaimable(u: Unit): GridPoint | null {
    const cx = Math.floor(u.px / CELL_SIZE);
    const cy = Math.floor(u.py / CELL_SIZE);
    for (let r = 1; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (isClaimable(this.host.map, x, y) && this.host.pathfinder.passable(x, y, false)) return { x, y };
        }
      }
    }
    return null;
  }

  /** Best unclaimed spot for the nation's next ally (see claimLand), or null when there is none. */
  private pickClaimSite(p: PlayerState, st: AIState, capital: Building): GridPoint | null {
    const map = this.host.map;
    const buildings = this.host.entities.buildings().filter((b) => b.alive);
    const enemy = buildings.filter((b) => b.owner !== p.id && b.owner !== NEUTRAL_OWNER);
    const economy = enemy.filter((b) => ECONOMY_TYPES.has(b.spec.type));
    const claims = buildings.filter((b) => (b.spec.type === 'flagpole' || b.spec.type === 'alliedBuilding') && isClaimable(map, b.x, b.y));
    const home = { x: capital.x + capital.w / 2, y: capital.y + capital.d / 2 };
    // Nearest-structure lookups through a coarse bucket grid: the whole-map scan times every enemy structure grew
    // with the war and froze the game for a tenth of a second late on.
    const nearestOf = this.nearestFinder(enemy, map.width, map.height);
    const nearestEconomy = this.nearestFinder(economy, map.width, map.height);
    let best: GridPoint | null = null;
    let bestScore = Infinity;
    // Only the sample cells on dry land (precomputed); the cheap tests first, the 7×7 footprint check last.
    for (const i of this.claimCandidates()) {
      const x = i % map.width;
      const y = (i / map.width) | 0;
      if (!isClaimable(map, x, y) || !isClaimable(map, x + 5, y + 5)) continue;
      const nearEnemy = nearestOf(x, y);
      if (nearEnemy < CLAIM_ENEMY_GAP) continue;
      if (claims.some((b) => Math.hypot(b.x - x, b.y - y) < CLAIM_SPACING)) continue;
      // Room for the flag and the Allied Building beside it, all on unclaimed land.
      if (!map.isAreaBuildable(x - 1, y - 1, 7, 7)) continue;
      let nearEconomy = nearestEconomy(x, y);
      if (!Number.isFinite(nearEconomy)) nearEconomy = nearEnemy;
      // As close to a rival as the rules allow (its structures and above all its economy are threatened), the trip
      // only a small tie-breaker; a little randomness so every AI plays differently.
      const score = nearEnemy + 0.5 * nearEconomy + 0.1 * Math.hypot(x - home.x, y - home.y) + st.rng() * 6;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  /**
   * Distance (cells) from (x, y) to the nearest of `list` (its top-left cell), Infinity when empty. Exact, but cheap
   * for many queries: structures are bucketed (B cells), and every bucket keeps the short list of structures that can
   * be the nearest to any point inside it (built on first use).
   */
  private nearestFinder(list: readonly Building[], width: number, height: number): (x: number, y: number) => number {
    const B = 32;
    const cols = Math.ceil(width / B);
    const rows = Math.ceil(height / B);
    const buckets = new Map<number, Building[]>();
    for (const b of list) {
      const k = Math.min(rows - 1, Math.max(0, Math.floor(b.y / B))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(b.x / B)));
      const arr = buckets.get(k);
      if (arr) arr.push(b);
      else buckets.set(k, [b]);
    }
    const maxR = Math.max(cols, rows);
    /** Calls `visit` for every structure in the buckets on ring r around (cx, cy). */
    const ring = (cx: number, cy: number, r: number, visit: (b: Building) => void): void => {
      for (let dy = -r; dy <= r; dy++) {
        const by = cy + dy;
        if (by < 0 || by >= rows) continue;
        const edge = Math.abs(dy) === r;
        for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r || 1) {
          const bx = cx + dx;
          if (bx < 0 || bx >= cols) continue;
          const arr = buckets.get(by * cols + bx);
          if (arr) for (const b of arr) visit(b);
        }
      }
    };
    const shortlist = new Map<number, Building[]>();
    const shortlistOf = (cx: number, cy: number): Building[] => {
      const key = cy * cols + cx;
      const known = shortlist.get(key);
      if (known) return known;
      const mx = (cx + 0.5) * B;
      const my = (cy + 0.5) * B;
      // Nearest to the bucket centre first; whatever is nearest to some point of the bucket lies within that + its diagonal.
      let dc = Infinity;
      for (let r = 0; r <= maxR && dc > (r - 1) * B; r++) ring(cx, cy, r, (b) => (dc = Math.min(dc, Math.hypot(b.x - mx, b.y - my))));
      const reach = dc + B * Math.SQRT2;
      const out: Building[] = [];
      for (let r = 0; r <= maxR && (r - 1) * B <= reach; r++) {
        ring(cx, cy, r, (b) => {
          if (Math.hypot(b.x - mx, b.y - my) <= reach) out.push(b);
        });
      }
      shortlist.set(key, out);
      return out;
    };
    return (x, y) => {
      if (list.length === 0) return Infinity;
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / B)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / B)));
      let best = Infinity;
      for (const b of shortlistOf(cx, cy)) best = Math.min(best, Math.hypot(b.x - x, b.y - y));
      return best;
    };
  }

  /**
   * Next free block of the AI's wall ring: the cells AI_WALL_RING cells out from the capital's edge, in segments of
   * AI_WALL_SEGMENT blocks with AI_WALL_GAP free cells between (gates for its own troops). A cell next to another
   * structure (not a wall) is skipped, so no door is blocked.
   */
  /** The capital's wall ring, walked clockwise so the segments stay evenly spaced. */
  private wallRing(capital: Building): GridPoint[] {
    const x0 = capital.x - AI_WALL_RING;
    const y0 = capital.y - AI_WALL_RING;
    const x1 = capital.x + capital.w - 1 + AI_WALL_RING;
    const y1 = capital.y + capital.d - 1 + AI_WALL_RING;
    const ring: GridPoint[] = [];
    for (let x = x0; x < x1; x++) ring.push({ x, y: y0 });
    for (let y = y0; y < y1; y++) ring.push({ x: x1, y });
    for (let x = x1; x > x0; x--) ring.push({ x, y: y1 });
    for (let y = y1; y > y0; y--) ring.push({ x: x0, y });
    return ring;
  }

  /**
   * A Nation Gate for a gap of the wall ring: the gap's middle four cells when they run straight (not round a corner)
   * and are free; `rotated` when the gap runs north–south. The cells either side are walled up afterwards.
   */
  private findGateSite(p: PlayerState, capital: Building): { x: number; y: number; rotated: boolean } | null {
    const map = this.host.map;
    const ring = this.wallRing(capital);
    const period = AI_WALL_SEGMENT + AI_WALL_GAP;
    const lead = Math.floor((AI_WALL_GAP - 4) / 2);
    for (let start = AI_WALL_SEGMENT + lead; start + 4 <= ring.length; start += period) {
      const cells = ring.slice(start, start + 4);
      const vertical = cells.every((c) => c.x === cells[0].x);
      const horizontal = cells.every((c) => c.y === cells[0].y);
      if (!vertical && !horizontal) continue;
      if (cells.some((c) => map.occupantAt(c.x, c.y) !== null)) continue;
      const x = Math.min(...cells.map((c) => c.x));
      const y = Math.min(...cells.map((c) => c.y));
      const w = vertical ? 1 : 4;
      const d = vertical ? 4 : 1;
      if (this.host.placement.check({ owner: p.id, x, y, w, d, radius: buildRadius('gate') }).ok) return { x, y, rotated: vertical };
    }
    return null;
  }

  private findWallSite(p: PlayerState, capital: Building): GridPoint | null {
    const map = this.host.map;
    const ring = this.wallRing(capital);
    // A gap cell next to one of the nation's gate pillars is walled up, so the gate is the only way through.
    const besideGate = (c: GridPoint): boolean =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const id = map.occupantAt(c.x + dx, c.y + dy);
        const b = id === null ? undefined : this.host.entities.get(id);
        // Never the gate's own way through (its two middle cells sit between its pillars too).
        return b instanceof Gate && b.owner === p.id && !b.openCells().some((o) => o.x === c.x && o.y === c.y);
      });
    const besideStructure = (c: GridPoint): boolean => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const id = map.occupantAt(c.x + dx, c.y + dy);
          const b = id === null ? undefined : this.host.entities.get(id);
          if (b?.kind === 'building' && (b as Building).spec.type !== 'wall' && (b as Building).spec.type !== 'gate') return true;
        }
      }
      return false;
    };
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (i % (AI_WALL_SEGMENT + AI_WALL_GAP) >= AI_WALL_SEGMENT && !besideGate(c)) continue;
      if (map.occupantAt(c.x, c.y) !== null || besideStructure(c)) continue;
      if (this.host.placement.check({ owner: p.id, x: c.x, y: c.y, w: 1, d: 1, radius: buildRadius('wall') }).ok) return c;
    }
    return null;
  }

  /** A legal spot near the capital (preferring close ones, with some randomness). */
  private findSite(p: PlayerState, st: AIState, capital: Building, option: BuildOption): GridPoint | null {
    const { w, d } = option.footprint;
    const found: { x: number; y: number; dist: number }[] = [];
    for (let dy = -22; dy <= 22; dy++) {
      for (let dx = -26; dx <= 26; dx++) {
        const x = capital.x + dx;
        const y = capital.y + dy;
        if (!this.host.placement.check({ owner: p.id, x, y, w, d, radius: buildRadius(option.id) }).ok) continue;
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
   * fleet close to the wanted mix (VEHICLE_WEIGHT reshaped by fleetWeights). Money comes first: while saving for a Happy City only the surplus is spent,
   * unless the army is too small or the capital is under threat.
   */
  private train(p: PlayerState, st: AIState, owned: Set<BuildingType>, threat: number): void {
    const { training, production } = this.host;
    const depth = threat > 0 ? 4 : 2;
    const f = this.forces(p);
    const city = BUILD_OPTIONS.find((o) => o.id === 'happyCity');
    // Money is only put aside for the next city once the army is comfortably above its floor: battle losses
    // are replaced first, so investing never leaves the nation defenceless.
    const reserve =
      threat === 0 && f.total >= MIN_ARMY * INVEST_ARMY_FACTOR && city && this.savingForCity(p, owned, st)
        ? buildCost(city, p.faction) * st.style.save
        : 0;
    const budget = p.credits - reserve;
    let vehicleCount = 0;
    for (const n of f.vehicles.values()) vehicleCount += n;
    const canVehicles = owned.has('warFactory'); // every order (aircraft too) is placed at the War Factory
    // Which side is short: soldiers or vehicles?
    const wantVehicle = canVehicles && f.soldiers >= vehicleCount * st.style.soldiersPerVehicle;

    // Both queues run without pause: the ratio only decides which side gets the money first when it is short.
    if (owned.has('barracks') && (!wantVehicle || threat > 0 || budget > 1500)) {
      const q = training.queue(p);
      if (q.items.length < depth && budget > (threat > 0 ? 120 : 250)) {
        const r = training.army(p);
        let tier: UnitTier = 'regular';
        const tiers = training.optionsFor(p).map((o) => o.tier);
        if (owned.has('techCenter') && r.special < r.specialCap && st.rng() < (threat > 0 ? 0.25 : st.overseas ? 0.75 : 0.4)) tier = 'special';
        // National demolition troops (Crazy Soldiers) now and then against a base full of structures.
        else if (tiers.includes('demolition') && threat === 0 && st.rng() < 0.15) tier = 'demolition';
        if (training.enqueue(p, tier) !== 'ok' && tier !== 'regular') training.enqueue(p, 'regular');
      }
    }
    if (canVehicles && (wantVehicle || threat > 0 || budget > 1200)) {
      const q = production.queue(p);
      if (q.items.length < depth && budget > (threat > 0 ? 500 : 700)) {
        // Every combat vehicle the nation can build here (its own national kinds included: bombers…).
        const options = production.optionsFor(p);
        const able = (k: VehicleKind): boolean => {
          const o = options.find((x) => x.kind === k);
          return !!o && owned.has(o.requires) && (!TECH_VEHICLES.includes(k) || owned.has('techCenter'));
        };
        const transports = this.host.entities
          .fieldMovers()
          .filter((u) => u instanceof Vehicle && u.owner === p.id && u.alive && u.isTransport).length;
        const queuedTransports = q.items.filter((k) => k === 'transport').length;
        const evacuating = this.host.safeZones.zonesOf(p.id).length > 0;
        if ((st.overseas || evacuating) && able('transport') && transports + queuedTransports < OVERSEAS_TRANSPORTS) {
          production.enqueue(p, 'transport');
          return;
        }
        // Trucks: soldiers tire on long marches, so keep one truck for every 8 soldiers (at most MAX_TRUCKS) to
        // carry them to the front fresh — on the home continent; across the sea it is the transport aircraft's job.
        const trucks = f.vehicles.get('truck') ?? 0;
        const queuedTrucks = q.items.filter((k) => k === 'truck').length;
        if (!st.overseas && able('truck') && trucks + queuedTrucks < Math.min(MAX_TRUCKS, Math.ceil(f.soldiers / TRUCK_SEATS))) {
          production.enqueue(p, 'truck');
          return;
        }
        // Air defence: every nation keeps its own air-defence vehicles at home against air raids.
        const mantis = (f.vehicles.get('mantis') ?? 0) + q.items.filter((k) => k === 'mantis').length;
        if (able('mantis') && mantis < this.airDefenceWanted(p)) {
          production.enqueue(p, 'mantis');
          return;
        }
        // Pick the kind furthest below its wanted share of the fleet.
        const weights = this.fleetWeights(p, st, f, vehicleCount);
        let total = 0;
        for (const [k, w] of weights) if (able(k)) total += w;
        let kind: VehicleKind | null = null;
        let worst = Infinity;
        for (const [k, w] of weights) {
          if (!able(k) || total <= 0) continue;
          const have = (f.vehicles.get(k) ?? 0) / Math.max(1, vehicleCount);
          const score = have - w / total + st.rng() * 0.05;
          if (score < worst) {
            worst = score;
            kind = k;
          }
        }
        // Ground fleet at its cap: airfield aircraft are not, so build one of those.
        if (kind && production.enqueue(p, kind) === 'cap') {
          const air = (['jet', 'heli', 'bomber'] as const).filter(able);
          const pick = air[Math.floor(st.rng() * air.length)];
          if (pick) production.enqueue(p, pick);
        }
      }
    }
  }

  /**
   * The fleet the nation wants, reshaped from what its enemies field:
   *  - many enemy aircraft → more fighters (their missiles hit aircraft);
   *  - many enemy structures / a big ground army → more bombers and tanks;
   *  - a war across the sea → aircraft first (only they and transports reach the enemy);
   *  - repair vehicles only once there is a ground fleet worth mending.
   */
  private fleetWeights(p: PlayerState, st: AIState, f: { vehicles: Map<VehicleKind, number> }, vehicleCount: number): [VehicleKind, number][] {
    let air = 0;
    let ground = 0;
    let structures = 0;
    for (const v of this.host.entities.vehicles()) {
      if (!v.alive || v.owner === p.id || v.owner === NEUTRAL_OWNER) continue;
      if (v.aircraft && !v.isTransport) air++;
      else if (!v.aircraft) ground++;
    }
    for (const u of this.host.entities.units()) if (u.alive && u.owner !== p.id && u.owner !== NEUTRAL_OWNER) ground += 0.3;
    for (const b of this.host.entities.buildings()) if (b.alive && !b.indestructible && b.owner !== p.id && b.owner !== NEUTRAL_OWNER) structures++;
    const enemies = Math.max(1, air + ground);
    const airShare = air / enemies;
    const out: [VehicleKind, number][] = [];
    for (const [k, base] of Object.entries(VEHICLE_WEIGHT) as [VehicleKind, number][]) {
      let w = base;
      if (k === 'jet') w *= 1 + airShare * 2;
      // The air-defence vehicle only shoots aircraft: worth buying only as far as the enemies field them.
      if (k === 'mantis') w *= airShare * 4;
      if (k === 'bomber') w *= 1 + Math.min(1, structures / 40);
      if (k === 'tank') w *= 1 + Math.min(1, ground / 60) * 0.5;
      if (st.overseas) w *= k === 'jet' || k === 'heli' || k === 'bomber' ? 2 : 0.5;
      if (k === 'repair') {
        const groundFleet = vehicleCount - (f.vehicles.get('jet') ?? 0) - (f.vehicles.get('heli') ?? 0) - (f.vehicles.get('bomber') ?? 0);
        if (groundFleet < 4 || (f.vehicles.get('repair') ?? 0) >= Math.ceil(groundFleet / 5)) w = 0;
      }
      out.push([k, w]);
    }
    return out;
  }

  /**
   * Own structures (not indestructible) below REPAIR_BELOW of their health that are worth sending an engineer into:
   * nobody is repairing them yet, and they have not been hit for REPAIR_CALM seconds (if one falls, the crew
   * inside dies with it).
   */
  private damaged(p: PlayerState): Building[] {
    return this.host.entities
      .buildings()
      .filter(
        (b) =>
          b.owner === p.id &&
          b.alive &&
          !b.indestructible &&
          b.crew.length === 0 &&
          b.hp < b.maxHp * REPAIR_BELOW &&
          this.time - b.lastAttackedAt > REPAIR_CALM,
      )
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  }

  /**
   * Same rules as the player: an engineer walks into a damaged structure, repairs it to 100% from inside and walks
   * out again (if the structure is destroyed meanwhile, it dies inside).
   * The nation trains engineers when it has damaged buildings and none on the way (one per building, max 3),
   * the capital first since it is the most damaged in a siege.
   */
  private repairBase(p: PlayerState, owned: Set<BuildingType>): void {
    const hurt = this.damaged(p);
    if (hurt.length === 0) return;
    const engineers = this.host.entities.fieldUnits().filter((u): u is Infantry => u instanceof Infantry && u.owner === p.id && u.alive && u.isEngineer);
    const covered = new Set(engineers.filter((u) => u.task?.type === 'repair').map((u) => u.task?.buildingId));
    const free = engineers.filter((u) => u.task === null && u.insideId === null);
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

  /**
   * Every repair vehicle (ARV) with nothing to mend drives to the most urgent damaged friendly ground vehicle nearby
   * (lowest health first, then the nearest), one ARV per patient.
   */
  private mendFleet(p: PlayerState): void {
    const mine = this.host.entities.vehicles().filter((v) => v.owner === p.id && v.alive && v.insideId === null && !v.aircraft);
    const menders = mine.filter((v) => v.isRepair);
    if (menders.length === 0) return;
    const taken = new Set(menders.map((v) => v.repairTargetId).filter((id): id is number => id !== null));
    const reach = MEND_SEARCH_CELLS * CELL_SIZE;
    for (const r of menders) {
      if (r.repairTargetId !== null) continue;
      let best: Vehicle | null = null;
      let bestScore = Infinity;
      for (const v of mine) {
        if (v === r || v.hp >= v.maxHp || taken.has(v.id) || v.seekRepairId !== null) continue;
        const d = Math.hypot(v.px - r.px, v.py - r.py);
        if (d > reach) continue;
        const score = (v.hp / v.maxHp) * reach + d;
        if (score < bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (best && this.host.orderMend(best, [r])) taken.add(best.id);
    }
  }

  /** Wounded soldiers go to the nearest hospital with a free bed as soon as they are out of the line of fire. */
  private healWounded(p: PlayerState): void {
    const hospitals = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.garrison);
    if (hospitals.length === 0) return;
    const heading = new Map<number, number>();
    for (const u of this.host.entities.fieldUnits()) {
      if (u.owner === p.id && u.task?.type === 'enter') heading.set(u.task.buildingId, (heading.get(u.task.buildingId) ?? 0) + 1);
    }
    for (const u of this.host.entities.fieldUnits()) {
      if (!(u instanceof Infantry) || u.owner !== p.id || !u.alive || u.task !== null) continue;
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

  // ------------------------------------------------------------------ army

  /**
   * Idle kamikaze drones (B-767) dive at the enemy's most valuable target, by tier (DRONE_PRIORITY): money-making
   * structures > the capital > military structures > civil structures > groups of vehicles and soldiers together > groups of vehicles >
   * groups of soldiers > a lone vehicle > a lone soldier. Within a tier: the bigger group, then
   * the nearest to home. Every enemy nation is weighed together (the rival first within a tier), so pairs either pile onto
   * one nation or spread over several, whichever has the better targets; one pair per target.
   */
  private sendDrones(p: PlayerState, st: AIState, capital: Building): void {
    const mine = this.host.entities.vehicles().filter((v) => v.owner === p.id && v.alive && v.isDrone);
    const idle = mine.filter((v) => v.diveTargetId === null);
    const first = idle[0];
    if (!first) return;
    const taken = new Set(mine.map((v) => v.diveTargetId).filter((id): id is number => id !== null));
    const home = capital.centerWorld();
    const enemy = (owner: number): boolean => owner !== p.id && owner !== NEUTRAL_OWNER;
    const cands: { e: Entity; owner: number; tier: number; size: number; dist: number }[] = [];
    for (const b of this.host.entities.buildings()) {
      if (!b.alive || !enemy(b.owner) || b.indestructible || b.spec.type === 'oilDerrick' || this.host.isShielded(b) || !isHostile(first, b)) continue;
      const c = b.centerWorld();
      cands.push({ e: b, owner: b.owner, tier: DRONE_BUILDING_TIER[b.spec.type] ?? DRONE_TIER_CIVIL, size: 1, dist: Math.hypot(c.x - home.x, c.y - home.y) });
    }
    const ground = this.host.entities.fieldMovers().filter(
      (u) => u.alive && enemy(u.owner) && !u.flies && u.visible && isHostile(first, u) && !this.host.safeZones.isSafe(u.px, u.py),
    );
    const reach = DRONE_GROUP_CELLS * CELL_SIZE;
    for (const u of ground) {
      let cars = 0;
      let men = 0;
      for (const o of ground) {
        if (o.owner !== u.owner || Math.hypot(o.px - u.px, o.py - u.py) > reach) continue;
        if (o instanceof Vehicle) cars++;
        else men++;
      }
      const tier = cars > 0 && men > 0 ? 4 : cars >= 2 ? 5 : men >= 2 ? 6 : cars === 1 ? 7 : 8;
      cands.push({ e: u, owner: u.owner, tier, size: cars + men, dist: Math.hypot(u.px - home.x, u.py - home.y) });
    }
    // The AI weighs every enemy nation at once: within a tier the rival comes first, so the pairs pile onto the rival
    // while it offers targets that good, and spread to other nations once a better tier is only found there.
    const pool = cands;
    const rivalFirst = (c: (typeof cands)[number]): number => (c.owner === st.rival ? 0 : 1);
    pool.sort((a, b) => a.tier - b.tier || rivalFirst(a) - rivalFirst(b) || b.size - a.size || a.dist - b.dist);
    let k = 0;
    for (const d of idle) {
      while (k < pool.length && taken.has(pool[k]!.e.id)) k++;
      const c = pool[k];
      if (!c) return;
      taken.add(c.e.id);
      this.host.launchDrone(d, c.e);
    }
  }

  private army(p: PlayerState, st: AIState, capital: Building): void {
    const all = this.host.entities.fieldMovers();
    let army = all.filter(
      (u) =>
        u.owner === p.id &&
        u.weapon !== null &&
        u.alive &&
        u.task?.type !== 'enter' &&
        u.boardTarget === null &&
        !(u instanceof Infantry && (u.isEngineer || u.isSquatters)) &&
        !this.sheltering(p, u),
    );
    if (army.length === 0) return;
    const home = capital.centerWorld();
    // Home air defence: up to airDefenceWanted air-defence vehicles stay round the capital and never join the attack.
    const flak = army.filter((u) => u instanceof Vehicle && u.type === 'mantis').slice(0, this.airDefenceWanted(p));
    if (flak.length > 0) {
      this.placeAirDefence(flak, home);
      const kept = new Set(flak);
      army = army.filter((u) => !kept.has(u));
      if (army.length === 0) return;
    }
    const guard = this.pickGuard(st, army, home);
    const defenders = this.defendDerricks(p, st, army, all);
    const stationed = this.holdNations(p, st, army.filter((u) => !st.guard.has(u.id) && !defenders.has(u.id)), all, home);
    const strike = army.filter((u) => !st.guard.has(u.id) && !defenders.has(u.id) && !stationed.has(u.id));

    this.defend(p, guard, home, all);
    this.retreatFromLostFights(p, st, strike, army, home, all);

    // Attackers never wait at home: they take on the nearest enemy, structure by structure.
    this.focusBuildings(p, strike);
    if (st.overseas) {
      this.overseasWave(p, st, strike, capital);
      return;
    }
    this.advance(p, st, strike);
  }

  /** Air-defence vehicles the nation keeps at home (AI_AIR_DEFENCE, more as its cities grow). */
  private airDefenceWanted(p: PlayerState): number {
    return AI_AIR_DEFENCE + Math.floor(this.cities(p) / AI_AIR_DEFENCE_PER_CITIES);
  }

  /** Spreads the home air-defence vehicles evenly on a ring round the capital; one already near its spot stays. */
  private placeAirDefence(flak: readonly Unit[], home: WorldPoint): void {
    const r = AI_AIR_DEFENCE_RING * CELL_SIZE;
    flak.forEach((u, i) => {
      const a = (i / flak.length) * Math.PI * 2 + 0.4;
      const spot = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (u.moving || Math.hypot(u.px - spot.x, u.py - spot.y) < CELL_SIZE * 4) return;
      this.host.orderMoveUnits([u], spot);
    });
  }

  /**
   * Keeps GUARD_SHARE of the army (at least one unit) as the home guard. Guards stay guards while they live;
   * missing places go to the units nearest the capital, surplus guards (the farthest) join the attack.
   */
  private pickGuard(st: AIState, army: readonly Unit[], home: WorldPoint): Unit[] {
    const want = Math.max(1, Math.round(army.length * GUARD_SHARE));
    const dist = (u: Unit): number => Math.hypot(u.px - home.x, u.py - home.y);
    let guard = army.filter((u) => st.guard.has(u.id));
    if (guard.length < want) {
      const free = army.filter((u) => !st.guard.has(u.id) && !u.aircraft).sort((a, b) => dist(a) - dist(b));
      guard = guard.concat(free.slice(0, want - guard.length));
    } else if (guard.length > want) {
      guard = guard.sort((a, b) => dist(a) - dist(b)).slice(0, want);
    }
    st.guard = new Set(guard.map((u) => u.id));
    return guard;
  }

  /**
   * Oil comes first: a derrick of the nation that lost health since the last think is under attack. The nearest
   * enemy near it is taken on by up to DERRICK_DEFENDERS of the nearest units that can hit it (within
   * DERRICK_HELP_CELLS); those units sit out the offensive this think. Returns their ids.
   */
  private defendDerricks(p: PlayerState, st: AIState, army: readonly Unit[], all: readonly Unit[]): Set<number> {
    const busy = new Set<number>();
    const seen = new Set<number>();
    for (const b of this.host.entities.buildings()) {
      if (!(b instanceof OilDerrick) || b.owner !== p.id || !b.alive || b.indestructible) continue;
      seen.add(b.id);
      const prev = st.derrickHp.get(b.id);
      st.derrickHp.set(b.id, b.hp);
      if (prev === undefined || b.hp >= prev) continue;
      const c = b.centerWorld();
      let enemy: Unit | null = null;
      let nearest = DERRICK_THREAT_CELLS * CELL_SIZE;
      for (const e of all) {
        if (!e.alive || e.owner === p.id || e.owner === NEUTRAL_OWNER) continue;
        const d = Math.hypot(e.px - c.x, e.py - c.y);
        if (d < nearest) {
          enemy = e;
          nearest = d;
        }
      }
      if (!enemy) continue;
      const target = enemy;
      const dist = (u: Unit): number => Math.hypot(u.px - c.x, u.py - c.y);
      const responders = army
        .filter((u) => !busy.has(u.id) && canTarget(u, target) && dist(u) < DERRICK_HELP_CELLS * CELL_SIZE)
        .sort((a, b2) => dist(a) - dist(b2))
        .slice(0, DERRICK_DEFENDERS);
      for (const u of responders) busy.add(u.id);
      this.host.orderAttackTarget(responders.filter((u) => u.attackTarget !== target.id), target);
    }
    for (const id of [...st.derrickHp.keys()]) if (!seen.has(id)) st.derrickHp.delete(id);
    return busy;
  }

  /**
   * Oil leases: a nation that is not the cartel sends its free engineers (those repairBase left idle) to lease the
   * cartel's derricks, the nearest first, while that pays: the oil one lease brings in (OIL_LEASE_SECONDS of output at
   * today's price, minus the cartel's share) must be worth LEASE_MIN_RETURN x an engineer. At most AI_LEASES per
   * nation at a time (the cartel's own OIL_LEASE_MAX still applies), never while the home front is under attack.
   * With no free engineer it trains one for the job.
   */
  private leaseOil(p: PlayerState, owned: Set<BuildingType>, threat: number): void {
    const faction = FACTIONS[p.faction];
    if (faction.leasesOil === true || threat > 0) return;
    const engineerCost = INFANTRY_BASE.engineer.cost * faction.stats.cost * (faction.stats.infantryCost ?? 1);
    const gain = OIL_LEASE_SECONDS * OIL_DERRICK_OUTPUT * this.host.oilMarket.price * (1 - OIL_LEASE_CARTEL_SHARE);
    if (gain < engineerCost * LEASE_MIN_RETURN) return;
    const derricks = this.host.entities.buildings().filter((b): b is OilDerrick => b instanceof OilDerrick);
    const claimed = new Set<number>();
    let mine = derricks.filter((d) => d.alive && d.lessee === p.id).length;
    for (const u of this.host.entities.fieldUnits()) {
      if (u.task?.type !== 'lease') continue;
      claimed.add(u.task.buildingId);
      if (u.owner === p.id) mine++;
    }
    if (mine >= AI_LEASES) return;
    const open = derricks.filter((d) => d.leasable && d.owner !== p.id && !claimed.has(d.id));
    if (open.length === 0) return;
    const free = this.host.entities
      .fieldUnits()
      .filter((u) => u.owner === p.id && u.alive && u.isEngineer && u.task === null && u.insideId === null && !u.moving);
    for (const u of free) {
      if (mine >= AI_LEASES) break;
      const dist = (d: OilDerrick): number => Math.hypot(d.centerWorld().x - u.px, d.centerWorld().y - u.py);
      const near = open.filter((d) => !claimed.has(d.id) && dist(d) < LEASE_RANGE_CELLS * CELL_SIZE).sort((a, b) => dist(a) - dist(b));
      for (const d of near) {
        if (!this.host.orderLease(u, d)) continue;
        claimed.add(d.id);
        mine++;
        break;
      }
    }
    if (mine >= AI_LEASES || free.length > 0 || !owned.has('barracks') || p.credits < engineerCost + 600) return;
    if (!this.host.training.queue(p).items.includes('engineer')) this.host.training.enqueue(p, 'engineer');
  }

  /**
   * Oil, in order: unowned derricks (contestNations), leases (leaseOil), then rivals' derricks — taken over by an
   * engineer rather than destroyed (the army leaves them for last, see ECONOMIC_TARGETS). A free engineer left over
   * goes for the nearest capturable enemy derrick it can walk to, one at a time per nation. War time only.
   */
  private captureOil(p: PlayerState, threat: number): void {
    if (threat > 0) return;
    const units = this.host.entities.fieldUnits();
    if (units.some((u) => u.owner === p.id && u.task?.type === 'capture' && this.host.entities.get(u.task.buildingId) instanceof OilDerrick)) return;
    const eng = units.find((u) => u.owner === p.id && u.alive && u.isEngineer && u.task === null && u.insideId === null && !u.moving && u.boardTarget === null);
    if (!eng) return;
    const pf = this.host.pathfinder;
    const ex = Math.floor(eng.px / CELL_SIZE);
    const ey = Math.floor(eng.py / CELL_SIZE);
    const targets = this.host.entities
      .buildings()
      .filter((b): b is OilDerrick => b instanceof OilDerrick && b.alive && b.owner !== p.id && b.owner !== NEUTRAL_OWNER && !b.spec.uncapturable && !this.host.isShielded(b))
      .map((b) => ({ b, d: Math.hypot(b.centerWorld().x - eng.px, b.centerWorld().y - eng.py) }))
      .filter(({ b, d }) => d < OIL_CAPTURE_CELLS * CELL_SIZE && pf.sameLandmass(ex, ey, b.x, b.y + b.d))
      .sort((a, b) => a.d - b.d);
    for (const { b } of targets) if (this.host.orderCapture(eng, b)) return;
  }

  /** The guard fights enemies near the capital and otherwise walks back to it. */
  private defend(p: PlayerState, guard: readonly Unit[], home: WorldPoint, all: readonly Unit[]): void {
    // Only threats the guard can actually fight count: an enemy jet over the sea must not send the ground guard
    // (which can neither hit it nor reach it) on an unreachable route every think.
    let threat: Unit | null = null;
    let nearestD = DEFENCE_RADIUS;
    for (const e of all) {
      if (e.owner === p.id || e.owner === NEUTRAL_OWNER) continue;
      const d = Math.hypot(e.px - home.x, e.py - home.y);
      if (d < nearestD && !e.retreating && guard.some((u) => canTarget(u, e))) {
        threat = e;
        nearestD = d;
      }
    }
    if (threat) {
      const t = threat;
      const responders = guard.filter((u) => canTarget(u, t) && (!u.attackMove || u.chasing === false));
      this.host.orderAttackMove(responders, { x: t.px, y: t.py });
      return;
    }
    const strays = guard.filter((u) => !u.moving && u.attackMove === null && u.combatTarget === null && Math.hypot(u.px - home.x, u.py - home.y) > HOME_RADIUS);
    if (strays.length > 0) this.host.orderAttackMove(strays, { x: home.x, y: home.y + CELL_SIZE * 8 });
  }

  /**
   * Contested prizes (CONTESTED_NATIONS capitals, ANTARCTIC_OIL_SITES derricks): the nation goes after the nearest one it does not hold, one at a time,
   * with a dedicated engineer - on foot when it is on the same landmass, otherwise flown in by transport. With no
   * free engineer it trains one. Never while the home front is under attack.
   */
  private contestNations(p: PlayerState, st: AIState, capital: Building, owned: Set<BuildingType>, threat: number): void {
    const caps = this.host.entities.buildings().filter((b) => isPrize(b) && b.alive);
    const pf = this.host.pathfinder;
    const cellOf = (b: Building): GridPoint | null => pf.nearestPassable(b.x + Math.floor(b.w / 2), b.y + b.d, 10);
    let target = caps.find((c) => c.id === st.nationTarget && c.owner !== p.id) ?? null;
    if (!target) {
      st.nationTarget = null;
      if (threat > 0 || this.time < NATION_FROM) return;
      const home = cellOf(capital);
      const homeW = capital.centerWorld();
      let best = Infinity;
      for (const c of caps) {
        if (c.owner === p.id) continue;
        const cell = cellOf(c);
        if (!cell) continue;
        const w = c.centerWorld();
        // Across the sea counts as twice as far (it needs an airlift); nobody's capital is easier prey.
        const overland = home !== null && pf.sameLandmass(home.x, home.y, cell.x, cell.y);
        const freeOil = c instanceof OilDerrick && c.owner === NEUTRAL_OWNER;
        const score = Math.hypot(w.x - homeW.x, w.y - homeW.y) * (overland ? 1 : 2) * (c.owner === NEUTRAL_OWNER ? 0.8 : 1) * (freeOil ? FREE_OIL_PULL : 1);
        if (score < best) {
          best = score;
          target = c;
        }
      }
      if (!target) return;
      st.nationTarget = target.id;
    }
    const goal = cellOf(target);
    if (!goal) return;
    const known = st.nationEngineer !== null ? this.host.entities.get(st.nationEngineer) : undefined;
    let eng = known instanceof Infantry && known.alive && known.owner === p.id ? known : undefined;
    if (!eng) {
      st.nationEngineer = null;
      eng = this.host.entities
        .fieldUnits()
        .find((u): u is Infantry => u instanceof Infantry && u.owner === p.id && u.alive && u.isEngineer && u.task === null && u.insideId === null && u.boardTarget === null);
      if (!eng) {
        const faction = FACTIONS[p.faction];
        const cost = INFANTRY_BASE.engineer.cost * faction.stats.cost * (faction.stats.infantryCost ?? 1);
        if (owned.has('barracks') && p.credits >= cost + 600 && !this.host.training.queue(p).items.includes('engineer')) this.host.training.enqueue(p, 'engineer');
        return;
      }
      st.nationEngineer = eng.id;
    }
    const engineer = eng;
    // Riding a transport: once it is loaded and parked at home, it takes off for the capital.
    const lift = this.host.entities.vehicles().find((v) => v.owner === p.id && v.alive && v.isTransport && v.cargo.includes(engineer));
    if (lift) {
      if (lift.flight === 'parked' && lift.incoming === 0) {
        const c = target.centerWorld();
        this.host.orderAttackMove([lift], this.safeDrop(p, { x: c.x, y: c.y + CELL_SIZE * 9 }));
      }
      return;
    }
    if (engineer.insideId !== null || engineer.boardTarget !== null || engineer.task?.type === 'capture') return;
    const ex = Math.floor(engineer.px / CELL_SIZE);
    const ey = Math.floor(engineer.py / CELL_SIZE);
    if (engineer.swims || pf.sameLandmass(ex, ey, goal.x, goal.y)) {
      if (!this.host.orderCapture(engineer, target)) st.nationTarget = null;
      return;
    }
    // Overseas: board a transport at home (soldiers loaded with it go along as the escort).
    if (!owned.has('airfield')) return;
    const t = this.homeTransports(p).find((v) => !this.carriesSquatters(v) && v.cargo.length < TRANSPORT_LOAD);
    if (t) this.host.orderBoard(t, [engineer]);
    else if (!this.host.entities.vehicles().some((v) => v.owner === p.id && v.alive && v.isTransport) && !this.host.production.queue(p).items.includes('transport'))
      this.host.production.enqueue(p, 'transport');
  }

  /**
   * Garrisons: every contested capital / Antarctic derrick this nation holds (and the one it is taking) gets up to NATION_GARRISON ground
   * units that can reach it. They walk there, fight any enemy that comes near it, and otherwise stay put. A held
   * capital across the sea that is short of men gets a loaded transport from home. Returns the units stationed.
   */
  private holdNations(p: PlayerState, st: AIState, free: readonly Unit[], all: readonly Unit[], home: WorldPoint): Set<number> {
    const busy = new Set<number>();
    const caps = this.host.entities
      .buildings()
      .filter((b) => isPrize(b) && b.alive && (b.owner === p.id || b.id === st.nationTarget));
    for (const id of [...st.nationGuard.keys()]) if (!caps.some((c) => c.id === id)) st.nationGuard.delete(id);
    if (caps.length === 0) return busy;
    const pf = this.host.pathfinder;
    const byId = new Map(free.map((u) => [u.id, u]));
    const radius = NATION_GARRISON_CELLS * CELL_SIZE;
    for (const c of caps) {
      const centre = c.centerWorld();
      const spot = { x: centre.x, y: centre.y + CELL_SIZE * 4 };
      const cell = pf.nearestPassable(c.x + Math.floor(c.w / 2), c.y + c.d, 10);
      if (!cell) continue;
      const reaches = (u: Unit): boolean => !u.aircraft && (u.swims || pf.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y));
      const dist = (u: Unit): number => Math.hypot(u.px - centre.x, u.py - centre.y);
      const kept = [...(st.nationGuard.get(c.id) ?? [])].map((id) => byId.get(id)).filter((u): u is Unit => u !== undefined && !busy.has(u.id) && reaches(u));
      if (kept.length < NATION_GARRISON) {
        const extra = free.filter((u) => !busy.has(u.id) && !kept.includes(u) && reaches(u)).sort((a, b) => dist(a) - dist(b));
        kept.push(...extra.slice(0, NATION_GARRISON - kept.length));
      }
      st.nationGuard.set(c.id, new Set(kept.map((u) => u.id)));
      for (const u of kept) busy.add(u.id);
      // An enemy near the capital: the garrison takes it on.
      let threat: Unit | null = null;
      let nearest = radius * 2;
      for (const e of all) {
        if (!e.alive || e.owner === p.id || e.owner === NEUTRAL_OWNER || e.retreating) continue;
        const d = Math.hypot(e.px - centre.x, e.py - centre.y);
        if (d < nearest && kept.some((u) => canTarget(u, e))) {
          threat = e;
          nearest = d;
        }
      }
      const t = threat;
      if (t) {
        // Ones already on their way to it are left alone (a fresh order every think would re-plan all their routes).
        const onIt = (u: Unit): boolean => u.moving && u.attackMove !== null && Math.hypot(u.attackMove.x - t.px, u.attackMove.y - t.py) < CELL_SIZE * 8;
        const responders = kept.filter((u) => canTarget(u, t) && dist(u) < radius * 3 && u.combatTarget === null && !onIt(u));
        if (responders.length > 0) this.host.orderAttackMove(responders, { x: t.px, y: t.py });
      }
      const away = kept.filter((u) => !u.moving && u.attackMove === null && u.combatTarget === null && dist(u) > radius);
      if (away.length > 0) this.host.orderAttackMove(this.motorize(p, st, away, spot), spot);
      // Held across the sea and short of men: fly in a loaded transport from home.
      if (c.owner === p.id && kept.length < NATION_GARRISON / 2) {
        const homeCell = pf.nearestPassable(Math.floor(home.x / CELL_SIZE), Math.floor(home.y / CELL_SIZE) + 1, 10);
        if (homeCell && !pf.sameLandmass(homeCell.x, homeCell.y, cell.x, cell.y)) {
          const t2 = this.homeTransports(p).find((v) => v.cargo.length >= TRANSPORT_LOAD / 2 && v.incoming === 0 && !this.carriesSquatters(v) && !v.cargo.some((x) => x.id === st.nationEngineer));
          if (t2) this.host.orderAttackMove([t2], this.safeDrop(p, { x: centre.x, y: centre.y + CELL_SIZE * 9 }));
        }
      }
    }
    return busy;
  }

  /**
   * Where a transport should set down near `goal`: of the dry cells on the goal's landmass within SAFE_DROP_CELLS,
   * the one least exposed to other nations - weighed by the armed enemy units and bunkers that could reach it -
   * with a small preference for staying close to the goal. Returns the goal itself when nothing better is found.
   */
  private safeDrop(p: PlayerState, goal: WorldPoint): WorldPoint {
    const pf = this.host.pathfinder;
    const gx = Math.floor(goal.x / CELL_SIZE);
    const gy = Math.floor(goal.y / CELL_SIZE);
    const anchor = pf.nearestPassable(gx, gy, 10);
    if (!anchor) return goal;
    const threats: { x: number; y: number; w: number; r: number }[] = [];
    for (const e of this.host.entities.fieldMovers()) {
      if (!e.alive || e.owner === p.id || e.owner === NEUTRAL_OWNER || e.weapon === null) continue;
      threats.push({ x: e.px, y: e.py, w: this.strength(e), r: Math.max(e.weapon.range, CELL_SIZE * 6) + CELL_SIZE * 6 });
    }
    for (const b of this.host.entities.buildings()) {
      if (!b.alive || b.owner === p.id || b.owner === NEUTRAL_OWNER || b.spec.type !== 'bunker') continue;
      const c = b.centerWorld();
      threats.push({ x: c.x, y: c.y, w: 3, r: BUNKER_RANGE + CELL_SIZE * 4 });
    }
    const danger = (x: number, y: number): number => {
      let d = 0;
      for (const t of threats) if (Math.hypot(t.x - x, t.y - y) < t.r) d += t.w;
      return d;
    };
    let best = goal;
    let bestScore = danger(goal.x, goal.y) * 10;
    if (bestScore === 0) return goal;
    for (let dy = -SAFE_DROP_CELLS; dy <= SAFE_DROP_CELLS; dy += 3) {
      for (let dx = -SAFE_DROP_CELLS; dx <= SAFE_DROP_CELLS; dx += 3) {
        const x = gx + dx;
        const y = gy + dy;
        if (!pf.passable(x, y, false) || !pf.sameLandmass(x, y, anchor.x, anchor.y)) continue;
        const wx = (x + 0.5) * CELL_SIZE;
        const wy = (y + 0.5) * CELL_SIZE;
        const score = danger(wx, wy) * 10 + Math.hypot(dx, dy) / SAFE_DROP_CELLS;
        if (score < bestScore) {
          bestScore = score;
          best = { x: wx, y: wy };
        }
      }
    }
    return best;
  }

  /** Waiting in (or walking to) one of the nation's own safe zones to be flown home. */
  private sheltering(p: PlayerState, u: Unit): boolean {
    return this.host.safeZones.zonesOf(p.id).some((z) => z.expected.has(u.id) || this.host.safeZones.contains(z, u.px, u.py));
  }

  /**
   * Airlift from the safe zones: empty transports fly from the airfield to each zone, land in it, take the waiting
   * units aboard and fly them to the parade ground in front of the capital (where they unload), until the zone is
   * empty and closes.
   */
  private evacuate(p: PlayerState, capital: Building): void {
    const zones = this.host.safeZones.zonesOf(p.id);
    if (zones.length === 0) return;
    const home = capital.centerWorld();
    const dropAt = { x: home.x, y: home.y + CELL_SIZE * 8 };
    const transports = this.host.entities
      .vehicles()
      .filter((v) => v.owner === p.id && v.alive && v.isTransport && v.flight !== 'crashing');
    const spare = transports.filter((t) => t.flight === 'parked' && t.cargo.length === 0 && t.incoming === 0);
    for (const z of zones) {
      const centre = this.host.safeZones.center(z);
      let waiting = this.host.safeZones.occupants(z).filter((u) => u.boardTarget === null && !(u instanceof Vehicle && u.isTransport));
      const grounded = transports.filter(
        (t) => (t.flight === 'landed' || (t.flight === 'unloading' && t.pickup)) && this.host.safeZones.contains(z, t.px, t.py),
      );
      for (const t of grounded) {
        if (waiting.length > 0 && !t.full) {
          this.host.orderBoard(t, waiting);
          waiting = waiting.filter((u) => u.boardTarget === null);
        } else if (t.flight === 'landed' && t.cargo.length > 0 && t.incoming === 0) {
          this.host.orderAttackMove([t], dropAt);
        }
      }
      // Transports already flying in for this zone.
      const inbound = transports.filter((t) => t.cargo.length === 0 && !grounded.includes(t) && this.headingTo(t, z));
      const seats = (grounded.length + inbound.length) * TRANSPORT_LOAD;
      let missing = Math.ceil(Math.max(0, waiting.length + z.expected.size - seats) / TRANSPORT_LOAD);
      while (missing > 0 && spare.length > 0) {
        const t = spare.shift();
        if (!t) break;
        this.host.orderAttackMove([t], centre);
        missing--;
      }
    }
  }

  /** Is this transport (taxiing, taking off or flying) on its way to zone `z`? */
  private headingTo(t: Vehicle, z: SafeZone): boolean {
    const route = t.mission ?? t.waypoints();
    const last = route[route.length - 1];
    return last !== undefined && this.host.safeZones.contains(z, last.x, last.y);
  }

  /** Fighting strength: price of the unit scaled by the health it has left. */
  private strength(u: Unit): number {
    return u.weapon ? (u.value * u.hp) / u.maxHp : 0;
  }

  /** Still resting at home after falling back from a lost fight? */
  private resting(st: AIState, u: Unit): boolean {
    const at = st.retreated.get(u.id);
    if (at === undefined) return false;
    if (this.time - at < RETREAT_REST) return true;
    st.retreated.delete(u.id);
    return false;
  }

  /**
   * Retreat rule: attackers in a fight they cannot win (the enemy around them is RETREAT_ODDS × stronger) fall back
   * to their own land to save the force. The winners are not allowed to chase them (see CombatSystem).
   */
  private retreatFromLostFights(p: PlayerState, st: AIState, strike: readonly Unit[], army: readonly Unit[], home: WorldPoint, all: readonly Unit[]): void {
    const done = new Set<number>();
    for (const u of strike) {
      if (done.has(u.id) || u.retreating || (u.combatTarget === null && !u.engaged)) continue;
      const near = (o: Unit): boolean => Math.hypot(o.px - u.px, o.py - u.py) < BATTLE_RADIUS;
      const mine = army.filter(near);
      const ours = mine.reduce((s, o) => s + this.strength(o), 0);
      let theirs = 0;
      for (const e of all) if (e.alive && e.owner !== p.id && e.owner !== NEUTRAL_OWNER && !e.retreating && near(e)) theirs += this.strength(e);
      const group = mine.filter((o) => !st.guard.has(o.id) && !o.retreating);
      for (const o of group) done.add(o.id);
      if (theirs <= ours * RETREAT_ODDS || group.length === 0) continue;
      for (const o of group) st.retreated.set(o.id, this.time);
      this.host.orderRetreat(group, { x: home.x, y: home.y + CELL_SIZE * 8 });
    }
  }

  /** Idle attackers march on the nearest enemy structure they can reach (aircraft and swimmers go anywhere). */
  private advance(p: PlayerState, st: AIState, strike: readonly Unit[]): void {
    const idle = strike.filter(
      (u) => !u.moving && !u.retreating && u.attackMove === null && u.attackTarget === null && u.combatTarget === null && !this.resting(st, u),
    );
    if (idle.length === 0 || (idle.length < STRIKE_GROUP && idle.length < strike.length)) return;
    const cx = idle.reduce((s, u) => s + u.px, 0) / idle.length;
    const cy = idle.reduce((s, u) => s + u.py, 0) / idle.length;
    const target = this.pickTarget(p, { x: cx, y: cy });
    if (!target) return;
    const goal = target.centerWorld();
    const cell = this.host.pathfinder.nearestPassable(Math.floor(goal.x / CELL_SIZE), Math.floor((goal.y + 10) / CELL_SIZE), 10);
    let going = idle.filter(
      (u) => u.aircraft || u.swims || (cell !== null && this.host.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y)),
    );
    // Far away: soldiers who would have to rest on the march ride the nation's trucks to the front instead.
    going = this.motorize(p, st, going, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
    if (going.length > 0) this.host.orderAttackMove(going, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
  }

  /**
   * Puts the tiring soldiers of an attack group into idle trucks nearby when the target is beyond a day's march
   * (they would have to stop and rest on the way); returns the units still to go on foot / under their own power.
   */
  private motorize(p: PlayerState, st: AIState, going: readonly Unit[], goal: WorldPoint): Unit[] {
    const far = (u: Unit): boolean => Math.hypot(goal.x - u.px, goal.y - u.py) > INFANTRY_MARCH_CELLS * CELL_SIZE * 1.5;
    const riders = going.filter((u): u is Infantry => u instanceof Infantry && !u.swims && !u.isSquatters && !u.isEngineer && far(u));
    if (riders.length === 0) return [...going];
    const trucks = this.host.entities
      .vehicles()
      .filter((t) => t.owner === p.id && t.alive && t.isTruck && t.insideId === null && !t.moving && t.cargo.length === 0 && t.incoming === 0 && !st.convoys.has(t.id));
    const aboard = new Set<Unit>();
    for (const t of trucks) {
      const near = riders.filter((u) => !aboard.has(u) && Math.hypot(u.px - t.px, u.py - t.py) < TRUCK_PICKUP_CELLS * CELL_SIZE).slice(0, TRUCK_SEATS);
      if (near.length < TRUCK_MIN_RIDERS) continue; // a truck only drives with TRUCK_MIN_RIDERS aboard
      if (!this.host.orderBoard(t, near)) continue;
      for (const u of near) aboard.add(u);
      st.convoys.set(t.id, goal);
    }
    return going.filter((u) => !aboard.has(u));
  }

  /**
   * Convoys: a truck whose soldiers are all aboard drives to UNLOAD_SHORT_CELLS short of the target and lets them
   * out there, fresh for the fight; an empty truck back home is free for the next run.
   */
  private driveConvoys(st: AIState): void {
    for (const [id, goal] of st.convoys) {
      const t = this.host.entities.get(id);
      if (!(t instanceof Vehicle) || !t.alive) {
        st.convoys.delete(id);
        continue;
      }
      if (t.incoming > 0 || t.ejecting) continue; // still loading / unloading
      if (t.cargo.length === 0) {
        st.convoys.delete(id);
        continue;
      }
      if (t.moving && t.truckMayDrive) continue;
      const d = Math.hypot(goal.x - t.px, goal.y - t.py);
      // Riders lost on the way (or never all aboard): too few to drive on, so they get out and walk.
      if (!t.truckMayDrive) {
        this.host.unloadTruck(t);
        continue;
      }
      if (d <= (UNLOAD_SHORT_CELLS + 2) * CELL_SIZE) {
        this.host.unloadTruck(t);
        continue;
      }
      const k = (d - UNLOAD_SHORT_CELLS * CELL_SIZE) / d;
      this.host.orderMoveUnits([t], { x: t.px + (goal.x - t.px) * k, y: t.py + (goal.y - t.py) * k });
    }
  }

  /**
   * Ceasefire: no soldier, vehicle or aircraft of the nation may stand within TRUCE_ZONE_CELLS of another nation's
   * structure (it would be fair game and could not fire back). Every unit inside that distance, or about to enter it
   * (TRUCE_SAFETY_CELLS more), falls back to the capital; convoys heading out let their riders off where they are.
   */
  private keepCeasefire(p: PlayerState, st: AIState, capital: Building): void {
    const R = TRUCE_ZONE_CELLS + TRUCE_SAFETY_CELLS;
    const zones = new StructureIndex(this.host.entities.buildings().filter((b) => b.alive && b.owner !== NEUTRAL_OWNER));
    const home = capital.centerWorld();
    const near = (u: Unit): boolean => {
      const cx = u.px / CELL_SIZE;
      const cy = u.py / CELL_SIZE;
      // Heading somewhere: the end of its route counts too (never walk into a zone).
      const d = u.destination;
      return zones.foreignWithin(p.id, cx, cy, R) || (!!d && zones.foreignWithin(p.id, d.x / CELL_SIZE, d.y / CELL_SIZE, R));
    };
    const out: Unit[] = [];
    for (const u of this.host.entities.fieldMovers()) {
      if (u.owner !== p.id || !u.alive || u.task?.type === 'lease' || u.retreating || u.fixed) continue;
      // Already standing at the capital: ordering it there again every think only costs a path search.
      if (!u.moving && Math.hypot(u.px - home.x, u.py - home.y) < 6 * CELL_SIZE) continue;
      if (near(u)) out.push(u);
    }
    for (const [id] of st.convoys) {
      const t = this.host.entities.get(id);
      if (!(t instanceof Vehicle) || !t.alive) st.convoys.delete(id);
      else if (near(t)) {
        if (t.cargo.length > 0) this.host.unloadTruck(t); // the riders get off and fall back on foot
        st.convoys.delete(id);
      }
    }
    if (out.length > 0) this.host.orderRetreat(out, home);
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

  /** Is a Squatters team aboard (or on its way into) this transport? */
  private carriesSquatters(t: Vehicle): boolean {
    if (t.cargo.some((c) => c instanceof Infantry && c.isSquatters)) return true;
    return this.host.entities.fieldUnits().some((u) => u instanceof Infantry && u.isSquatters && u.boardTarget === t.id);
  }

  /** Own transport aircraft standing at home (parked) with room left. */
  private homeTransports(p: PlayerState): Vehicle[] {
    return this.host.entities
      .fieldMovers()
      .filter((u): u is Vehicle => u instanceof Vehicle && u.owner === p.id && u.alive && u.isTransport && u.flight === 'parked');
  }

  /** Overseas war: idle soldiers at home that cannot swim climb into the parked transports, ready to be flown over. */
  private loadTransports(p: PlayerState, st: AIState, capital: Building): void {
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
          !u.isEngineer &&
          !u.isSquatters &&
          !st.guard.has(u.id) &&
          u.task === null &&
          u.boardTarget === null &&
          u.attackMove === null &&
          u.combatTarget === null &&
          u.hp >= u.maxHp * HEAL_BELOW &&
          Math.hypot(u.px - home.x, u.py - home.y) < BASE_RADIUS,
      );
    for (const t of this.homeTransports(p)) {
      if (this.carriesSquatters(t)) continue; // that transport is flying Squatters to new land
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
    const crossers = army.filter((u) => (u.aircraft || u.swims) && !u.retreating && !this.resting(st, u));
    const loaded = this.homeTransports(p).filter((t) => t.cargo.length > 0 && !this.carriesSquatters(t) && !t.cargo.some((c) => c.id === st.nationEngineer));
    const boarding = this.host.entities.fieldMovers().some((u) => u.owner === p.id && u.boardTarget !== null);
    const force = crossers.length + loaded.reduce((s, t) => s + t.cargo.length, 0);
    const need = Math.max(OVERSEAS_MIN_FORCE, Math.min(st.waveSize, 24));
    // Wait for the transports to finish loading unless the force is already big enough without them.
    if (force < need || (boarding && force < need * 1.5)) return;
    st.nextWave = this.time + WAVE_GAP * st.style.waveGap;
    st.waveSize = Math.min(st.waveSize + 3, 30);
    // Fighters and swimmers go straight at the target; transports land next to it and unload.
    this.host.orderAttackMove(crossers, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
    if (loaded.length > 0) this.host.orderAttackMove(loaded, this.safeDrop(p, { x: goal.x, y: goal.y + CELL_SIZE * 9 }));
  }

  /** How eagerly this government attacks `b` (lower = sooner); Infinity: not a target yet (or ever). */
  private targetWeight(p: PlayerState, b: Building, othersLeft: boolean): number {
    const st = this.state.get(p.id);
    const type = b.spec.type;
    if (type === 'capital') return othersLeft ? Infinity : 1;
    const eco = ECONOMIC_TARGETS[type];
    const mil = MILITARY_TARGETS[type];
    const base = eco !== undefined ? eco * (st?.style.economicFocus ?? 1) : mil !== undefined ? mil * (st?.style.militaryFocus ?? 1) : OTHER_TARGET;
    // A structure already burning is cheaper to finish off; the chosen rival is hit first.
    return base * (0.6 + (0.4 * b.hp) / b.maxHp) * (st?.rival === b.owner ? RIVAL_FOCUS : 1);
  }

  /**
   * Picks the nation to make war on — any nation, AI or the player: the one whose nearest structure is closest,
   * weighed by how its army compares with ours (a weaker neighbour is the better prey) and how rich it is
   * (cities and derricks are worth taking).
   */
  private chooseRival(p: PlayerState, st: AIState, capital: Building): number | null {
    const home = capital.centerWorld();
    const near = new Map<number, number>();
    const wealth = new Map<number, number>();
    for (const b of this.enemyStructures(p)) {
      const c = b.centerWorld();
      near.set(b.owner, Math.min(near.get(b.owner) ?? Infinity, Math.hypot(c.x - home.x, c.y - home.y)));
      if (ECONOMY_TYPES.has(b.spec.type)) wealth.set(b.owner, (wealth.get(b.owner) ?? 0) + 1);
    }
    const armies = new Map<number, number>();
    for (const u of this.host.entities.fieldMovers()) if (u.alive && u.weapon !== null) armies.set(u.owner, (armies.get(u.owner) ?? 0) + 1);
    const mine = armies.get(p.id) ?? 0;
    // How many other governments have already picked each nation as their rival.
    const pile = new Map<number, number>();
    for (const [id, other] of this.state) if (id !== p.id && other.rival !== null) pile.set(other.rival, (pile.get(other.rival) ?? 0) + 1);
    let best: number | null = null;
    let bestScore = Infinity;
    for (const [owner, d] of near) {
      // A nation already besieged by MAX_ATTACKERS governments is left to them (unless every candidate is).
      if ((pile.get(owner) ?? 0) >= MAX_ATTACKERS && [...near.keys()].some((o) => (pile.get(o) ?? 0) < MAX_ATTACKERS)) continue;
      const odds = ((armies.get(owner) ?? 0) + 5) / (mine + 5);
      const crowd = 1 + RIVAL_PILE_UP * (pile.get(owner) ?? 0);
      const score = ((d * Math.sqrt(odds)) / (1 + 0.05 * (wealth.get(owner) ?? 0))) * crowd * (0.9 + 0.2 * st.rng());
      if (score < bestScore) {
        bestScore = score;
        best = owner;
      }
    }
    return best;
  }

  /** Enemy structures this nation may attack (not its own, not neutral, not protected). */
  private enemyStructures(p: PlayerState): Building[] {
    return this.host.entities
      .buildings()
      .filter((b) => b.alive && b.owner !== p.id && b.owner !== NEUTRAL_OWNER && !b.indestructible && !this.host.isShielded(b));
  }

  /** Army units near an enemy structure (and not busy) get an explicit order to destroy the most valuable one in reach. */
  private focusBuildings(p: PlayerState, army: Unit[]): void {
    const targets = this.enemyStructures(p);
    if (targets.length === 0) return;
    // Nations that still have structures besides their capital (their capital is not a target yet).
    const hasOthers = new Set(targets.filter((b) => b.spec.type !== 'capital').map((b) => b.owner));
    const groups = new Map<number, { building: Building; units: Unit[] }>();
    for (const u of army) {
      if (u.retreating || u.attackTarget !== null || u.combatTarget !== null) continue;
      let best: Building | null = null;
      let bestScore = Infinity;
      for (const b of targets) {
        const c = b.centerWorld();
        const d = Math.hypot(c.x - u.px, c.y - u.py) - (b.w * CELL_SIZE) / 2;
        if (d >= SIEGE_RANGE) continue;
        // Within reach the cheapest-to-lose structures for us are the most painful for them.
        const score = (Math.max(d, CELL_SIZE) + SIEGE_RANGE * 0.5) * this.targetWeight(p, b, hasOthers.has(b.owner));
        if (score < bestScore) {
          best = b;
          bestScore = score;
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
   * Next objective: the enemy structure with the best score (distance × war-aim weight, see ECONOMIC_TARGETS).
   * Money-makers first, then the army's buildings; capitals only once a nation has nothing else left.
   */
  private pickTarget(p: PlayerState, from: WorldPoint | Building): Building | null {
    const mine = 'spec' in from ? from.centerWorld() : from;
    // Offensives go to the chosen rival only (at most MAX_ATTACKERS governments besiege one nation); any enemy once
    // the rival has nothing left to hit.
    const all = this.enemyStructures(p);
    const rival = this.state.get(p.id)?.rival ?? null;
    const ofRival = rival === null ? [] : all.filter((b) => b.owner === rival);
    const targets = ofRival.length > 0 ? ofRival : all;
    let best: Building | null = null;
    let bestScore = Infinity;
    // Capitals wait until their own nation has no other structure left.
    const hasOthers = new Set(targets.filter((o) => o.spec.type !== 'capital').map((o) => o.owner));
    for (const b of targets) {
      const othersLeft = hasOthers.has(b.owner);
      const c = b.centerWorld();
      const score = Math.hypot(c.x - mine.x, c.y - mine.y) * this.targetWeight(p, b, othersLeft);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }
}
