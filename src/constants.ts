import type { FactionId, GeoPoint, NamedSite, VehicleKind, WeaponKind, WeaponSpec } from './types';

// ---------------------------------------------------------------- World (real Earth)
/** Packed Earth texture built by `npm run build:earth` (see scripts/build-earth.mjs). */
export const EARTH_TEXTURE_URL = `${import.meta.env.BASE_URL}data/earth.png`;
/** Earth data resolution (equirectangular, 1 texel ≈ 9.8 km at the equator). */
export const EARTH_TEX_WIDTH = 4096;
export const EARTH_TEX_HEIGHT = 2048;
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
/** Sprites are authored in a 2:1 isometric art space (tile = 64×32 px)… */
export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_TW = TILE_W / 2;
export const HALF_TH = TILE_H / 2;
/** …and shrunk to fit their grid footprint, so every building keeps the same proportion to the land. */
/** Large structures (capitals) occupy 5×4 cells, everything else 4×4 (7 px cells). */
export const FOOTPRINT_LARGE = { w: 5, d: 4 } as const;
export const FOOTPRINT_SMALL = { w: 4, d: 4 } as const;
/** Airfield: a long runway + an apron with six parking spots, 12×6 tiles. */
export const FOOTPRINT_AIRFIELD = { w: 12, d: 6 } as const;

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
/** Army size limits per nation (living + queued). Any mix of types may be bought, up to these totals. */
export const MAX_SOLDIERS = 20;
export const MAX_VEHICLES = 10;
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
/** Rotation step for buildings (R key), in degrees. */
export const ROTATE_STEP_DEG = 30;
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
export const VEHICLE_WEAPON: Readonly<Record<VehicleKind, WeaponKind>> = {
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
  light: { cost: 600, trainSeconds: 8, maxHp: 180, speed: 2.4, radius: 2.4 },
  tank: { cost: 1200, trainSeconds: 14, maxHp: 420, speed: 1.4, radius: 3.0 },
  ifv: { cost: 900, trainSeconds: 11, maxHp: 300, speed: 1.8, radius: 2.8 },
  jet: { cost: 1600, trainSeconds: 16, maxHp: 220, speed: 9, radius: 3.2 },
} as const;
export const WAR_FACTORY_COST = 2000;
/** Max vehicles waiting in a nation's vehicle queue. */
export const VEHICLE_QUEUE_MAX = 5;

/** Engineers repair this many HP per second on a friendly building. */
export const ENGINEER_REPAIR_HP_PER_SECOND = 60;
/** Hospital: HP per second restored to each patient inside, and its capacity. */
export const HOSPITAL_HEAL_PER_SECOND = 10;
export const HOSPITAL_CAPACITY = 20;
/** Max soldiers waiting in a nation's training queue. */
export const TRAINING_QUEUE_MAX = 5;

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
/** TB per second produced by each oil derrick. */
export const OIL_DERRICK_INCOME = 20;
/** Oil derricks per nation, built in one straight row on the safest ground: 3, or 4 for Europe (it also runs the World Bank). */
export const OIL_DERRICK_COUNT: Readonly<Record<FactionId, number>> = { usa: 3, russia: 3, china: 3, europe: 4 };
/** Oil cycle: pump for 3 minutes, then rest 1 minute while the field recovers. */
export const OIL_MINE_SECONDS = 180;
export const OIL_REST_SECONDS = 60;
