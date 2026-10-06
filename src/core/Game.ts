import {
  BUILDING_VALUE,
  CAMERA_EDGE_SCROLL,
  CAMERA_PAN_SPEED,
  CAPITAL_LOCATIONS,
  CHHG_LOCATION,
  CRUSH_RADIUS,
  BUILD_LIMIT_SOLDIERS,
  MAX_SOLDIERS,
  MAX_GROUND_VEHICLES,
  BUILD_LIMIT_VEHICLES,
  PARADE_GAP,
  PARADE_MAX_CELLS,
  PARADE_SPACING,
  UNIT_SPACING,
  CELL_SIZE,
  CURRENCY,
  EARTH_TEXTURE_URL,
  FACTION_ORDER,
  FOCUS_ZOOM,
  GRID_HEIGHT,
  GRID_WIDTH,
  MAP_SEED,
  FOOTPRINT_SMALL,
  NEUTRAL_OWNER,
  OIL_DERRICK_COUNT,
  STARTING_CREDITS,
  STARTING_OIL,
  WORLD_BANK_LOCATION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  ZOOM_STEP,
  isAircraftKind,
} from '../constants';
import { worldToIso } from './IsoView';
import { Building } from '../entities/Building';
import { PLACEMENT_MARGIN } from '../map/TileMap';
import { Capital } from '../entities/Capital';
import { Chhg } from '../entities/Chhg';
import { EntityManager } from '../entities/EntityManager';
import { SoundSystem } from '../audio/SoundSystem';
import type { Entity } from '../entities/Entity';
import { Infantry } from '../entities/Infantry';
import { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import { OilDerrick } from '../entities/OilDerrick';
import { WorldBank } from '../entities/WorldBank';
import { FACTIONS } from '../factions';
import { computeBiomes } from '../map/Biomes';
import { type EarthData, loadEarthData } from '../map/EarthData';
import { geoToWorld } from '../map/Geo';
import { TerrainRenderer } from '../map/TerrainRenderer';
import { Pathfinder } from '../map/Pathfinder';
import { TileMap } from '../map/TileMap';
import { computeSafety, findOilRow } from '../map/OilSite';
import { TERRITORIES } from '../map/Territories';
import { buildWorld } from '../map/WorldGenerator';
import { TreeLayer } from '../map/Trees';
import { soldierPortrait } from '../render/InfantryArt';
import { vehiclePortrait } from '../render/VehicleArt';
import { SpriteCache } from '../render/SpriteCache';
import { BUILDING_ART } from '../render/sprites';
import { AIRFIELD_SLOTS, RUNWAY_D, AIRFIELD_SIZE } from '../render/sprites/Airfield';
import { AircraftSystem, type AirfieldGeometry } from '../systems/AircraftSystem';
import { AISystem } from '../systems/AISystem';
import { canTarget, CombatSystem, distanceTo, isHostile } from '../systems/CombatSystem';
import { OilMarket } from '../systems/OilMarket';
import { TaxSystem } from '../systems/TaxSystem';
import { EndScreen } from '../ui/EndScreen';
import { NewsToast } from '../ui/NewsToast';
import { BUILD_OPTIONS, type BuildOption, ConstructionSystem, type QueueState, buildCost, missingRequirement } from '../systems/ConstructionSystem';
import { EconomySystem } from '../systems/EconomySystem';
import type { GameSystem } from '../systems/GameSystem';
import { BUILD_RADIUS, type PlacementRequest, type PlacementResult, PlacementSystem } from '../systems/PlacementSystem';
import { PowerSystem } from '../systems/PowerSystem';
import { SelectionSystem } from '../systems/SelectionSystem';
import { TrainingSystem } from '../systems/TrainingSystem';
import { VehicleSystem } from '../systems/VehicleSystem';
import type { BuildingType, FactionId, GameEvents, PlayerState, UnitTier, VehicleKind, WeaponSpec, WorldPoint } from '../types';
import { Minimap } from '../ui/Minimap';
import { Sidebar } from '../ui/Sidebar';
import { StatusBar } from '../ui/StatusBar';
import { Camera } from './Camera';
import { EffectsLayer } from './Effects';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { InputHandler } from './InputHandler';
import { clamp } from './MathUtils';
import { type PlacementGhost, Renderer } from './Renderer';

export interface GameDom {
  canvas: HTMLCanvasElement;
  sidebar: HTMLElement;
  status: HTMLElement;
}

const SIDEBAR_REFRESH = 0.2;

/** Player-facing explanation of why a footprint cannot be placed. */
const BLOCK_REASONS: Readonly<Record<string, string>> = {
  outOfBounds: 'Outside the map',
  occupied: 'A building is already there',
  water: 'Cannot build on water',
  ice: 'Cannot build on ice',
  trees: 'Trees in the way',
  needsWater: 'Must be built on water',
  tooFar: `Too far from your base (max ${BUILD_RADIUS} cells)`,
};
/** Map-authored buildings may shift this many cells to find tree-free ground… */
const PRESET_SNAP_RADIUS = 2;
/** …otherwise the nearest dry spot within this radius is used and cleared of trees. */
const PRESET_SEARCH_RADIUS = 8;
/** Landmark labels sit a bit above the footprint centre when focusing. */
const FOCUS_OFFSET_Y = 6;

/**
 * Composition root: loads the Earth, builds the world, wires systems/UI
 * through the event bus and drives everything from the game loop.
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly map = new TileMap(GRID_WIDTH, GRID_HEIGHT);
  readonly entities = new EntityManager();
  readonly players: PlayerState[];
  readonly camera = new Camera(WORLD_WIDTH, WORLD_HEIGHT);
  /** Capitals in FACTION_ORDER, then other landmarks (hotkeys 1..n). */
  readonly landmarks: Building[] = [];
  readonly derricks: OilDerrick[] = [];

  private readonly terrain: TerrainRenderer;
  private readonly sprites = new SpriteCache(BUILDING_ART);
  private readonly input: InputHandler;
  private readonly renderer: Renderer;
  private readonly selection: SelectionSystem;
  private readonly systems: GameSystem[];
  private readonly economy: EconomySystem;
  /** Construction rules (terrain, overlap, build radius) for new buildings. */
  readonly placement: PlacementSystem;
  /** Sidebar production queue (one structure at a time per nation). */
  readonly construction: ConstructionSystem;
  /** Finished structure the player is currently positioning, if any. */
  private placing: BuildOption | null = null;
  /** Infantry production (separate queue from structures). */
  readonly training: TrainingSystem;
  /** Vehicle and aircraft production (War Factory / Airfield). */
  readonly production: VehicleSystem;
  /** Shooting, damage and kills. */
  readonly combat: CombatSystem;
  /** Take-off, flight home, landing and parking of fighters. */
  readonly aircraft: AircraftSystem;
  private repathTimer = 0;
  /** Computer-controlled nations. */
  readonly ai: AISystem;
  readonly effects = new EffectsLayer();
  readonly sound: SoundSystem;
  /** World Bank oil market (one price for every nation) and the news toasts. */
  readonly oilMarket: OilMarket;
  private readonly news: NewsToast;
  private readonly endScreen = new EndScreen();
  /** The war is decided (victory or game over): the simulation stops. */
  private ended = false;
  private paused = false;
  private endCheck = 0;
  private readonly lastShot = new Map<number, number>();
  private smokeTimer = 0;
  /** Types of the human player's buildings, refreshed with the sidebar. */
  private ownedCache: Set<BuildingType> = new Set();
  readonly pathfinder: Pathfinder;
  private moveMarker: { x: number; y: number; at: number } | null = null;
  private lastBuildingClick: { id: number; at: number } | null = null;
  private ghost: PlacementGhost | null = null;
  private lastQueueState: QueueState = 'idle';
  private readonly sidebar: Sidebar;
  private readonly minimap: Minimap;
  private readonly status: StatusBar;
  private readonly loop: GameLoop;

  private mouseWorld: WorldPoint | null = null;
  private time = 0;
  private sidebarTimer = SIDEBAR_REFRESH; // refresh on the first frame

  /**
   * Builds the game for the chosen faction. Pass an already-started Earth
   * load to overlap the download with the faction-selection screen.
   */
  static async create(
    dom: GameDom,
    playerFaction: FactionId,
    earth: Promise<EarthData> = loadEarthData(EARTH_TEXTURE_URL),
  ): Promise<Game> {
    return new Game(dom, playerFaction, await earth);
  }

  private constructor(
    private readonly dom: GameDom,
    playerFaction: FactionId,
    earth: EarthData,
  ) {
    this.players = FACTION_ORDER.map((faction, i) => ({
      id: i + 1,
      name: faction === playerFaction ? 'Commander' : `${FACTIONS[faction].shortName} AI`,
      faction,
      isHuman: faction === playerFaction,
      credits: STARTING_CREDITS,
      oil: STARTING_OIL,
      debt: 0,
      creditFrozen: false,
      defeated: false,
      powerProduced: 0,
      powerConsumed: 0,
    }));

    // Landmarks and oil derricks at real-world locations.
    for (const player of this.players) {
      const f = player.faction;
      this.landmarks.push(this.entities.add(new Capital(FACTIONS[f], player.id, geoToWorld(CAPITAL_LOCATIONS[f]))));
    }
    // The World Bank is neutral: shared by every nation, never destroyed or occupied.
    this.landmarks.push(this.entities.add(new WorldBank(geoToWorld(WORLD_BANK_LOCATION))));
    // CHHG at the South Pole: neutral, indestructible, uncapturable.
    this.landmarks.push(this.entities.add(new Chhg(geoToWorld(CHHG_LOCATION))));

    // World grid + terrain art from Earth data.
    const biomes = computeBiomes(GRID_WIDTH, GRID_HEIGHT, MAP_SEED);
    buildWorld(earth, biomes, this.map);
    const trees = new TreeLayer(this.map, biomes, MAP_SEED);
    this.placeOnGrid(this.entities.buildings(), trees);
    this.placeOilRows(trees);
    this.terrain = new TerrainRenderer(earth, this.map, biomes, trees, MAP_SEED);

    // Rendering, systems & input.
    this.renderer = new Renderer(dom.canvas, this.camera, this.terrain, this.sprites);
    this.input = new InputHandler(dom.canvas);
    this.selection = new SelectionSystem(this.entities, this.sprites, this.bus);
    this.economy = new EconomySystem(this.players, this.entities);
    this.oilMarket = new OilMarket(this.players, this.entities);
    this.news = new NewsToast();
    this.placement = new PlacementSystem(this.map, this.entities);
    this.construction = new ConstructionSystem(this.players);
    this.pathfinder = new Pathfinder(this.map);
    this.training = new TrainingSystem(this.players, this.entities, (player, tier, barracks) =>
      this.spawnSoldier(player, tier, barracks),
    );
    // Income is credited before construction spends it within the same tick.
    this.production = new VehicleSystem(this.players, this.entities, (player, kind, producer) =>
      this.spawnVehicle(player, kind, producer),
    );
    this.sound = new SoundSystem(() => {
      const v = this.camera.viewRect();
      return { centre: { x: v.x + v.w / 2, y: v.y + v.h / 2 }, range: Math.hypot(v.w, v.h) / 2 };
    });
    this.aircraft = new AircraftSystem(this.entities, (b) => this.airfieldGeometry(b), {
      landingSpot: (x, y, self) => this.landingSpot(x, y, self),
      unload: (t) => this.unloadTransport(t),
    });
    this.combat = new CombatSystem(this.entities, this.pathfinder, {
      onFire: (s, t, w, impact) => this.onFire(s, t, w, impact),
      onDeath: (e, killer) => this.onDeath(e, killer),
    });
    this.ai = new AISystem(
      this.players.filter((p) => !p.isHuman),
      this,
    );
    this.systems = [
      new PowerSystem(this.players, this.entities),
      this.economy,
      this.oilMarket,
      new TaxSystem(this.players, this.entities, this.oilMarket, (player, _city, amount) => {
        if (player.isHuman) this.sidebar.notify(`Happy City taxes: +${amount} ${CURRENCY}.`, 3);
      }),
      this.construction,
      this.training,
      this.production,
      this.aircraft,
      this.combat,
      this.ai,
    ];

    // UI.
    const human = this.humanPlayer;
    this.sidebar = new Sidebar(dom.sidebar, human, BUILD_OPTIONS, this.training.optionsFor(human), this.production.optionsFor(human), {
      onBuild: (option) => this.onBuildClick(option),
      onCancel: () => this.onBuildCancel(),
      preview: (option) => this.sprites.get(option.spriteKey(human.faction)).canvas,
      onAutoDefense: (on) => this.ai.setAssist(human, on),
      onTrain: (option) => this.onTrainClick(option.tier),
      onTrainCancel: (option) => this.onTrainCancel(option.tier),
      trainPreview: (option) => soldierPortrait(human.faction, option.tier),
      onAlert: (at) => this.camera.centerOn(at.x, at.y),
      onSellOil: () => this.sellOil(),
      onLoan: () => this.takeLoan(),
      onPause: () => this.togglePause(),
      onVehicle: (option) => this.onVehicleClick(option.kind),
      onVehicleCancel: (option) => this.onVehicleCancel(option.kind),
      vehiclePreview: (option) => vehiclePortrait(human.faction, option.kind),
    });
    this.minimap = new Minimap(this.sidebar.minimapCanvas, this.terrain, this.camera, (p) =>
      this.bus.emit('camera:focus', p),
    );
    this.status = new StatusBar(dom.status, this.map);

    this.bus.on('camera:focus', (p) => this.camera.centerOn(p.x, p.y));
    this.bus.on('selection:changed', () => (this.sidebarTimer = SIDEBAR_REFRESH));
    new ResizeObserver(() => this.renderer.resize()).observe(dom.canvas);

    this.systems.forEach((s) => s.update(0));
    this.camera.setZoom(FOCUS_ZOOM);
    this.focusOwnCapital();

    this.loop = new GameLoop(
      (dt) => this.tick(dt),
      (dt) => this.frame(dt),
    );
  }

  get humanPlayer(): PlayerState {
    const p = this.players.find((pl) => pl.isHuman);
    if (!p) throw new Error('No human player configured');
    return p;
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.input.dispose();
  }

  // ------------------------------------------------------------------ API used by the AI (see AIHost)

  /** Puts the finished structure of `player`'s queue down at (x, y); false if the spot is illegal. */
  placeReady(player: PlayerState, x: number, y: number): boolean {
    const slot = this.construction.slot(player);
    const option = slot.option;
    if (!option || slot.state !== 'ready') return false;
    const { w, d } = option.footprint;
    if (!this.placement.check({ owner: player.id, x, y, w, d }).ok) return false;
    if (!this.construction.takeReady(player)) return false;
    const b = this.entities.add(option.create(player.id, player.faction, x, y));
    b.placedAt = this.time;
    this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    return true;
  }

  ownedTypesOf(player: PlayerState): Set<BuildingType> {
    const set = new Set<BuildingType>();
    for (const b of this.entities.buildings()) if (b.owner === player.id && b.alive) set.add(b.spec.type);
    return set;
  }

  orderEnter(u: Infantry, b: Building): void {
    if (this.walkToDoor(u, b)) u.task = { type: 'enter', buildingId: b.id };
  }

  /** An engineer walks into a damaged own building and restores it to full health (and is consumed). */
  orderRepair(u: Infantry, b: Building): void {
    if (this.walkToDoor(u, b)) u.task = { type: 'repair', buildingId: b.id };
  }

  /** Focus: the units attack `target` (a structure needs exactly this order — units never shoot buildings on their own). */
  orderAttackTarget(units: readonly Unit[], target: Entity): void {
    for (const u of units) {
      if (!canTarget(u, target)) continue;
      u.parade = null;
      u.task = null;
      u.attackMove = null;
      u.attackTarget = target.id;
    }
  }

  /** Units walk to `target` and fight whatever they meet on the way. */
  orderAttackMove(units: readonly Unit[], target: WorldPoint): void {
    const spacing = Math.max(UNIT_SPACING * 1.15, Math.max(0, ...units.map((u) => u.radius)) * 2.1);
    units.forEach((u, k) => {
      u.parade = null;
      u.task = null;
      u.attackTarget = null;
      const off = spiralOffset(k, u.aircraft ? 10 : spacing);
      // Transports never attack anything: an attack-move is just a flight to the spot.
      if (u instanceof Vehicle && u.isTransport) {
        u.attackMove = null;
        u.follow([{ x: target.x + off.x, y: target.y + off.y }]);
        return;
      }
      u.attackMove = target;
      if (u.aircraft) {
        u.follow([{ x: target.x + off.x, y: target.y + off.y }]);
        return;
      }
      // Every unit gets its own spot around the target: no two vehicles are sent to the same point.
      const cell = this.map.cellAt(target.x + off.x, target.y + off.y) ?? this.map.cellAt(target.x, target.y);
      if (!cell) return;
      const goal = this.pathfinder.nearestPassable(cell.x, cell.y, 14, undefined, u.swims);
      if (goal) u.follow(this.pathfinder.find({ x: u.px, y: u.py }, goal, u.swims));
    });
  }

  /** Whether a new building may be placed (used by the Phase 2 build menu and AI). */
  canPlace(req: PlacementRequest): PlacementResult {
    return this.placement.check(req);
  }

  /** Centres the camera on landmark #index (0-based) and selects it. */
  focusLandmark(index: number): void {
    const b = this.landmarks[index];
    if (b) this.focusBuilding(b.id, true);
  }

  // ------------------------------------------------------------------ experience, crushing, transports

  /** The killer earns the price of what it destroyed; 3× / 6× / 9× its own price promotes it. */
  private awardKill(e: Entity, killer?: Entity): void {
    if (!(killer instanceof Unit) || !killer.alive || killer.owner === e.owner || e.owner === NEUTRAL_OWNER) return;
    const value = e instanceof Unit ? e.value : (BUILDING_VALUE[(e as Building).spec.type] ?? 1000);
    const before = killer.rank;
    killer.killValue += value;
    if (killer.rank > before && killer.owner === this.humanPlayer.id) {
      const name = killer instanceof Vehicle || killer instanceof Infantry ? killer.name : 'Unit';
      this.sidebar.notify(`${name} promoted: ${['', 'Veteran', 'Elite', 'Elite+'][killer.rank]}!`);
      this.effects.add({ kind: 'flash', ...this.fx(killer.px, killer.py, 3), age: 0, ttl: 0.4, size: 3 });
    }
  }

  /** Tanks and armoured vehicles that drive over enemy soldiers kill them (and get the credit). */
  private crushInfantry(): void {
    const walkers = this.entities.fieldUnits().filter((u) => u.alive);
    if (walkers.length === 0) return;
    for (const v of this.entities.vehicles()) {
      if (!v.alive || !v.visible || v.aircraft || !v.moving || (v.type !== 'tank' && v.type !== 'ifv')) continue;
      for (const u of walkers) {
        if (!u.alive || u.owner === v.owner || u.owner === NEUTRAL_OWNER || v.owner === NEUTRAL_OWNER) continue;
        if (Math.hypot(u.px - v.px, u.py - v.py) > CRUSH_RADIUS + u.radius) continue;
        u.lastAttackerId = v.id;
        u.lastAttackedAt = this.time;
        u.hp = 0;
        this.effects.add({ kind: 'blast', ...this.fx(u.px, u.py, 1), age: 0, ttl: 0.25, radius: 2.4 });
      }
    }
  }

  /** Nearest spot where a transport can set down at or near (x, y), or null. */
  private landingSpot(x: number, y: number, self: Vehicle): WorldPoint | null {
    const cell = this.map.cellAt(x, y);
    if (!cell) return null;
    // Never set down on a spot (or right beside one) where another aircraft already stands on the ground.
    const taken = new Set<number>();
    for (const o of this.entities.vehicles()) {
      if (o === self || !o.aircraft || !o.alive || o.flies) continue;
      const c = this.map.cellAt(o.px, o.py);
      if (!c) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.map.inBounds(c.x + dx, c.y + dy)) taken.add(this.map.index(c.x + dx, c.y + dy));
    }
    const g = this.pathfinder.nearestPassable(cell.x, cell.y, 6, taken);
    return g ? { x: (g.x + 0.5) * CELL_SIZE, y: (g.y + 0.5) * CELL_SIZE } : null;
  }

  /** Everyone aboard steps out on free cells around the transport (or its drop-off point). */
  private unloadTransport(t: Vehicle): void {
    const anchor = t.dropSpot ?? { x: t.px, y: t.py };
    const home = this.map.cellAt(anchor.x, anchor.y);
    if (!home) return;
    const taken = new Set<number>();
    let out = 0;
    for (const u of [...t.cargo]) {
      const cell = this.pathfinder.nearestPassable(home.x, home.y, 12, taken, u.swims);
      if (!cell) continue;
      taken.add(this.map.index(cell.x, cell.y));
      u.px = (cell.x + 0.5) * CELL_SIZE;
      u.py = (cell.y + 0.5) * CELL_SIZE;
      u.x = cell.x + 0.5;
      u.y = cell.y + 0.5;
      u.insideId = null;
      u.boardTarget = null;
      u.stop();
      t.cargo.splice(t.cargo.indexOf(u), 1);
      out++;
    }
    if (out > 0 && t.owner === this.humanPlayer.id) this.sidebar.notify(`${out} unloaded from the ${t.name}.`);
  }

  /** U key: a selected, parked transport unloads everyone it carries. */
  private unloadSelectedTransport(): void {
    const t = this.selection.selectedUnitList().find((u): u is Vehicle => u instanceof Vehicle && u.isTransport && u.cargo.length > 0);
    if (!t) return;
    if (t.flight !== 'parked' && t.flight !== 'landed') {
      this.sidebar.notify('The transport must be on the ground to unload — or it unloads when it reaches its destination.');
      return;
    }
    this.unloadTransport(t);
  }

  /** Soldiers and vehicles walk to a parked transport and climb aboard when they reach its airfield. */
  orderBoard(t: Vehicle, riders: Unit[]): boolean {
    if (t.flight !== 'parked' && t.flight !== 'landed') return false;
    const here = this.map.cellAt(t.px, t.py);
    if (!here) return false;
    let sent = 0;
    for (const u of riders) {
      if (!t.canLoad(u)) continue;
      const cell = this.pathfinder.nearestPassable(here.x, here.y, 16, undefined, u.swims);
      if (!cell) continue;
      u.parade = null;
      u.task = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.boardTarget = t.id;
      u.follow(this.pathfinder.find({ x: u.px, y: u.py }, cell, u.swims));
      sent++;
    }
    if (sent === 0) {
      if (t.owner === this.humanPlayer.id) this.sidebar.notify(t.full ? `The ${t.name} is full.` : `The ${t.name} cannot carry that.`);
      return true;
    }
    if (t.owner === this.humanPlayer.id) this.moveMarker = { x: t.px, y: t.py, at: this.time };
    return true;
  }

  /** Units that reached the airfield of their transport board it if there is still room. */
  private processBoarding(): void {
    for (const u of this.entities.fieldMovers()) {
      if (u.boardTarget === null) continue;
      const t = this.entities.get(u.boardTarget);
      if (!(t instanceof Vehicle) || !t.alive || (t.flight !== 'parked' && t.flight !== 'landed')) {
        u.boardTarget = null;
        continue;
      }
      // Boarding needs contact: right up to a transport that stands in the field, or to the wall of the airfield.
      const home = t.homeId === null ? undefined : this.entities.get(t.homeId);
      const reach = t.flight === 'parked' && home instanceof Building ? distanceTo(u.px, u.py, home) : Math.hypot(u.px - t.px, u.py - t.py) - t.radius * 0.5;
      if (reach > CELL_SIZE * 1.3) {
        if (!u.moving) u.boardTarget = null; // could not get close enough
        continue;
      }
      u.boardTarget = null;
      if (!t.canLoad(u)) {
        if (u.owner === this.humanPlayer.id) this.sidebar.notify(`The ${t.name} is full.`);
        continue;
      }
      t.cargo.push(u);
      u.insideId = t.id;
      u.stop();
      this.selection.selectedUnits.delete(u.id);
    }
  }

  /** Last dry position of every unit that cannot swim. */
  private readonly lastDry = new Map<number, { x: number; y: number }>();

  /**
   * No vehicle (aircraft included, once on the ground) and no ordinary soldier ever stands or drives in water — only
   * watercraft / swimmers may: a unit that has stepped into a water cell (a path corner, a shove…) is put back on its
   * last dry spot and plans a new route. Aircraft may only cross water in the air.
   */
  private keepOutOfWater(): void {
    if (this.lastDry.size > 4000) this.lastDry.clear();
    for (const u of this.entities.fieldMovers()) {
      if (u.flies || u.swims || (u instanceof Vehicle && u.altitude > 0)) continue;
      if (!this.map.isWater(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE))) {
        this.lastDry.set(u.id, { x: u.px, y: u.py });
        continue;
      }
      const back = this.lastDry.get(u.id);
      if (!back) continue;
      u.px = back.x;
      u.py = back.y;
      u.x = back.x / CELL_SIZE;
      u.y = back.y / CELL_SIZE;
      u.needsRepath = true;
    }
  }

  /** Fixed-rate simulation step. */
  private tick(dt: number): void {
    if (this.ended || this.paused) return;
    this.endCheck += dt;
    if (this.endCheck >= 1) {
      this.endCheck = 0;
      this.evaluateNations();
    }
    for (const u of this.entities.fieldMovers()) {
      const cx = Math.floor(u.px / CELL_SIZE);
      const cy = Math.floor(u.py / CELL_SIZE);
      u.inWater = !u.flies && this.map.isWater(cx, cy);
      u.terrainFactor = u.flies ? 1 : this.map.hasTrees(cx, cy) ? 0.78 : 1; // woods slow everybody down
    }
    this.entities.update(dt);
    this.keepOutOfWater();
    this.crushInfantry();
    this.processBoarding();
    this.separateUnits();
    this.repathStuckUnits(dt);
    this.processTasks();
    this.healGarrisons(dt);
    for (const s of this.systems) s.update(dt);
  }

  /** Pushes overlapping soldiers apart (never into water, unless they swim, or buildings). */
  private separateUnits(): void {
    // Several relaxation passes so a crowd of vehicles ends up fully apart, not just mostly.
    for (let pass = 0; pass < 6; pass++) if (!this.separatePass()) break;
  }

  /** One pass of pushing overlapping units apart; false when nothing overlapped. */
  private separatePass(): boolean {
    let moved = false;
    const units = this.entities.fieldMovers();
    if (units.length < 2) return false;
    // A bucket must be at least as wide as the largest contact gap, or overlapping pairs two buckets apart are missed.
    let maxR = 0;
    for (const u of units) maxR = Math.max(maxR, u.radius);
    const bucket = Math.max(8, maxR * 2);
    const grid = new Map<number, Unit[]>();
    const key = (cx: number, cy: number): number => cx * 100003 + cy;
    for (const u of units) {
      const k = key(Math.floor(u.px / bucket), Math.floor(u.py / bucket));
      const list = grid.get(k);
      if (list) list.push(u);
      else grid.set(k, [u]);
    }
    for (const a of units) {
      const bx = Math.floor(a.px / bucket);
      const by = Math.floor(a.py / bucket);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const b of grid.get(key(bx + dx, by + dy)) ?? []) {
            if (b.id <= a.id || a.flies !== b.flies) continue;
            const gap = a.radius + b.radius;
            let vx = b.px - a.px;
            let vy = b.py - a.py;
            let d = Math.hypot(vx, vy);
            if (d >= gap) continue;
            moved = true;
            if (d < 0.01) {
              vx = (a.id % 7) - 3 || 1;
              vy = (b.id % 5) - 2;
              d = Math.hypot(vx, vy);
            }
            // Parked / rolling aircraft never move; a unit standing still is pushed less than one walking into it.
            if (a.fixed && b.fixed) continue;
            const wa = a.fixed ? 0 : b.fixed ? 1 : a.moving ? 0.7 : 0.3;
            const push = (gap - d) / d;
            // If one side is blocked (water, building), the other takes the whole push so they still come apart.
            if (!this.nudge(a, -vx * push * wa, -vy * push * wa)) this.nudge(b, vx * push * wa, vy * push * wa);
            if (!this.nudge(b, vx * push * (1 - wa), vy * push * (1 - wa))) this.nudge(a, -vx * push * (1 - wa), -vy * push * (1 - wa));
          }
        }
      }
    }
    return moved;
  }

  private nudge(u: Unit, dx: number, dy: number): boolean {
    if (u.fixed) return false;
    const nx = u.px + dx;
    const ny = u.py + dy;
    const cx = Math.floor(nx / CELL_SIZE);
    const cy = Math.floor(ny / CELL_SIZE);
    if (u.flies || this.pathfinder.passable(cx, cy, u.swims)) {
      u.px = nx;
      u.py = ny;
      return true;
    }
    return false;
  }

  /**
   * Enemies to highlight like Red Alert 2: everything my units are shooting at or have been ordered
   * to attack (strong when a *selected* unit is on it), plus the enemy under the cursor when the
   * selected army could attack it.
   */
  private attackFocus(): { entity: Unit | Building; strong: boolean; hover: boolean }[] {
    const me = this.humanPlayer.id;
    const selected = this.selection.selectedUnits;
    const out = new Map<number, { entity: Unit | Building; strong: boolean; hover: boolean }>();
    const mark = (e: Entity | undefined, strong: boolean, hover: boolean): void => {
      if (!e || !e.alive || !(e instanceof Unit || e instanceof Building)) return;
      if (e instanceof Unit && !e.visible) return;
      const prev = out.get(e.id);
      out.set(e.id, { entity: e, strong: strong || !!prev?.strong, hover: hover || !!prev?.hover });
    };
    for (const u of this.entities.fieldMovers()) {
      if (u.owner !== me || !u.alive) continue;
      const id = u.attackTarget ?? u.combatTarget;
      if (id === null) continue;
      const target = this.entities.get(id);
      if (target && isHostile(u, target)) mark(target, selected.has(u.id), false);
    }
    const hoverId = this.selection.hoveredUnitId ?? this.selection.hoveredId;
    const hovered = hoverId === null ? undefined : this.entities.get(hoverId);
    if (hovered && hovered.owner !== me && this.selection.selectedUnitList().some((u) => canTarget(u, hovered))) mark(hovered, true, true);
    return [...out.values()];
  }

  /** Per-frame: input, camera, rendering, UI. */
  private frame(dt: number): void {
    this.time += dt;
    this.handleInput(dt);

    const { mouse } = this.input;
    this.mouseWorld = mouse.inside ? this.camera.screenToWorld(mouse.x, mouse.y) : null;
    this.updateGhost();
    this.selection.updateHover(this.placing ? null : this.mouseWorld);
    const hovering = this.selection.hoveredId !== null || this.selection.hoveredUnitId !== null;
    const focus = this.placing ? [] : this.attackFocus();
    const aiming = focus.some((f) => f.hover);
    this.dom.canvas.style.cursor = this.placing || aiming ? 'crosshair' : hovering ? 'pointer' : 'default';

    this.effects.update(dt);
    this.smokeFromDamagedBuildings(dt);
    const buildings = this.entities.buildings();
    const units = this.entities.fieldMovers();
    this.renderer.render({
      buildings,
      selectedId: this.selection.selectedId,
      hoveredId: this.selection.hoveredId,
      selectionRect: this.placing ? null : this.input.selectionRect,
      time: this.time,
      ghost: this.ghost,
      buildZones: this.placing ? this.buildZones() : [],
      units,
      selectedUnits: this.selection.selectedUnits,
      hoveredUnitId: this.placing ? null : this.selection.hoveredUnitId,
      moveMarker: this.moveMarker,
      focus: focus.map((f) => ({ entity: f.entity, strong: f.strong })),
      effects: this.effects.list,
    });
    this.minimap.render(buildings, units, this.humanPlayer.id, this.ownedCache.has('airfield'));
    this.status.update(dt, this.mouseWorld, this.camera.zoom);

    const queue = this.construction.slot(this.humanPlayer);
    if (queue.state !== this.lastQueueState) {
      if (queue.state === 'ready') this.sidebar.notify('Construction complete — click the cameo, then place it.');
      if (queue.state === 'onHold') this.sidebar.notify(`Not enough ${CURRENCY} — construction on hold.`);
      this.lastQueueState = queue.state;
      this.sidebarTimer = SIDEBAR_REFRESH;
    }

    this.sidebarTimer += dt;
    if (this.sidebarTimer >= SIDEBAR_REFRESH) {
      const elapsed = this.sidebarTimer;
      this.sidebarTimer = 0;
      const own = this.derricks.filter((d) => d.owner === this.humanPlayer.id && d.alive);
      const pumping = own.filter((d) => d.pumping).length;
      this.sidebar.update(
        {
          player: this.humanPlayer,
          oilRate: this.economy.oilRate(this.humanPlayer),
          oilPrice: this.oilMarket.price,
          sellable: this.oilMarket.sellable(this.humanPlayer),
          salesWait: this.oilMarket.waitSeconds(this.humanPlayer),
          loanBlocker: this.oilMarket.loanBlocker(this.humanPlayer),
          derricks: own.length,
          pumping,
          queue,
          placing: this.placing !== null,
          training: this.training.queue(this.humanPlayer),
          vehicleQueue: this.production.queue(this.humanPlayer),
          owned: (this.ownedCache = this.ownedTypes()),
          hasWarFactory: this.production.producerOf(this.humanPlayer, 'warFactory') !== null,
          hasAirfield: this.production.producerOf(this.humanPlayer, 'airfield') !== null,
          hasBarracks: this.training.barracksOf(this.humanPlayer) !== null,
          army: this.training.army(this.humanPlayer),
          vehicleQueued: this.production.queue(this.humanPlayer).items.length,
          parkingFree: this.production.parkingFree(this.humanPlayer),
        },
        elapsed,
      );
    }
  }


  private handleInput(dt: number): void {
    const { input, camera } = this;

    for (const ev of input.drain()) {
      if (ev.type === 'click' || ev.type === 'keyDown') this.sound.unlock(); // browsers need a user gesture
      switch (ev.type) {
        case 'click': {
          if (this.placing) {
            if (ev.button === 'right') this.stopPlacing();
            else this.tryPlace();
            break;
          }
          const world = camera.screenToWorld(ev.x, ev.y);
          // Right-click deselects everything.
          if (ev.button === 'right') {
            this.selection.clearAll();
            break;
          }
          const unit = this.selection.pickUnit(world);
          // Soldiers / vehicles selected + click on one of my parked transports: they climb aboard.
          if (unit instanceof Vehicle && unit.isTransport && unit.owner === this.humanPlayer.id && !this.selection.selectedUnits.has(unit.id)) {
            const riders = this.selection.selectedUnitList().filter((u) => !u.aircraft);
            if (riders.length > 0 && this.orderBoard(unit, riders)) break;
          }
          if (unit && unit.owner === this.humanPlayer.id) {
            this.selection.selectUnits([unit.id], ev.shift);
            break;
          }
          // Armed units selected + click on an enemy soldier/vehicle: attack it.
          if (unit && unit.owner !== this.humanPlayer.id && this.orderAttack(unit)) break;
          const hit = this.selection.pick(world);
          if (hit) {
            // Double-click one of your own buildings: everyone stationed inside comes out.
            const now = performance.now();
            const dbl = this.lastBuildingClick?.id === hit.id && now - this.lastBuildingClick.at < 400;
            this.lastBuildingClick = { id: hit.id, at: now };
            if (dbl && hit.owner === this.humanPlayer.id && hit.garrison.length > 0) {
              this.ejectUnits(hit, [...hit.garrison]);
              break;
            }
            // Soldiers selected: enter / repair / capture orders take priority over selecting it.
            if (this.selection.selectedUnits.size > 0 && this.orderOnBuilding(hit)) break;
            this.selection.selectedUnits.clear();
            this.selection.select(hit.id);
            break;
          }
          // Left-click on open ground with soldiers selected = move them there.
          if (this.selection.selectedUnits.size > 0) this.orderMove(world);
          else this.selection.select(null);
          break;
        }
        case 'wheel':
          camera.zoomAt(ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ev.x, ev.y);
          break;
        case 'keyDown':
          this.handleKey(ev.code);
          break;
        case 'boxSelect': {
          // Drag-select own soldiers (buildings are not box-selectable — RA2 rule).
          if (this.placing) break;
          const a = camera.screenToIso(ev.rect.x, ev.rect.y);
          const picked = this.selection.unitsInIsoRect({ x: a.x, y: a.y, w: ev.rect.w / camera.zoom, h: ev.rect.h / camera.zoom }, this.humanPlayer.id);
          this.selection.selectUnits(
            picked.map((u) => u.id),
            ev.shift,
          );
          break;
        }
      }
    }

    // Keyboard + edge scrolling (edge keeps scrolling after the cursor leaves the window).
    let dx = 0;
    let dy = 0;
    if (input.isKeyDown('ArrowLeft') || input.isKeyDown('KeyA')) dx -= 1;
    if (input.isKeyDown('ArrowRight') || input.isKeyDown('KeyD')) dx += 1;
    if (input.isKeyDown('ArrowUp') || input.isKeyDown('KeyW')) dy -= 1;
    if (input.isKeyDown('ArrowDown') || input.isKeyDown('KeyS')) dy += 1;
    if (CAMERA_EDGE_SCROLL && document.hasFocus() && !input.selectionRect) {
      dx += input.edge.x;
      dy += input.edge.y;
    }
    dx = clamp(dx, -1, 1);
    dy = clamp(dy, -1, 1);
    if (dx !== 0 || dy !== 0) {
      const step = (CAMERA_PAN_SPEED * dt) / camera.zoom / Math.hypot(dx, dy);
      camera.panBy(dx * step, dy * step);
    }

    const drag = input.consumePan();
    if (drag.x !== 0 || drag.y !== 0) camera.panBy(-drag.x / camera.zoom, -drag.y / camera.zoom);
  }

  private handleKey(code: string): void {
    const cam = this.camera;
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      this.focusLandmark(Number(digit[1]) - 1);
      return;
    }
    switch (code) {
      case 'KeyH':
        this.focusOwnCapital();
        break;
      case 'KeyF':
        this.sidebar.toggleAutoDefense();
        break;
      case 'KeyM':
        this.sidebar.notify(this.sound.toggleMute() ? 'Sound off.' : 'Sound on.');
        break;
      case 'KeyP':
        this.togglePause();
        break;
      case 'KeyO':
        this.cycleOwnDerrick();
        break;
      case 'Escape':
        if (this.placing) this.stopPlacing();
        else this.selection.clearAll();
        break;
      case 'Tab':
        this.sidebar.toggle();
        break;
      case 'KeyU':
        this.unloadSelectedTransport();
        break;
      case 'KeyR':
        // While positioning a structure: turn it 90° (footprint d × w, art mirrored), still square to the grid.
        if (this.placing) {
          this.placingRotated = !this.placingRotated;
          this.sidebar.notify(this.placingRotated ? 'Turned 90°.' : 'Turned back.', 1.5);
        } else this.rotateSelectedBuilding();
        break;
      case 'Equal':
      case 'NumpadAdd':
        cam.zoomAt(ZOOM_STEP, cam.viewWidth / 2, cam.viewHeight / 2);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        cam.zoomAt(1 / ZOOM_STEP, cam.viewWidth / 2, cam.viewHeight / 2);
        break;
    }
  }

  /**
   * Snaps map-authored buildings onto the grid at (or very near) their real
   * location: first a fully legal spot within PRESET_SNAP_RADIUS cells; if the
   * area is wooded, the nearest dry spot and its trees are cleared (like an RA2
   * map editor). Water and overlaps are never allowed. Player construction
   * uses the strict rule (TileMap.placementBlocker) with no tree clearing.
   */
  private placeOnGrid(buildings: readonly Building[], trees: TreeLayer): void {
    for (const b of buildings) {
      const opts = { naval: b.naval };
      const site =
        this.map.findBuildableSite(b.x, b.y, b.w, b.d, { ...opts, maxRadius: PRESET_SNAP_RADIUS }) ??
        this.map.findBuildableSite(b.x, b.y, b.w, b.d, { ...opts, ignoreTrees: true, maxRadius: PRESET_SEARCH_RADIUS });
      if (site) b.moveTo(site.x, site.y);
      else if (!b.indestructible) console.warn(`No legal site near ${b.spec.name} (${b.x},${b.y}); kept as is.`);
      trees.clearArea(b.x, b.y, b.w, b.d);
      this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    }
  }

  // ------------------------------------------------------------------ construction

  /** Cameo left-click: start building, or pick up a finished structure to place it. */
  private onBuildClick(option: BuildOption): void {
    const player = this.humanPlayer;
    const slot = this.construction.slot(player);
    if (slot.state === 'idle') {
      const need = missingRequirement(option, this.ownedTypes());
      if (need) {
        this.sidebar.notify(`${option.name} requires a ${BUILD_OPTIONS.find((o) => o.id === need)?.name ?? need} first.`);
        return;
      }
      this.construction.start(player, option);
      this.sidebar.notify(`Building ${option.name} — ${buildCost(option, player.faction)} ${CURRENCY}`);
    } else if (slot.state === 'ready' && slot.option?.id === option.id) {
      this.placing = option;
      this.selection.select(null);
      this.sidebar.notify('Click a free spot near your base to place it.');
    } else if (slot.option?.id !== option.id) {
      this.sidebar.notify('Already building another structure.');
    }
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** Cameo right-click: cancel production and refund what was paid. */
  private onBuildCancel(): void {
    const slot = this.construction.slot(this.humanPlayer);
    if (slot.state === 'idle') return;
    const refund = Math.floor(slot.paid);
    this.stopPlacing();
    this.construction.cancel(this.humanPlayer);
    this.sidebar.notify(`Construction cancelled — ${refund} ${CURRENCY} refunded.`);
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /**
   * R with one of your buildings selected: turns it 90° on the ground (footprint d × w, art mirrored) if the
   * turned footprint fits on free, buildable cells around the same centre — always square to the grid.
   */
  private rotateSelectedBuilding(): void {
    const b = this.selection.selectedId === null ? undefined : this.entities.get(this.selection.selectedId);
    if (!(b instanceof Building) || !b.alive || b.owner !== this.humanPlayer.id) return;
    const t = b.spec.type;
    if (t === 'capital' || t === 'oilDerrick' || t === 'bank' || t === 'chhg') {
      this.sidebar.notify('This structure cannot be turned.', 2);
      return;
    }
    if (t === 'airfield' && this.entities.vehicles().some((v) => v.homeId === b.id && v.alive && v.fixed)) {
      this.sidebar.notify('Move the aircraft off the airfield before turning it.', 3);
      return;
    }
    const w = b.d;
    const d = b.w;
    const x = Math.round(b.x + b.w / 2 - w / 2);
    const y = Math.round(b.y + b.d / 2 - d / 2);
    // Free its own cells while checking the turned footprint.
    this.map.occupy(b.x, b.y, b.w, b.d, null);
    const result = this.placement.check({ owner: b.owner, x, y, w, d });
    if (!result.ok) {
      this.map.occupy(b.x, b.y, b.w, b.d, b.id);
      this.sidebar.notify(`Cannot turn it here: ${BLOCK_REASONS[result.reason] ?? result.reason}.`, 3);
      return;
    }
    b.rotated = !b.rotated;
    b.moveTo(x, y);
    this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** The structure being positioned is turned 90° (R). */
  private placingRotated = false;

  private stopPlacing(): void {
    this.placingRotated = false;
    this.placing = null;
    this.ghost = null;
  }

  /** Footprint under the cursor (centred on it) + legality for the preview. */
  private updateGhost(): void {
    if (!this.placing || !this.mouseWorld) {
      this.ghost = null;
      return;
    }
    const fp = this.placing.footprint;
    const w = this.placingRotated ? fp.d : fp.w;
    const d = this.placingRotated ? fp.w : fp.d;
    const x = Math.floor(this.mouseWorld.x / CELL_SIZE - w / 2 + 0.5);
    const y = Math.floor(this.mouseWorld.y / CELL_SIZE - d / 2 + 0.5);
    const result = this.placement.check({ owner: this.humanPlayer.id, x, y, w, d });
    this.ghost = {
      spriteKey: this.placing.spriteKey(this.humanPlayer.faction),
      faction: this.humanPlayer.faction,
      x,
      y,
      w,
      d,
      mirrored: this.placingRotated,
      ok: result.ok,
      reason: result.ok ? null : (BLOCK_REASONS[result.reason] ?? result.reason),
    };
  }

  /** Left click while placing: put the structure down if the spot is legal. */
  private tryPlace(): void {
    const g = this.ghost;
    const option = this.placing;
    if (!g || !option) return;
    if (!g.ok) {
      this.sidebar.notify(g.reason ?? 'Cannot place here.');
      return;
    }
    const player = this.humanPlayer;
    if (!this.construction.takeReady(player)) return;
    const b = this.entities.add(option.create(player.id, player.faction, g.x, g.y));
    b.rotated = g.mirrored;
    b.moveTo(g.x, g.y);
    b.placedAt = this.time;
    this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    this.stopPlacing();
    this.sidebar.notify(`${option.name} placed.`);
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** Areas (cells) where the player may build: own buildings grown by BUILD_RADIUS. */
  private buildZones(): { x: number; y: number; w: number; h: number }[] {
    const r = BUILD_RADIUS;
    return this.entities
      .buildings()
      .filter((b) => b.owner === this.humanPlayer.id && b.alive)
      .map((b) => ({
        x: (b.x - r) * CELL_SIZE,
        y: (b.y - r) * CELL_SIZE,
        w: (b.w + r * 2) * CELL_SIZE,
        h: (b.d + r * 2) * CELL_SIZE,
      }));
  }

  /** Building types the human player currently has standing. */
  private ownedTypes(): Set<BuildingType> {
    const set = new Set<BuildingType>();
    for (const b of this.entities.buildings()) if (b.owner === this.humanPlayer.id && b.alive) set.add(b.spec.type);
    return set;
  }

  // ------------------------------------------------------------------ combat feedback

  /** A shot was fired: tracer, muzzle flash, impact burst, sound and (once per fight) the battle cry. */
  /** A point of the world plane `lift` px above the ground, as an effect position (effects live in iso space). */
  private fx(x: number, y: number, lift = 0): WorldPoint {
    const p = worldToIso(x, y);
    return { x: p.x, y: p.y - lift };
  }

  private onFire(s: Unit, t: Entity, w: WeaponSpec, _impact: WorldPoint): void {
    this.alertUnderAttack(t, s);
    const heavy = w.kind === 'cannon' || w.kind === 'missile';
    // Where the shot lands (world plane + height) and where the barrel is.
    let tx = s.px;
    let ty = s.py;
    let tlift = 0;
    if (t instanceof Unit) {
      tx = t.px;
      ty = t.py;
      tlift = t.bodyHeight * 0.6;
    } else if (t instanceof Building) {
      const c = t.centerWorld();
      tx = c.x + (((t.id * 7) % 9) - 4);
      ty = c.y;
      tlift = 6;
    }
    const dist = Math.hypot(tx - s.px, ty - s.py) || 1;
    const reach = s instanceof Vehicle ? 3.2 : 1.0;
    const mx = s.px + ((tx - s.px) / dist) * reach;
    const my = s.py + ((ty - s.py) / dist) * reach;
    const muzzle = this.fx(mx, my, s instanceof Vehicle ? s.bodyHeight : s.bodyHeight * 0.8);
    const hit = this.fx(tx, ty, tlift);
    const ttl = { rifle: 0.09, smg: 0.06, sniper: 0.14, mg: 0.06, autocannon: 0.08, cannon: 0.22, missile: 0.35 }[w.kind];
    const color = heavy ? '#ffb347' : w.kind === 'sniper' ? '#ffffff' : '#ffe9a0';
    this.effects.add({ kind: 'tracer', x0: muzzle.x, y0: muzzle.y, x1: hit.x, y1: hit.y, age: 0, ttl, color, width: heavy ? 1.1 : 0.45, shell: heavy });
    this.effects.add({ kind: 'flash', x: muzzle.x, y: muzzle.y, age: 0, ttl: 0.07, size: heavy ? 3.6 : 1.8 });
    this.effects.add({ kind: 'blast', x: hit.x, y: hit.y, age: -ttl, ttl: heavy ? 0.35 : 0.18, radius: heavy ? 6 : 1.6 });
    this.sound.play(w.kind, { x: mx, y: my });
    const prev = this.lastShot.get(s.id) ?? -99;
    this.lastShot.set(s.id, this.time);
    if (this.time - prev > 8 && s.faction !== 'neutral') this.sound.battleCry(s.faction, { x: s.px, y: s.py });
  }

  /** Throttled "under attack" alerts for everything the player owns. */
  private readonly alertAt = new Map<string, number>();
  private alertUnderAttack(t: Entity, attacker: Unit): void {
    if (t.owner !== this.humanPlayer.id || attacker.owner === t.owner) return;
    const isBuilding = t instanceof Building;
    const key = isBuilding ? `b:${t.spec.type}` : `u:${t instanceof Vehicle ? t.type : 'soldier'}`;
    if (this.time - (this.alertAt.get(key) ?? -99) < 12) return;
    this.alertAt.set(key, this.time);
    const name = isBuilding ? t.spec.name : t instanceof Vehicle || t instanceof Infantry ? t.name : 'Unit';
    const at = isBuilding ? t.centerWorld() : { x: (t as Unit).px, y: (t as Unit).py };
    this.sidebar.alert(`${name} is under attack!`, at);
  }

  /** Sell button: the World Bank looks at the offer and decides whether, and how much, to buy. */
  private sellOil(): void {
    const result = this.oilMarket.sell(this.humanPlayer);
    this.sidebar.notify(
      result.kind === 'sold'
        ? `World Bank bought ${result.barrels.toFixed(1)} barrels at ${result.price} ${CURRENCY} → +${result.revenue} ${CURRENCY}` +
          (result.repaid > 0 ? ` (${result.repaid} ${CURRENCY} paid back on your debt)` : '')
        : `World Bank declined: ${result.reason}.`,
      5,
    );
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** Pause button / P key: freezes the simulation (camera and selection still work). */
  private togglePause(): void {
    this.paused = !this.paused;
    this.sidebar.setPaused(this.paused);
  }

  /** Emergency loan button: only on the player's request, only at 0 TB. */
  private takeLoan(): void {
    const result = this.oilMarket.borrow(this.humanPlayer);
    this.sidebar.notify(
      result.kind === 'granted'
        ? `World Bank loan: +${result.amount} ${CURRENCY}. Debt ${result.debt} ${CURRENCY} — oil sales pay it back automatically.`
        : `Loan refused: ${result.reason}.`,
      5,
    );
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** Does the nation still have soldiers or armed vehicles (aircraft and passengers included)? */
  private hasArmy(p: PlayerState): boolean {
    return (
      this.entities.units().some((u) => u.owner === p.id && u.alive && u.weapon !== null) ||
      this.entities.vehicles().some((v) => v.owner === p.id && v.alive && v.weapon !== null)
    );
  }

  /** A capital fell: BREAKING NEWS. The nation is only beaten once it has no soldiers or combat vehicles left either. */
  private defeatNation(capital: Building): void {
    const nation = this.players.find((p) => p.id === capital.owner);
    if (!nation || nation.defeated) return;
    const name = FACTIONS[nation.faction].name;
    const fights = this.hasArmy(nation);
    const subject = nation.isHuman ? 'Your capital has fallen' : `${name}'s capital, ${capital.spec.name}, has fallen`;
    const army = nation.isHuman ? 'your army fights on' : 'its army fights on';
    this.news.show('BREAKING NEWS', fights ? `${subject} — but ${army}.` : `${subject}.`);
  }

  /**
   * A nation is defeated when its capital is gone AND it has no soldiers or combat vehicles. The player loses
   * the game when defeated; the player wins once every other nation is defeated.
   */
  private evaluateNations(): void {
    for (const p of this.players) {
      if (p.defeated) continue;
      const hasCapital = this.entities.buildings().some((b) => b.owner === p.id && b.alive && b.spec.type === 'capital');
      if (hasCapital || this.hasArmy(p)) continue;
      p.defeated = true;
      const name = FACTIONS[p.faction].name;
      this.news.show('BREAKING NEWS', p.isHuman ? 'Your nation has been defeated.' : `${name} has been defeated — no capital and no army left.`);
    }
    if (this.humanPlayer.defeated) {
      this.ended = true;
      this.endScreen.show(false, 'Your capital has fallen and you have no soldiers or combat vehicles left.');
    } else if (this.players.every((p) => p.isHuman || p.defeated)) {
      this.ended = true;
      this.endScreen.show(true, 'Every enemy capital is destroyed and no enemy soldier or combat vehicle remains. The war is won.');
    }
  }

  /** Something ran out of health: remove it with an explosion. */
  private onDeath(e: Entity, killer?: Entity): void {
    this.awardKill(e, killer);
    this.selection.selectedUnits.delete(e.id);
    if (e instanceof Unit) {
      // Everyone aboard a destroyed transport goes down with it.
      if (e instanceof Vehicle && e.cargo.length > 0) {
        for (const c of e.cargo) {
          this.selection.selectedUnits.delete(c.id);
          this.entities.remove(c.id);
        }
        e.cargo.length = 0;
      }
      this.entities.remove(e.id);
      const vehicle = e instanceof Vehicle;
      this.effects.add({ kind: 'smoke', ...this.fx(e.px, e.py, 1), age: 0, ttl: 1.2, radius: vehicle ? 5 : 2.2 });
      if (vehicle) {
        this.effects.add({ kind: 'blast', ...this.fx(e.px, e.py, e.flies ? 2 + e.altitude : 2), age: 0, ttl: 0.5, radius: e.flies ? 14 : 10 });
        this.sound.play('explosion', { x: e.px, y: e.py });
      }
      return;
    }
    if (!(e instanceof Building)) return;
    if (this.selection.selectedId === e.id) this.selection.select(null);
    this.ejectUnits(e, [...e.garrison]);
    if (e.spec.type === 'capital') this.defeatNation(e);
    if (e.owner === this.humanPlayer.id) this.sidebar.alert(`${e.spec.name} was destroyed!`, e.centerWorld());
    if (e.spec.type === 'airfield') {
      // Aircraft parked on it burn with it unless the nation has another airfield to move them to.
      const other = this.entities.buildings().some((b) => b.id !== e.id && b.owner === e.owner && b.alive && b.spec.type === 'airfield');
      if (!other) for (const v of this.entities.vehicles()) if (v.homeId === e.id && v.fixed) v.hp = 0;
    }
    this.map.occupy(e.x, e.y, e.w, e.d, null);
    this.entities.remove(e.id);
    const i = this.derricks.indexOf(e as OilDerrick);
    if (i >= 0) this.derricks.splice(i, 1);
    const f = e.footprintWorld();
    for (let k = 0; k < 7; k++) {
      this.effects.add({
        kind: 'blast',
        ...this.fx(f.x + f.w * (0.15 + 0.7 * ((k * 37) % 10) / 10), f.y + f.h * (0.2 + 0.6 * ((k * 53) % 10) / 10), 4),
        age: -k * 0.12,
        ttl: 0.7,
        radius: 11 + (k % 3) * 4,
      });
      this.effects.add({ kind: 'smoke', ...this.fx(f.x + f.w / 2 + (k - 3) * 2.5, f.y + f.h / 2, 6), age: -k * 0.1, ttl: 3, radius: 7 });
    }
    this.sound.play('explosion', e.centerWorld());
    if (e.owner === this.humanPlayer.id) this.sidebar.notify(`Your ${e.spec.name} was destroyed!`, 5);
  }

  /** Buildings below half health smoke; below a quarter they also burn. */
  private smokeFromDamagedBuildings(dt: number): void {
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = 0.45;
    for (const b of this.entities.buildings()) {
      if (b.hpRatio >= 0.5 || !b.alive) continue;
      const f = b.footprintWorld();
      const spot = this.fx(f.x + f.w * (0.25 + Math.random() * 0.5), f.y + f.h * (0.2 + Math.random() * 0.5), 6);
      this.effects.add({ kind: 'smoke', ...spot, age: 0, ttl: 1.8, radius: 4.5 });
      if (b.hpRatio < 0.25) this.effects.add({ kind: 'blast', x: spot.x, y: spot.y + 2, age: 0, ttl: 0.4, radius: 5 });
    }
  }

  // ------------------------------------------------------------------ vehicles & aircraft

  private onVehicleClick(kind: VehicleKind): void {
    // (aircraft need a free parking spot on an airfield)
    const player = this.humanPlayer;
    const option = this.production.optionsFor(player).find((o) => o.kind === kind);
    if (!option) return;
    const result = this.production.enqueue(player, kind);
    this.sidebar.notify(
      result === 'ok'
        ? `Building ${option.name} — ${option.cost} ${CURRENCY}`
        : result === 'full'
          ? `Vehicle orders are full (${BUILD_LIMIT_VEHICLES}) — one more once an order is done.`
          : result === 'tech'
            ? 'Second-tier vehicles need a High-Tech Center.'
            : result === 'cap'
            ? `Ground vehicles are at their limit of ${MAX_GROUND_VEHICLES} — aircraft are not limited.`
            : result === 'noParking'
            ? 'No free parking spot — build another Airfield or send aircraft out.'
            : option.requires === 'airfield'
              ? 'Requires an Airfield.'
              : 'Requires a War Factory.',
    );
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  private onVehicleCancel(kind: VehicleKind): void {
    if (this.production.cancelOne(this.humanPlayer, kind)) this.sidebar.notify('Production cancelled.');
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /**
   * A finished vehicle rolls out of the War Factory's front (an aircraft takes
   * off from the Airfield) and drives or flies to the first free spot nearby.
   */
  /** Where the runway, apron parking spots and approach point are, in world px. */
  private airfieldGeometry(b: Building): AirfieldGeometry {
    // The art's axes are the grid's: tile (u, v) of the 12×6 sprite is the cell u right, v down of the footprint's corner.
    // A turned building shows its art mirrored: the art's (u, v) lands on the cell v right, u down.
    const pt = (u: number, v: number): WorldPoint =>
      b.rotated ? { x: (b.x + v) * CELL_SIZE, y: (b.y + u) * CELL_SIZE } : { x: (b.x + u) * CELL_SIZE, y: (b.y + v) * CELL_SIZE };
    const start = pt(0.5, RUNWAY_D / 2);
    const end = pt(AIRFIELD_SIZE.w - 0.5, RUNWAY_D / 2);
    const heading = Math.atan2(end.y - start.y, end.x - start.x);
    return {
      slots: AIRFIELD_SLOTS.map(([u, v]) => pt(u, v)),
      runwayStart: start,
      runwayEnd: end,
      heading,
      approach: { x: start.x - Math.cos(heading) * 40, y: start.y - Math.sin(heading) * 40 },
    };
  }

  /** A new aircraft (fighter or transport) appears parked on a free spot of its airfield's apron. */
  private spawnAircraft(player: PlayerState, kind: VehicleKind, airfield: Building): void {
    const g = this.airfieldGeometry(airfield);
    const taken = new Set(
      this.entities
        .vehicles()
        .filter((v) => v.aircraft && v.alive && v.homeId === airfield.id && !v.flies)
        .map((v) => v.slot),
    );
    let slot = 0;
    while (taken.has(slot)) slot++;
    const spot = g.slots[slot] ?? g.slots[0];
    if (!spot) return;
    const jet = this.entities.add(new Vehicle(player.id, player.faction as FactionId, kind, spot));
    jet.flight = 'parked';
    jet.altitude = 0;
    jet.homeId = airfield.id;
    jet.slot = slot;
    jet.heading = g.heading;
    if (player.isHuman) this.sidebar.notify(`${jet.name} parked on the airfield.`);
  }

  /** Units that have been stuck for a while, or whose next waypoint became blocked, plan a new route. */
  private repathStuckUnits(dt: number): void {
    this.repathTimer -= dt;
    if (this.repathTimer > 0) return;
    this.repathTimer = 0.5;
    for (const u of this.entities.fieldMovers()) {
      if (!u.moving || u.aircraft || !u.destination) continue;
      const next = u.waypoints()[0];
      const nextCell = next ? this.map.cellAt(next.x, next.y) : null;
      const blocked = nextCell !== null && !this.pathfinder.passable(nextCell.x, nextCell.y, u.swims);
      if (!u.needsRepath && !blocked) continue;
      const dest = u.destination;
      const cell = this.map.cellAt(dest.x, dest.y);
      if (!cell) continue;
      const goal = this.pathfinder.passable(cell.x, cell.y, u.swims) ? cell : this.pathfinder.nearestPassable(cell.x, cell.y, 6, undefined, u.swims);
      if (!goal) {
        u.stop();
        continue;
      }
      const path = this.pathfinder.find({ x: u.px, y: u.py }, goal, u.swims);
      const last = path[path.length - 1];
      if (last && goal.x === cell.x && goal.y === cell.y) {
        last.x = dest.x;
        last.y = dest.y;
      }
      u.follow(path);
    }
  }

  private spawnVehicle(player: PlayerState, kind: VehicleKind, producer: Building): void {
    if (isAircraftKind(kind)) {
      this.spawnAircraft(player, kind, producer);
      return;
    }
    // Land vehicles roll out of the front of the War Factory to the first free spot nearby.
    const door = this.doorPoint(producer);
    const startCell = this.pathfinder.nearestPassable(Math.floor(door.x / CELL_SIZE), Math.floor(door.y / CELL_SIZE), 8);
    if (!startCell) return;
    const start = { x: (startCell.x + 0.5) * CELL_SIZE, y: (startCell.y + 0.5) * CELL_SIZE };
    const unit = this.entities.add(new Vehicle(player.id, player.faction as FactionId, kind, start));
    unit.heading = Math.PI / 2;
    const movers = this.entities.fieldMovers();
    for (let k = 0; k < 120; k++) {
      const off = spiralOffset(k, 9);
      const spot = { x: door.x + off.x, y: door.y + CELL_SIZE * 3 + Math.abs(off.y) };
      const cell = this.map.cellAt(spot.x, spot.y);
      if (!cell || !this.pathfinder.passable(cell.x, cell.y)) continue;
      if (movers.some((m) => m !== unit && !m.flies && Math.hypot(m.px - spot.x, m.py - spot.y) < m.radius + unit.radius + 1)) continue;
      const path = this.pathfinder.find({ x: unit.px, y: unit.py }, cell);
      const last = path[path.length - 1];
      if (last) {
        last.x = spot.x;
        last.y = spot.y;
      }
      unit.follow(path);
      break;
    }
    if (player.isHuman) this.sidebar.notify(`${unit.name} ready.`);
  }

  // ------------------------------------------------------------------ infantry

  private onTrainClick(tier: UnitTier): void {
    const player = this.humanPlayer;
    const option = this.training.optionsFor(player).find((o) => o.tier === tier);
    if (!option) return;
    if (!this.training.barracksOf(player)) this.sidebar.notify('Requires a Barracks.');
    else {
      const result = this.training.enqueue(player, tier);
      this.sidebar.notify(
        result === 'ok'
          ? `Training ${option.name} — ${option.cost} ${CURRENCY}`
          : result === 'tech'
            ? 'Second-tier soldiers need a High-Tech Center.'
            : result === 'ratio'
            ? 'Elite soldiers never outnumber the regulars: 2 elite for every 3 regular — train more regular soldiers first.'
            : result === 'cap'
            ? `Army is at its limit of ${MAX_SOLDIERS} soldiers — train more when some have fallen.`
            : result === 'full'
            ? `Training orders are full (${BUILD_LIMIT_SOLDIERS}) — one more once an order is done.`
            : 'You already have a President.',
      );
    }
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  private onTrainCancel(tier: UnitTier): void {
    if (this.training.cancelOne(this.humanPlayer, tier)) this.sidebar.notify('Training cancelled.');
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** A trained soldier walks out of the barracks' front door to a free rally cell. */
  private spawnSoldier(player: PlayerState, tier: UnitTier, barracks: Building): void {
    const doorX = barracks.x + Math.floor(barracks.w / 2);
    const doorY = barracks.y + barracks.d;
    const exit = this.pathfinder.nearestPassable(doorX, doorY, PARADE_MAX_CELLS);
    if (!exit) return;
    const unit = this.entities.add(
      new Infantry(player.id, player.faction as FactionId, tier, {
        x: (exit.x + 0.5) * CELL_SIZE,
        y: (exit.y + 0.2) * CELL_SIZE,
      }),
    );
    // Parade ground: soldiers march to the next free slot of a neat grid around the barracks, never
    // farther than PARADE_MAX_CELLS cells from its walls (the slots nearest the door fill first).
    const used = new Set(
      this.entities
        .units()
        .filter((u) => u !== unit && u.alive && u.parade?.barracks === barracks.id)
        .map((u) => u.parade?.slot ?? -1),
    );
    const slots = this.paradeSlots(barracks);
    // First free slot whose cell is actually standable (blocked spots are skipped).
    let slot = 0;
    for (; slot < slots.length; slot++) {
      const at = slots[slot];
      if (at && !used.has(slot) && this.pathfinder.passable(Math.floor(at.x / CELL_SIZE), Math.floor(at.y / CELL_SIZE), unit.swims)) break;
    }
    const spot = slots[slot];
    const slotX = spot?.x ?? unit.px;
    const slotY = spot?.y ?? unit.py;
    const slotCell = { x: Math.floor(slotX / CELL_SIZE), y: Math.floor(slotY / CELL_SIZE) };
    if (spot) {
      const path = this.pathfinder.find({ x: unit.px, y: unit.py }, slotCell, unit.swims);
      const last = path[path.length - 1];
      // The slot cell is the goal, so snap the last waypoint to the exact slot spot.
      if (last && Math.floor(last.x / CELL_SIZE) === slotCell.x && Math.floor(last.y / CELL_SIZE) === slotCell.y) {
        last.x = slotX;
        last.y = slotY;
      }
      unit.parade = { barracks: barracks.id, slot };
      unit.follow(path);
    } else {
      // Every slot is taken: the soldier simply stays at the door instead of wandering off.
      unit.parade = null;
    }
    if (player.isHuman) this.sidebar.notify(`${unit.name} ready.`);
  }

  /**
   * Standing spots around a barracks, at most PARADE_MAX_CELLS cells from its walls, ordered from the
   * door outwards. Slot numbers stay valid as long as the barracks does not move.
   */
  private paradeSlots(b: Building): WorldPoint[] {
    const reach = PARADE_MAX_CELLS * CELL_SIZE - PARADE_SPACING / 2;
    const left = b.x * CELL_SIZE;
    const top = b.y * CELL_SIZE;
    const right = (b.x + b.w) * CELL_SIZE;
    const bottom = (b.y + b.d) * CELL_SIZE;
    const door = this.doorPoint(b);
    const slots: WorldPoint[] = [];
    for (let x = left - reach; x <= right + reach; x += PARADE_SPACING) {
      for (let y = top - reach; y <= bottom + reach; y += PARADE_SPACING) {
        const gap = Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
        if (gap < PARADE_GAP || gap > reach) continue;
        slots.push({ x, y });
      }
    }
    return slots.sort((p, q) => Math.hypot(p.x - door.x, p.y - door.y) - Math.hypot(q.x - door.x, q.y - door.y) || p.x - q.x || p.y - q.y);
  }

  // ------------------------------------------------------------------ building orders

  /** The door: centre of the building's front edge, where its artwork meets the ground (world px). */
  private doorPoint(b: Building): WorldPoint {
    return { x: (b.x + b.w / 2) * CELL_SIZE, y: (b.y + b.d - PLACEMENT_MARGIN) * CELL_SIZE + 1 };
  }

  /** Walks `u` right up to `b`'s door (the soldier ends up touching the building). */
  private walkToDoor(u: Infantry, b: Building): boolean {
    const door = this.doorPoint(b);
    let cell = this.map.cellAt(door.x, door.y);
    if (!cell || !this.pathfinder.passable(cell.x, cell.y, u.swims)) {
      cell = this.pathfinder.nearestPassable(cell?.x ?? b.x, cell?.y ?? b.y + b.d, 8, undefined, u.swims);
    }
    if (!cell) return false;
    const path = this.pathfinder.find({ x: u.px, y: u.py }, cell, u.swims);
    const last = path[path.length - 1];
    // Stand exactly on the door spot when it lies in the goal cell.
    if (last && Math.floor(door.x / CELL_SIZE) === cell.x && Math.floor(door.y / CELL_SIZE) === cell.y) {
      last.x = door.x;
      last.y = door.y;
    }
    u.parade = null;
    u.follow(path);
    return true;
  }

  /**
   * Left-click on a building with soldiers selected:
   *  - own building that accepts them (capital ← President, hospital ← wounded): enter;
   *  - own damaged building + engineers: repair;
   *  - enemy building + engineers: capture it (neutral buildings are immune).
   * Returns true if at least one soldier got an order.
   */
  private orderOnBuilding(b: Building): boolean {
    const me = this.humanPlayer;
    let ordered = 0;
    for (const u of this.selection.selectedUnitList()) {
      if (!(u instanceof Infantry)) continue; // only people enter, repair or capture
      let type: 'enter' | 'repair' | 'capture' | null = null;
      if (b.owner === me.id) {
        if (b.canEnter(u)) type = 'enter';
        else if (u.isEngineer && b.hp < b.maxHp && !b.indestructible) type = 'repair';
      } else if (u.isEngineer && b.capturable && b.faction !== 'neutral') {
        type = 'capture';
      }
      if (!type || !this.walkToDoor(u, b)) continue;
      u.task = { type, buildingId: b.id };
      ordered++;
    }
    if (ordered === 0 && b.faction === 'neutral' && this.selection.selectedUnitList().some((u) => u instanceof Infantry && u.isEngineer)) {
      this.sidebar.notify('Neutral buildings cannot be captured or destroyed.');
    }
    // Enemy building and nobody could capture it: armed units attack it instead.
    if (ordered === 0 && b.owner !== me.id && b.owner !== NEUTRAL_OWNER) return this.orderAttack(b);
    return ordered > 0;
  }

  /** Every selected armed unit that can hurt `target` is ordered to attack it. */
  private orderAttack(target: Entity): boolean {
    const attackers = this.selection.selectedUnitList().filter((u) => canTarget(u, target));
    if (attackers.length === 0) return false;
    for (const u of attackers) {
      u.attackTarget = target.id;
      u.attackMove = null;
      u.task = null;
      u.parade = null;
    }
    const at = target instanceof Building ? target.centerWorld() : { x: (target as Unit).px, y: (target as Unit).py };
    this.moveMarker = { x: at.x, y: at.y, at: this.time };
    return true;
  }

  /** Advances enter / repair / capture orders for soldiers standing at their target. */
  private processTasks(): void {
    for (const u of this.entities.fieldUnits()) {
      const task = u.task;
      if (!task) continue;
      const b = this.entities.get(task.buildingId);
      if (!(b instanceof Building) || !b.alive) {
        u.task = null;
        continue;
      }
      // Nothing happens until the soldier has actually walked up to the door.
      if (u.moving) continue;
      const door = this.doorPoint(b);
      if (Math.hypot(door.x - u.px, door.y - u.py) > CELL_SIZE * 1.6) {
        if (!this.walkToDoor(u, b) || !u.moving) u.task = null; // unreachable
        continue;
      }
      if (task.type === 'enter') {
        u.task = null;
        if (b.canEnter(u)) {
          b.garrison.push(u);
          u.insideId = b.id;
          u.stop();
          this.selection.selectedUnits.delete(u.id);
          if (u.owner === this.humanPlayer.id) this.sidebar.notify(`${u.name} entered: ${b.spec.name}. Double-click it to bring them out.`);
        }
      } else if (task.type === 'repair') {
        // Repair: the engineer goes inside and is consumed; the building is restored to 100% at once.
        if (b.hp < b.maxHp) {
          b.hp = b.maxHp;
          this.entities.remove(u.id);
          this.selection.selectedUnits.delete(u.id);
          if (u.owner === this.humanPlayer.id) this.sidebar.notify(`${b.spec.name} fully repaired — the engineer stays inside.`);
        } else u.task = null;
      } else {
        // Capture: the engineer is consumed and the building changes sides.
        if (b.capture(u.owner, u.faction as FactionId)) {
          this.entities.remove(u.id);
          this.selection.selectedUnits.delete(u.id);
          if (u.owner === this.humanPlayer.id) this.sidebar.notify(`${b.spec.name} captured!`);
        } else u.task = null;
      }
    }
  }

  /** Patients inside a hospital recover health over time. */
  private healGarrisons(dt: number): void {
    for (const b of this.entities.buildings()) {
      const heal = b.spec.garrison?.healPerSecond;
      if (!heal) continue;
      const healed: Infantry[] = [];
      for (const u of b.garrison) {
        u.hp = Math.min(u.maxHp, u.hp + heal * dt);
        if (u.hp >= u.maxHp) healed.push(u);
      }
      // Patients walk out on their own as soon as they are fully healed.
      if (healed.length > 0) this.ejectUnits(b, healed, 'healed');
    }
  }

  /** Brings the given people stationed in `b` out onto the ground in front of it. */
  private ejectUnits(b: Building, out: Infantry[], why: 'out' | 'healed' = 'out'): void {
    for (const u of out) {
      const i = b.garrison.indexOf(u);
      if (i >= 0) b.garrison.splice(i, 1);
    }
    out.forEach((u, k) => {
      const off = spiralOffset(k, UNIT_SPACING * 1.15);
      const base = { x: (b.x + b.w / 2) * CELL_SIZE + off.x, y: (b.y + b.d + 1.2) * CELL_SIZE + off.y };
      const cell = this.pathfinder.nearestPassable(Math.floor(base.x / CELL_SIZE), Math.floor(base.y / CELL_SIZE), 8, undefined, u.swims);
      u.px = cell ? (cell.x + 0.5) * CELL_SIZE : base.x;
      u.py = cell ? (cell.y + 0.5) * CELL_SIZE : base.y;
      u.insideId = null;
      u.stop();
    });
    if (out.length > 0 && why === 'healed' && b.owner === this.humanPlayer.id) this.sidebar.notify(`${out.length} healed and left the ${b.spec.name}.`);
    else if (out.length > 0) this.sidebar.notify(`${out.length} came out of: ${b.spec.name}.`);
  }

  /** Moves the selected soldiers, spreading them over distinct nearby cells. */
  private orderMove(world: WorldPoint): void {
    const units = this.selection.selectedUnitList();
    if (!this.map.cellAt(world.x, world.y) || units.length === 0) return;
    // Closest soldiers take the spots nearest the click; the first stands exactly on it.
    units.sort((a, b) => Math.hypot(a.px - world.x, a.py - world.y) - Math.hypot(b.px - world.x, b.py - world.y));
    // Destination spots are as far apart as the biggest unit needs, so tanks and aircraft never share a point.
    const spacing = Math.max(UNIT_SPACING * 1.15, Math.max(...units.map((u) => u.radius)) * 2.1);
    units.forEach((u, k) => {
      u.parade = null; // leaves the parade ground
      u.task = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.chasing = false;
      const off = spiralOffset(k, spacing);
      let goal = { x: world.x + off.x, y: world.y + off.y };
      let cell = this.map.cellAt(goal.x, goal.y);
      if (!u.aircraft && (!cell || !this.pathfinder.passable(cell.x, cell.y, u.swims))) {
        // Spot not standable: use the nearest standable cell centre instead.
        const near = this.pathfinder.nearestPassable(cell?.x ?? 0, cell?.y ?? 0, 10, undefined, u.swims);
        if (!near) return;
        cell = near;
        goal = { x: (near.x + 0.5) * CELL_SIZE, y: (near.y + 0.5) * CELL_SIZE };
      }
      if (u.aircraft) {
        u.follow([goal]); // aircraft ignore terrain and fly straight (parked ones take off first)
        return;
      }
      if (!cell) return;
      if (!cell) return;
      const path = this.pathfinder.find({ x: u.px, y: u.py }, cell, u.swims);
      const last = path[path.length - 1];
      if (last) {
        last.x = goal.x;
        last.y = goal.y;
      } else path.push(goal);
      u.follow(path);
    });
    this.moveMarker = { x: world.x, y: world.y, at: this.time };
  }

  /**
   * Each nation's oil derricks stand in one straight row on the safest ground
   * of its territory: farthest from the sea (landings) and from foreign borders.
   */
  private placeOilRows(trees: TreeLayer): void {
    for (const player of this.players) {
      const f = player.faction;
      const idx = TERRITORIES.findIndex((t) => t.faction === f) + 1;
      const capital = this.landmarks.find((b) => b.owner === player.id && b.spec.type === 'capital');
      if (!capital || idx === 0) continue;
      const safety = computeSafety(this.map, idx);
      // The oil field goes to safe ground (away from the sea and from foreign borders), well away from our own
      // capital and from every foreign capital; if the homeland has no room, settle for the farthest spot that fits.
      let row: ReturnType<typeof findOilRow> = null;
      const foreignCapitals = this.landmarks.filter((l) => l.spec.type === 'capital' && l.owner !== player.id).map((l) => ({ x: l.x, y: l.y }));
      // [distance from our own capital, distance from every foreign capital] in cells, relaxed step by step.
      for (const [minAway, avoidAway] of [[38, 40], [30, 32], [22, 24], [14, 18], [6, 12], [0, 8]] as const) {
        row = findOilRow(this.map, safety, { x: capital.x, y: capital.y }, OIL_DERRICK_COUNT[f], {
          w: FOOTPRINT_SMALL.w,
          d: FOOTPRINT_SMALL.d,
          gap: 1,
          radius: 110,
          minAway,
          avoid: foreignCapitals,
          avoidAway,
        });
        if (row) break;
      }
      if (!row) {
        console.warn(`No room for ${f}'s oil row.`);
        continue;
      }
      row.forEach((cell, i) => {
        // One derrick of every row is managed by the World Bank: it stays the nation's but cannot be destroyed.
        const derrick = new OilDerrick(player.id, f, { x: 0, y: 0 }, i, i === Math.min(1, row.length - 1));
        derrick.moveTo(cell.x, cell.y);
        this.entities.add(derrick);
        trees.clearArea(cell.x, cell.y, derrick.w, derrick.d);
        this.map.occupy(cell.x, cell.y, derrick.w, derrick.d, derrick.id);
        this.derricks.push(derrick);
      });
    }
  }

  /** Jumps to the next of the player's oil derricks. */
  private cycleOwnDerrick(): void {
    const own = this.derricks.filter((d) => d.owner === this.humanPlayer.id);
    if (own.length === 0) return;
    const i = own.findIndex((d) => d.id === this.selection.selectedId);
    const next = own[(i + 1) % own.length];
    if (next) this.focusBuilding(next.id, true);
  }

  private focusOwnCapital(): void {
    const own = this.landmarks.find((b) => b.owner === this.humanPlayer.id && b.spec.type === 'capital');
    if (own) this.focusBuilding(own.id, false);
  }

  private focusBuilding(id: number, select: boolean): void {
    const e = this.entities.get(id);
    if (!(e instanceof Building)) return;
    const c = e.centerWorld();
    this.camera.setZoom(FOCUS_ZOOM);
    this.bus.emit('camera:focus', { x: c.x, y: c.y - FOCUS_OFFSET_Y });
    if (select) this.selection.select(id);
  }
}

/** k-th point of a sunflower spiral (k = 0 is the centre), `spacing` px apart. */
function spiralOffset(k: number, spacing: number): { x: number; y: number } {
  if (k === 0) return { x: 0, y: 0 };
  const r = spacing * Math.sqrt(k);
  const a = k * 2.399963;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}
