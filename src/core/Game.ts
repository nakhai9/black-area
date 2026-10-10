import { BULLET_FLIGHT_SECONDS, BULLET_IMPACT_SECONDS, hasBulletSheet, type BulletSize } from '../render/BulletSheet';
import { setDemoActive } from './Demo';
import {
  DEMO_CREDITS,
  MAX_WAYPOINTS,
  DEMO_UNITS_EACH,
  BUILDING_VALUE,
  CAMERA_EDGE_PAN_SPEED,
  DERRICK_GRACE_ATTACKS,
  ENGINEER_REPAIR_SHARE,
  DERRICK_GRACE_GAP,
  MERCY_BONUS,
  RESALE_SHARE,
  CAMERA_EDGE_SCROLL,
  CAMERA_PAN_SPEED,
  BOMB_FALL_SECONDS,
  OIL_LEASE_CARTEL_SHARE,
  OIL_LEASE_MAX,
  OIL_LEASE_SECONDS,
  FORMATION_COLS,
  FORMATION_RANKS,
  DEMO_FUSE_SECONDS,
  DEMO_GROUP_RADIUS_CELLS,
  DEMO_GROUP_SIZE,
  DEMO_LARGE_DAMAGE,
  DEMO_PLANT_CELLS,
  DEMO_RELOAD_SECONDS,
  DEMO_SMALL_CELLS,
  BOMBS_PER_DROP,
  CAPITAL_LOCATIONS,
  CRUSH_RADIUS,
  BUILD_LIMIT_SOLDIERS,
  MAX_SOLDIERS,
  MAX_GROUND_VEHICLES,
  BUILD_LIMIT_VEHICLES,
  PARADE_GAP,
  PARADE_MAX_CELLS,
  PARADE_SPACING,
  VETERAN_REGEN_CALM,
  REPAIR_VEHICLE_HEAL_SHARE,
  REPAIR_VEHICLE_INTERVAL,
  REPAIR_VEHICLE_RANGE_CELLS,
  REPAIR_VEHICLE_REPATH,
  VETERAN_REGEN_PER_SECOND,
  VETERAN_REGEN_RANK,
  UNIT_SPACING,
  VEHICLE_GAP,
  MAX_TRANSPORTS,
  JANITOR_INTERVAL,
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
  OIL_FIELD_SPACING,
  OIL_POLICIES,
  OIL_ROW_MAX,
  OIL_SITES,
  OIL_SITES_ABROAD,
  STARTING_CREDITS,
  STARTING_OIL,
  WORLD_BANK_LOCATION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  ZOOM_STEP,
  isAircraftKind,
  POWER_PER_BARREL,
  MAX_ALLIES,
  GAME_VERSION,
} from '../constants';
import { worldToIso } from './IsoView';
import { Building } from '../entities/Building';
import { PLACEMENT_MARGIN } from '../map/TileMap';
import { Capital } from '../entities/Capital';
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
import { formatGeo, geoToWorld, worldToGeo } from '../map/Geo';
import { TerrainRenderer } from '../map/TerrainRenderer';
import { Pathfinder } from '../map/Pathfinder';
import { type GroupMember, PathService } from '../map/PathService';
import { TileMap } from '../map/TileMap';
import { computeSafety, findOilRow } from '../map/OilSite';
import { TERRITORIES } from '../map/Territories';
import { buildWorld } from '../map/WorldGenerator';
import { TreeLayer } from '../map/Trees';
import { SOLDIER_DEATH_SECONDS, hasSoldierDeath, soldierPortrait } from '../render/InfantryArt';
import { vehiclePortrait } from '../render/VehicleArt';
import { REPAIR_DEATH_SECONDS, hasRepairSheet } from '../render/RepairSheets';
import { TRUCK_DEATH_SECONDS, hasTruckSheet } from '../render/TruckSheets';
import { TANK_DEATH_SECONDS, hasTankSheet } from '../render/TankSheets';
import { SpriteCache } from '../render/SpriteCache';
import { BUILDING_ART } from '../render/sprites';
import { AIRFIELD_SLOTS, RUNWAY_D, AIRFIELD_SIZE } from '../render/sprites/Airfield';
import { AircraftSystem, type AirfieldGeometry } from '../systems/AircraftSystem';
import { AISystem } from '../systems/AISystem';
import { canTarget, CombatSystem, distanceTo, isHostile } from '../systems/CombatSystem';
import { MIN_SALE_STOCK, OilMarket } from '../systems/OilMarket';
import { TaxSystem } from '../systems/TaxSystem';
import { EndScreen } from '../ui/EndScreen';
import { PauseMenu } from '../ui/PauseMenu';
import { NewsToast } from '../ui/NewsToast';
import { BUILD_OPTIONS, type BuildOption, ConstructionSystem, type QueueState, buildCost, missingRequirement } from '../systems/ConstructionSystem';
import { EconomySystem } from '../systems/EconomySystem';

/** An ally hit within this many seconds shows as under attack in the Allies tab. */
const ALLY_ALERT_SECONDS = 5;
/** The military ranking is re-counted this often (s): soldiers die and vehicles are lost in between. */
const MILITARY_RANK_INTERVAL = 240;
import type { GameSystem } from '../systems/GameSystem';
import { BUILD_RADIUS, OIL_DERRICK_CLEARANCE, type PlacementRequest, type PlacementResult, PlacementSystem, isClaimable } from '../systems/PlacementSystem';
import { Flagpole } from '../entities/Flagpole';
import { Bunker } from '../entities/Bunker';
import { PowerSystem } from '../systems/PowerSystem';
import { SAFE_ZONE_SIZE, type SafeZone, SafeZoneSystem } from '../systems/SafeZoneSystem';
import { SelectionSystem } from '../systems/SelectionSystem';
import { TrainingSystem } from '../systems/TrainingSystem';
import { VehicleSystem } from '../systems/VehicleSystem';
import type { BuildingType, FactionId, GameEvents, OilPolicy, PlayerState, UnitTier, VehicleKind, WeaponSpec, WorldPoint } from '../types';
import { Minimap } from '../ui/Minimap';
import { sweepUnitSprites, unitSpriteBytes } from '../render/UnitSprites';
import { type TransportInfo, type RankRow, type AllyInfo, Sidebar } from '../ui/Sidebar';
import { StatusBar } from '../ui/StatusBar';
import { Camera } from './Camera';
import { EffectsLayer } from './Effects';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { InputHandler } from './InputHandler';
import { clamp } from './MathUtils';
import { type PlacementGhost, Renderer } from './Renderer';
import { BOMB_BLAST_TTL, hasBombSheet } from '../render/BombSheets';
import { MISSILE_BLAST_SECONDS, MISSILE_FLIGHT_SECONDS, hasMissileSheet } from '../render/MissileSheet';
import { SHELL_FLIGHT_SECONDS, SHELL_IMPACT_SECONDS, hasShellSheet } from '../render/ShellSheet';
import type { Effect } from './Effects';
import { SAVE_FORMAT, SAVE_VERSION, SaveCodec, type SaveFile, migrateSave } from './SaveCodec';
import { peekNextEntityId, setNextEntityId } from '../entities/Entity';

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
  units: 'Units are standing there',
  water: 'Cannot build on water',
  ice: 'Cannot build on ice',
  trees: 'Trees in the way',
  needsWater: 'Must be built on water',
  tooFar: `Too far from your base (max ${BUILD_RADIUS} cells)`,
  claimed: 'Allied Buildings stand only on unclaimed land claimed with a Squatters team',
  nearOil: `Too close to an oil derrick (keep ${OIL_DERRICK_CLEARANCE} free cells around it)`,
};
/** Map-authored buildings may shift this many cells to find tree-free ground… */
const PRESET_SNAP_RADIUS = 2;
/** Crossing routes are checked this many cells ahead; a unit gives way at most CROSSING_MAX_WAIT s. */
const CROSSING_LOOKAHEAD_CELLS = 4;
const CROSSING_MAX_WAIT = 6;
/** Cells around an airfield (on top of its own N × M) where a move click keeps its aircraft home; from one more cell out they take off. */
const AIRFIELD_CLICK_MARGIN = 2;
/** New vehicles park around a rally point this many cells out in front of the War Factory's door. */
const PARKING_RALLY_CELLS = 3;
/** Seconds between two riders getting off a truck. */
const TRUCK_EJECT_STEP = 0.35;
/** F / double-click: the flag goes up on the nearest open cell within this many cells of the Squatters. */
const FLAG_SEARCH_CELLS = 8;
/** …otherwise the nearest dry spot within this radius is used and cleared of trees. */
const PRESET_SEARCH_RADIUS = 8;
/** RA2 Enter cursor: an arrow going down into a hatch, shown over a transport the selection can climb into. */
const ENTER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 14v6h16v-6M12 2v11M7 8l5 5 5-5" stroke="#000" stroke-width="4"/>' +
    '<path d="M4 14v6h16v-6M12 2v11M7 8l5 5 5-5" stroke="#5cff6a" stroke-width="2"/></svg>',
)}") 12 12, pointer`;
/** RA2 scatter (X): how far each selected unit runs from the group (cells; aircraft twice as far). */
const SCATTER_CELLS = 3;
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
  /** Green safe zones of the Global Financial Center for units evacuated by air. */
  readonly safeZones: SafeZoneSystem;
  private repathTimer = 0;
  private yieldTimer = 0;
  /** Spatial hash of separateUnits, reused every pass (with a pool of emptied bucket arrays). */
  private readonly sepGrid = new Map<number, Unit[]>();
  private readonly sepPool: Unit[][] = [];
  /** Last cursor written to the canvas style. */
  private lastCursor = '';
  /** Retreat groups (see Unit.retreatGroup) and the "group:nation" pairs already paid the mercy bonus. */
  private nextRetreatGroup = 1;
  private readonly mercyPaid = new Set<string>();
  /** Attacks launched on the player's structures so far, and when each enemy nation last hit one of them. */
  private attacksOnPlayer = 0;
  private readonly lastHitOnPlayer = new Map<number, number>();
  /** Computer-controlled nations. */
  readonly ai: AISystem;
  readonly effects = new EffectsLayer();
  readonly sound: SoundSystem;
  /** Global Financial Center oil market (one price for every nation) and the news toasts. */
  readonly oilMarket: OilMarket;
  private readonly news: NewsToast;
  private readonly endScreen = new EndScreen();
  private readonly pauseMenu = new PauseMenu(
    () => this.togglePause(),
    {
      get: () => this.sound.musicLevel,
      set: (v) => this.sound.setMusicVolume(v),
    },
    { onSave: () => this.downloadSave() },
  );
  /** The war is decided (victory or game over): the simulation stops. */
  private ended = false;
  private paused = false;
  private minimapTimer = 0;
  private endCheck = 0;
  private readonly lastShot = new Map<number, number>();
  private smokeTimer = 0;
  /** Types of the human player's buildings, refreshed with the sidebar. */
  private ownedCache: Set<BuildingType> = new Set();
  readonly pathfinder: Pathfinder;
  /** Route planning for many units: HPA* corridors, time-sliced jobs, shared flow fields (see PathService). */
  readonly paths: PathService;
  private moveMarker: { x: number; y: number; at: number } | null = null;
  /** Right-clicked moving unit of mine: its route to the destination is shown as a green line for a moment. */
  private pathPeekId: number | null = null;
  /** Waypoint mode (Z): the points clicked so far (max MAX_WAYPOINTS), or null when not plotting a route. */
  private waypoints: WorldPoint[] | null = null;
  private lastBuildingClick: { id: number; at: number } | null = null;
  private ghost: PlacementGhost | null = null;
  private lastQueueState: QueueState = 'idle';
  private readonly sidebar: Sidebar;
  private readonly minimap: Minimap;
  private readonly status: StatusBar;
  private readonly loop: GameLoop;

  private mouseWorld: WorldPoint | null = null;
  private time = 0;
  /** Military ranking snapshot (owner → value of living soldiers + working vehicles) and the game time it was taken. */
  private militarySnapshot: Map<number, number> | null = null;
  private militarySnapshotAt = 0;
  private sidebarTimer = SIDEBAR_REFRESH; // refresh on the first frame
  /** Auto sell toggle: offer the oil stock whenever the market allows a sale. */
  private autoSellOil = false;

  /**
   * Builds the game for the chosen faction. Pass an already-started Earth
   * load to overlap the download with the faction-selection screen.
   */
  static async create(
    dom: GameDom,
    playerFaction: FactionId,
    earth: Promise<EarthData> = loadEarthData(EARTH_TEXTURE_URL),
    sound: SoundSystem = new SoundSystem(),
    demo = false,
  ): Promise<Game> {
    return new Game(dom, playerFaction, await earth, sound, demo);
  }

  private constructor(
    private readonly dom: GameDom,
    playerFaction: FactionId,
    earth: EarthData,
    sound: SoundSystem,
    /** Dev-only DEMO mode: the player tests alone, the other nations' AI never acts. */
    demo = false,
  ) {
    setDemoActive(demo);
    if (demo) dom.sidebar.classList.add('demo');
    this.players = FACTION_ORDER.map((faction, i) => ({
      id: i + 1,
      name: faction === playerFaction ? 'Commander' : `${FACTIONS[faction].shortName} AI`,
      faction,
      isHuman: faction === playerFaction,
      credits: STARTING_CREDITS,
      oil: STARTING_OIL,
      leasedOil: 0,
      debt: 0,
      creditFrozen: false,
      defeated: false,
      capitalLost: false,
      powerProduced: 0,
      powerConsumed: 0,
      powerStored: 0,
      powerCapacity: 0,
      blackout: false,
      powerSupply: 0,
      powerShort: false,
    }));

    // Landmarks and oil derricks at real-world locations.
    for (const player of this.players) {
      const f = player.faction;
      this.landmarks.push(this.entities.add(new Capital(FACTIONS[f], player.id, geoToWorld(CAPITAL_LOCATIONS[f]))));
    }
    // The Global Financial Center is neutral: shared by every nation, never destroyed or occupied.
    this.landmarks.push(this.entities.add(new WorldBank(geoToWorld(WORLD_BANK_LOCATION))));

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
    // While any of my units is selected, a left drag gives an order instead of sweeping up others; deselect first (right click).
    this.input.boxSelectEnabled = () => this.selection.selectedUnits.size === 0;
    this.economy = new EconomySystem(this.players, this.entities, (p) => this.oilMarket.outputFactor(p));
    this.oilMarket = new OilMarket(this.players, this.entities);
    this.news = new NewsToast();
    this.placement = new PlacementSystem(this.map, this.entities);
    this.construction = new ConstructionSystem(this.players);
    this.pathfinder = new Pathfinder(this.map);
    this.paths = new PathService(this.map, this.pathfinder);
    // Label the landmasses now, behind the loading screen, not on the first order of the game (~130 ms).
    this.pathfinder.sameLandmass(0, 0, 0, 0);
    this.training = new TrainingSystem(this.players, this.entities, (player, tier, barracks) =>
      this.spawnSoldier(player, tier, barracks),
    );
    // Income is credited before construction spends it within the same tick.
    this.production = new VehicleSystem(
      this.players,
      this.entities,
      (player, kind, producer) => this.spawnVehicle(player, kind, producer),
      (producer) => this.factoryExitClear(producer),
    );
    // The sound system (and its music) already runs since the faction picker; now it hears from the camera.
    this.sound = sound;
    this.sound.setListener(() => {
      const v = this.camera.viewRect();
      return { centre: { x: v.x + v.w / 2, y: v.y + v.h / 2 }, range: Math.hypot(v.w, v.h) / 2 };
    });
    this.aircraft = new AircraftSystem(this.entities, (b) => this.airfieldGeometry(b), {
      landingSpot: (x, y, self) => this.landingSpot(x, y, self),
      unloadOne: (t) => this.unloadOne(t),
      selected: (v) => this.selection.selectedUnits.has(v.id),
      powered: (owner) => !this.players.find((p) => p.id === owner)?.powerShort,
      newTanker: (t) => this.newTanker(t),
      pay: (owner, amount) => {
        const p = this.players.find((pl) => pl.id === owner);
        if (!p || p.capitalLost || p.credits < amount) return false;
        p.credits -= amount;
        return true;
      },
    });
    this.safeZones = new SafeZoneSystem(
      this.map,
      this.pathfinder,
      this.entities,
      () => undefined, // zones open and close without announcements
    );
    this.combat = new CombatSystem(this.entities, this.pathfinder, {
      onFire: (s, t, w, impact) => this.onFire(s, t, w, impact),
      onBunkerFire: (b, t) => this.onBunkerFire(b, t),
      onDeath: (e, killer) => this.onDeath(e, killer),
      onSpare: (nation, fugitive) => this.payMercyBonus(nation, fugitive),
      safeAt: (x, y) => this.safeZones.isSafe(x, y),
      shielded: (t) => t instanceof Building && this.isShielded(t),
    });
    this.ai = new AISystem(
      this.players.filter((p) => !p.isHuman),
      this,
    );
    this.systems = [
      new PowerSystem(this.players, this.entities, this.oilMarket),
      this.economy,
      this.oilMarket,
      new TaxSystem(this.players, this.entities, this.oilMarket, (player, _city, amount) => {
        if (player.isHuman) this.sidebar.notify(`Happy City taxes: +${amount} ${CURRENCY}.`, 3);
      }),
      this.construction,
      this.training,
      this.production,
      this.aircraft,
      this.safeZones,
      this.combat,
      ...(demo ? [] : [this.ai]),
      // DEMO: finances are switched off — the budget and oil stock never run down, so nothing waits for money.
      ...(demo
        ? [
            {
              update: () => {
                const p = this.humanPlayer;
                p.credits = DEMO_CREDITS;
                p.oil = Math.max(p.oil, DEMO_CREDITS);
                p.debt = 0;
              },
            },
          ]
        : []),
    ];

    // UI.
    const human = this.humanPlayer;
    this.sidebar = new Sidebar(dom.sidebar, human, BUILD_OPTIONS, this.training.optionsFor(human), this.production.optionsFor(human), {
      onBuild: (option) => this.onBuildClick(option),
      onCancel: () => this.onBuildCancel(),
      preview: (option) => this.sprites.get(option.spriteKey(human.faction)).canvas,
      onTrain: (option) => this.onTrainClick(option.tier),
      onTrainCancel: (option) => this.onTrainCancel(option.tier),
      trainPreview: (option) => soldierPortrait(human.faction, option.tier),
      onAlert: (at) => {
        if (!this.paused) this.camera.centerOn(at.x, at.y);
      },
      onSellOil: () => this.sellOil(),
      onToggleAutoSell: () => {
        this.autoSellOil = !this.autoSellOil;
        this.sidebar.notify(this.autoSellOil ? 'Auto sell ON: oil is offered to the Global Financial Center whenever a sale is allowed.' : 'Auto sell OFF.', 3);
        this.sidebarTimer = SIDEBAR_REFRESH;
      },
      onLoan: () => this.takeLoan(),
      onOilPolicy: (policy) => this.setOilPolicy(policy),
      onUnload: () => this.unloadSelectedTransport(),
      onVehicle: (option) => this.onVehicleClick(option.kind),
      onVehicleCancel: (option) => this.onVehicleCancel(option.kind),
      vehiclePreview: (option) => vehiclePortrait(human.faction, option.kind),
    });
    this.minimap = new Minimap(
      this.sidebar.minimapCanvas,
      this.terrain,
      this.camera,
      (p) => this.bus.emit('camera:focus', p),
      (p) => this.minimapOrder(p),
    );
    this.status = new StatusBar(dom.status, this.map);

    this.bus.on('camera:focus', (p) => {
      if (!this.paused) this.camera.centerOn(p.x, p.y);
    });
    this.bus.on('selection:changed', () => (this.sidebarTimer = SIDEBAR_REFRESH));
    new ResizeObserver(() => this.renderer.resize()).observe(dom.canvas);

    if (demo) {
      this.buildDemoBase();
      this.spawnDemoArmy();
    }
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

  /** Parts of the game whose state goes into a save, by a stable name. */
  private saveParts(): Record<string, object> {
    const parts: Record<string, object> = {
      oilMarket: this.oilMarket,
      construction: this.construction,
      training: this.training,
      production: this.production,
      combat: this.combat,
      aircraft: this.aircraft,
      safeZones: this.safeZones,
      ai: this.ai,
      economy: this.economy,
    };
    this.systems.forEach((s, i) => {
      if (!Object.values(parts).includes(s)) parts[`system${i}`] = s;
    });
    return parts;
  }

  /** Game fields never written back from a save (screen / input state). */
  private static readonly UNSAVED = ['systems', 'paths', 'paused', 'ended', 'dom', 'lastCursor', 'mouseWorld', 'ghost', 'placing', 'placingRotated', 'waypoints', 'moveMarker', 'pathPeekId', 'lastBuildingClick'];

  /**
   * Everything needed to continue this game later, as plain JSON-ready data: players, every entity, the state of
   * every system and of the game itself, and the camera. The world (terrain, territories, trees) is not saved —
   * it is rebuilt from MAP_SEED when the game is created again.
   */
  exportSave(): SaveFile {
    const codec = new SaveCodec(this.players);
    const game: Record<string, unknown> = {};
    const skipped: string[] = [];
    for (const [k, v] of Object.entries(codec.snapshotSafe(this, Game.UNSAVED, skipped))) game[k] = v;
    const systems: Record<string, Record<string, unknown>> = {};
    for (const [name, part] of Object.entries(this.saveParts())) systems[name] = codec.snapshotSafe(part, [], skipped);
    if (skipped.length > 0) console.warn('Save: fields left out', skipped);
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      gameVersion: GAME_VERSION,
      savedAt: new Date().toISOString(),
      faction: this.humanPlayer.faction as FactionId,
      nextEntityId: peekNextEntityId(),
      players: this.players.map((p) => codec.encodePlayer(p)),
      entities: [...this.entities.all()].map((e) => codec.encodeEntity(e)),
      systems,
      game,
      camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom },
    };
  }

  /** Replaces the freshly generated game with a saved one (same nation, same world). */
  importSave(save: SaveFile): void {
    migrateSave(save); // checks the format and upgrades an older save to the current one
    const codec = new SaveCodec(this.players);
    // Clear the new game's starting world: its structures leave the map, every entity goes.
    for (const b of this.entities.buildings()) this.map.occupy(b.x, b.y, b.w, b.d, null);
    for (const e of [...this.entities.all()]) this.entities.remove(e.id);
    // Entities: shells first (so references between them resolve), then their fields.
    // Anything this version no longer has (a removed kind of unit) is left out.
    const shells = save.entities.flatMap((s) => {
      const e = codec.createShell(s);
      return e ? [[e, s] as const] : [];
    });
    for (const [e, s] of shells) codec.fillEntity(e, s);
    for (const [e] of shells) this.entities.add(e);
    for (const b of this.entities.buildings()) if (b.alive) this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    setNextEntityId(Math.max(save.nextEntityId, ...save.entities.map((s) => (s.data.id as number) + 1)));
    Unit.insideVersion++;
    for (const p of save.players) codec.restorePlayer(p);
    const parts = this.saveParts();
    for (const [name, data] of Object.entries(save.systems)) {
      const part = parts[name];
      if (part) codec.restore(part, data);
    }
    codec.restore(this, save.game);
    this.dropRemovedOrders();
    // Visual effects are not saved, except ticking charges, which draw their own.
    this.effects.list.length = 0;
    for (const c of this.charges) this.effects.add(c.fx);
    this.selection.selectUnits([]);
    this.camera.x = save.camera.x;
    this.camera.y = save.camera.y;
    this.camera.setZoom(save.camera.zoom);
    this.sidebarTimer = SIDEBAR_REFRESH;
    this.sidebar.notify('Game loaded.', 3);
  }

  /**
   * After loading an older save: orders for things this version no longer sells are dropped (what was paid for them is
   * refunded), so every queue only holds what the shop offers today. New structures and units are on sale as usual.
   */
  private dropRemovedOrders(): void {
    for (const p of this.players) {
      const slot = this.construction.slot(p);
      if (slot.state !== 'idle' && (!slot.option || !BUILD_OPTIONS.includes(slot.option))) {
        p.credits += Math.floor(slot.paid);
        Object.assign(slot, { option: null, state: 'idle', progress: 0, paid: 0 });
      }
      const vq = this.production.queue(p);
      const kinds = new Set(this.production.optionsFor(p).map((o) => o.kind));
      if (vq.items[0] !== undefined && !kinds.has(vq.items[0])) {
        p.credits += Math.floor(vq.paid);
        vq.paid = 0;
        vq.progress = 0;
      }
      vq.items = vq.items.filter((k) => kinds.has(k));
      if (vq.items.length === 0) vq.state = 'idle';
      const tq = this.training.queue(p);
      const tiers = new Set(this.training.optionsFor(p).map((o) => o.tier));
      if (tq.items[0] !== undefined && !tiers.has(tq.items[0])) {
        p.credits += Math.floor(tq.paid);
        tq.paid = 0;
        tq.progress = 0;
      }
      tq.items = tq.items.filter((t) => tiers.has(t));
      if (tq.items.length === 0) tq.state = 'idle';
    }
  }

  /** Pause menu → Save: downloads the save as a JSON file. */
  private downloadSave(): void {
    try {
      const save = this.exportSave();
      const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = save.savedAt.slice(0, 16).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `black-area-${save.faction}-${stamp}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.sidebar.notify('Game saved to a file.', 3);
    } catch (err) {
      console.error(err);
      this.sidebar.notify(`Could not save: ${err instanceof Error ? err.message : String(err)}`, 6);
    }
  }

  stop(): void {
    this.loop.stop();
    this.input.dispose();
  }

  // ------------------------------------------------------------------ API used by the AI (see AIHost)

  /** Puts the finished structure of `player`'s queue down at (x, y); false if the spot is illegal. */
  /** Route being plotted in waypoint mode, starting at the selection's centre (null when not plotting). */
  private waypointPlan(): WorldPoint[] | null {
    if (!this.waypoints) return null;
    const units = this.selection.selectedUnitList();
    if (units.length === 0) return null;
    const cx = units.reduce((s, u) => s + u.px, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.py, 0) / units.length;
    return [{ x: cx, y: cy }, ...this.waypoints];
  }

  /** DEMO: the player starts with one of every production / support structure already standing around the capital. */
  private buildDemoBase(): void {
    const me = this.humanPlayer;
    const capital = this.landmarks.find((b) => b.owner === me.id && b.spec.type === 'capital');
    if (!capital) return;
    const cx = capital.x + Math.floor(capital.w / 2);
    const cy = capital.y + Math.floor(capital.d / 2);
    const ids = ['powerPlant', 'powerPlant', 'barracks', 'warFactory', 'hospital', 'airfield', 'techCenter'];
    for (const id of ids) {
      const option = BUILD_OPTIONS.find((o) => o.id === id);
      if (!option) continue;
      const { w, d } = option.footprint;
      // Nearest free spot on a growing ring around the capital.
      let spot: { x: number; y: number } | null = null;
      for (let r = 2; r <= 40 && !spot; r++) {
        for (let dy = -r; dy <= r && !spot; dy++) {
          for (let dx = -r; dx <= r && !spot; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = cx + dx - Math.floor(w / 2);
            const y = cy + dy - Math.floor(d / 2);
            if (this.placement.check({ owner: me.id, x, y, w, d }).ok) spot = { x, y };
          }
        }
      }
      if (!spot) continue;
      const b = this.entities.add(option.create(me.id, me.faction, spot.x, spot.y));
      this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    }
  }

  /** DEMO: DEMO_UNITS_EACH of every soldier, vehicle and aircraft the nation has, ready at their buildings. */
  private spawnDemoArmy(): void {
    const me = this.humanPlayer;
    const barracks = this.production.producerOf(me, 'barracks');
    for (let i = 0; i < DEMO_UNITS_EACH; i++) {
      if (barracks) for (const o of this.training.optionsFor(me)) this.spawnSoldier(me, o.tier, barracks);
      for (const o of this.production.optionsFor(me)) {
        const producer = this.production.producerOf(me, o.requires);
        if (producer) this.spawnVehicle(me, o.kind, producer);
      }
    }
  }

  placeReady(player: PlayerState, x: number, y: number): boolean {
    const slot = this.construction.slot(player);
    const option = slot.option;
    if (!option || slot.state !== 'ready') return false;
    const { w, d } = option.footprint;
    if (!this.placement.check({ owner: player.id, x, y, w, d, unclaimedOnly: option.id === 'alliedBuilding' }).ok) return false;
    if (!this.construction.takeReady(player)) return false;
    const b = this.entities.add(option.create(player.id, player.faction, x, y));
    b.placedAt = this.time;
    this.map.occupy(b.x, b.y, b.w, b.d, b.id);
    return true;
  }

  /** Allies the nation leads: its Allied Buildings standing, plus one under construction. */
  alliesOf(player: PlayerState): number {
    const built = this.entities.buildings().filter((b) => b.owner === player.id && b.alive && b.spec.type === 'alliedBuilding').length;
    return built + (this.construction.slot(player).option?.id === 'alliedBuilding' ? 1 : 0);
  }

  /**
   * A Squatters team plants its nation's flag on the unclaimed land it stands on (or a free cell right next to it): the
   * flag becomes one of the nation's structures and the team is used up. Returns null on success, else why not.
   */
  /**
   * Can a flag stand on cell (x, y)? Open ground only: no rock, trees, water or ice, no structure on it and no other
   * soldier or vehicle standing there (`team`, the Squatters planting it, does not count).
   */
  private flagGround(x: number, y: number, team: Unit): boolean {
    const t = this.map.typeAt(x, y);
    if (!t || t === 'water' || t === 'snow' || t === 'rock' || this.map.hasTrees(x, y) || this.map.occupantAt(x, y) !== null) return false;
    const x0 = x * CELL_SIZE;
    const y0 = y * CELL_SIZE;
    return !this.entities
      .fieldMovers()
      .some((m) => m !== team && m.alive && !m.flies && m.insideId === null && m.px > x0 && m.px < x0 + CELL_SIZE && m.py > y0 && m.py < y0 + CELL_SIZE);
  }

  /** My selected Squatters teams standing still: they show "Double-click / F: plant flag" above their heads. */
  private flagHints(): ReadonlySet<number> {
    const ids = new Set<number>();
    for (const id of this.selection.selectedUnits) {
      const u = this.entities.get(id);
      if (u instanceof Infantry && u.isSquatters && u.alive && u.owner === this.humanPlayer.id && u.insideId === null && !u.moving) ids.add(u.id);
    }
    return ids;
  }

  /** F key: every selected Squatters team of mine plants its flag where it stands. */
  private plantSelectedFlags(): void {
    const teams = this.selection.selectedUnitList().filter((u): u is Infantry => u instanceof Infantry && u.isSquatters && u.owner === this.humanPlayer.id);
    if (teams.length === 0) return;
    let planted = 0;
    let why = '';
    for (const t of teams) {
      const r = this.plantFlag(t);
      if (r === null) planted++;
      else why = r;
    }
    this.sidebar.notify(planted > 0 ? 'Flag planted — the Squatters have done their duty. This land is claimed: raise an Allied Building beside it.' : `Cannot plant the flag: ${why}.`, 4);
    if (planted > 0) {
      this.bus.emit('selection:changed', { entityId: null });
      this.sidebarTimer = SIDEBAR_REFRESH;
    }
  }

  plantFlag(u: Infantry): string | null {
    if (!u.alive || !u.isSquatters) return 'not Squatters';
    const here = this.map.cellAt(u.px, u.py);
    if (!here) return 'outside the map';
    // The flag goes up on the nearest unit cell (from the team) that is open ground, on any land (own, enemy or
    // unclaimed); the team is used up.
    let spot: { x: number; y: number } | null = null;
    let best = Infinity;
    for (let r = 0; r <= FLAG_SEARCH_CELLS && !spot; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = here.x + dx;
          const y = here.y + dy;
          if (!this.flagGround(x, y, u)) continue;
          const d = Math.hypot((x + 0.5) * CELL_SIZE - u.px, (y + 0.5) * CELL_SIZE - u.py);
          if (d < best) {
            best = d;
            spot = { x, y };
          }
        }
      }
    }
    if (!spot) return `no open ground within ${FLAG_SEARCH_CELLS} cells (rock, trees, water, structures or units everywhere)`;
    const player = this.players.find((p) => p.id === u.owner);
    if (!player) return 'no nation';
    this.entities.remove(u.id);
    this.selection.selectedUnits.delete(u.id);
    const flag = this.entities.add(new Flagpole(player.id, player.faction, { x: (spot.x + 0.5) * CELL_SIZE, y: (spot.y + 0.5) * CELL_SIZE }));
    flag.placedAt = this.time;
    this.map.occupy(flag.x, flag.y, flag.w, flag.d, flag.id);
    return null;
  }

  /** The player's Allied Buildings, then its claim flags on new land that have no Allied Building yet (Allies tab). */
  private alliesInfo(): AllyInfo[] {
    const me = this.humanPlayer.id;
    const mine = this.entities.buildings().filter((b) => b.owner === me && b.alive);
    const allied = mine.filter((b) => b.spec.type === 'alliedBuilding');
    const claims = mine.filter(
      (b) => b.spec.type === 'flagpole' && isClaimable(this.map, b.x, b.y) && !allied.some((a) => Math.hypot(a.x - b.x, a.y - b.y) < 14),
    );
    return [...allied, ...claims].map((b) => {
      const at = b.centerWorld();
      return {
        id: b.id,
        built: b.spec.type === 'alliedBuilding',
        place: formatGeo(worldToGeo(at)),
        at,
        hp: b.hp,
        maxHp: b.maxHp,
        underAttack: this.time - b.lastAttackedAt < ALLY_ALERT_SECONDS,
      };
    });
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
      u.retreating = false;
      u.attackTarget = target.id;
    }
  }

  /** Units walk to `target` and fight whatever they meet on the way. */
  /** Falls back to `target` without stopping to fight: enemies may not chase the retreating units. */
  orderRetreat(units: readonly Unit[], target: WorldPoint): void {
    const stranded = this.strandedFrom(units, target);
    const walkers = units.filter((u) => !stranded.includes(u));
    if (walkers.length > 0) this.orderMove(target, [...walkers], false);
    this.markRetreat(walkers);
    if (stranded.length > 0) this.sendToSafeZone(stranded);
  }

  /** These units fall back as one group (one mercy bonus for the whole group). */
  private markRetreat(units: readonly Unit[]): void {
    const group = this.nextRetreatGroup++;
    for (const u of units) {
      u.retreating = true;
      u.retreatGroup = group;
      u.sparedBy.clear();
    }
  }

  /** Ground units that cannot walk to `to` (another landmass) and cannot swim there: they must leave by air. */
  private strandedFrom(units: readonly Unit[], to: WorldPoint): Unit[] {
    const goal = this.map.cellAt(to.x, to.y);
    if (!goal) return [];
    const cell = this.pathfinder.nearestPassable(goal.x, goal.y, 10);
    if (!cell) return [];
    return units.filter(
      (u) => !u.aircraft && !u.swims && !this.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y),
    );
  }

  /**
   * Units stranded on a foreign land fall back into a green safe zone that the Global Financial Center opens near
   * them (within reach of the enemy capital they fought near). Nobody may attack inside it; transports fly them home.
   */
  private sendToSafeZone(units: readonly Unit[]): void {
    const first = units[0];
    if (!first) return;
    const cx = units.reduce((s, u) => s + u.px, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.py, 0) / units.length;
    let enemyCapital: WorldPoint | null = null;
    let best = Infinity;
    for (const b of this.entities.buildings()) {
      if (!b.alive || b.spec.type !== 'capital' || b.owner === first.owner || b.owner === NEUTRAL_OWNER) continue;
      const c = b.centerWorld();
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < best) {
        best = d;
        enemyCapital = c;
      }
    }
    const opened = this.safeZones.open(first.owner, { x: cx, y: cy }, enemyCapital);
    if (!opened) return; // no room for a zone: the units hold their ground
    const { zone } = opened;
    this.orderMove(this.safeZones.center(zone), [...units], false);
    this.markRetreat(units);
    for (const u of units) zone.expected.add(u.id);
  }

  /** The nation's open safe zones (AI evacuation). */
  safeZonesOf(p: PlayerState): SafeZone[] {
    return this.safeZones.zonesOf(p.id);
  }

  /**
   * A click on an own airfield or within AIRFIELD_CLICK_MARGIN cells of it is no reason to take off: aircraft
   * standing on the ground stay put, aircraft in the air come in to land there. Only a click farther out (from the
   * margin + 1 cells on) sends them flying. Returns the units the order still applies to.
   */
  private keepAircraftAtAirfield(units: readonly Unit[], world: WorldPoint): Unit[] {
    const cell = this.map.cellAt(world.x, world.y);
    if (!cell || !units.some((u) => u.aircraft)) return [...units];
    const m = AIRFIELD_CLICK_MARGIN;
    const near = (owner: number): Building | undefined =>
      this.entities.buildings().find(
        (b) => b.alive && b.owner === owner && b.spec.type === 'airfield' && cell.x >= b.x - m && cell.x < b.x + b.w + m && cell.y >= b.y - m && cell.y < b.y + b.d + m,
      );
    return units.filter((u) => {
      if (!(u instanceof Vehicle) || !u.aircraft) return true;
      const field = near(u.owner);
      if (!field) return true;
      if (!u.flies) return false; // on the ground at (or next to) the airfield: no take-off
      this.aircraft.land(u, field);
      return false;
    });
  }

  orderAttackMove(units: readonly Unit[], target: WorldPoint): void {
    units = this.keepAircraftAtAirfield(units, target);
    const spacing = Math.max(UNIT_SPACING * 1.15, Math.max(0, ...units.map((u) => u.radius)) * 2.1);
    units.forEach((u, k) => {
      u.parade = null;
      u.task = null;
      if (u instanceof Infantry) u.charge = null;
      u.attackTarget = null;
      u.retreating = false;
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
      // A walker cannot reach another landmass: skip the A* search (it would scan the whole map and find nothing).
      if (goal && !u.swims && !this.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), goal.x, goal.y)) {
        u.attackMove = null;
        return;
      }
      if (goal) u.follow(this.paths.find({ x: u.px, y: u.py }, goal, u.swims));
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
      this.effects.add({ kind: 'flash', ...this.fx(killer.px, killer.py, 3 + this.liftOf(killer)), age: 0, ttl: 0.4, size: 3 });
    }
  }

  /** Tanks and armoured vehicles that drive over enemy soldiers kill them (and get the credit). */
  private crushInfantry(): void {
    const walkers = this.entities.fieldUnits();
    if (walkers.length === 0) return;
    for (const v of this.entities.vehicles()) {
      if (!v.alive || !v.visible || v.aircraft || !v.moving || (v.type !== 'tank' && v.type !== 'ifv') || v.owner === NEUTRAL_OWNER) continue;
      for (const u of walkers) {
        if (!u.alive || u.owner === v.owner || u.owner === NEUTRAL_OWNER) continue;
        // Squared distances: no square root per tank × soldier pair.
        const dx = u.px - v.px;
        const dy = u.py - v.py;
        const reach = CRUSH_RADIUS + u.radius;
        if (dx * dx + dy * dy > reach * reach) continue;
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

  /**
   * RA2 unloading: the next passenger jumps out of the transport onto a free cell beside it (a cell nobody stands on,
   * never water or a building). False when nobody could get out: no room around it.
   */
  private unloadOne(t: Vehicle): boolean {
    const u = t.cargo[0];
    const here = this.map.cellAt(t.px, t.py);
    if (!u || !here) return false;
    const taken = new Set<number>([this.map.index(here.x, here.y)]);
    for (const o of this.entities.fieldMovers()) {
      if (o === t || o.flies || Math.hypot(o.px - t.px, o.py - t.py) > CELL_SIZE * 14) continue;
      const c = this.map.cellAt(o.px, o.py);
      if (c) taken.add(this.map.index(c.x, c.y));
    }
    const cell = this.pathfinder.nearestPassable(here.x, here.y, 12, taken, u.swims) ?? this.pathfinder.nearestPassable(here.x, here.y, 12, undefined, u.swims);
    if (!cell) {
      if (t.owner === this.humanPlayer.id) this.sidebar.notify(`No room around the ${t.name} to unload.`);
      return false;
    }
    u.px = (cell.x + 0.5) * CELL_SIZE;
    u.py = (cell.y + 0.5) * CELL_SIZE;
    u.x = cell.x + 0.5;
    u.y = cell.y + 0.5;
    u.insideId = null;
    u.boardTarget = null;
    u.stop();
    if (u instanceof Infantry && u.isSquatters) u.airlifted = true;
    t.cargo.shift();
    this.hatch(u.px, u.py);
    if (t.cargo.length === 0 && t.owner === this.humanPlayer.id) this.sidebar.notify(`Everyone is out of the ${t.name}.`);
    return true;
  }

  /** AI: plain move order for `units` (convoy trucks). */
  orderMoveUnits(units: readonly Unit[], target: WorldPoint): void {
    this.orderMove(target, [...units], false);
  }

  /** AI: a truck lets its riders out where it stands. */
  unloadTruck(t: Vehicle): void {
    if (!t.isTruck || t.cargo.length === 0) return;
    t.stop();
    t.ejecting = true;
    t.ejectClock = 0;
  }

  /** Trucks told to unload (U): they stand still and let their riders out one by one (a tank rolls off the bed). */
  private processTruckUnloading(dt: number): void {
    for (const t of this.entities.vehicles()) {
      if (!t.isTruck || !t.ejecting) continue;
      if (!t.alive || t.cargo.length === 0) {
        t.ejecting = false;
        continue;
      }
      if (t.moving) t.stop();
      t.ejectClock -= dt;
      if (t.ejectClock > 0) continue;
      t.ejectClock = TRUCK_EJECT_STEP;
      if (!this.unloadOne(t) || t.cargo.length === 0) t.ejecting = false;
    }
  }

  /** Little flash and hatch clunk where a unit climbs into or jumps out of a transport. */
  private hatch(x: number, y: number): void {
    this.effects.add({ kind: 'flash', ...this.fx(x, y, 2), age: 0, ttl: 0.25, size: 1.6 });
    this.sound.play('board', { x, y });
  }

  /**
   * U key / Unload button (RA2 Deploy): every selected transport with passengers lets them out one by one — on the
   * spot when it stands on the ground, otherwise it first sets down on the nearest solid ground below it.
   */
  private unloadSelectedTransport(): void {
    const transports = this.selection.selectedUnitList().filter((u): u is Vehicle => u instanceof Vehicle && u.isCarrier);
    const loaded = transports.filter((t) => t.cargo.length > 0);
    if (loaded.length === 0) {
      if (transports.length > 0) this.sidebar.notify('The transport is empty.');
      return;
    }
    this.unloadCarriers(loaded);
  }

  /** Lets the riders of these carriers out: a truck where it stands, an aircraft on the ground (setting down first). */
  private unloadCarriers(loaded: readonly Vehicle[]): void {
    for (const t of loaded) {
      if (t.isTruck) {
        t.stop();
        t.ejecting = true;
        t.ejectClock = 0;
        continue;
      }
      const r = this.aircraft.requestUnload(t);
      if (r === 'noSpot') this.sidebar.notify(`The ${t.name} cannot land here (open water) — fly it over land first.`);
      else if (r === 'busy') this.sidebar.notify(`The ${t.name} is taking off or landing — unload in a moment.`);
    }
  }

  /** The first selected transport of mine (sidebar transport panel), or null. */
  private selectedTransport(): Vehicle | null {
    return this.selection.selectedUnitList().find((u): u is Vehicle => u instanceof Vehicle && u.isCarrier && u.owner === this.humanPlayer.id) ?? null;
  }

  /** Sidebar Transport panel for the first selected transport of mine. */
  private transportInfo(): TransportInfo | null {
    const t = this.selectedTransport();
    if (!t) return null;
    return {
      name: t.name,
      soldiers: t.soldiersAboard,
      soldierCapacity: t.soldierCapacity,
      vehicles: t.vehiclesAboard,
      vehicleCapacity: t.vehicleCapacity,
      incoming: t.incoming,
      state: t.carrierState,
    };
  }

  /** Can any of the selected units climb into transport `t` right now (RA2 Enter cursor)? */
  private canBoardSelected(t: Vehicle): boolean {
    if (!t.isCarrier || t.owner !== this.humanPlayer.id || this.selection.selectedUnits.has(t.id)) return false;
    const usable = t.boardable || t.flight === 'airborne' || t.flight === 'approach' || (t.flight === 'unloading' && t.pickup);
    if (!usable) return false;
    return this.selection.selectedUnitList().some((u) => u !== t && t.accepts(u) && (u instanceof Vehicle ? t.fitsWith(0, 1) : t.fitsWith(1, 0)));
  }

  /**
   * RA2 loading: the riders walk up to the transport and climb in one by one as they reach it. A transport on the
   * ground takes them where it stands; one in the air first sets down on solid ground below it. Only as many as fit
   * are sent (counting the ones already on their way); the others stay put.
   */
  orderBoard(t: Vehicle, riders: Unit[]): boolean {
    if (!t.isCarrier || !t.alive) return false;
    if (!t.isTruck && (t.flight === 'airborne' || t.flight === 'approach') && !this.aircraft.setDownForPickup(t)) {
      if (t.owner === this.humanPlayer.id) this.sidebar.notify(`The ${t.name} cannot land here (open water) to take anyone aboard.`);
      return true;
    }
    const grounded = t.boardable || (t.flight === 'unloading' && t.pickup);
    if (!grounded) return false;
    if (t.isTruck) t.stop(); // a truck waits where it is for its riders
    const spot = t.flight === 'unloading' && t.dropSpot ? t.dropSpot : { x: t.px, y: t.py };
    const here = this.map.cellAt(spot.x, spot.y);
    if (!here) return false;
    // Seats already promised to units walking up.
    let soldiers = 0;
    let vehicles = 0;
    for (const o of this.entities.fieldMovers()) {
      if (o.boardTarget !== t.id || riders.includes(o)) continue;
      if (o instanceof Vehicle) vehicles++;
      else soldiers++;
    }
    let sent = 0;
    let left = 0;
    for (const u of riders) {
      if (u === t || !t.accepts(u)) continue;
      const vehicle = u instanceof Vehicle;
      if (!t.fitsWith(soldiers + (vehicle ? 0 : 1), vehicles + (vehicle ? 1 : 0))) {
        left++;
        continue;
      }
      const cell = this.pathfinder.nearestPassable(here.x, here.y, 16, undefined, u.swims);
      if (!cell || (!u.swims && !this.pathfinder.sameLandmass(Math.floor(u.px / CELL_SIZE), Math.floor(u.py / CELL_SIZE), cell.x, cell.y))) {
        left++;
        continue;
      }
      if (vehicle) vehicles++;
      else soldiers++;
      u.parade = null;
      u.task = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.boardTarget = t.id;
      if (u instanceof Vehicle) {
        u.repairTargetId = null;
        u.seekRepairId = null;
      }
      u.follow(this.paths.find({ x: u.px, y: u.py }, cell, u.swims));
      sent++;
    }
    if (t.owner === this.humanPlayer.id) {
      if (sent === 0) this.sidebar.notify(t.full ? `The ${t.name} is full.` : `The ${t.name} cannot take them (no room, or they cannot reach it).`);
      else if (left > 0) this.sidebar.notify(`${sent} heading for the ${t.name}; ${left} cannot fit or reach it.`);
      if (sent > 0) this.moveMarker = { x: spot.x, y: spot.y, at: this.time };
    }
    return true;
  }

  /**
   * Units walking to a transport climb aboard one by one as they reach it (it must stand on the ground). Also
   * recounts, per transport, how many are still on their way (its "loading" state).
   */
  private processBoarding(): void {
    for (const v of this.entities.vehicles()) v.incoming = 0;
    for (const u of this.entities.fieldMovers()) {
      if (u.boardTarget === null) continue;
      const t = this.entities.get(u.boardTarget);
      const settingDown = t instanceof Vehicle && t.flight === 'unloading' && t.pickup;
      if (!(t instanceof Vehicle) || !t.alive || (!t.boardable && !settingDown)) {
        u.boardTarget = null;
        continue;
      }
      t.incoming++;
      if (settingDown) continue; // wait beside the landing spot until it touches down
      // Boarding needs contact: right up to a transport that stands in the field, or to the wall of the airfield.
      const home = t.homeId === null ? undefined : this.entities.get(t.homeId);
      const reach = !t.isTruck && t.flight === 'parked' && home instanceof Building ? distanceTo(u.px, u.py, home) : Math.hypot(u.px - t.px, u.py - t.py) - t.radius * 0.5;
      if (reach > CELL_SIZE * 1.3) {
        if (!u.moving) u.boardTarget = null; // could not get close enough
        continue;
      }
      u.boardTarget = null;
      t.incoming--;
      if (!t.canLoad(u)) {
        if (u.owner === this.humanPlayer.id) this.sidebar.notify(`The ${t.name} is full.`);
        continue;
      }
      t.cargo.push(u);
      u.insideId = t.id;
      u.stop();
      this.selection.selectedUnits.delete(u.id);
      this.hatch(t.px, t.py);
    }
  }

  /**
   * Repair vehicles among `units` (never `target` itself) are sent to mend `target`, a friendly ground vehicle.
   * False when none of them is a repair vehicle, or the target is not something they repair (aircraft).
   */
  orderMend(target: Vehicle, units: readonly Unit[]): boolean {
    if (!target.alive || target.aircraft) return false;
    const menders = units.filter((u): u is Vehicle => u instanceof Vehicle && u.isRepair && u !== target && u.owner === target.owner);
    if (menders.length === 0) return false;
    if (target.hp >= target.maxHp) {
      if (target.owner === this.humanPlayer.id) this.sidebar.notify(`The ${target.name} needs no repair.`);
      return true;
    }
    for (const v of menders) {
      v.repairTargetId = target.id;
      v.mendClock = 0;
      v.mendRepathAt = -Infinity;
      v.boardTarget = null;
      v.attackTarget = null;
      v.attackMove = null;
      v.task = null;
      v.parade = null;
      v.orderFlash = { kind: 'move', at: this.time, target };
    }
    if (target.owner === this.humanPlayer.id) this.moveMarker = { x: target.px, y: target.py, at: this.time };
    return true;
  }

  /**
   * Click (left or right) on one of my vehicles with units selected — the two repair orders:
   *  - a damaged ground vehicle (not selected), with repair vehicles selected: they drive up and mend it;
   *  - a repair vehicle (not selected), with damaged ground vehicles selected: those drive to it and are mended there.
   * Anything else returns false (the click selects / moves as usual).
   */
  private orderRepairClick(unit: Vehicle, selected: readonly Unit[]): boolean {
    if (!unit.alive || unit.aircraft || this.selection.selectedUnits.has(unit.id)) return false;
    const damaged = (v: Unit): v is Vehicle => v instanceof Vehicle && v.alive && !v.aircraft && v.hp < v.maxHp && v.owner === unit.owner;
    if (damaged(unit) && selected.some((u) => u instanceof Vehicle && u.isRepair) && this.orderMend(unit, selected)) {
      const n = selected.filter((u) => u instanceof Vehicle && u.isRepair).length;
      this.sidebar.notify(n === 1 ? `Repairing the ${unit.name}.` : `${n} repair vehicles sent to the ${unit.name}.`);
      return true;
    }
    if (!unit.isRepair) return false;
    const patients = selected.filter((u): u is Vehicle => damaged(u) && u !== unit);
    if (patients.length === 0) return false;
    for (const v of patients) {
      v.seekRepairId = unit.id;
      v.patientClock = 0;
      v.seekRepathAt = -Infinity;
      v.repairTargetId = null;
      v.boardTarget = null;
      v.attackTarget = null;
      v.attackMove = null;
      v.task = null;
      v.parade = null;
      v.orderFlash = { kind: 'move', at: this.time, target: unit };
    }
    this.sidebar.notify(`${patients.length === 1 ? `The ${patients[0]?.name ?? 'vehicle'} is` : `${patients.length} vehicles are`} heading to the ${unit.name} for repair.`);
    this.moveMarker = { x: unit.px, y: unit.py, at: this.time };
    return true;
  }

  /**
   * Damaged vehicles sent to a repair vehicle: each drives up to it (re-planning if it moves) and, while within
   * REPAIR_VEHICLE_RANGE_CELLS of its hull, gets REPAIR_VEHICLE_HEAL_SHARE of its max HP every REPAIR_VEHICLE_INTERVAL
   * seconds. Every patient in range is mended at once. Ends when full, or the repair vehicle is gone / unreachable.
   */
  private processPatients(dt: number): void {
    const reach = REPAIR_VEHICLE_RANGE_CELLS * CELL_SIZE;
    for (const v of this.entities.vehicles()) {
      if (v.seekRepairId === null) continue;
      const r = this.entities.get(v.seekRepairId);
      if (!v.alive || v.insideId !== null || v.hp >= v.maxHp || !(r instanceof Vehicle) || !r.alive || !r.isRepair || r.insideId !== null || r.owner !== v.owner) {
        v.seekRepairId = null;
        if (v.alive && v.insideId === null && v.moving) v.stop();
        continue;
      }
      const gap = Math.hypot(r.px - v.px, r.py - v.py) - r.radius - v.radius;
      if (gap > reach) {
        v.patientClock = 0;
        const drifted = !v.destination || Math.hypot(v.destination.x - r.px, v.destination.y - r.py) > CELL_SIZE;
        if (this.time - v.seekRepathAt < REPAIR_VEHICLE_REPATH || (v.moving && !drifted)) continue;
        v.seekRepathAt = this.time;
        const cell = this.pathfinder.nearestPassable(Math.floor(r.px / CELL_SIZE), Math.floor(r.py / CELL_SIZE), 6);
        const path = cell && this.pathfinder.sameLandmass(Math.floor(v.px / CELL_SIZE), Math.floor(v.py / CELL_SIZE), cell.x, cell.y) ? this.paths.find({ x: v.px, y: v.py }, cell) : [];
        if (path.length === 0) {
          v.seekRepairId = null; // cannot get there
          v.stop();
          continue;
        }
        v.follow(path);
        continue;
      }
      if (v.moving) v.stop();
      r.mending = true;
      if (!r.moving) r.heading = Math.atan2(v.py - r.py, v.px - r.px);
      v.patientClock += dt;
      if (v.patientClock >= REPAIR_VEHICLE_INTERVAL) {
        v.patientClock -= REPAIR_VEHICLE_INTERVAL;
        v.hp = Math.min(v.maxHp, v.hp + v.maxHp * REPAIR_VEHICLE_HEAL_SHARE);
      }
    }
  }

  /**
   * Repair vehicles at work: each drives up to its target (following it if it drives off) and, while within
   * REPAIR_VEHICLE_RANGE_CELLS of its hull, restores REPAIR_VEHICLE_HEAL_SHARE of its max HP every
   * REPAIR_VEHICLE_INTERVAL seconds. The job ends when the target is full, dies, boards a transport or cannot be reached.
   */
  private processMends(dt: number): void {
    const reach = REPAIR_VEHICLE_RANGE_CELLS * CELL_SIZE;
    for (const v of this.entities.vehicles()) {
      v.mending = false;
      if (v.repairTargetId === null) continue;
      const t = this.entities.get(v.repairTargetId);
      if (!v.alive || v.insideId !== null || !(t instanceof Vehicle) || !t.alive || t.aircraft || t.insideId !== null || t.owner !== v.owner || t.hp >= t.maxHp) {
        v.repairTargetId = null;
        if (v.alive && v.insideId === null && v.moving) v.stop();
        continue;
      }
      const gap = Math.hypot(t.px - v.px, t.py - v.py) - t.radius - v.radius;
      if (gap > reach) {
        v.mendClock = 0;
        // Re-plan towards the target now and then (it may be driving away), or when the last route ran out.
        const drifted = !v.destination || Math.hypot(v.destination.x - t.px, v.destination.y - t.py) > CELL_SIZE;
        if (this.time - v.mendRepathAt < REPAIR_VEHICLE_REPATH || (v.moving && !drifted)) continue;
        v.mendRepathAt = this.time;
        const cell = this.pathfinder.nearestPassable(Math.floor(t.px / CELL_SIZE), Math.floor(t.py / CELL_SIZE), 6);
        const path = cell && this.pathfinder.sameLandmass(Math.floor(v.px / CELL_SIZE), Math.floor(v.py / CELL_SIZE), cell.x, cell.y) ? this.paths.find({ x: v.px, y: v.py }, cell) : [];
        if (path.length === 0) {
          v.repairTargetId = null; // cannot get there
          v.stop();
          continue;
        }
        v.follow(path);
        continue;
      }
      if (v.moving) v.stop();
      v.heading = Math.atan2(t.py - v.py, t.px - v.px);
      v.mending = true;
      v.mendClock += dt;
      if (v.mendClock >= REPAIR_VEHICLE_INTERVAL) {
        v.mendClock -= REPAIR_VEHICLE_INTERVAL;
        t.hp = Math.min(t.maxHp, t.hp + t.maxHp * REPAIR_VEHICLE_HEAL_SHARE);
      }
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
        // Update the stored point in place: no new object per unit per tick.
        const dry = this.lastDry.get(u.id);
        if (dry) {
          dry.x = u.px;
          dry.y = u.py;
        } else this.lastDry.set(u.id, { x: u.px, y: u.py });
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
    if (this.ended || this.paused) {
      this.sound.motion({ foot: 0, engines: new Map() });
      return;
    }
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
    this.paths.update();
    this.queueInCrowds();
    this.yieldAtCrossings(dt);
    this.entities.update(dt);
    this.motionSound();
    this.keepOutOfWater();
    this.crushInfantry();
    this.processBoarding();
    this.processTruckUnloading(dt);
    this.separateUnits();
    this.repathStuckUnits(dt);
    this.giveWay(dt);
    this.processTasks();
    this.processDemolition(dt);
    this.processRepairs(dt);
    this.processMends(dt);
    this.processPatients(dt);
    this.healGarrisons(dt);
    this.regenVeterans(dt);
    this.janitorTimer += dt;
    if (this.janitorTimer >= JANITOR_INTERVAL) {
      this.janitorTimer = 0;
      this.collectGarbage();
    }
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
    // The hash and its bucket arrays are reused from pass to pass and tick to tick (no garbage at 30 Hz × 6 passes).
    const grid = this.sepGrid;
    for (const list of grid.values()) {
      list.length = 0;
      this.sepPool.push(list);
    }
    grid.clear();
    const key = (cx: number, cy: number): number => cx * 100003 + cy;
    for (const u of units) {
      const k = key(Math.floor(u.px / bucket), Math.floor(u.py / bucket));
      const list = grid.get(k);
      if (list) list.push(u);
      else {
        const fresh = this.sepPool.pop() ?? [];
        fresh.push(u);
        grid.set(k, fresh);
      }
    }
    for (const a of units) {
      const bx = Math.floor(a.px / bucket);
      const by = Math.floor(a.py / bucket);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(key(bx + dx, by + dy));
          if (!cell) continue;
          for (const b of cell) {
            if (b.id <= a.id || a.flies !== b.flies) continue;
            // Vehicles and aircraft hold a little clear air between their hulls; soldiers still close up.
            const gap = a.radius + b.radius + (a instanceof Vehicle && b instanceof Vehicle ? VEHICLE_GAP : 0);
            let vx = b.px - a.px;
            let vy = b.py - a.py;
            // Cheap squared test first; the square root only for pairs that really touch.
            if (vx * vx + vy * vy >= gap * gap) continue;
            let d = Math.hypot(vx, vy);
            moved = true;
            if (d < 0.01) {
              vx = (a.id % 7) - 3 || 1;
              vy = (b.id % 5) - 2;
              d = Math.hypot(vx, vy);
            }
            // Parked / rolling aircraft never move; a unit standing still is pushed less than one walking into it.
            if (a.fixed && b.fixed) continue;
            const wa = a.fixed ? 0 : b.fixed ? 1 : a.moving && a.restLeft <= 0 ? 0.7 : 0.3; // a resting soldier holds its ground
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
  private attackFocus(): { entity: Unit | Building; strong: boolean; hover: boolean; engaged: boolean; airLock: boolean }[] {
    const me = this.humanPlayer.id;
    const selected = this.selection.selectedUnits;
    const out = new Map<number, { entity: Unit | Building; strong: boolean; hover: boolean; engaged: boolean; airLock: boolean }>();
    const mark = (e: Entity | undefined, strong: boolean, hover: boolean, by?: Unit): void => {
      if (!e || !e.alive || !(e instanceof Unit || e instanceof Building)) return;
      if (e instanceof Unit && !e.visible) return;
      // An aircraft's lock is only shown while it is selected (it still attacks its target either way).
      if (by?.aircraft && !strong) return;
      const prev = out.get(e.id);
      // An aircraft locks onto air units and structures.
      const lock = !!by?.aircraft && (e instanceof Building || e.flies);
      out.set(e.id, { entity: e, strong: strong || !!prev?.strong, hover: hover || !!prev?.hover, engaged: !!by || !!prev?.engaged, airLock: lock || !!prev?.airLock });
    };
    for (const u of this.entities.fieldMovers()) {
      if (u.owner !== me || !u.alive) continue;
      const id = u.attackTarget ?? u.combatTarget;
      if (id === null) continue;
      const target = this.entities.get(id);
      if (target && isHostile(u, target)) mark(target, selected.has(u.id), false, u);
    }
    const hoverId = this.selection.hoveredUnitId ?? this.selection.hoveredId;
    const hovered = hoverId === null ? undefined : this.entities.get(hoverId);
    if (hovered && hovered.owner !== me && this.selection.selectedUnitList().some((u) => canTarget(u, hovered))) mark(hovered, true, true);
    return [...out.values()];
  }

  /**
   * Structures the selected soldiers were sent to, drawn with the lock box while they are selected: capture yellow,
   * repair green, lease blue, enter white, a Crazy Soldier's charge red.
   */
  private taskLocks(): { entity: Building; color: string }[] {
    const colors = { capture: '#ffd23f', repair: '#3fdc4a', lease: '#4ac8ff', enter: '#f2f5f8' } as const;
    const out = new Map<number, { entity: Building; color: string }>();
    for (const u of this.selection.selectedUnitList()) {
      if (!(u instanceof Infantry)) continue;
      const id = u.task?.buildingId ?? u.charge?.targetId;
      const b = id === undefined ? undefined : this.entities.get(id);
      if (!(b instanceof Building) || !b.alive || out.has(b.id)) continue;
      out.set(b.id, { entity: b, color: u.task ? colors[u.task.type] : '#ff3b30' });
    }
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
    // RA2 Enter cursor: the selected units can climb into the transport under the mouse.
    const hoverUnit = this.selection.hoveredUnitId === null ? undefined : this.entities.get(this.selection.hoveredUnitId);
    const entering = !this.placing && hoverUnit instanceof Vehicle && this.canBoardSelected(hoverUnit);
    const cursor = this.placing || aiming ? 'crosshair' : entering ? ENTER_CURSOR : hovering ? 'pointer' : 'default';
    // Style writes only when the cursor actually changes (not every frame).
    if (cursor !== this.lastCursor) {
      this.lastCursor = cursor;
      this.dom.canvas.style.cursor = cursor;
    }

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
      safeZones: this.safeZones.zones.map((z) => ({
        x: z.x * CELL_SIZE,
        y: z.y * CELL_SIZE,
        w: SAFE_ZONE_SIZE * CELL_SIZE,
        h: SAFE_ZONE_SIZE * CELL_SIZE,
      })),
      units,
      selectedUnits: this.selection.selectedUnits,
      hoveredUnitId: this.placing ? null : this.selection.hoveredUnitId,
      moveMarker: this.moveMarker,
      pathPeekId: this.pathPeekId,
      waypointPlan: this.waypointPlan(),
      flagHints: this.flagHints(),
      focus: focus.map((f) => ({ entity: f.entity, strong: f.strong, engaged: f.engaged, airLock: f.airLock })),
      taskLocks: this.placing ? [] : this.taskLocks(),
      effects: this.effects.list,
    });
    // The radar does not need 60 updates a second: 12 are plenty and save a full redraw every other frame.
    this.minimapTimer += dt;
    if (this.minimapTimer >= 1 / 12) {
      this.minimapTimer = 0;
      this.minimap.render(buildings, units, this.humanPlayer.id, this.ownedCache.has('airfield'));
    }
    this.status.update(dt, this.mouseWorld, this.camera.zoom);

    const queue = this.construction.slot(this.humanPlayer);
    if (queue.state !== this.lastQueueState) {
      if (queue.state === 'ready') this.sidebar.notify('Construction complete — click the cameo, then place it.');
      if (queue.state === 'onHold') this.sidebar.notify(`Not enough ${CURRENCY} — construction on hold.`);
      if (queue.state === 'noPower') this.sidebar.notify('Not enough power — construction stopped. Build a Nuclear Power Plant.');
      this.lastQueueState = queue.state;
      this.sidebarTimer = SIDEBAR_REFRESH;
    }

    this.sidebarTimer += dt;
    if (this.sidebarTimer >= SIDEBAR_REFRESH) {
      const elapsed = this.sidebarTimer;
      this.sidebarTimer = 0;
      if (
        this.autoSellOil &&
        !this.humanPlayer.defeated &&
        this.oilMarket.sellable(this.humanPlayer) >= MIN_SALE_STOCK &&
        this.oilMarket.waitSeconds(this.humanPlayer) === 0
      )
        this.sellOil(true);
      const own = this.derricks.filter((d) => d.owner === this.humanPlayer.id && d.alive);
      const pumping = own.filter((d) => d.pumping).length;
      this.sidebar.update(
        {
          player: this.humanPlayer,
          oilRate: this.economy.oilRate(this.humanPlayer),
          oilPrice: this.oilMarket.price,
          previousPrice: this.oilMarket.previous,
          priceHistory: this.oilMarket.history,
          priceChangeIn: Math.ceil(this.oilMarket.secondsToChange),
          sellable: this.oilMarket.sellable(this.humanPlayer),
          salesWait: this.oilMarket.waitSeconds(this.humanPlayer),
          autoSell: this.autoSellOil,
          cartel: this.oilMarket.isCartel(this.humanPlayer),
          oilPolicy: this.oilMarket.policy,
          policyWait: this.oilMarket.policyWait(),
          loanBlocker: this.oilMarket.loanBlocker(this.humanPlayer),
          creditLine: this.oilMarket.creditLine(this.humanPlayer),
          loanSize: this.oilMarket.loanSize(this.humanPlayer),
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
          ranking: this.sidebar.wantsRanking(elapsed) ? this.ranking() : null,
          transport: this.transportInfo(),
          allies: this.alliesInfo(),
        },
        elapsed,
      );
    }
  }


  private handleInput(dt: number): void {
    const { input, camera } = this;

    // Paused: the battlefield is frozen, the camera too — only Esc (resume) gets through.
    if (this.paused) {
      for (const ev of input.drain()) if (ev.type === 'keyDown' && ev.code === 'Escape') this.handleKey(ev.code);
      input.consumePan();
      return;
    }

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
          // RA2 mouse: left button selects and gives orders; right button only deselects (units keep their orders).
          // Ctrl+Shift+right-click is still attack-move.
          if (ev.button === 'right') {
            // Right-click in waypoint mode: the selection sets off along the route, then is deselected.
            if (this.waypoints) {
              this.finishWaypoints();
              this.selection.clearAll();
            } else if (ev.ctrl && ev.shift) this.rightClick(world, true);
            else if (!this.peekPath(world)) this.selection.clearAll();
          } else if (ev.ctrl && !ev.shift) {
            // Ctrl+click on one of my structures: sell it to the Global Financial Center.
            const b = this.selection.pick(world);
            if (b && b.owner === this.humanPlayer.id) this.sellBuilding(b);
          } else this.leftClick(world, ev.shift, ev.double);
          break;
        }
        case 'wheel':
          camera.zoomAt(ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ev.x, ev.y);
          break;
        case 'keyDown':
          this.handleKey(ev.code);
          break;
        case 'boxSelect': {
          // Drag-select own soldiers (buildings are not box-selectable — RA2 rule). A shaky click while placing still places.
          if (this.placing) {
            this.tryPlace();
            break;
          }
          const a = camera.screenToIso(ev.rect.x, ev.rect.y);
          const picked = this.selection.unitsInIsoRect({ x: a.x, y: a.y, w: ev.rect.w / camera.zoom, h: ev.rect.h / camera.zoom }, this.humanPlayer.id);
          // A shaky click that swept an empty box keeps the current selection instead of dropping it.
          if (picked.length === 0 && !ev.shift) break;
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
    // Keys pan at full speed; the screen edge alone pans slower.
    const keyPan = dx !== 0 || dy !== 0;
    if (CAMERA_EDGE_SCROLL && document.hasFocus() && !input.selectionRect) {
      dx += input.edge.x;
      dy += input.edge.y;
    }
    dx = clamp(dx, -1, 1);
    dy = clamp(dy, -1, 1);
    if (dx !== 0 || dy !== 0) {
      const speed = keyPan ? CAMERA_PAN_SPEED : CAMERA_EDGE_PAN_SPEED;
      const step = (speed * dt) / camera.zoom / Math.hypot(dx, dy);
      camera.panBy(dx * step, dy * step);
    }

    const drag = input.consumePan();
    if (drag.x !== 0 || drag.y !== 0) camera.panBy(-drag.x / camera.zoom, -drag.y / camera.zoom);
  }

  /**
   * Left click: select one of my units (Shift toggles it in / out of the group; groups are only made with the
   * selection box), or a building (double-click one of mine: everyone stationed inside comes out).
   * With units selected, a click on open ground, an enemy, a transport or a building they can enter gives that order.
   * Anything else clears the selection.
   */
  private leftClick(world: WorldPoint, shift: boolean, double: boolean): void {
    const me = this.humanPlayer.id;
    const unit = this.selection.pickUnit(world);
    // Double-click on one of my selected carriers (truck or transport aircraft) with riders aboard: they get out
    // (same as the U key for that vehicle).
    if (double && !shift && unit instanceof Vehicle && unit.isCarrier && unit.owner === me && unit.cargo.length > 0 && this.selection.selectedUnits.has(unit.id)) {
      this.unloadCarriers([unit]);
      return;
    }
    // Double-click on one of my Squatters teams: it plants its flag (same as selecting it and pressing F).
    if (double && !shift && unit instanceof Infantry && unit.isSquatters && unit.owner === me) {
      this.selection.selectUnits([unit.id]);
      this.plantSelectedFlags();
      return;
    }
    if (this.waypoints) {
      if (this.selection.selectedUnits.size === 0) this.waypoints = null;
      else {
        if (this.waypoints.length < MAX_WAYPOINTS && this.map.cellAt(world.x, world.y)) this.waypoints.push(world);
        else if (this.waypoints.length >= MAX_WAYPOINTS) this.sidebar.notify(`At most ${MAX_WAYPOINTS} waypoints — press Z or right-click to go.`);
        return;
      }
    }
    const selected = this.selection.selectedUnitList();
    // RA2 default: with units selected, a left click is also an order (board / attack / enter / move).
    // A double-click on one of my units just selects that unit; anywhere else (two quick move orders in a row) it
    // is still an order, so the group is never dropped by clicking fast.
    if (selected.length > 0 && !shift && !(double && unit && unit.owner === me)) {
      // Clicking on (or right next to) one of the selected units is a move order there, not a re-selection:
      // a group, or an aircraft circling overhead, can then be sent anywhere without the click hitting itself.
      if (unit && unit.owner === me && this.selection.selectedUnits.has(unit.id)) {
        this.orderMove(world);
        return;
      }
      if (unit instanceof Vehicle && unit.isCarrier && unit.owner === me && !this.selection.selectedUnits.has(unit.id)) {
        const riders = selected.filter((u) => !u.aircraft);
        if (riders.length > 0 && this.orderBoard(unit, riders)) return;
      }
      // Repair vehicles + click on a damaged own ground vehicle, or damaged vehicles + click on an own repair vehicle.
      if (unit instanceof Vehicle && unit.owner === me && this.orderRepairClick(unit, selected)) return;
    // Units inside a safe zone may not be attacked: the order is ignored.
    if (unit && unit.owner !== me && this.safeZones.isSafe(unit.px, unit.py)) return;
    if (unit && unit.owner !== me && this.orderAttack(unit)) return;
      if (!unit) {
        const hit = this.selection.pick(world);
        if (hit && this.orderOnBuilding(hit)) return;
        if (!hit) {
          this.orderMove(world);
          return;
        }
      }
    }
    if (unit && unit.owner === me) {
      if (shift && !double) this.selection.toggleUnit(unit.id);
      else this.selection.selectUnits([unit.id]);
      return;
    }
    const hit = unit ? null : this.selection.pick(world);
    if (hit) {
      const now = performance.now();
      const dbl = this.lastBuildingClick?.id === hit.id && now - this.lastBuildingClick.at < 400;
      this.lastBuildingClick = { id: hit.id, at: now };
      if (dbl && hit.owner === me && hit.garrison.length > 0) {
        this.ejectUnits(hit, [...hit.garrison]);
        return;
      }
      // Double-click on one of my Barracks / War Factories / Airfields: new units come out of that one.
      const t = hit.spec.type;
      if (dbl && hit.owner === me && (t === 'barracks' || t === 'warFactory' || t === 'airfield')) {
        (this.humanPlayer.primaryBuilding ??= {})[t] = hit.id;
        this.sidebar.notify(`${hit.spec.name}: new units will come out here.`);
      }
      this.selection.selectedUnits.clear();
      this.selection.select(hit.id);
      return;
    }
    if (!shift) this.selection.clearAll();
  }

  /**
   * Right click (RA2): orders for the selected units — board a transport, attack an enemy, enter / repair / capture
   * a building, or move. Ctrl+Shift: attack-move (fight anything met on the way). Nothing selected: deselect.
   */
  /** Right-click on one of my moving units: a green line joins it to where it is heading (true when shown). */
  private peekPath(world: WorldPoint): boolean {
    const u = this.selection.pickUnit(world);
    if (!u || u.owner !== this.humanPlayer.id || !u.moving || !u.destination) return false;
    u.orderFlash = { kind: 'move', at: this.time, target: null };
    this.pathPeekId = u.id;
    return true;
  }

  private rightClick(world: WorldPoint, attackMove: boolean): void {
    const me = this.humanPlayer.id;
    const selected = this.selection.selectedUnitList();
    if (selected.length === 0) {
      this.selection.clearAll();
      return;
    }
    const unit = this.selection.pickUnit(world);
    if (unit && unit.owner !== me && this.orderAttack(unit)) return;
    if (attackMove) {
      this.orderHumanAttackMove(selected, world);
      return;
    }
    // Repair vehicles selected + right-click on one of my damaged ground vehicles: they drive up and mend it.
    if (unit instanceof Vehicle && unit.owner === me && (this.orderRepairClick(unit, selected) || this.orderMend(unit, selected))) return;
    // Soldiers / vehicles selected + right-click on one of my parked transports: they climb aboard.
    if (unit instanceof Vehicle && unit.isCarrier && unit.owner === me && !this.selection.selectedUnits.has(unit.id)) {
      const riders = selected.filter((u) => !u.aircraft);
      if (riders.length > 0 && this.orderBoard(unit, riders)) return;
    }
    const hit = unit ? null : this.selection.pick(world);
    if (hit && this.orderOnBuilding(hit)) return;
    // A loaded transport sent over open water has nowhere to set down: its passengers stay aboard.
    const loaded = selected.find((u): u is Vehicle => u instanceof Vehicle && u.isCarrier && u.cargo.length > 0);
    if (loaded && !this.landingSpot(world.x, world.y, loaded)) this.sidebar.notify(`The ${loaded.name} cannot land there (open water) — the passengers stay aboard.`);
    this.orderMove(world);
  }

  /** Ctrl+Shift+right-click: armed units attack-move to the spot, the unarmed ones simply go there. */
  private orderHumanAttackMove(units: readonly Unit[], world: WorldPoint): void {
    if (!this.map.cellAt(world.x, world.y)) return;
    const armed = units.filter((u) => u.weapon !== null && !(u instanceof Vehicle && u.isTransport));
    for (const u of armed) u.chasing = false;
    this.orderAttackMove(armed, world);
    for (const u of armed) u.orderFlash = { kind: 'move', at: this.time, target: null };
    const unarmed = units.filter((u) => !armed.includes(u));
    if (unarmed.length > 0) this.orderMove(world, unarmed);
    this.moveMarker = { x: world.x, y: world.y, at: this.time };
  }

  /** X key (RA2 scatter): the selected units spread out a few cells away from the middle of the group. */
  private scatterSelected(): void {
    const units = this.selection.selectedUnitList().filter((u) => !u.fixed);
    if (units.length === 0) return;
    const cx = units.reduce((s, u) => s + u.px, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.py, 0) / units.length;
    units.forEach((u, k) => {
      u.parade = null;
      u.task = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.chasing = false;
      // Away from the middle of the group; units standing right on it fan out by the golden angle.
      const away = Math.hypot(u.px - cx, u.py - cy);
      const angle = away > 0.5 ? Math.atan2(u.py - cy, u.px - cx) + (((k * 37) % 7) - 3) * 0.12 : k * 2.39996;
      const dist = SCATTER_CELLS * CELL_SIZE * (u.aircraft ? 2 : 1);
      const goal = { x: u.px + Math.cos(angle) * dist, y: u.py + Math.sin(angle) * dist };
      if (u.aircraft) {
        u.follow([goal]);
        return;
      }
      const cell = this.map.cellAt(goal.x, goal.y);
      const spot = cell ? this.pathfinder.nearestPassable(cell.x, cell.y, 3, undefined, u.swims) : null;
      if (!spot) return;
      u.follow(this.paths.find({ x: u.px, y: u.py }, spot, u.swims));
    });
  }

  /**
   * X: the selected ground units form up in parade order around where they stand — 3 × 5 blocks (3 ranks of 5)
   * squared to the screen, soldiers' blocks in front and vehicles' behind, every unit then turning to face the same
   * way (towards the viewer). Each takes a free spot of its own; aircraft are left alone.
   */
  private formUpSelected(): void {
    const units = this.selection.selectedUnitList().filter((u) => !u.fixed && !u.aircraft && u.alive);
    if (units.length === 0) return;
    const cx = units.reduce((s, u) => s + u.px, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.py, 0) / units.length;
    // Screen axes in world space: "across" runs left → right on screen, "back" runs from the front rank away from the viewer.
    const across = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const back = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    const FACE = Math.atan2(-back.y, -back.x); // everyone looks towards the viewer
    const COLS = FORMATION_COLS;
    const RANKS = FORMATION_RANKS;
    const soldiers = units.filter((u) => u instanceof Infantry);
    const vehicles = units.filter((u) => !(u instanceof Infantry));
    const soldierGap = UNIT_SPACING * 1.8;
    const vehicleGap = Math.max(...vehicles.map((v) => v.radius), 1) * 2.8;
    const ranksOf = (n: number): number => Math.ceil(n / COLS) + Math.max(0, Math.ceil(n / (COLS * RANKS)) - 1); // + one empty rank between blocks
    const soldierDepth = soldiers.length ? (ranksOf(soldiers.length) - 1) * soldierGap : 0;
    const vehicleDepth = vehicles.length ? (ranksOf(vehicles.length) - 1) * vehicleGap : 0;
    const total = soldierDepth + vehicleDepth + (soldiers.length && vehicles.length ? vehicleGap * 1.5 : 0);
    // Front rank sits half the depth towards the viewer from the group's centre.
    const front = { x: cx - (back.x * total) / 2, y: cy - (back.y * total) / 2 };
    const slotsFor = (group: Unit[], gap: number, start: number): { u: Unit; at: WorldPoint }[] => {
      // Units nearest the front fill the front ranks, left to right as they stand on screen.
      const along = (u: Unit): number => (u.px - cx) * across.x + (u.py - cy) * across.y;
      const depthOf = (u: Unit): number => (u.px - cx) * back.x + (u.py - cy) * back.y;
      const sorted = [...group].sort((a, b) => depthOf(a) - depthOf(b));
      const out: { u: Unit; at: WorldPoint }[] = [];
      for (let k = 0; k < sorted.length; k += COLS) {
        const rankIndex = k / COLS;
        const blockGap = Math.floor(rankIndex / RANKS); // an empty rank between 3 × 5 blocks
        const d = start + (rankIndex + blockGap) * gap;
        const rank = sorted.slice(k, k + COLS).sort((a, b) => along(a) - along(b));
        rank.forEach((u, c) => {
          const a = (c - (COLS - 1) / 2) * gap; // full-width ranks keep the columns lined up
          out.push({ u, at: { x: front.x + across.x * a + back.x * d, y: front.y + across.y * a + back.y * d } });
        });
      }
      return out;
    };
    const slots = [
      ...slotsFor(soldiers, soldierGap, 0),
      ...slotsFor(vehicles, vehicleGap, soldiers.length ? soldierDepth + vehicleGap * 1.5 : 0),
    ];
    const claimed: WorldPoint[] = [];
    for (const { u, at } of slots) {
      u.parade = null;
      u.task = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.chasing = false;
      if (u instanceof Infantry) u.charge = null;
      const spot = this.freeStandSpot(at, u, units, claimed);
      if (!spot) continue;
      claimed.push(spot);
      const cell = this.map.cellAt(spot.x, spot.y);
      if (!cell) continue;
      const path = this.paths.find({ x: u.px, y: u.py }, cell, u.swims);
      const last = path[path.length - 1];
      if (last) {
        last.x = spot.x;
        last.y = spot.y;
      } else path.push(spot);
      u.orderFlash = { kind: 'move', at: this.time, target: null };
      u.follow(path);
      u.faceOnArrival = FACE;
    }
    this.sidebar.notify(`Form up: ${units.length} unit${units.length === 1 ? '' : 's'} in ${COLS}-wide ranks, ${RANKS} deep.`, 2);
  }

  private handleKey(code: string): void {
    // While the pause menu is open only Esc (resume) works.
    if (this.paused && code !== 'Escape') return;
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
      case 'KeyM':
        this.sidebar.notify(this.sound.toggleMute() ? 'Sound off.' : 'Sound on.');
        break;
      case 'KeyO':
        this.cycleOwnDerrick();
        break;
      case 'Escape':
        if (this.placing) this.stopPlacing();
        else if (this.waypoints) this.waypoints = null; // Esc drops the route being plotted
        else if (!this.ended) this.togglePause();
        break;
      case 'Tab':
        this.sidebar.toggle();
        break;
      case 'KeyF':
        this.plantSelectedFlags();
        break;
      case 'KeyR':
        // Only while positioning a new structure: turn it 90° (footprint d × w, art mirrored). Once built it stays put.
        if (this.placing) {
          this.placingRotated = !this.placingRotated;
          this.updateGhost();
          this.sidebar.notify(this.placingRotated ? 'Turned 90°.' : 'Turned back.', 1.5);
        }
        break;
      case 'KeyU':
        this.unloadSelectedTransport();
        break;
      case 'KeyZ':
        // Z: start plotting a route for the selection; Z again sends it off along the points.
        if (this.waypoints) this.finishWaypoints();
        else if (this.selection.selectedUnits.size > 0) {
          this.waypoints = [];
          this.sidebar.notify(`Waypoint mode: left-click up to ${MAX_WAYPOINTS} points, then Z (or right-click) to go.`);
        }
        break;
      case 'KeyX':
        this.formUpSelected();
        break;
      case 'KeyC':
        this.scatterSelected();
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
      if (option.id === 'alliedBuilding' && this.alliesOf(player) >= MAX_ALLIES) {
        this.sidebar.notify(`A nation leads at most ${MAX_ALLIES} allies.`);
        return;
      }
      const need = missingRequirement(option, this.ownedTypes());
      if (need) {
        this.sidebar.notify(
          option.id === 'alliedBuilding'
            ? 'Allied Building: first send a Squatters team to unclaimed land and plant your flag there (select it, press F).'
            : `${option.name} requires a ${BUILD_OPTIONS.find((o) => o.id === need)?.name ?? need} first.`,
        );
        return;
      }
      if (!this.construction.start(player, option)) {
        if (player.capitalLost) this.sidebar.notify('Your capital is lost — you can no longer buy anything.');
        return;
      }
      this.sidebar.notify(`Building ${option.name} — ${buildCost(option, player.faction)} ${CURRENCY}`);
    } else if (slot.state === 'ready' && slot.option?.id === option.id) {
      this.placing = option;
      this.placingRotated = false;
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

  /** The structure being positioned is turned 90° (R). */
  private placingRotated = false;

  private stopPlacing(): void {
    this.placing = null;
    this.ghost = null;
    this.placingRotated = false;
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
    const result = this.placement.check({ owner: this.humanPlayer.id, x, y, w, d, unclaimedOnly: this.placing.id === 'alliedBuilding' });
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
  /**
   * How high above its ground point a unit is actually drawn: part of its body, plus its flying altitude.
   * Shots, muzzle flashes and hit sparks use this so a dogfight happens up where the aircraft are instead of
   * on the ground below them.
   */
  private aimHeight(u: Unit, share = 1): number {
    return u.bodyHeight * share + this.liftOf(u);
  }

  /** Flying height of a unit in iso px (0 for anything on the ground). */
  private liftOf(u: Unit): number {
    return (u as { altitude?: number }).altitude ?? 0;
  }

  private fx(x: number, y: number, lift = 0): WorldPoint {
    const p = worldToIso(x, y);
    return { x: p.x, y: p.y - lift };
  }

  /** A bunker's machine gun: muzzle flash at the slit facing the target, a tracer and a small hit spark. */
  private onBunkerFire(b: Bunker, t: Unit): void {
    const c = b.centerWorld();
    const dist = Math.hypot(t.px - c.x, t.py - c.y) || 1;
    const reach = (b.w * CELL_SIZE) / 2;
    const mx = c.x + ((t.px - c.x) / dist) * reach;
    const my = c.y + ((t.py - c.y) / dist) * reach;
    const muzzle = this.fx(mx, my, 2);
    const hit = this.fx(t.px, t.py, this.aimHeight(t, 0.6));
    this.effects.add({ kind: 'flash', x: muzzle.x, y: muzzle.y, age: 0, ttl: 0.07, size: 2.2 });
    if (hasBulletSheet()) this.addBullet(muzzle, hit, 'bunker');
    else {
      this.effects.add({ kind: 'tracer', x0: muzzle.x, y0: muzzle.y, x1: hit.x, y1: hit.y, age: 0, ttl: 0.06, color: '#ffe9a0', width: 0.45, shell: false });
      this.effects.add({ kind: 'blast', x: hit.x, y: hit.y, age: -0.06, ttl: 0.18, radius: 1.6 });
    }
    this.sound.play('mg', { x: mx, y: my });
    this.alertUnderAttack(t, b);
  }

  private onFire(s: Unit, t: Entity, w: WeaponSpec, _impact: WorldPoint): void {
    this.countAttackOnPlayer(s, t);
    this.alertUnderAttack(t, s);
    const heavy = w.kind === 'cannon' || w.kind === 'missile' || w.kind === 'bomb';
    // Where the shot lands (world plane + height) and where the barrel is.
    let tx = s.px;
    let ty = s.py;
    let tlift = 0;
    if (t instanceof Unit) {
      tx = t.px;
      ty = t.py;
      tlift = this.aimHeight(t, 0.6);
    } else if (t instanceof Building) {
      const c = t.centerWorld();
      tx = heavy ? c.x + (((t.id * 7) % 9) - 4) : c.x; // small arms aim at the centre
      ty = c.y;
      tlift = 6;
    }
    const dist = Math.hypot(tx - s.px, ty - s.py) || 1;
    const reach = s instanceof Vehicle ? 3.2 : 1.0;
    const mx = s.px + ((tx - s.px) / dist) * reach;
    const my = s.py + ((ty - s.py) / dist) * reach;
    const muzzle = this.fx(mx, my, this.aimHeight(s, s instanceof Vehicle ? 1 : 0.8));
    const hit = this.fx(tx, ty, tlift);
    const ttl = { rifle: 0.09, smg: 0.06, sniper: 0.14, mg: 0.06, autocannon: 0.08, cannon: 0.22, missile: 0.35, bomb: BOMB_FALL_SECONDS }[w.kind];
    if (w.kind === 'bomb' || (s instanceof Vehicle && s.type === 'bomber')) {
      if (s instanceof Vehicle && s.type === 'bomber' && hasBombSheet(s.faction)) {
        // Bomber with a bomb sheet: the stick of bombs falls from the bay and blows up on the ground.
        const faction = s.faction as FactionId;
        const bay = this.fx(s.px, s.py, this.aimHeight(s, 0.5));
        const ground = this.fx(s.px, s.py, 0);
        const fall = BOMB_FALL_SECONDS;
        for (let i = 0; i < BOMBS_PER_DROP; i++) {
          const ox = (i - (BOMBS_PER_DROP - 1) / 2) * 3;
          const delay = i * 0.15;
          this.effects.add({ kind: 'bombFall', x0: bay.x + ox, y0: bay.y, x1: hit.x + ox, y1: hit.y, gx: ground.x + ox, gy: ground.y, age: -delay, ttl: fall, faction });
          this.effects.add({ kind: 'bombBlast', x: hit.x + ox, y: hit.y, age: -(delay + fall), ttl: BOMB_BLAST_TTL, faction });
        }
        this.sound.play(w.kind, { x: mx, y: my });
        return;
      }
    }
    if (w.kind !== 'bomb' && hasBulletSheet()) {
      // A real bullet from the shared sheet, sized to the gun: rifle < bunker MG < autocannon < aircraft < tank.
      let size: BulletSize = 'rifle';
      if (s instanceof Vehicle) {
        if (s.flies) size = t instanceof Unit && t.flies ? 'aircraftAir' : 'aircraftGround';
        else if (s.type === 'tank' || w.kind === 'cannon') size = 'tank';
        else if (w.kind === 'autocannon' || w.kind === 'missile') size = 'autocannon';
      }
      this.effects.add({ kind: 'flash', x: muzzle.x, y: muzzle.y, age: 0, ttl: 0.07, size: size === 'tank' ? 3.6 : 1.8 });
      this.addBullet(muzzle, hit, size);
      this.sound.play(w.kind, { x: mx, y: my });
      const last = this.lastShot.get(s.id) ?? -99;
      this.lastShot.set(s.id, this.time);
      if (this.time - last > 8 && s.faction !== 'neutral' && !(s instanceof Vehicle)) this.sound.battleCry(s.faction, { x: s.px, y: s.py });
      return;
    }
    if (w.kind === 'cannon' && s instanceof Vehicle && s.type === 'tank' && hasShellSheet()) {
      // Tank shell from the shared sheet: muzzle flash, tracer round, then sparks on armour or a blast and scorch mark.
      this.effects.add({ kind: 'shell', x0: muzzle.x, y0: muzzle.y, x1: hit.x, y1: hit.y, age: 0, ttl: SHELL_FLIGHT_SECONDS });
      this.effects.add({ kind: 'shellImpact', x: hit.x, y: hit.y, age: -SHELL_FLIGHT_SECONDS, ttl: SHELL_IMPACT_SECONDS, armour: t instanceof Vehicle });
      this.sound.play(w.kind, { x: mx, y: my });
      return;
    }
    if (w.kind === 'missile' && s instanceof Vehicle && s.flies && hasMissileSheet()) {
      // Aircraft missile from the shared sheet: smoke trail in flight, then a burst on aircraft or a blast on the ground.
      const air = t instanceof Unit && t.flies;
      this.effects.add({ kind: 'missile', x0: muzzle.x, y0: muzzle.y, x1: hit.x, y1: hit.y, age: 0, ttl: MISSILE_FLIGHT_SECONDS });
      this.effects.add({ kind: 'missileBlast', x: hit.x, y: hit.y, age: -MISSILE_FLIGHT_SECONDS, ttl: MISSILE_BLAST_SECONDS, air });
      this.sound.play(w.kind, { x: mx, y: my });
      return;
    }
    const color = heavy ? '#ffb347' : w.kind === 'sniper' ? '#ffffff' : '#ffe9a0';
    this.effects.add({ kind: 'tracer', x0: muzzle.x, y0: muzzle.y, x1: hit.x, y1: hit.y, age: 0, ttl, color, width: heavy ? 1.1 : 0.45, shell: heavy });
    this.effects.add({ kind: 'flash', x: muzzle.x, y: muzzle.y, age: 0, ttl: 0.07, size: heavy ? 3.6 : 1.8 });
    this.effects.add({ kind: 'blast', x: hit.x, y: hit.y, age: -ttl, ttl: heavy ? 0.35 : 0.18, radius: w.kind === 'bomb' ? 14 : heavy ? 6 : 1.6 });
    this.sound.play(w.kind, { x: mx, y: my });
    const prev = this.lastShot.get(s.id) ?? -99;
    this.lastShot.set(s.id, this.time);
    if (this.time - prev > 8 && s.faction !== 'neutral') this.sound.battleCry(s.faction, { x: s.px, y: s.py });
  }

  /** A bullet from `from` to `to` (iso px) and its impact when it gets there. */
  private addBullet(from: { x: number; y: number }, to: { x: number; y: number }, size: BulletSize): void {
    this.effects.add({ kind: 'bullet', x0: from.x, y0: from.y, x1: to.x, y1: to.y, age: 0, ttl: BULLET_FLIGHT_SECONDS, size });
    this.effects.add({ kind: 'bulletHit', x: to.x, y: to.y, age: -BULLET_FLIGHT_SECONDS, ttl: BULLET_IMPACT_SECONDS, size });
  }

  /** Footsteps, engines and tracks of the units moving within earshot of the camera (louder with more of them). */
  private motionSound(): void {
    const cam = this.camera;
    const hw = cam.viewWidth / 2;
    const hh = cam.viewHeight / 2;
    // Per sound (marching feet, or one vehicle model by its name): the loudest (nearest the centre) unit sets the
    // level, each further one adds a little.
    const best = new Map<string, number>();
    const more = new Map<string, number>();
    const kinds = new Map<string, VehicleKind>();
    for (const u of this.entities.fieldMovers()) {
      if (!u.alive || u.insideId !== null) continue;
      let key: string | null = null;
      if (u instanceof Vehicle) {
        // Every vehicle and aircraft: ground vehicles while they drive, aircraft whenever they are not parked.
        if (u.aircraft ? u.flight !== 'parked' : u.moving) {
          key = u.name;
          kinds.set(key, u.type);
        }
      } else if (u.moving) key = 'foot';
      if (!key) continue;
      // Only units inside the frame are heard: full volume in the middle of the screen, silent at its edge.
      const s = cam.worldToScreen(u.px, u.py);
      const near = 1 - Math.max(Math.abs(s.x - hw) / hw, Math.abs(s.y - hh) / hh);
      if (near <= 0) continue;
      const top = best.get(key) ?? 0;
      if (near > top) {
        more.set(key, (more.get(key) ?? 0) + top);
        best.set(key, near);
      } else more.set(key, (more.get(key) ?? 0) + near);
    }
    const level = (k: string): number => Math.min(1, (best.get(k) ?? 0) + 0.12 * (more.get(k) ?? 0));
    const engines = new Map<string, { kind: VehicleKind; level: number }>();
    for (const [name, kind] of kinds) if (best.has(name)) engines.set(name, { kind, level: level(name) });
    this.sound.motion({ foot: level('foot'), engines });
  }

  /** Throttled "under attack" alerts for everything the player owns. */
  private readonly alertAt = new Map<string, number>();
  private janitorTimer = 0;
  private alertUnderAttack(t: Entity, attacker: Entity): void {
    if (t.owner !== this.humanPlayer.id || attacker.owner === t.owner) return;
    const isBuilding = t instanceof Building;
    const key = isBuilding ? `b:${t.spec.type}` : `u:${t instanceof Vehicle ? t.type : 'soldier'}`;
    if (this.time - (this.alertAt.get(key) ?? -99) < 12) return;
    this.alertAt.set(key, this.time);
    const name = isBuilding ? t.spec.name : t instanceof Vehicle || t instanceof Infantry ? t.name : 'Unit';
    const at = isBuilding ? t.centerWorld() : { x: (t as Unit).px, y: (t as Unit).py };
    this.sidebar.alert(`${name} is under attack!`, at);
    this.sound.alarm();
  }

  /** Sell button: the Global Financial Center looks at the offer and decides whether, and how much, to buy. */
  private sellOil(auto = false): void {
    const result = this.oilMarket.sell(this.humanPlayer);
    if (auto && result.kind !== 'sold') return; // auto sell stays quiet when the Center declines
    this.sidebar.notify(
      result.kind === 'sold'
        ? `Global Financial Center bought ${result.barrels.toFixed(1)} barrels at ${result.price} ${CURRENCY} → +${result.revenue} ${CURRENCY}` +
          (result.royalty > 0 ? ` (−${result.royalty} ${CURRENCY} lease share to the oil cartel)` : '') +
          (result.repaid > 0 ? ` (${result.repaid} ${CURRENCY} paid back on your debt)` : '')
        : `Global Financial Center declined: ${result.reason}.`,
      5,
    );
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /**
   * Economy and military standing of every nation (Rank tab).
   *  - Wealth: oil in stock at the posted price + structures (build cost × health left) + soldiers and vehicles
   *    + budget + unused stored power (valued at the oil it was made from).
   *  - Military: price of the living soldiers and working vehicles, re-counted only every MILITARY_RANK_INTERVAL s.
   */
  private ranking(): RankRow[] {
    const units = new Map<number, number>();
    const add = (owner: number, value: number): void => {
      units.set(owner, (units.get(owner) ?? 0) + value);
    };
    for (const u of this.entities.units()) if (u.alive) add(u.owner, u.value);
    for (const v of this.entities.vehicles()) if (v.alive) add(v.owner, v.value);
    const structures = new Map<number, number>();
    for (const b of this.entities.buildings()) {
      if (!b.alive || b.indestructible) continue;
      const option = BUILD_OPTIONS.find((o) => o.id === b.spec.type);
      if (!option) continue;
      structures.set(b.owner, (structures.get(b.owner) ?? 0) + buildCost(option, b.faction as FactionId) * (b.hp / b.maxHp));
    }
    if (!this.militarySnapshot || this.time - this.militarySnapshotAt >= MILITARY_RANK_INTERVAL) {
      this.militarySnapshot = new Map(units);
      this.militarySnapshotAt = this.time;
    }
    const price = this.oilMarket.price;
    return this.players.map((p) => ({
      playerId: p.id,
      faction: p.faction as FactionId,
      name: FACTIONS[p.faction].name,
      isHuman: p.isHuman,
      defeated: p.defeated,
      economy:
        p.oil * price + (structures.get(p.id) ?? 0) + (units.get(p.id) ?? 0) + p.credits + (p.powerStored / POWER_PER_BARREL) * price,
      military: this.militarySnapshot?.get(p.id) ?? 0,
    }));
  }

  /** Esc: freezes the simulation and opens the pause menu (Continue / Quit game). */
  private togglePause(): void {
    this.paused = !this.paused;
    this.pauseMenu.setOpen(this.paused);
  }

  /** Cartel policy buttons (oil-cartel nation only): cut / hold / flood production. */
  private setOilPolicy(policy: OilPolicy): void {
    const result = this.oilMarket.setPolicy(this.humanPlayer, policy);
    this.sidebar.notify(
      result.kind === 'set'
        ? `Oil cartel policy: ${OIL_POLICIES[result.policy].label}. Your derricks pump ${Math.round(OIL_POLICIES[result.policy].output * 100)}%; the world price heads ${result.policy === 'cut' ? 'up' : result.policy === 'flood' ? 'down' : 'back to the market level'}.`
        : `Policy unchanged: ${result.reason}.`,
      5,
    );
    this.sidebarTimer = SIDEBAR_REFRESH;
  }

  /** Emergency loan button: only on the player's request, only at 0 TB. */
  private takeLoan(): void {
    const result = this.oilMarket.borrow(this.humanPlayer);
    this.sidebar.notify(
      result.kind === 'granted'
        ? `Global Financial Center loan: +${result.amount} ${CURRENCY}. Debt ${result.debt} ${CURRENCY} — oil sales pay it back automatically.`
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
    // A nation whose own capital is destroyed or captured can no longer buy anything (a captured enemy capital
    // does not count as its own).
    for (const p of this.players) {
      if (p.capitalLost) continue;
      const own = this.entities.buildings().some((b) => b.alive && b.owner === p.id && b.spec.type === 'capital' && b.spec.spriteKey === `capital:${p.faction}`);
      if (own) continue;
      p.capitalLost = true;
      if (p.isHuman) this.sidebar.notify('Your capital is lost — you can no longer buy anything.', 6);
    }
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
      const wasCarryingTank = e instanceof Vehicle && e.vehiclesAboard > 0;
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
      // One of my aircraft shot down / crashed: the pilot's distress call.
      if (vehicle && e.aircraft && e.owner === this.humanPlayer.id) this.sound.mayday();
      if (e instanceof Infantry && !e.inWater && hasSoldierDeath(e.profile.look)) {
        this.effects.add({ kind: 'soldierDeath', ...this.fx(e.px, e.py), age: 0, ttl: SOLDIER_DEATH_SECONDS, look: e.profile.look, heading: e.heading });
        return;
      }
      this.effects.add({ kind: 'smoke', ...this.fx(e.px, e.py, 1 + this.liftOf(e)), age: 0, ttl: 1.2, radius: vehicle ? 5 : 2.2 });
      if (vehicle && e.type === 'tank' && hasTankSheet(e.faction as FactionId)) {
        this.effects.add({ kind: 'tankDeath', ...this.fx(e.px, e.py), age: 0, ttl: TANK_DEATH_SECONDS, faction: e.faction as FactionId });
        this.sound.play('explosion', { x: e.px, y: e.py });
      } else if (vehicle && e.isTruck && hasTruckSheet(e.faction as FactionId)) {
        this.effects.add({ kind: 'truckDeath', ...this.fx(e.px, e.py), age: 0, ttl: TRUCK_DEATH_SECONDS, faction: e.faction as FactionId, heading: e.heading, flatbed: wasCarryingTank });
      } else if (vehicle && e.isRepair && hasRepairSheet(e.faction as FactionId)) {
        this.effects.add({ kind: 'repairDeath', ...this.fx(e.px, e.py), age: 0, ttl: REPAIR_DEATH_SECONDS, faction: e.faction as FactionId, heading: e.heading });
        this.sound.play('explosion', { x: e.px, y: e.py });
      } else if (vehicle) {
        this.effects.add({ kind: 'blast', ...this.fx(e.px, e.py, e.flies ? 2 + e.altitude : 2), age: 0, ttl: 0.5, radius: e.flies ? 14 : 10 });
        this.sound.play('explosion', { x: e.px, y: e.py });
      }
      return;
    }
    if (!(e instanceof Building)) return;
    this.crushCrew(e, killer);
    if (e.spec.type === 'capital') this.defeatNation(e);
    if (e.owner === this.humanPlayer.id) this.sidebar.alert(`${e.spec.name} was destroyed!`, e.centerWorld());
    this.removeBuilding(e);
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
        : result === 'noCapital'
          ? 'Your capital is lost — you can no longer buy anything.'
        : result === 'full'
          ? `Vehicle orders are full (${BUILD_LIMIT_VEHICLES}) — one more once an order is done.`
          : result === 'tech'
            ? 'Second-tier vehicles need a High-Tech Center.'
            : result === 'cap'
            ? `Ground vehicles are at their limit of ${MAX_GROUND_VEHICLES} — aircraft are not limited.`
            : result === 'transportCap'
            ? `Transport aircraft are at their limit of ${MAX_TRANSPORTS}.`
            : result === 'noParking'
            ? 'No free parking spot — build another Airfield or send aircraft out.'
            : result === 'noAirfield'
              ? 'Aircraft are built at an Airfield — build one first.'
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
    // The art's axes are the grid's: tile (u, v) of the 12×8 sprite is the cell u right, v down of the footprint's corner.
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
  private spawnAircraft(player: PlayerState, kind: VehicleKind, producer: Building, prefer = -1): Vehicle | null {
    // One aircraft per parking spot: use the producing airfield, or another one of the nation with room.
    // A transport takes a spot with a free one ahead of it for its tanker.
    let airfield = producer;
    let slot = kind === 'transport' ? this.aircraft.freeTransportSlot(airfield) : this.aircraft.freeSlot(null, airfield, prefer);
    if (slot < 0) {
      for (const b of this.entities.buildings()) {
        if (b.owner !== player.id || !b.alive || b.spec.type !== 'airfield') continue;
        slot = this.aircraft.freeSlot(null, b);
        if (slot >= 0) {
          airfield = b;
          break;
        }
      }
    }
    if (slot < 0) return null;
    const g = this.airfieldGeometry(airfield);
    const spot = g.slots[slot];
    if (!spot) return null;
    const jet = this.entities.add(new Vehicle(player.id, player.faction as FactionId, kind, spot));
    jet.flight = 'parked';
    jet.altitude = 0;
    jet.homeId = airfield.id;
    jet.slot = slot;
    jet.heading = g.heading;
    // Every transport comes with its own tanker, parked on the next free spot.
    if (kind === 'transport') {
      const tanker = this.spawnAircraft(player, 'tanker', airfield, slot + 1);
      if (tanker) {
        tanker.escortOf = jet.id;
        jet.tankerId = tanker.id;
      }
    }
    if (player.isHuman && kind !== 'tanker') this.sidebar.notify(`${jet.name} parked on the airfield.`);
    return jet;
  }

  /** A transport back on its airfield without a tanker gets a new one on a free spot there (false: no room yet). */
  private newTanker(t: Vehicle): boolean {
    const home = t.homeId === null ? undefined : this.entities.get(t.homeId);
    const player = this.players.find((p) => p.id === t.owner);
    if (!(home instanceof Building) || !player || this.aircraft.freeSlot(null, home) < 0) return false;
    const tanker = this.spawnAircraft(player, 'tanker', home, t.slot + 1);
    if (!tanker) return false;
    tanker.escortOf = t.id;
    t.tankerId = tanker.id;
    if (player.isHuman) this.sidebar.notify(`${t.name}: a new ${tanker.name} tanker has joined it.`);
    return true;
  }

  /**
   * Local steering, queueing (layer 4 of the route system): a moving ground unit that closes on another unit going
   * the same way just ahead of it slows to that unit's pace instead of ramming into it, so a column through a gap
   * files through in order. Separation and giveWay handle the rest.
   */
  private queueInCrowds(): void {
    const movers = this.entities.fieldMovers();
    const bucket = CELL_SIZE * 2;
    const grid = new Map<number, Unit[]>();
    const key = (x: number, y: number): number => x * 100003 + y;
    for (const u of movers) {
      u.crowdFactor = 1;
      if (u.flies || !u.alive) continue;
      const k = key(Math.floor(u.px / bucket), Math.floor(u.py / bucket));
      const list = grid.get(k);
      if (list) list.push(u);
      else grid.set(k, [u]);
    }
    for (const u of movers) {
      if (!u.moving || u.flies || !u.alive) continue;
      const next = u.waypoints()[0];
      if (!next) continue;
      const len = Math.hypot(next.x - u.px, next.y - u.py);
      if (len < 0.01) continue;
      const fx = (next.x - u.px) / len;
      const fy = (next.y - u.py) / len;
      const bx = Math.floor(u.px / bucket);
      const by = Math.floor(u.py / bucket);
      let factor = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (const o of grid.get(key(bx + dx, by + dy)) ?? []) {
          if (o === u || !o.moving) continue;
          const rx = o.px - u.px;
          const ry = o.py - u.py;
          const along = rx * fx + ry * fy;
          const side = Math.abs(rx * -fy + ry * fx);
          const gap = u.radius + o.radius;
          if (along <= 0 || along > gap + 3 || side > gap * 0.8) continue;
          // Only traffic heading the same way: keep a car length behind it.
          const on = o.waypoints()[0];
          if (!on) continue;
          const ol = Math.hypot(on.x - o.px, on.y - o.py) || 1;
          if (((on.x - o.px) * fx + (on.y - o.py) * fy) / ol < 0.5) continue;
          factor = Math.min(factor, Math.max(0.25, (along - gap) / 3));
        }
      }
      u.crowdFactor = factor;
    }
  }

  /**
   * Crossing routes (soldiers, tanks, trucks, ARVs): when two ground units' next stretches cross, the one that will
   * reach the crossing point first has right of way; the other stops short of it and waits its turn, then drives on
   * once the first is through (first come, first served). A wait never lasts longer than CROSSING_MAX_WAIT s, so a
   * unit that stopped in the crossing cannot hold the other forever. Aircraft never stop: they climb over each other
   * instead (AircraftSystem.avoid).
   */
  private yieldAtCrossings(dt: number): void {
    const movers = this.entities.fieldMovers().filter((u) => u.alive && !u.flies && !u.fixed && u.moving && u.restLeft <= 0);
    const look = CROSSING_LOOKAHEAD_CELLS * CELL_SIZE;
    const bucket = look;
    const grid = new Map<number, Unit[]>();
    const key = (x: number, y: number): number => x * 100003 + y;
    const leg = new Map<number, { dx: number; dy: number; len: number }>();
    for (const u of movers) {
      const next = u.waypoints()[0];
      if (!next) continue;
      const len = Math.hypot(next.x - u.px, next.y - u.py);
      if (len < 0.5) continue;
      // The stretch it is about to drive: towards its next waypoint, at most `look` px.
      leg.set(u.id, { dx: (next.x - u.px) / len, dy: (next.y - u.py) / len, len: Math.min(len, look) });
      const k = key(Math.floor(u.px / bucket), Math.floor(u.py / bucket));
      const list = grid.get(k);
      if (list) list.push(u);
      else grid.set(k, [u]);
    }
    const waiting = new Set<number>();
    for (const a of movers) {
      const la = leg.get(a.id);
      if (!la) continue;
      const bx = Math.floor(a.px / bucket);
      const by = Math.floor(a.py / bucket);
      for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) {
        for (const b of grid.get(key(bx + gx, by + gy)) ?? []) {
          if (b.id <= a.id) continue;
          const lb = leg.get(b.id);
          if (!lb) continue;
          // Where do the two stretches cross? (a + s·da = b + t·db)
          const cross = la.dx * lb.dy - la.dy * lb.dx;
          if (Math.abs(cross) < 0.35) continue; // (nearly) the same or opposite way: queueing / separation
          const rx = b.px - a.px;
          const ry = b.py - a.py;
          const s = (rx * lb.dy - ry * lb.dx) / cross;
          const t = (rx * la.dy - ry * la.dx) / cross;
          const clear = a.radius + b.radius + 1;
          if (s < -clear || t < -clear || s > la.len + clear || t > lb.len + clear) continue;
          // Right of way: whoever gets to the crossing first (by time); the other stops short of it.
          const ta = Math.max(0, s) / Math.max(0.1, a.speed);
          const tb = Math.max(0, t) / Math.max(0.1, b.speed);
          const [first, second, dist] = ta < tb || (ta === tb && a.id < b.id) ? [a, b, t] : [b, a, s];
          if (second.crossingWait > CROSSING_MAX_WAIT || first.crossingWait > 0) continue;
          // Only once it is about to enter the crossing: it stops just before it.
          if (dist > clear + 2 && dist > second.radius * 2 + 3) continue;
          second.crowdFactor = 0;
          waiting.add(second.id);
        }
      }
    }
    for (const u of this.entities.fieldMovers()) u.crossingWait = waiting.has(u.id) ? u.crossingWait + dt : 0;
  }

  /**
   * A ground vehicle standing still in the way of a moving one (on the stretch just ahead of it) pulls over to
   * the side, onto a clear spot, so the mover can pass. Busy vehicles (attacking, working) stay put.
   */
  private giveWay(dt: number): void {
    this.yieldTimer -= dt;
    if (this.yieldTimer > 0) return;
    this.yieldTimer = 0.25;
    const movers = this.entities.fieldMovers();
    const ground = movers.filter((m): m is Vehicle => m instanceof Vehicle && m.alive && !m.flies && !m.fixed);
    const idle = ground.filter((m) => !m.moving && m.attackTarget === null && m.task === null);
    if (idle.length === 0) return;
    for (const v of ground) {
      if (!v.moving) continue;
      const next = v.waypoints()[0];
      if (!next) continue;
      const dx = next.x - v.px;
      const dy = next.y - v.py;
      const len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      const fx = dx / len;
      const fy = dy / len;
      const lookAhead = Math.min(len, 3 * CELL_SIZE) + v.radius;
      const dest = v.destination;
      for (const o of idle) {
        if (o === v || o.moving) continue;
        const rx = o.px - v.px;
        const ry = o.py - v.py;
        const along = rx * fx + ry * fy; // distance ahead of the mover
        const side = rx * -fy + ry * fx; // signed distance off its line
        const clear = v.radius + o.radius + VEHICLE_GAP;
        if (along <= 0 || along > lookAhead || Math.abs(side) >= clear) continue;
        // Parked on the mover's own destination: the mover will stop short anyway.
        if (dest && Math.hypot(dest.x - o.px, dest.y - o.py) < clear) continue;
        // Pull over to the side it already leans to, far enough to clear the mover's path.
        const dir = side >= 0 ? 1 : -1;
        const shift = clear * 1.4 + 2;
        let spot: WorldPoint | null = null;
        for (const s of [dir, -dir]) {
          const p = { x: o.px - fy * shift * s, y: o.py + fx * shift * s };
          spot = this.freeStandSpot(p, o, [], []);
          if (spot) break;
        }
        if (!spot) continue;
        const cell = this.map.cellAt(spot.x, spot.y);
        if (!cell) continue;
        const path = this.paths.find({ x: o.px, y: o.py }, cell, o.swims);
        const last = path[path.length - 1];
        if (last) {
          last.x = spot.x;
          last.y = spot.y;
        } else path.push(spot);
        const facing = o.faceOnArrival ?? o.heading;
        o.follow(path);
        o.faceOnArrival = facing; // pulls over and lines up again the way it stood
      }
    }
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
      const path = this.paths.find({ x: u.px, y: u.py }, goal, u.swims);
      const last = path[path.length - 1];
      if (last && goal.x === cell.x && goal.y === cell.y) {
        last.x = dest.x;
        last.y = dest.y;
      }
      u.follow(path, true); // same order, new route: still faces the group's way on arrival
    }
  }

  private spawnVehicle(player: PlayerState, kind: VehicleKind, producer: Building): void {
    if (isAircraftKind(kind)) {
      this.spawnAircraft(player, kind, producer);
      return;
    }
    // Land vehicles roll out of the War Factory's exit cell and drive on to a parking spot (see parkingSpot).
    const exit = this.factoryExit(producer);
    if (!exit) return;
    const unit = this.entities.add(new Vehicle(player.id, player.faction as FactionId, kind, exit));
    unit.heading = Math.PI / 2;
    const spot = this.parkingSpot(producer, unit);
    const cell = spot ? this.map.cellAt(spot.x, spot.y) : null;
    if (spot && cell) {
      const path = this.paths.find({ x: unit.px, y: unit.py }, cell);
      const last = path[path.length - 1];
      if (last) {
        last.x = spot.x;
        last.y = spot.y;
      } else path.push(spot);
      unit.follow(path);
    }
    if (player.isHuman) this.sidebar.notify(`${unit.name} ready.`);
  }

  /** The cell a new vehicle rolls out onto: the free ground right in front of the factory's door (world px centre). */
  private factoryExit(producer: Building): WorldPoint | null {
    const door = this.doorPoint(producer);
    const c = this.pathfinder.nearestPassable(Math.floor(door.x / CELL_SIZE), Math.floor(door.y / CELL_SIZE), 8);
    return c ? { x: (c.x + 0.5) * CELL_SIZE, y: (c.y + 0.5) * CELL_SIZE } : null;
  }

  /** Nothing (no soldier, no ground vehicle) stands in the factory's exit cell or right in front of it. */
  private factoryExitClear(producer: Building): boolean {
    const exit = this.factoryExit(producer);
    if (!exit) return false;
    const reach = CELL_SIZE * 1.1;
    const blockers = this.entities
      .fieldMovers()
      .filter((m) => m.alive && !m.flies && Math.hypot(m.px - exit.x, m.py - (exit.y + CELL_SIZE * 0.5)) < reach + m.radius);
    // Own vehicles idling in the doorway are waved on to a parking spot (RA2 clears its exit the same way).
    for (const m of blockers) {
      if (!(m instanceof Vehicle) || m.owner !== producer.owner || m.moving || m.attackTarget !== null || m.task !== null) continue;
      const spot = this.parkingSpot(producer, m);
      const cell = spot ? this.map.cellAt(spot.x, spot.y) : null;
      if (!spot || !cell) continue;
      const path = this.paths.find({ x: m.px, y: m.py }, cell);
      const last = path[path.length - 1];
      if (last) {
        last.x = spot.x;
        last.y = spot.y;
      }
      m.follow(path);
    }
    return blockers.length === 0;
  }

  /**
   * RA2 parking after a vehicle leaves the factory: it heads for the rally point a few cells out in front of the door;
   * if that is taken, a spiral search round it finds the nearest free cell — never in the exit lane (the cells straight
   * out from the door), so the next vehicle can always get out. Later vehicles line up beside and behind the first.
   */
  private parkingSpot(producer: Building, unit: Vehicle): WorldPoint | null {
    const exit = this.factoryExit(producer);
    if (!exit) return null;
    const rally = { x: exit.x, y: exit.y + CELL_SIZE * PARKING_RALLY_CELLS };
    const step = Math.max(unit.radius * 2.2, CELL_SIZE);
    const others = this.entities.fieldMovers().filter((m) => m !== unit && m.alive && !m.flies);
    for (let k = 0; k < 160; k++) {
      const off = spiralOffset(k, step);
      const cell = this.map.cellAt(rally.x + off.x, rally.y + off.y);
      if (!cell || !this.pathfinder.passable(cell.x, cell.y)) continue;
      const p = { x: (cell.x + 0.5) * CELL_SIZE, y: (cell.y + 0.5) * CELL_SIZE };
      // Keep the exit lane open: the strip straight out from the door, as wide as a vehicle.
      if (Math.abs(p.x - exit.x) < unit.radius + CELL_SIZE * 0.5 && p.y >= exit.y - CELL_SIZE && p.y < rally.y - CELL_SIZE * 0.5) continue;
      if (!this.hullFits(p, unit)) continue;
      // Taken by anyone standing there or already driving there.
      if (others.some((m) => {
        const at = m.destination ?? { x: m.px, y: m.py };
        return Math.hypot(at.x - p.x, at.y - p.y) < m.radius + unit.radius + VEHICLE_GAP;
      })) continue;
      return p;
    }
    return null;
  }

  // ------------------------------------------------------------------ infantry

  private onTrainClick(tier: UnitTier): void {
    const player = this.humanPlayer;
    const option = this.training.optionsFor(player).find((o) => o.tier === tier);
    if (!option) return;
    if (!this.training.barracksOf(player)) this.sidebar.notify('Requires a Ministry of Defence.');
    else {
      const result = this.training.enqueue(player, tier);
      this.sidebar.notify(
        result === 'ok'
          ? `Training ${option.name} — ${option.cost} ${CURRENCY}`
          : result === 'noCapital'
            ? 'Your capital is lost — you can no longer buy anything.'
          : result === 'tech'
            ? 'Second-tier soldiers need a High-Tech Center.'
            : result === 'ratio'
            ? 'Elite soldiers never outnumber the regulars: 2 elite for every 3 regular — train more regular soldiers first.'
            : result === 'cap'
            ? `Army is at its limit of ${MAX_SOLDIERS} soldiers — train more when some have fallen.`
            : `Training orders are full (${BUILD_LIMIT_SOLDIERS}) — one more once an order is done.`,
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
      const path = this.paths.find({ x: unit.px, y: unit.py }, slotCell, unit.swims);
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
    const path = this.paths.find({ x: u.px, y: u.py }, cell, u.swims);
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
   * Right-click on a building with soldiers selected:
   *  - own building that accepts them (hospital ← wounded): enter;
   *  - own damaged building + engineers: repair;
   *  - enemy building + engineers: capture it (neutral buildings are immune).
   * Returns true if at least one soldier got an order.
   */
  private orderOnBuilding(b: Building): boolean {
    const me = this.humanPlayer;
    let ordered = 0;
    // Aircraft selected + click on an own airfield: they come in to land there (from the nearer runway end).
    if (b.owner === me.id && b.spec.type === 'airfield') {
      for (const u of this.selection.selectedUnitList()) if (u instanceof Vehicle && this.aircraft.land(u, b)) ordered++;
      if (ordered > 0) return true;
    }
    for (const u of this.selection.selectedUnitList()) {
      if (!(u instanceof Infantry)) continue; // only people enter, repair or capture
      if (u.isDemolition && b.owner !== me.id && isHostile(u, b)) {
        // Crazy Soldier: run up and plant a charge on it.
        u.charge = { targetId: b.id };
        u.task = null;
        u.attackTarget = null;
        this.walkToDoor(u, b);
        ordered++;
        continue;
      }
      let type: 'enter' | 'repair' | 'capture' | 'lease' | null = null;
      if (u.isEngineer && b instanceof OilDerrick && b.owner !== me.id && b.leasable) {
        if (this.leasesTaken(b.owner) >= OIL_LEASE_MAX) {
          this.sidebar.notify(`${FACTIONS[b.faction as FactionId].shortName} leases at most ${OIL_LEASE_MAX} derricks at a time.`, 3);
          continue;
        }
        type = 'lease';
      } else if (b.owner === me.id) {
        // A damaged structure is repaired first, even a hospital the (wounded) engineer could check into: it is
        // treated there once the repair is done (see processRepairs).
        if (u.isEngineer && b.hp < b.maxHp && !b.indestructible) type = 'repair';
        else if (b.canEnter(u)) type = 'enter';
      } else if (u.isEngineer && b.capturable && b.faction !== 'neutral') {
        type = 'capture';
      }
      if (!type || !this.walkToDoor(u, b)) continue;
      u.task = type === 'lease' ? { type, buildingId: b.id, lessor: b.owner } : { type, buildingId: b.id };
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
    // Crazy Soldiers run at a ground target to plant a charge on it.
    const sappers = this.selection.selectedUnitList().filter(
      (u): u is Infantry => u instanceof Infantry && u.isDemolition && isHostile(u, target) && !(target instanceof Unit && target.flies),
    );
    for (const u of sappers) {
      u.charge = { targetId: target.id };
      u.task = null;
      u.attackTarget = null;
      u.parade = null;
      u.orderFlash = { kind: 'attack', at: this.time, target };
      this.runAt(u, target);
    }
    const attackers = this.selection.selectedUnitList().filter((u) => canTarget(u, target));
    if (attackers.length === 0) return sappers.length > 0;
    for (const u of attackers) {
      u.attackTarget = target.id;
      u.attackMove = null;
      u.task = null;
      u.parade = null;
      u.orderFlash = { kind: 'attack', at: this.time, target };
    }
    const at = target instanceof Building ? target.centerWorld() : { x: (target as Unit).px, y: (target as Unit).py };
    this.moveMarker = { x: at.x, y: at.y, at: this.time };
    return true;
  }

  /** Charges ticking on their targets (Crazy Soldier), with the effect that draws each one. */
  private readonly charges: { targetId: number; owner: number; planterId: number; x: number; y: number; fuse: number; fx: Extract<Effect, { kind: 'charge' }> }[] = [];

  /** Sends a Crazy Soldier running at `target` (a structure's door, or the unit itself). */
  private runAt(u: Infantry, target: Entity): void {
    if (target instanceof Building) {
      this.walkToDoor(u, target);
      return;
    }
    if (!(target instanceof Unit)) return;
    const cell = this.map.cellAt(target.px, target.py);
    if (!cell) return;
    const path = this.paths.find({ x: u.px, y: u.py }, cell, u.swims);
    const last = path[path.length - 1];
    if (last) {
      last.x = target.px;
      last.y = target.py;
    }
    u.follow(path);
  }

  /** Where a charge on `target` sits (world px), or null when the target is gone. */
  private chargeSpot(target: Entity | undefined): WorldPoint | null {
    if (!target || !target.alive) return null;
    if (target instanceof Building) return target.centerWorld();
    if (target instanceof Unit) return { x: target.px, y: target.py };
    return null;
  }

  /**
   * Crazy Soldiers run at their target and plant a charge once within DEMO_PLANT_CELLS; charges follow a moving
   * target and blow after DEMO_FUSE_SECONDS (see the DEMO_* constants for the damage).
   */
  private processDemolition(dt: number): void {
    for (const u of this.entities.fieldUnits()) {
      if (!(u instanceof Infantry) || !u.charge) continue;
      const target = this.entities.get(u.charge.targetId);
      if (!target || !target.alive || !isHostile(u, target)) {
        u.charge = null;
        continue;
      }
      if (distanceTo(u.px, u.py, target) <= DEMO_PLANT_CELLS * CELL_SIZE) {
        if (this.time < u.chargeReadyAt) continue; // still fixing the next charge
        const at = this.chargeSpot(target);
        if (!at) continue;
        const p = this.fx(at.x, at.y, target instanceof Unit ? this.aimHeight(target, 0.4) : 4);
        const fx: Extract<Effect, { kind: 'charge' }> = { kind: 'charge', x: p.x, y: p.y, age: 0, ttl: DEMO_FUSE_SECONDS };
        this.effects.add(fx);
        this.charges.push({ targetId: target.id, owner: u.owner, planterId: u.id, x: at.x, y: at.y, fuse: DEMO_FUSE_SECONDS, fx });
        u.charge = null;
        u.chargeReadyAt = this.time + DEMO_RELOAD_SECONDS;
        u.stop();
        continue;
      }
      // Chasing a moving unit: re-aim now and then; otherwise keep walking.
      if (!u.moving || (target instanceof Unit && Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2))) this.runAt(u, target);
    }

    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i]!;
      const target = this.entities.get(c.targetId);
      const at = this.chargeSpot(target);
      if (at) {
        c.x = at.x;
        c.y = at.y;
        const p = this.fx(c.x, c.y, target instanceof Unit ? this.aimHeight(target, 0.4) : 4);
        c.fx.x = p.x;
        c.fx.y = p.y;
      }
      c.fuse -= dt;
      if (c.fuse > 0) continue;
      this.charges.splice(i, 1);
      this.detonate(c, target);
    }
  }

  /** A charge goes off: the structure under it is destroyed (small) or loses DEMO_LARGE_DAMAGE (large); nearby enemy combat units die. */
  private detonate(c: { owner: number; planterId: number; x: number; y: number }, target: Entity | undefined): void {
    const hit = (o: Entity, amount: number): void => {
      if (!o.alive) return;
      o.damage(amount);
      o.lastAttackerId = c.planterId;
      o.lastAttackedAt = this.time;
    };
    if (target instanceof Building && target.alive && !target.indestructible) {
      hit(target, target.w * target.d <= DEMO_SMALL_CELLS ? target.hp : target.maxHp * DEMO_LARGE_DAMAGE);
    }
    const group = [...this.entities.fieldUnits(), ...this.entities.vehicles()]
      .filter((o, k, all) => all.indexOf(o) === k)
      .filter(
        (o) =>
          o.alive &&
          !o.flies &&
          o.weapon !== null &&
          o.owner !== c.owner &&
          o.owner !== NEUTRAL_OWNER &&
          Math.hypot(o.px - c.x, o.py - c.y) <= DEMO_GROUP_RADIUS_CELLS * CELL_SIZE,
      )
      .sort((a, b) => Math.hypot(a.px - c.x, a.py - c.y) - Math.hypot(b.px - c.x, b.py - c.y));
    const dead = group.length <= DEMO_GROUP_SIZE ? group.length : Math.ceil(group.length / 2);
    for (const o of group.slice(0, dead)) hit(o, Infinity);
    // A charge on an unarmed unit (engineer, transport on the ground…) still kills it.
    if (target instanceof Unit && target.alive && !group.some((o) => o === target)) hit(target, Infinity);
    const p = this.fx(c.x, c.y, 0);
    this.effects.add({ kind: 'demoBlast', x: p.x, y: p.y, age: 0, ttl: 0.8 });
    this.sound.play('explosion', { x: c.x, y: c.y });
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
        // Repair: the engineer goes inside and works there until the building is back to 100% (see processRepairs).
        u.task = null;
        if (b.hp < b.maxHp && b.owner === u.owner) {
          b.crew.push(u);
          u.insideId = b.id;
          u.stop();
          this.selection.selectedUnits.delete(u.id);
        }
      } else if (task.type === 'lease') {
        // Lease: the engineer signs for the derrick and stays at the door; the derrick pumps for his nation.
        u.task = null;
        if (b instanceof OilDerrick && b.leasable && this.leasesTaken(b.owner) >= OIL_LEASE_MAX) {
          if (u.owner === this.humanPlayer.id) this.sidebar.notify(`${FACTIONS[b.faction as FactionId].shortName} leases at most ${OIL_LEASE_MAX} derricks at a time.`, 3);
        } else if (b instanceof OilDerrick && b.leasable) {
          b.lease(u.owner);
          u.stop();
          if (u.owner === this.humanPlayer.id) {
            this.sidebar.notify(`Oil derrick leased for ${OIL_LEASE_SECONDS / 60} min: it pumps for you; ${Math.round(OIL_LEASE_CARTEL_SHARE * 100)}% of the money from its oil goes to ${FACTIONS[b.faction as FactionId].shortName}.`, 6);
          } else if (b.owner === this.humanPlayer.id) {
            this.sidebar.notify(`${FACTIONS[this.players.find((p) => p.id === u.owner)?.faction ?? 'usa'].shortName} leased one of your derricks for ${OIL_LEASE_SECONDS / 60} min.`, 5);
          }
        } else if (u.owner === this.humanPlayer.id) this.sidebar.notify('That derrick is already leased.', 3);
      } else {
        // Capture: the engineer is consumed and the building changes sides.
        if (b.capture(u.owner, u.faction as FactionId)) {
          this.entities.remove(u.id);
          this.selection.selectedUnits.delete(u.id);
          if (u.owner === this.humanPlayer.id) this.sidebar.notify(`${b.spec.name} captured!`);
          this.razeFlagsAround(b);
        } else u.task = null;
      }
    }
  }

  /**
   * A structure changed hands: every flag standing on its footprint grown by one cell each side (an (M+2) × (N+2)
   * area for an M × N structure) is torn down, whoever planted it.
   */
  private razeFlagsAround(b: Building): void {
    for (const f of this.entities.buildings()) {
      if (f === b || !f.alive || f.spec.type !== 'flagpole') continue;
      if (f.x + f.w > b.x - 1 && f.x < b.x + b.w + 1 && f.y + f.d > b.y - 1 && f.y < b.y + b.d + 1) f.hp = 0;
    }
  }

  /**
   * Derricks of `owner` leased now plus those engineers are walking to lease (the walker itself is not counted
   * once it arrives: its task is cleared before the check).
   */
  private leasesTaken(owner: number): number {
    let n = 0;
    const pending = new Set<number>();
    for (const b of this.derricks) if (b.alive && b.owner === owner && b.lessee !== null) n++;
    for (const u of this.entities.fieldUnits()) {
      if (u.task?.type === 'lease' && u.task.lessor === owner && !pending.has(u.task.buildingId)) {
        const d = this.entities.get(u.task.buildingId);
        if (d instanceof OilDerrick && d.lessee === null) pending.add(u.task.buildingId);
      }
    }
    return n + pending.size;
  }

  /** Engineers inside a building repair it to 100%, then walk out of it. */
  private processRepairs(dt: number): void {
    for (const b of this.entities.buildings()) {
      if (b.crew.length === 0 || !b.alive) continue;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * ENGINEER_REPAIR_SHARE * b.crew.length * dt);
      if (b.hp < b.maxHp) continue;
      // Repaired hospital: wounded engineers stay on as patients; the rest walk out.
      const crew = b.crew.splice(0);
      const out: Infantry[] = [];
      for (const c of crew) {
        if (b.canEnter(c)) b.garrison.push(c);
        else out.push(c);
      }
      this.placeOutside(b, out);
    }
  }

  /** The building is destroyed with engineers inside: they die with it, killed by whoever destroyed it. */
  private crushCrew(b: Building, killer?: Entity): void {
    for (const u of b.crew.splice(0)) {
      this.awardKill(u, killer);
      this.selection.selectedUnits.delete(u.id);
      this.entities.remove(u.id);
    }
  }

  /**
   * Housekeeping every JANITOR_INTERVAL seconds: drops baked pictures and terrain chunks that have not been
   * drawn since the last sweep, and forgets per-entity bookkeeping of units that no longer exist.
   *
   * This frees the game's own caches. It does not run the browser's garbage collector — a web page cannot
   * force that; it only makes the memory those caches held collectable.
   */
  private collectGarbage(): void {
    for (const id of [...this.lastShot.keys()]) if (!this.entities.get(id)) this.lastShot.delete(id);
    for (const id of [...this.lastDry.keys()]) if (!this.entities.get(id)) this.lastDry.delete(id);
    for (const [key, at] of [...this.alertAt]) if (this.time - at > 12) this.alertAt.delete(key);
    this.combat.sweep();
    const pics = sweepUnitSprites();
    const chunks = this.terrain.sweepChunks();
    if (import.meta.env.DEV) {
      console.debug(
        `[janitor] ${pics.dropped} pictures (${pics.freedMB.toFixed(1)} MB) + ${chunks.dropped} terrain chunks (${chunks.freedMB.toFixed(1)} MB) released; ${(unitSpriteBytes() / 1048576).toFixed(1)} MB of pictures still cached`,
      );
    }
  }

  /** Elite veterans (2 chevrons or more) slowly patch themselves up while nobody is shooting at them. */
  private regenVeterans(dt: number): void {
    for (const u of this.entities.fieldMovers()) {
      if (!u.alive || u.hp >= u.maxHp || u.rank < VETERAN_REGEN_RANK) continue;
      if (this.time - u.lastAttackedAt < VETERAN_REGEN_CALM) continue;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * VETERAN_REGEN_PER_SECOND * dt);
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
    this.placeOutside(b, out);
    if (out.length > 0 && why === 'healed' && b.owner === this.humanPlayer.id) this.sidebar.notify(`${out.length} healed and left the ${b.spec.name}.`);
    else if (out.length > 0) this.sidebar.notify(`${out.length} came out of: ${b.spec.name}.`);
  }

  /** Puts people who leave `b` on free cells in front of its door. */
  private placeOutside(b: Building, out: readonly Infantry[]): void {
    out.forEach((u, k) => {
      const off = spiralOffset(k, UNIT_SPACING * 1.15);
      const base = { x: (b.x + b.w / 2) * CELL_SIZE + off.x, y: (b.y + b.d + 1.2) * CELL_SIZE + off.y };
      const cell = this.pathfinder.nearestPassable(Math.floor(base.x / CELL_SIZE), Math.floor(base.y / CELL_SIZE), 8, undefined, u.swims);
      u.px = cell ? (cell.x + 0.5) * CELL_SIZE : base.x;
      u.py = cell ? (cell.y + 0.5) * CELL_SIZE : base.y;
      u.insideId = null;
      u.stop();
    });
  }

  /** A nation hitting one of the player's structures after DERRICK_GRACE_GAP s of quiet starts a new attack. */
  private countAttackOnPlayer(s: Unit, t: Entity): void {
    if (!(t instanceof Building) || t.owner !== this.humanPlayer.id || s.owner === t.owner) return;
    const last = this.lastHitOnPlayer.get(s.owner);
    if (last === undefined || this.time - last > DERRICK_GRACE_GAP) this.attacksOnPlayer++;
    this.lastHitOnPlayer.set(s.owner, this.time);
  }

  /** The player's oil derricks cannot be attacked during the first DERRICK_GRACE_ATTACKS attacks on the player. */
  isShielded(b: Building): boolean {
    return b.spec.type === 'oilDerrick' && b.owner === this.humanPlayer.id && this.attacksOnPlayer < DERRICK_GRACE_ATTACKS;
  }

  /** What the Global Financial Center pays for `b` (its build cost × health × RESALE_SHARE); null: cannot be sold. */
  private salePrice(b: Building): number | null {
    if (!b.alive || b.indestructible || b.spec.type === 'capital') return null;
    const option = BUILD_OPTIONS.find((o) => o.id === b.spec.type);
    if (!option) return null;
    return Math.round((buildCost(option, b.faction as FactionId) * RESALE_SHARE * b.hp) / b.maxHp / 10) * 10;
  }

  /**
   * Ctrl+click on one of the player's structures: the Global Financial Center buys it back, the money goes into the
   * national budget and the structure is taken down, leaving its ground free for the next one.
   */
  private sellBuilding(b: Building): void {
    const price = this.salePrice(b);
    if (price === null) {
      this.sidebar.notify(`The ${b.spec.name} cannot be sold.`, 3);
      return;
    }
    const p = this.players.find((pl) => pl.id === b.owner);
    if (!p) return;
    p.credits += price;
    this.removeBuilding(b);
    this.sidebar.notify(`${b.spec.name} sold to the Global Financial Center: +${price} ${CURRENCY}.`, 3);
  }

  /** Takes a structure off the map: its people step out, its aircraft move or burn, its cells become free. */
  private removeBuilding(e: Building): void {
    if (this.selection.selectedId === e.id) this.selection.select(null);
    this.ejectUnits(e, [...e.garrison]);
    this.placeOutside(e, e.crew.splice(0));
    if (e.spec.type === 'airfield') {
      // Aircraft parked on it burn with it unless the nation has another airfield to move them to.
      const other = this.entities.buildings().some((b) => b.id !== e.id && b.owner === e.owner && b.alive && b.spec.type === 'airfield');
      if (!other) for (const v of this.entities.vehicles()) if (v.homeId === e.id && v.fixed) v.hp = 0;
    }
    this.map.occupy(e.x, e.y, e.w, e.d, null);
    this.entities.remove(e.id);
    const i = this.derricks.indexOf(e as OilDerrick);
    if (i >= 0) this.derricks.splice(i, 1);
  }

  /** Humane victor: the Global Financial Center rewards a nation that lets a retreating enemy go. */
  private payMercyBonus(nation: number, fugitive: Unit): void {
    // Once per retreating group and nation, however many units of the group it lets go.
    const key = `${fugitive.retreatGroup}:${nation}`;
    if (this.mercyPaid.has(key)) return;
    this.mercyPaid.add(key);
    const p = this.players.find((pl) => pl.id === nation);
    if (!p || p.defeated) return;
    p.credits += MERCY_BONUS;
    if (p.isHuman) this.sidebar.notify(`Mercy bonus: you let a retreating enemy group go — Global Financial Center pays +${MERCY_BONUS} ${CURRENCY}.`, 3);
  }

  /** A plain move that takes the unit closer to its own capital is a retreat (enemies may not chase it). */
  private isRetreat(u: Unit, to: WorldPoint): boolean {
    const capital = this.entities.buildings().find((b) => b.owner === u.owner && b.alive && b.spec.type === 'capital');
    if (!capital) return false;
    const home = capital.centerWorld();
    return Math.hypot(to.x - home.x, to.y - home.y) < Math.hypot(u.px - home.x, u.py - home.y);
  }

  /** Click on the radar with units selected: they go to that spot (in waypoint mode it becomes the next point). */
  private minimapOrder(world: WorldPoint): boolean {
    if (this.paused || this.placing || this.selection.selectedUnits.size === 0) return false;
    if (!this.map.cellAt(world.x, world.y)) return true; // off the map: no order, camera stays
    if (this.waypoints) {
      if (this.waypoints.length < MAX_WAYPOINTS) this.waypoints.push(world);
      return true;
    }
    this.orderMove(world);
    return true;
  }

  /** Ends waypoint mode: the selected units follow the plotted points in order (nothing plotted: just cancels). */
  private finishWaypoints(): void {
    const points = this.waypoints;
    this.waypoints = null;
    if (!points || points.length === 0) return;
    const units = this.selection.selectedUnitList();
    if (units.length === 0) return;
    const first = points[0]!;
    units.sort((a, b) => Math.hypot(a.px - first.x, a.py - first.y) - Math.hypot(b.px - first.x, b.py - first.y));
    const spacing = Math.max(UNIT_SPACING * 1.15, Math.max(...units.map((u) => u.radius)) * 2.1);
    units.forEach((u, k) => {
      u.parade = null;
      u.task = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.chasing = false;
      u.retreating = false;
      u.sparedBy.clear();
      const off = spiralOffset(k, spacing);
      const route: WorldPoint[] = [];
      let from: WorldPoint = { x: u.px, y: u.py };
      for (const p of points) {
        let goal = { x: p.x + off.x, y: p.y + off.y };
        if (u.aircraft) {
          route.push(goal); // aircraft fly straight from point to point
          continue;
        }
        let cell = this.map.cellAt(goal.x, goal.y);
        if (!cell || !this.pathfinder.passable(cell.x, cell.y, u.swims)) {
          const near = this.pathfinder.nearestPassable(cell?.x ?? 0, cell?.y ?? 0, 10, undefined, u.swims);
          if (!near) continue;
          cell = near;
          goal = { x: (near.x + 0.5) * CELL_SIZE, y: (near.y + 0.5) * CELL_SIZE };
        }
        const leg = this.paths.find(from, cell, u.swims);
        const last = leg[leg.length - 1];
        if (last) {
          last.x = goal.x;
          last.y = goal.y;
        } else leg.push(goal);
        route.push(...leg);
        from = goal;
      }
      if (route.length === 0) return;
      u.orderFlash = { kind: 'move', at: this.time, target: null };
      u.follow(route);
    });
    const end = points[points.length - 1]!;
    this.moveMarker = { x: end.x, y: end.y, at: this.time };
  }

  /**
   * Nearest spot to `goal` where `u` can stand clear of everything: a passable cell, away from units that are not
   * part of the order (`group`) and from spots already given to others in it (`claimed`). Null when none is near.
   */
  /** Every cell the unit's circle at `p` touches is passable (so it never parks half on a structure). */
  private hullFits(p: WorldPoint, u: Unit): boolean {
    const r = u.radius + 1;
    const x0 = Math.floor((p.x - r) / CELL_SIZE);
    const x1 = Math.floor((p.x + r) / CELL_SIZE);
    const y0 = Math.floor((p.y - r) / CELL_SIZE);
    const y1 = Math.floor((p.y + r) / CELL_SIZE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!this.pathfinder.passable(x, y, u.swims)) return false;
    return true;
  }

  private freeStandSpot(goal: WorldPoint, u: Unit, group: readonly Unit[], claimed: readonly WorldPoint[]): WorldPoint | null {
    const others = this.entities.fieldMovers().filter((m) => m !== u && m.alive && !m.flies && !group.includes(m));
    const step = Math.max(u.radius * 2.1, UNIT_SPACING);
    for (let k = 0; k < 200; k++) {
      const off = spiralOffset(k, step);
      const p = { x: goal.x + off.x, y: goal.y + off.y };
      const cell = this.map.cellAt(p.x, p.y);
      if (!cell || !this.pathfinder.passable(cell.x, cell.y, u.swims)) continue;
      if (k > 0) {
        p.x = (cell.x + 0.5) * CELL_SIZE; // away from the click: stand on the middle of a cell
        p.y = (cell.y + 0.5) * CELL_SIZE;
      }
      // The whole hull must fit: no part of it may hang over a building, water or the map edge.
      if (!this.hullFits(p, u)) continue;
      // Stationary units hold their ground; a moving one counts by where it is heading.
      if (others.some((m) => {
        const at = m.destination ?? { x: m.px, y: m.py };
        const gap = m.radius + u.radius + (m instanceof Vehicle && u instanceof Vehicle ? VEHICLE_GAP : 0);
        return Math.hypot(at.x - p.x, at.y - p.y) < gap;
      })) continue;
      if (claimed.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < u.radius * 2)) continue;
      return p;
    }
    return null;
  }

  private orderMove(world: WorldPoint, units: Unit[] = this.selection.selectedUnitList(), evacuate = true): void {
    units = this.keepAircraftAtAirfield(units, world);
    if (!this.map.cellAt(world.x, world.y) || units.length === 0) return;
    // A new move order ends a repair job (mending, or driving to a repair vehicle).
    for (const u of units) if (u instanceof Vehicle) {
      u.repairTargetId = null;
      u.seekRepairId = null;
    }
    // Falling back home across the sea: the stranded ones head for a safe zone to be flown out.
    if (evacuate) {
      const stranded = this.strandedFrom(units, world).filter((u) => this.isRetreat(u, world) && !this.safeZones.isSafe(u.px, u.py));
      if (stranded.length > 0) {
        this.sendToSafeZone(stranded);
        units = units.filter((u) => !stranded.includes(u));
        if (units.length === 0) return;
      }
    }
    // Closest soldiers take the spots nearest the click; the first stands exactly on it.
    units.sort((a, b) => Math.hypot(a.px - world.x, a.py - world.y) - Math.hypot(b.px - world.x, b.py - world.y));
    // Destination spots are as far apart as the biggest unit needs, so tanks and aircraft never share a point.
    const spacing = Math.max(UNIT_SPACING * 1.15, Math.max(...units.map((u) => u.radius)) * 2.1);
    const group = this.nextRetreatGroup++;
    // Spots already handed out in this order: no two units of the group are sent to the same place.
    const claimed: WorldPoint[] = [];
    // Ground units of the order, by whether they swim: each set shares one flow field (PathService).
    const walkers: (GroupMember & { ticket: number; facing: number })[] = [];
    const swimmers: (GroupMember & { ticket: number; facing: number })[] = [];
    // RA2 formation: the ground units line up side by side across the way the group travels (front row first,
    // further rows behind it) and all end up facing that way — never nose to nose.
    const ground = units.filter((u) => !u.aircraft);
    const gx = ground.reduce((s, u) => s + u.px, 0) / Math.max(1, ground.length);
    const gy = ground.reduce((s, u) => s + u.py, 0) / Math.max(1, ground.length);
    // Converging from all sides (the group's middle is already at the spot): face the way most of them are heading.
    const hx = ground.reduce((s, u) => s + Math.cos(u.heading), 0);
    const hy = ground.reduce((s, u) => s + Math.sin(u.heading), 0);
    const facing = Math.hypot(world.x - gx, world.y - gy) > CELL_SIZE * 2 ? Math.atan2(world.y - gy, world.x - gx) : Math.atan2(hy, hx || 1e-6);
    const cols = Math.min(ground.length, Math.max(2, Math.ceil(Math.sqrt(ground.length * 2))));
    const formationOffset = (k: number): WorldPoint => {
      const row = Math.floor(k / cols);
      const inRow = Math.min(cols, ground.length - row * cols);
      const across = ((k % cols) - (inRow - 1) / 2) * spacing;
      const back = row * spacing;
      return { x: -Math.sin(facing) * across - Math.cos(facing) * back, y: Math.cos(facing) * across - Math.sin(facing) * back };
    };
    let groundIndex = 0;
    units.forEach((u, k) => {
      u.parade = null; // leaves the parade ground
      u.task = null;
      if (u instanceof Infantry) u.charge = null;
      u.attackTarget = null;
      u.attackMove = null;
      u.chasing = false;
      u.chaseFrom = null; // a new move order: any later chase is measured from where it gets to
      u.retreating = this.isRetreat(u, world);
      u.retreatGroup = group;
      u.sparedBy.clear();
      const off = u.aircraft ? spiralOffset(k, spacing) : formationOffset(groundIndex++);
      let goal = { x: world.x + off.x, y: world.y + off.y };
      let cell = this.map.cellAt(goal.x, goal.y);
      if (!u.aircraft && (!cell || !this.pathfinder.passable(cell.x, cell.y, u.swims))) {
        // Spot not standable: use the nearest standable cell centre instead.
        const near = this.pathfinder.nearestPassable(cell?.x ?? 0, cell?.y ?? 0, 10, undefined, u.swims);
        if (!near) return;
        cell = near;
        goal = { x: (near.x + 0.5) * CELL_SIZE, y: (near.y + 0.5) * CELL_SIZE };
      }
      if (!u.aircraft) {
        // Park / stand only where nothing is in the way: no other unit, no building, no water.
        const free = this.freeStandSpot(goal, u, units, claimed);
        if (!free) return;
        goal = free;
        cell = this.map.cellAt(goal.x, goal.y);
        claimed.push(goal);
      }
      u.orderFlash = { kind: 'move', at: this.time, target: null };
      if (u.aircraft) {
        u.follow([goal]); // aircraft ignore terrain and fly straight (parked ones take off first)
        return;
      }
      if (!cell) return;
      // Its route comes from the group's shared flow field a few frames later; until then it stands (and turns).
      u.stop();
      (u.swims ? swimmers : walkers).push({ unit: u, goal, cell, ticket: u.pathTicket, facing });
    });
    for (const members of [walkers, swimmers]) {
      const lead = members[0];
      if (!lead) continue;
      const swim = lead.unit.swims;
      this.paths.schedule(
        this.paths.groupJob(members, lead.cell, swim, (m, path) => {
          const mm = m as (typeof members)[number];
          if (!mm.unit.alive || mm.unit.pathTicket !== mm.ticket) return; // given another order meanwhile
          const last = path[path.length - 1];
          if (last) {
            last.x = mm.goal.x;
            last.y = mm.goal.y;
          } else path.push(mm.goal);
          mm.unit.follow(path);
          mm.unit.faceOnArrival = mm.facing; // the whole group ends up facing the same way
        }),
      );
    }
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
      // [distance from our own capital, distance from every foreign capital] in cells, relaxed step by step —
      // first with every derrick well inside our own land (never on or near a foreign border), then anywhere.
      const steps = [[38, 40], [30, 32], [22, 24], [14, 18], [6, 12], [0, 8]] as const;
      // Never next to another nation's oil field: OIL_FIELD_SPACING cells from every foreign derrick (half that as a last resort).
      const fields = this.derricks.map((dr) => ({ x: dr.x, y: dr.y }));
      // A nation tied to a real oil region (OIL_SITES) builds there, however near or far its capital is.
      const site = OIL_SITES[f];
      const near = site ? (this.map.cellAt(geoToWorld(site).x, geoToWorld(site).y) ?? undefined) : undefined;
      const passes = [
        ...steps.map(([a, b]) => [a, b, 6, OIL_FIELD_SPACING] as const),
        ...steps.map(([a, b]) => [a, b, 1, OIL_FIELD_SPACING] as const),
        ...steps.map(([a, b]) => [a, b, 1, OIL_FIELD_SPACING / 2] as const),
        // Only if the homeland has no room at all may the field leave it.
        ...steps.map(([a, b]) => [a, b, 0, OIL_FIELD_SPACING / 2] as const),
      ];
      // A nation tied to an oil region never leaves its own land for it: wider region, closer neighbours, but inside.
      // (OIL_SITES_ABROAD: the region lies outside the homeland, so the field stands on neutral ground there.)
      const abroad = OIL_SITES_ABROAD.has(f);
      const sitePasses = (abroad ? [8, 12, 16] : [16, 24, 32]).flatMap((r): (readonly [number, number, number])[] =>
        abroad
          ? [[0, OIL_FIELD_SPACING, r], [0, OIL_FIELD_SPACING / 2, r], [0, 0, r]]
          : [[6, OIL_FIELD_SPACING, r], [1, OIL_FIELD_SPACING, r], [1, OIL_FIELD_SPACING / 2, r], [1, 0, r]],
      );
      const plan = near
        ? sitePasses.map(([minSafe, fieldsAway, nearRadius]) => ({ minAway: 0, avoidAway: 8, minSafe, fieldsAway, nearRadius }))
        : passes.map(([minAway, avoidAway, minSafe, fieldsAway]) => ({ minAway, avoidAway, minSafe, fieldsAway, nearRadius: 0 }));
      for (const { minAway, avoidAway, minSafe, fieldsAway, nearRadius } of plan) {
        row = findOilRow(this.map, safety, { x: capital.x, y: capital.y }, OIL_DERRICK_COUNT[f], {
          w: FOOTPRINT_SMALL.w,
          d: FOOTPRINT_SMALL.d,
          gap: 1,
          radius: 110,
          minAway,
          avoid: foreignCapitals,
          avoidAway,
          perRow: OIL_ROW_MAX,
          minSafe,
          fields,
          fieldsAway,
          near,
          nearRadius,
        });
        if (row) break;
      }
      if (!row) {
        console.warn(`No room for ${f}'s oil row.`);
        continue;
      }
      row.forEach((cell, i) => {
        // One derrick of every row is managed by the Global Financial Center: it stays the nation's but cannot be destroyed.
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
