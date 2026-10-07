import type { BuildingType, FactionId, GeoPoint, NamedSite, UnitTier, VehicleKind, WeaponKind, WeaponSpec } from './types';

// ---------------------------------------------------------------- World (real Earth)
/** Packed Earth texture built by `npm run build:earth` (see scripts/build-earth.mjs). */
export const EARTH_TEXTURE_URL = `${import.meta.env.BASE_URL}data/earth.png`;
/** Earth data resolution (equirectangular, 1 texel ≈ 9.8 km at the equator). */
const EARTH_TEX_WIDTH = 4096;
const EARTH_TEX_HEIGHT = 2048;
/**
 * World px per Earth texel. 2.25 per side = 5.06× the land area of a 1:1 world,
 * so there is five times more room to build while buildings keep their size.
 */
export const WORLD_SCALE = 2.25;
export const WORLD_WIDTH = EARTH_TEX_WIDTH * WORLD_SCALE;
export const WORLD_HEIGHT = EARTH_TEX_HEIGHT * WORLD_SCALE;
/** Elevation / depth encoding of the Earth texture channels. */
export const ELEVATION_M_PER_UNIT = 6400 / 255;
export const DEPTH_M_PER_UNIT = 11000 / 255;
/** Hill-shading strength (higher = more dramatic relief). */
export const RELIEF_EXAGGERATION = 1 / 1300;
export const MAP_SEED = 20261005;

// ---------------------------------------------------------------- Logic grid
/**
 * Size of one gameplay cell ("ô vuông") in world px — pathing & building placement.
 * The grid is rounded up, so the last column/row may poke slightly past the world edge.
 */
export const CELL_SIZE = 7;
export const GRID_WIDTH = Math.ceil(WORLD_WIDTH / CELL_SIZE);
export const GRID_HEIGHT = Math.ceil(WORLD_HEIGHT / CELL_SIZE);

// ---------------------------------------------------------------- Building sprites
/**
 * The battlefield is drawn isometrically, like Red Alert 2. The square gameplay grid ("ô vuông") is the
 * hidden grid of the whole Earth surface; on screen every cell is a 2:1 diamond: world x runs down-right,
 * world y down-left. ISO_X / ISO_Y are screen px per world px (see core/IsoView).
 */
export const ISO_X = 0.5;
export const ISO_Y = 0.25;
/** Sprites are authored in a 2:1 isometric art space (tile = 64×32 px)… */
const TILE_W = 64;
const TILE_H = 32;
export const HALF_TW = TILE_W / 2;
export const HALF_TH = TILE_H / 2;
/**
 * …and scaled so a building's art ground diamond is exactly the diamond that its W×D grid footprint
 * covers on screen: buildings fill their cells edge to edge, whatever their size.
 */
export const SPRITE_SCALE = (CELL_SIZE * ISO_X) / HALF_TW;
/** Tallest building art in the game (art px: Happy City 220, High-Tech Center 205, capitals ≤ 112). */
export const TALLEST_BUILDING_ART = 220;
/** Aircraft cruise above the roof of the tallest building of any nation, with a margin (iso px). */
export const CRUISE_ALTITUDE = Math.ceil(TALLEST_BUILDING_ART * SPRITE_SCALE) + 6;
/** Large structures (War Factory, Hospital) occupy 5×4 cells, everything else 4×4 (7 px cells). */
export const FOOTPRINT_LARGE = { w: 5, d: 4 } as const;
export const FOOTPRINT_SMALL = { w: 4, d: 4 } as const;
/**
 * Capitals sit on a 5 × 8 plot: the palace itself on roughly 5 × 5, and the nation's ceremonial approach
 * (the Mall, Red Square, the outer courtyard, the esplanade) on the 5 × 3 in front of it. The art is
 * authored in 4 × 6.4 units and drawn 1.25× to fill the plot.
 */
export const FOOTPRINT_CAPITAL = { w: 5, d: 8 } as const;
/** Airfield: a long runway + an apron with six parking spots, 12×6 tiles. */
export const FOOTPRINT_AIRFIELD = { w: 12, d: 6 } as const;
/** Happy City: a whole city block, 8×8 tiles. */
export const FOOTPRINT_CITY = { w: 8, d: 8 } as const;

// ---------------------------------------------------------------- Simulation & camera
export const TICK_RATE = 30;
export const CAMERA_PAN_SPEED = 1100; // screen px / second
export const CAMERA_EDGE_MARGIN = 16; // px from the window edge that triggers scrolling
export const CAMERA_EDGE_SCROLL = true;
/** Tactical zoom only — the whole-world overview lives on the sidebar radar. */
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 7;
export const ZOOM_STEP = 1.12;
/** Zoom used at start and when jumping to a building. */
export const FOCUS_ZOOM = 7;

// ---------------------------------------------------------------- Players & economy
/** In-game currency unit shown everywhere in the UI. */
export const CURRENCY = 'TB';
// ---------------------------------------------------------------- Construction
/** Build speed: every structure advances BUILD_STEP_FRACTION every BUILD_STEP_SECONDS (20% / 4 s). */
export const BUILD_STEP_SECONDS = 4;
export const BUILD_STEP_FRACTION = 0.2;
/** Cost of an infantry barracks, paid gradually from the nation's treasury. */
export const BARRACKS_COST = 800;
export const HOSPITAL_COST = 1200;
export const AIRFIELD_COST = 2000;
/** High-Tech Center (a high-rise): base price; it unlocks the second-tier soldiers and vehicles. */
export const TECH_CENTER_COST = 8000;
/** Second-tier units that need a High-Tech Center: special-forces soldiers and the armoured fighting vehicle. */
export const TECH_TIERS: readonly UnitTier[] = ['special'];
export const TECH_VEHICLES: readonly VehicleKind[] = ['ifv', 'transport'];
/**
 * Happy City: no limit on how many a nation builds; fixed price (no faction cost multiplier). Every city pays
 * HAPPY_CITY_TAX TB of taxes into its nation's budget every HAPPY_CITY_TAX_PERIOD seconds, each on its own clock.
 */
export const HAPPY_CITY_COST = 10000;
export const HAPPY_CITY_TAX = 500;
export const HAPPY_CITY_TAX_PERIOD = 60;
/** Duration of the build-up animation after placing a structure. */
export const BUILD_RISE_SECONDS = 1.2;

// ---------------------------------------------------------------- Infantry
/** Base infantry stats; faction multipliers (cost, armor → hp, unitSpeed) apply on top. */
export const INFANTRY_BASE = {
  regular: { cost: 200, trainSeconds: 5, maxHp: 125, speed: 1.4 },
  special: { cost: 500, trainSeconds: 10, maxHp: 200, speed: 1.7 },
  president: { cost: 1000, trainSeconds: 12, maxHp: 150, speed: 1.2 },
  engineer: { cost: 400, trainSeconds: 6, maxHp: 100, speed: 1.3 },
} as const;
/**
 * BuildLimit: how many orders a nation may have waiting at once (the one being made included). Any type may be
 * ordered; a slot frees up as soon as an order is completed. There is no cap on how many units a nation owns.
 */
export const BUILD_LIMIT_SOLDIERS = 15;
export const BUILD_LIMIT_VEHICLES = 10;
/** Army cap: a nation never has more than this many soldiers (alive anywhere + on order). */
export const MAX_SOLDIERS = 25;
/** Ground vehicle cap (light, tank, IFV — alive + on order); aircraft are not limited by it. */
export const MAX_GROUND_VEHICLES = 30;
/** Transport aircraft a nation may own at once (alive + on order). Fighters are not limited by it. */
export const MAX_TRANSPORTS = 3;
/**
 * Elite (second-tier) soldiers are never more than the regular (first-tier) ones, at most 2 for every 3
 * regulars: with 5 soldiers that is 3 regular + 2 elite. Alive soldiers and soldiers on order both count.
 */
export const eliteCap = (regulars: number): number => Math.floor((regulars * 2) / 3);
/** Special-forces soldiers swim; they move at this fraction of their speed in water. */
export const SWIM_SPEED_FACTOR = 0.6;
/** Leg-swing phase (radians) per world px walked: higher = shorter, quicker steps. */
export const STEP_PHASE_PER_PX = 2.4;
/** Minimum distance between two soldiers' feet (world px): they never overlap. */
export const UNIT_SPACING = 2.2;
/** Freshly trained soldiers never stand farther than this many cells from the barracks' walls. */
export const PARADE_MAX_CELLS = 2;
/** Parade spacing between soldiers (world px) and the gap between the barracks front edge and the first row. */
export const PARADE_SPACING = 3.4;
export const PARADE_GAP = 3;
// ---------------------------------------------------------------- Combat
/** Weapon stats (range in world px; faction firepower/range multipliers apply on top). */
export const WEAPONS: Readonly<Record<WeaponKind, WeaponSpec>> = {
  rifle: { kind: 'rifle', damage: 9, range: 32, cooldown: 0.75, vsBuilding: 0.4, hitsAir: false, splash: 0 },
  smg: { kind: 'smg', damage: 6, range: 30, cooldown: 0.22, vsBuilding: 0.35, hitsAir: true, splash: 0 },
  sniper: { kind: 'sniper', damage: 45, range: 56, cooldown: 2.2, vsBuilding: 0.15, hitsAir: false, splash: 0 },
  mg: { kind: 'mg', damage: 5, range: 30, cooldown: 0.18, vsBuilding: 0.3, hitsAir: true, splash: 0 },
  cannon: { kind: 'cannon', damage: 60, range: 50, cooldown: 1.8, vsBuilding: 1.6, hitsAir: false, splash: 7 },
  autocannon: { kind: 'autocannon', damage: 16, range: 42, cooldown: 0.5, vsBuilding: 0.7, hitsAir: true, splash: 0 },
  missile: { kind: 'missile', damage: 45, range: 60, cooldown: 1.4, vsBuilding: 1.3, hitsAir: true, splash: 4 },
};
/** Which weapon each vehicle carries. */
export const VEHICLE_WEAPON: Readonly<Partial<Record<VehicleKind, WeaponKind>>> = {
  light: 'mg',
  tank: 'cannon',
  ifv: 'autocannon',
  jet: 'missile',
};
/** Soldiers only shoot at enemies within this many cells (vehicles keep their own, longer ranges). */
export const INFANTRY_MAX_RANGE_CELLS = 3;
/** How often (s) an idle armed unit looks for a new target / repaths while chasing. */
export const ACQUIRE_PERIOD = 0.3;
export const CHASE_PERIOD = 0.8;
/** A unit that was shot at hits back at an attacker up to this many times its weapon range away. */
export const RETALIATE_RANGE_FACTOR = 2.2;
/** Idle armed units notice enemies up to this many times their weapon range away and move in to fight. */
export const GUARD_VISION_FACTOR = 1.8;

// ---------------------------------------------------------------- Vehicles & aircraft
/**
 * Base vehicle stats; faction multipliers (cost, armor → hp, unitSpeed) apply on top.
 * speed is in cells per second, radius in world px. Jets are built at the Airfield,
 * everything else at the War Factory.
 */
export const VEHICLE_BASE = {
  light: { cost: 600, trainSeconds: 8, maxHp: 180, speed: 2.4, radius: 3.4 },
  tank: { cost: 1200, trainSeconds: 14, maxHp: 420, speed: 1.4, radius: 4.2 },
  ifv: { cost: 900, trainSeconds: 11, maxHp: 300, speed: 1.8, radius: 4.0 },
  jet: { cost: 1600, trainSeconds: 16, maxHp: 220, speed: 9, radius: 3.2 },
  /** Unarmed cargo aircraft: slower than the fighter. */
  transport: { cost: 1400, trainSeconds: 14, maxHp: 260, speed: 5.5, radius: 3.6 },
} as const;

/** Aircraft are built at the Airfield and use its runway; everything else rolls out of the War Factory. */
export const isAircraftKind = (kind: VehicleKind): boolean => kind === 'jet' || kind === 'transport';

/**
 * Temporary: only these vehicles can be produced (sidebar and AI). The rest stay in the code but are
 * hidden until they are wanted again — add a kind here to bring it back.
 */
export const AVAILABLE_VEHICLES: readonly VehicleKind[] = ['tank', 'ifv', 'jet', 'transport'];

/**
 * Transport aircraft load: soldiers only → 12; soldiers + a vehicle → 8 soldiers and 1 vehicle;
 * vehicles only → 3 (2 or 3 vehicles leave no room for soldiers).
 */
export const TRANSPORT_SOLDIERS = 12;
export const TRANSPORT_MIXED_SOLDIERS = 8;
export const TRANSPORT_VEHICLES = 3;
/**
 * Clear space (world px) vehicles keep between their hulls, on the ground and in the air, on top of their
 * collision radii. Soldiers are not held this far apart — crowds of infantry are meant to close up.
 */
export const VEHICLE_GAP = 2;
/** Ground vehicles this close (px) to an enemy soldier run it over. */
export const CRUSH_RADIUS = 2.4;
/** Veteran / Elite / Elite+ at 3× / 6× / 9× the unit's own price in destroyed enemy value. */
export const RANK_KILL_MULTIPLES = [3, 6, 9] as const;
/**
 * Veterans patch themselves up in the field from this rank on (2 chevrons = Elite). The pace is deliberately
 * slow — a share of the unit's own max HP per second — and it only starts after VETERAN_REGEN_CALM seconds
 * without being hit, so an elite under fire still dies.
 */
export const VETERAN_REGEN_RANK = 2;
export const VETERAN_REGEN_PER_SECOND = 0.01;
export const VETERAN_REGEN_CALM = 5;
/** Seconds between housekeeping sweeps that drop the game's unused picture and terrain caches. */
export const JANITOR_INTERVAL = 180;
export const WAR_FACTORY_COST = 2000;

/** Unused: engineers now restore a friendly building to 100% at once and are consumed. */
export const ENGINEER_REPAIR_HP_PER_SECOND = 60;
/** Hospital: HP per second restored to each patient inside, and its capacity. */
export const HOSPITAL_HEAL_PER_SECOND = 10;
export const HOSPITAL_CAPACITY = 20;

/** Every nation starts broke; oil derricks are the only source of TB. */
export const STARTING_CREDITS = 0;

/** Owner id of neutral entities (not a player). */
export const NEUTRAL_OWNER = 0;

/** Faction order used for player ids, sidebar listing and hotkeys 1..4. */
export const FACTION_ORDER: readonly FactionId[] = ['usa', 'russia', 'china', 'europe'];

// ---------------------------------------------------------------- Landmarks (real coordinates)
export const CAPITAL_LOCATIONS: Readonly<Record<FactionId, NamedSite>> = {
  usa: { lon: -77.04, lat: 38.9, name: 'Washington, D.C.' },
  russia: { lon: 37.62, lat: 55.75, name: 'Moscow' },
  china: { lon: 116.4, lat: 39.9, name: 'Beijing' },
  europe: { lon: 4.35, lat: 50.85, name: 'Brussels' },
};
export const WORLD_BANK_LOCATION: GeoPoint = { lon: 8.54, lat: 47.37 }; // Zürich
/** Neutral CHHG complex on the Antarctic ice (inland, Queen Maud Land). */
export const CHHG_LOCATION: GeoPoint = { lon: 20, lat: -78 };

// ---------------------------------------------------------------- Oil (replaces RA2 ore)
/** Barrels of oil pumped per second by each derrick while it is pumping (oil is sold to the World Bank for TB). */
export const OIL_DERRICK_OUTPUT = 0.1 / 10; // 0.1 barrel every 10 s
/** Every nation starts with some oil in stock, so the first sale can pay for the first buildings. */
export const STARTING_OIL = 20;
/**
 * World Bank oil market: one price for everybody (TB per barrel). It rises and falls mainly with
 *   - FLOW: barrels the nations sold to the Bank lately (more oil sold → cheaper) against barrels the Bank had
 *     to sell them for their power grids (more bought → dearer), both remembered over ~OIL_FLOW_MEMORY seconds;
 *   - WEALTH: the average net worth of the nations still in the war (richer world → dearer oil);
 *   - a small mean-reverting market mood (±OIL_MOOD_MAX) so the chart never sits flat.
 *   target = OIL_PRICE_START × wealthFactor × flowFactor × (1 + mood), clamped to [MIN, MAX];
 * the posted price eases towards that target every OIL_PRICE_INTERVAL seconds.
 */
export const OIL_PRICE_START = 600;
export const OIL_PRICE_MIN = 150;
export const OIL_PRICE_MAX = 1500;
export const OIL_PRICE_INTERVAL = 10;
/** Share of the gap to the target price closed at each revision (0..1). */
export const OIL_PRICE_EASE = 0.35;
/** Seconds over which sold / bought barrels fade out of the market's memory (exponential decay). */
export const OIL_FLOW_MEMORY = 90;
/** Barrels of flow that move the price noticeably (smaller = jumpier market). */
export const OIL_FLOW_REF = 3;
/** Exponent on the flow ratio (0.5 = square root: doubling sales cuts the price by ~30%). */
export const OIL_FLOW_WEIGHT = 0.5;
/** Average net worth per nation (TB) at which wealth leaves the price unchanged, and its exponent. */
export const OIL_WEALTH_REF = 15000;
export const OIL_WEALTH_WEIGHT = 0.3;
/** Market mood: at most ±12%, stepping by up to ±4% per revision and pulled 15% back to 0 each time. */
export const OIL_MOOD_MAX = 0.12;
export const OIL_MOOD_STEP = 0.04;
export const OIL_MOOD_PULL = 0.15;
/**
 * World Bank credit: when the treasury is at 0 TB the player may press "Emergency loan" (never automatic). No interest.
 * The Bank lends against what the nation could sell to pay it back (its collateral):
 *   collateral = oil stock × posted price + RESALE_SHARE × (structures' build cost × health share + vehicles' cost)
 *   credit line = LOAN_TO_VALUE × collateral
 * Each loan pays LOAN_SHARE of the credit line (at least LOAN_MIN, never past the line) and adds it to DEBT.
 * Once DEBT reaches the line, credit is frozen until DEBT ≤ DEBT_RESUME_SHARE × line. All income pays debt first.
 */
export const RESALE_SHARE = 0.5;
export const LOAN_TO_VALUE = 0.5;
export const LOAN_SHARE = 0.25;
export const LOAN_MIN = 1000;
export const DEBT_RESUME_SHARE = 0.5;
/** The Bank never buys more than this share of the offered stock in one sale. */
export const WB_MAX_SHARE = 0.25;
/** No limit on the number of sales, but a nation must wait this many seconds between two offers. */
export const OIL_SALE_COOLDOWN = 2;
/** Barrels that always stay in the nation's stock: a sale never dips below this reserve. */
export const OIL_RESERVE = 1.0;
/** Oil derricks per nation, built in one straight row on the safest ground: 4, or 5 for Europe (it also runs the World Bank). */
export const OIL_DERRICK_COUNT: Readonly<Record<FactionId, number>> = { usa: 4, russia: 4, china: 4, europe: 5 };
/** Oil cycle: pump for 3 minutes, then rest 1 minute while the field recovers. */
export const OIL_MINE_SECONDS = 180;
export const OIL_REST_SECONDS = 60;

// ---------------------------------------------------------------- Power (nuclear plants burn oil)
/**
 * Every structure drains power (units/s, see each entity's powerDrain). Nuclear plants turn the nation's oil
 * stock into power: 0.001 barrel → 1 power, so a plant burning at full rate uses 0.01 bbl/s for 10 power/s —
 * about one derrick's output. Each plant also stores up to POWER_PLANT_STORAGE; a new plant starts empty (0).
 * When the grid runs dry (drain > generation and storage empty) the World Bank is forced to sell the missing
 * oil at OIL_GRID_MARKUP × the posted price; with an empty treasury the nation falls into a blackout (low power).
 */
export const POWER_PER_BARREL = 1000;
export const POWER_PLANT_OUTPUT = 10;
export const POWER_PLANT_STORAGE = 300;
export const POWER_PLANT_COST = 1500;
export const OIL_GRID_MARKUP = 1.25;

/** Price-equivalent of a destroyed structure, for veteran experience (default 1000). */
export const BUILDING_VALUE: Readonly<Partial<Record<BuildingType, number>>> = {
  barracks: BARRACKS_COST,
  hospital: HOSPITAL_COST,
  warFactory: WAR_FACTORY_COST,
  airfield: AIRFIELD_COST,
  techCenter: TECH_CENTER_COST,
  happyCity: HAPPY_CITY_COST,
  powerPlant: POWER_PLANT_COST,
  capital: 4000,
  oilDerrick: 1500,
};
