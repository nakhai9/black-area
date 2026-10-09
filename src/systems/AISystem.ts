import { AVAILABLE_VEHICLES, CELL_SIZE, MAX_ALLIES, NEUTRAL_OWNER } from '../constants';
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
import { type PlacementSystem, isClaimable } from './PlacementSystem';
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
  placeReady(player: PlayerState, x: number, y: number): boolean;
  ownedTypesOf(player: PlayerState): Set<BuildingType>;
  /** Sends a person into a building (wounded → hospital). */
  orderEnter(u: Infantry, b: Building): void;
  /** Sends an engineer to repair an own damaged building. */
  orderRepair(u: Infantry, b: Building): void;
  /** Soldiers / vehicles walk to a parked transport and climb aboard. */
  orderBoard(t: Vehicle, riders: Unit[]): boolean;
  /** Soldiers/vehicles walk to `target`, fighting everything on the way. */
  orderAttackMove(units: readonly Unit[], target: WorldPoint): void;
  /** Focus on an enemy structure or unit: soldiers and vehicles only attack buildings when told to. */
  orderAttackTarget(units: readonly Unit[], target: Entity): void;
  /** Falls back to `target` without stopping to fight; enemies may not chase retreating units. */
  orderRetreat(units: readonly Unit[], target: WorldPoint): void;
  /** Green safe zones of the Global Financial Center (units stranded abroad wait there to be flown home). */
  readonly safeZones: SafeZoneSystem;
  /** Structure that may not be attacked right now (the player's derricks during their grace period). */
  isShielded(b: Building): boolean;
  /** A Squatters team plants its flag where it stands (null = planted, else why not). */
  plantFlag(u: Infantry): string | null;
  /** Allies the nation leads (Allied Buildings standing + one under construction). */
  alliesOf(player: PlayerState): number;
}

/** Order in which an AI nation builds its base. */
const BUILD_PLAN: readonly BuildOption['id'][] = ['powerPlant', 'barracks', 'warFactory', 'hospital', 'airfield', 'techCenter'];
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
/** Seconds a structure must go unhit before an engineer is sent inside to repair it. */
const REPAIR_CALM = 8;
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
 * Claiming new land for allies: from this game time on, with a calm home front and this much cash, the nation
 * flies a Squatters team to unclaimed land and raises an Allied Building there (at most MAX_ALLIES).
 */
const CLAIM_FROM = 300;
const CLAIM_MIN_CREDITS = 4000;
/** A claim is kept at least this far (cells) from any enemy structure, and from every other claim. */
const CLAIM_ENEMY_GAP = 18;
const CLAIM_SPACING = 30;
/** Cells between sampled candidate sites when looking for land to claim. */
const CLAIM_SAMPLE = 5;
/** An Allied Building goes up within this many cells of the nation's claim flag. */
const ALLIED_SEARCH = 9;
/** Rival structures that make a claim next to them a threat to that rival's economy. */
const ECONOMY_TYPES: ReadonlySet<BuildingType> = new Set(['oilDerrick', 'happyCity', 'powerPlant']);

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
  { name: 'warlord', cityAppetite: 0.5, save: 0.4, waveGap: 0.7, soldiersPerVehicle: 1.4, economicFocus: 1.15, militaryFocus: 0.8 },
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
const ECONOMIC_TARGETS: Partial<Record<BuildingType, number>> = { oilDerrick: 0.45, happyCity: 0.5, powerPlant: 0.6 };
const MILITARY_TARGETS: Partial<Record<BuildingType, number>> = { barracks: 0.75, warFactory: 0.8, airfield: 0.85, techCenter: 0.9 };
/** Any other structure (hospital…). */
const OTHER_TARGET = 1.1;

interface AIState {
  nextThink: number;
  /** Ids of the units kept at home as the guard (GUARD_SHARE of the army). */
  guard: Set<number>;
  /** Unit id → game time it fell back from a lost fight (rests RETREAT_REST s before attacking again). */
  retreated: Map<number, number>;
  /** Earliest game time the nation offers oil to the Global Financial Center again. */
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
  ) {
    players.forEach((p, i) => this.addState(p, i));
  }

  private addState(p: PlayerState, i: number): AIState {
    const rng = mulberry32(1000 + p.id * 77 + Math.floor(Math.random() * 1e6));
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
    };
    this.state.set(p.id, st);
    return st;
  }

  update(dt: number): void {
    this.time += dt;
    for (const p of this.players) {
      const st = this.state.get(p.id);
      if (!st || this.time < st.nextThink) continue;
      st.nextThink = this.time + THINK_PERIOD;
      this.think(p, st);
    }
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
    this.train(p, st, owned, threat);
    this.repairBase(p, owned);
    this.claimLand(p, st, capital, owned, threat);
    if (st.overseas) this.loadTransports(p, st, capital);
    this.healWounded(p);
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
    if (p.credits < 3000 || p.debt > 0 || market.price >= 550) {
      market.sell(p);
      st.nextSell = this.time + 5;
    }
  }

  /** An AI oil cartel steers the world price like OPEC: cuts output when oil is cheap, floods the market when it is dear. */
  private steerOilPrice(p: PlayerState, market: OilMarket): void {
    if (!market.isCartel(p) || market.policyWait() > 0) return;
    const price = market.price;
    const want = price < 450 ? 'cut' : price > 1050 ? 'flood' : price >= 650 && price <= 900 ? 'hold' : market.policy;
    if (want !== market.policy) market.setPolicy(p, want);
  }

  /** Happy Cities the nation owns (alive). */
  private cities(p: PlayerState): number {
    return this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'happyCity').length;
  }

  /**
   * Does the nation want another Happy City right now? It does whenever it can grow without weakening
   * itself: the High-Tech Center is up, it owes the Global Financial Center nothing, and it still has an army on the
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
    const slot = this.host.construction.slot(p);
    if (slot.state === 'ready' && slot.option) {
      const site = slot.option.id === 'alliedBuilding' ? this.findAlliedSite(p, slot.option) : this.findSite(p, st, capital, slot.option);
      if (site) this.host.placeReady(p, site.x, site.y);
      else this.host.construction.cancel(p); // nowhere to put it: refund and try the next plan step
      return;
    }
    // Stuck for lack of power: refund it so a power plant can go into the queue first.
    if (slot.state === 'noPower') this.host.construction.cancel(p);
    else if (slot.state !== 'idle') return;
    // Another nuclear plant once the drain outgrows what the plants can generate (oil from the Center is dear).
    const plants = this.host.entities.buildings().filter((b) => b.owner === p.id && b.alive && b.spec.type === 'powerPlant').length;
    const plant = BUILD_OPTIONS.find((o) => o.id === 'powerPlant');
    if (plant && plants > 0 && p.powerConsumed > p.powerSupply && p.credits >= buildCost(plant, p.faction) * 0.3) {
      this.host.construction.start(p, plant);
      return;
    }
    let next = BUILD_PLAN.map((id) => BUILD_OPTIONS.find((o) => o.id === id)).find(
      (o) => o && !owned.has(o.id as BuildingType) && missingRequirement(o, owned) === null,
    );
    // A claim flag stands on new land without its ally yet: raise the Allied Building next to it.
    if (!next && threat === 0 && this.openClaims(p).length > 0 && this.host.alliesOf(p) < MAX_ALLIES) next = BUILD_OPTIONS.find((o) => o.id === 'alliedBuilding');
    // Base complete (or waiting): grow the economy with Happy Cities when nobody is attacking.
    if (!next && threat === 0 && this.savingForCity(p, owned, st)) next = BUILD_OPTIONS.find((o) => o.id === 'happyCity');
    if (next && p.credits >= buildCost(next, p.faction) * (next.id === 'happyCity' ? 1 : next.id === 'alliedBuilding' ? 0.6 : 0.3)) this.host.construction.start(p, next);
  }

  // ------------------------------------------------------------------ allies (new land)

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

  /** Legal spot for the Allied Building beside one of the nation's open claim flags (closest to the flag). */
  private findAlliedSite(p: PlayerState, option: BuildOption): GridPoint | null {
    const { w, d } = option.footprint;
    for (const flag of this.openClaims(p)) {
      let best: GridPoint | null = null;
      let bestD = Infinity;
      for (let dy = -ALLIED_SEARCH; dy <= ALLIED_SEARCH; dy++) {
        for (let dx = -ALLIED_SEARCH; dx <= ALLIED_SEARCH; dx++) {
          const x = flag.x + dx;
          const y = flag.y + dy;
          if (!this.host.placement.check({ owner: p.id, x, y, w, d, unclaimedOnly: true }).ok) continue;
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
    // Teams in the field: plant the flag once flown in, or go aboard a transport.
    for (const u of teams) {
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
      this.host.orderAttackMove([t], { x: (st.claimSite.x + 0.5) * CELL_SIZE, y: (st.claimSite.y + 0.5) * CELL_SIZE });
    }
    const wanted = this.host.alliesOf(p) + this.openClaims(p).length < MAX_ALLIES;
    if (!wanted || teams.length > 0 || aboard.length > 0 || threat > 0 || this.time < CLAIM_FROM) return;
    if (!owned.has('barracks') || !owned.has('airfield') || p.credits < CLAIM_MIN_CREDITS || p.debt > 0) return;
    if (this.host.training.queue(p).items.includes('squatters')) return;
    st.claimSite = this.pickClaimSite(p, st, capital);
    if (!st.claimSite) return;
    // A transport to fly the team over.
    const transports = this.host.entities.vehicles().filter((v) => v.owner === p.id && v.alive && v.isTransport).length;
    if (transports === 0 && !this.host.production.queue(p).items.includes('transport')) this.host.production.enqueue(p, 'transport');
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
    let best: GridPoint | null = null;
    let bestScore = Infinity;
    for (let y = 2; y < map.height - 8; y += CLAIM_SAMPLE) {
      for (let x = 2; x < map.width - 8; x += CLAIM_SAMPLE) {
        if (!isClaimable(map, x, y)) continue;
        // Room for the flag and the Allied Building beside it, all on unclaimed land.
        if (!map.isAreaBuildable(x - 1, y - 1, 7, 7) || !isClaimable(map, x + 5, y + 5)) continue;
        let nearEnemy = Infinity;
        for (const b of enemy) nearEnemy = Math.min(nearEnemy, Math.hypot(b.x - x, b.y - y));
        if (nearEnemy < CLAIM_ENEMY_GAP) continue;
        if (claims.some((b) => Math.hypot(b.x - x, b.y - y) < CLAIM_SPACING)) continue;
        let nearEconomy = Infinity;
        for (const b of economy) nearEconomy = Math.min(nearEconomy, Math.hypot(b.x - x, b.y - y));
        if (!Number.isFinite(nearEconomy)) nearEconomy = nearEnemy;
        // Threaten a rival's economy, but keep the flight short; a little randomness so every AI plays differently.
        const score = nearEconomy + 0.35 * Math.hypot(x - home.x, y - home.y) + st.rng() * 12;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    return best;
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

    if (owned.has('barracks') && (!wantVehicle || threat > 0)) {
      const q = training.queue(p);
      if (q.items.length < depth && budget > (threat > 0 ? 120 : 250)) {
        const r = training.army(p);
        let tier: UnitTier = 'regular';
        if (owned.has('techCenter') && r.special < r.specialCap && st.rng() < (threat > 0 ? 0.25 : st.overseas ? 0.75 : 0.4)) tier = 'special';
        training.enqueue(p, tier);
      }
    }
    if (canVehicles && (wantVehicle || threat > 0)) {
      const q = production.queue(p);
      if (q.items.length < depth && budget > (threat > 0 ? 500 : 700)) {
        // Pick the kind furthest below its share of the fleet, among those this base can build.
        const able = (k: VehicleKind): boolean =>
          AVAILABLE_VEHICLES.includes(k) && (k === 'jet' ? owned.has('airfield') : k === 'ifv' ? owned.has('warFactory') && owned.has('techCenter') : owned.has('warFactory'));
        let kind: VehicleKind | null = null;
        let worst = Infinity;
        // Across the sea only aircraft (and what transports carry) reach the enemy: favour jets, keep transports.
        const mix: readonly [VehicleKind, number][] = st.overseas ? [['tank', 0.25], ['ifv', 0.15], ['light', 0.1], ['jet', 0.5]] : VEHICLE_MIX;
        const transports = this.host.entities
          .fieldMovers()
          .filter((u) => u instanceof Vehicle && u.owner === p.id && u.alive && u.isTransport).length;
        const queuedTransports = q.items.filter((k) => k === 'transport').length;
        const evacuating = this.host.safeZones.zonesOf(p.id).length > 0;
        if ((st.overseas || evacuating) && owned.has('airfield') && transports + queuedTransports < OVERSEAS_TRANSPORTS) {
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

  private army(p: PlayerState, st: AIState, capital: Building): void {
    const all = this.host.entities.fieldMovers();
    const army = all.filter(
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
    const guard = this.pickGuard(st, army, home);
    const strike = army.filter((u) => !st.guard.has(u.id));

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
    const going = idle.filter(
      (u) => u.aircraft || u.swims || (cell !== null && this.host.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y)),
    );
    if (going.length > 0) this.host.orderAttackMove(going, { x: goal.x, y: goal.y + CELL_SIZE * 3 });
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
    const loaded = this.homeTransports(p).filter((t) => t.cargo.length > 0 && !this.carriesSquatters(t));
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

  /** How eagerly this government attacks `b` (lower = sooner); Infinity: not a target yet (or ever). */
  private targetWeight(p: PlayerState, b: Building, othersLeft: boolean): number {
    const st = this.state.get(p.id);
    const type = b.spec.type;
    if (type === 'capital') return othersLeft ? Infinity : 1;
    const eco = ECONOMIC_TARGETS[type];
    const mil = MILITARY_TARGETS[type];
    const base = eco !== undefined ? eco * (st?.style.economicFocus ?? 1) : mil !== undefined ? mil * (st?.style.militaryFocus ?? 1) : OTHER_TARGET;
    // A structure already burning is cheaper to finish off.
    return base * (0.6 + (0.4 * b.hp) / b.maxHp);
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
    const targets = this.enemyStructures(p);
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
