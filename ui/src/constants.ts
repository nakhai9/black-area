import { t } from "./i18n";
import type {
  BuildingType,
  FactionId,
  GeoPoint,
  NamedSite,
  OilPolicy,
  UnitTier,
  VehicleKind,
  WeaponKind,
  WeaponSpec,
} from "./types";

/**
 * DEMO: skip the faction screen and start a solo test game as DEMO_FACTION (no AI opponents). Read from the env
 * (VITE_DEMO_MODE=true in .env.local); off when unset, so production builds never start in demo.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
/** DEMO_MODE nation, by number (VITE_DEMO_FACTION): 1 USA, 2 Russia, 3 China, 4 Europe, 5 Islamic (the FACTION_ORDER position, from 1). Default 2. */
export const DEMO_FACTION = Number(import.meta.env.VITE_DEMO_FACTION) || 2;

/**
 * Version of the game, x.y.z (semantic versioning):
 *  - x (major): a big change that breaks compatibility — old save files no longer load, or the game is reworked;
 *  - y (minor): new content or rules — a new unit, structure, faction feature or game rule (saves still load);
 *  - z (patch): fixes and tuning — bug fixes, balance numbers, art / UI touch-ups, no new features.
 * How to update: after each change bump the matching part and reset the parts to its right to 0 (1.2.3 → fix 1.2.4,
 * feature 1.3.0, breaking 2.0.0), and write the same number into RULE.html and README.md.
 */
export const GAME_VERSION = "2.75.0";

/** An Allied Building within this many cells of any capital is an embassy; farther out it is a "Pro-<nation> regime". */
export const EMBASSY_CAPITAL_CELLS = 25;

/** War / ceasefire cycle: WAR_SECONDS of war between the nations, then PEACE_SECONDS of peace to build up, over and over. */
export const WAR_SECONDS = 10 * 60;
export const PEACE_SECONDS = 2 * 60;
/**
 * Ceasefire zone: during the peace, a unit (soldier, vehicle, aircraft) within TRUCE_ZONE_CELLS of the edge of another
 * nation's structure breaks the ceasefire: every other nation may destroy it and it may not fight back. Units have
 * TRUCE_GRACE_SECONDS after the ceasefire starts to leave such zones.
 */
export const TRUCE_ZONE_CELLS = 5;
export const TRUCE_GRACE_SECONDS = 15;

// ---------------------------------------------------------------- World (real Earth)
/** Packed Earth texture built by `npm run build:earth` (see scripts/build-earth.mjs). */
export const EARTH_TEXTURE_URL = `${import.meta.env.BASE_URL}data/earth.png`;
/** Earth data resolution (equirectangular, 1 texel ≈ 9.8 km at the equator). */
const EARTH_SOURCE_WIDTH = 4096;
const EARTH_TEX_HEIGHT = 2048;
/**
 * Narrower Atlantic: the open-ocean band between the Americas and Europe / Africa (lon west..east) is squeezed to
 * `keep` of its width when the Earth texture is loaded, so the continents sit closer. Brazil's tip (-34.8°) and
 * Senegal (-17.5°) stay outside the band, so their coasts keep their shape; Iceland / Greenland's east get narrower.
 */
export const ATLANTIC_SQUEEZE = { west: -34, east: -17, keep: 0.4 } as const;
/**
 * Narrower eastern Pacific: between Hawaii and the Americas (lon west..east) the open ocean keeps `keep` of its width,
 * but only between latitudes south..north (full squeeze inside, easing out over `ramp` degrees) so Alaska, Vancouver
 * Island and Antarctica keep their shape. Everything west of the band moves east; the strip left at the map's west
 * edge is open sea.
 */
export const PACIFIC_SQUEEZE = {
  west: -152,
  east: -125,
  keep: 0.35,
  south: -45,
  north: 40,
  ramp: 7,
} as const;
/** Degrees of longitude left after the squeeze (360 minus what the Atlantic band gave up). */
export const EARTH_LON_SPAN =
  360 -
  (ATLANTIC_SQUEEZE.east - ATLANTIC_SQUEEZE.west) * (1 - ATLANTIC_SQUEEZE.keep);
/** Width of the loaded (squeezed) Earth texture. */
export const EARTH_TEX_WIDTH = Math.round(
  (EARTH_SOURCE_WIDTH * EARTH_LON_SPAN) / 360,
);
/**
 * World px per Earth texel. 5.5 per side (≈2.4× the old 2.25) so island nations — Japan, Indonesia, Taiwan,
 * Hainan, Madagascar — have room for at least four structures while buildings keep their size.
 */
export const WORLD_SCALE = 5.5;
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
 * Size of one unit cell ("ô đơn vị", the 1×1 cell every system counts in) in world px — pathing, building
 * placement, footprints, flags, ranges in cells.
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
export const CRUISE_ALTITUDE =
  Math.ceil(TALLEST_BUILDING_ART * SPRITE_SCALE) + 6;
/** Large structures (War Factory) occupy 5×4 cells, everything else 4×4 (7 px cells). */
export const FOOTPRINT_LARGE = { w: 5, d: 4 } as const;
export const FOOTPRINT_SMALL = { w: 4, d: 4 } as const;
/** Ministry of Defence (barracks) plot: 5 × 3 cells; the USA's Pentagon stands on 4 × 4 (barracksFootprint). */
export const FOOTPRINT_BARRACKS = { w: 5, d: 3 } as const;
export const FOOTPRINT_PENTAGON = { w: 4, d: 4 } as const;
export function barracksFootprint(design: string): {
  readonly w: number;
  readonly d: number;
} {
  return design === "usa" ? FOOTPRINT_PENTAGON : FOOTPRINT_BARRACKS;
}
/** The Global Monitoring Center: 5 × 5 cells. */
export const FOOTPRINT_GMC = { w: 5, d: 5 } as const;
/** Bridge laid by a bridge layer: BRIDGE_W cells wide across, BRIDGE_L cells long (Bridge; rotated = long along x). */
export const BRIDGE_W = 2;
export const BRIDGE_L = 3;
export const FOOTPRINT_BRIDGE = { w: BRIDGE_W, d: BRIDGE_L } as const;
/** At most this many sections join end to end into one bridge (no bridges across a sea). Player and AI alike. */
export const BRIDGE_MAX_SECTIONS = 5;
/** Health of one bridge section (enemies can destroy it; it falls into the water). */
export const BRIDGE_HP = 900;
/** A bridge layer deploys once within this many cells of the spot it was sent to (its bow at the bridge's near end). */
export const BRIDGE_DEPLOY_CELLS = 2.5;
/** Attack orders go out in squads (player and AI): at least this many regular soldiers, special forces, tanks. */
export const SQUAD_MIN_REGULAR = 9;
export const SQUAD_MIN_SPECIAL = 5;
export const SQUAD_MIN_TANKS = 6;
/** A bridge may only be laid this close (cells, from the layer to the near end of the bridge) to where its layer stands. */
export const BRIDGE_REACH_CELLS = 4;
/** Pyramids of Giza (neutral monument). */
export const FOOTPRINT_PYRAMIDS = { w: 6, d: 6 } as const;
/** Flagpole: exactly one cell. */
export const FOOTPRINT_FLAGPOLE = { w: 1, d: 1 } as const;
/** Bunker: a small pillbox filling one cell. */
export const FOOTPRINT_BUNKER = { w: 1, d: 1 } as const;
/**
 * Capitals sit on a 5 × 5 plot: the palace itself only, with no ceremonial forecourt in front of it.
 * The art is authored in 4 × 4 units and drawn 1.25× to fill the plot.
 */
export const FOOTPRINT_CAPITAL = { w: 5, d: 5 } as const;
/** The White House is a long, shallow block: 5 wide × 3 deep (art authored in 4 × 2.4 units, drawn 1.25×). */
export const FOOTPRINT_WHITE_HOUSE = { w: 5, d: 3 } as const;
/** Contested-nation capitals: a long, shallow 5 × 3 plot like the White House (art 4 × 2.4 units, drawn 1.25×). */
export const FOOTPRINT_NATION_CAPITAL = { w: 5, d: 3 } as const;
/** Plot of a faction's capital. */
export function capitalFootprint(faction: FactionId): {
  readonly w: number;
  readonly d: number;
} {
  return faction === "usa" ? FOOTPRINT_WHITE_HOUSE : FOOTPRINT_CAPITAL;
}
/** Airfield: a long runway + an apron with nine parking spots, 12×8 tiles. */
export const FOOTPRINT_AIRFIELD = { w: 12, d: 8 } as const;
/** Happy City: a whole city block, 8×8 tiles. */
export const FOOTPRINT_CITY = { w: 8, d: 8 } as const;

// ---------------------------------------------------------------- Simulation & camera
export const TICK_RATE = 30;
/** Mercy bonus: the Global Monitoring Center pays a nation this much for each retreating enemy group it lets go unchased (once per group, whatever its size). */
export const MERCY_BONUS = 100;
/**
 * Grace period for the player's oil derricks: they cannot be attacked until enemy nations have launched this many
 * attacks (all nations together) on the player's structures. An attack starts when a nation hits one of them after
 * DERRICK_GRACE_GAP seconds without having hit any.
 */
export const DERRICK_GRACE_ATTACKS = 5;
export const DERRICK_GRACE_GAP = 30;
export const CAMERA_PAN_SPEED = 1100; // screen px / second (keyboard)
/** Slower pan while the cursor rests on the screen edge, so the view does not fly off. */
export const CAMERA_EDGE_PAN_SPEED = 450; // screen px / second
export const CAMERA_EDGE_MARGIN = 16; // px from the window edge that triggers scrolling
export const CAMERA_EDGE_SCROLL = true;
/** Tactical zoom only — the whole-world overview lives on the sidebar radar. */
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 9;
export const ZOOM_STEP = 1.12;
/** Zoom used at start and when jumping to a building. */
export const FOCUS_ZOOM = 8;

// ---------------------------------------------------------------- Players & economy
/** In-game currency unit shown everywhere in the UI. */
export const CURRENCY = "TB";
// ---------------------------------------------------------------- Construction
/** Build speed: every structure advances BUILD_STEP_FRACTION every BUILD_STEP_SECONDS (20% / 4 s). */
export const BUILD_STEP_SECONDS = 4;
export const BUILD_STEP_FRACTION = 0.2;
/** Cost of an infantry barracks, paid gradually from the nation's treasury. */
export const BARRACKS_COST = 800;
/** A national flagpole: one cell, decoration that also counts as one of the nation's structures. */
export const FLAGPOLE_COST = 100;
/**
 * Allied Building: the seat of an allied nation, raised on land the nation has claimed with a Squatters team. A nation
 * leads at most MAX_ALLIES allies (built or under construction).
 */
export const ALLIED_BUILDING_COST = 6000;
export const MAX_ALLIES = 6;
/**
 * Bunker (2×2): a self-firing machine-gun pillbox, no garrison needed. Every BUNKER_COOLDOWN seconds it fires at the
 * nearest enemy soldier or ground vehicle within BUNKER_RANGE world px (never at aircraft) for BUNKER_DAMAGE, scaled
 * by BUNKER_VS_VEHICLE against vehicles (≈32 dps on a soldier, ≈11 dps on armour). The AI raises up to AI_BUNKERS.
 */
export const BUNKER_COST = 800;
/** A bunker may stand up to this many cells from the edge of one of the nation's own base structures (Defense-tab ones never count). */
export const BUNKER_BUILD_RADIUS = 3;
export const BUNKER_HP = 1000;
export const BUNKER_POWER_DRAIN = 1;
export const BUNKER_RANGE = 40;
export const BUNKER_DAMAGE = 8;
export const BUNKER_COOLDOWN = 0.25;
export const BUNKER_VS_VEHICLE = 0.35;
export const AI_BUNKERS = 2;
/**
 * Wall (1×1, Defense tab): a block in the nation's own style (Russia / China red, Islamic blue, USA / Europe concrete)
 * that enemy ground units cannot pass. Like a bunker it may stand up to WALL_BUILD_RADIUS cells from the edge of one of
 * the nation's own base structures (never measured from another Defense-tab structure). The AI rings its capital with wall segments (gaps left for its own troops).
 */
export const WALL_COST = 100;
export const WALL_HP = 4000;
export const WALL_BUILD_RADIUS = 3;
/** Placing a wall block with up to this many free cells between it and another block of the nation in a straight line fills them (free). */
export const WALL_FILL_GAP = 5;
export const FOOTPRINT_WALL = { w: 1, d: 1 } as const;
/** AI: wall ring this many cells out from the capital's edge, segments of AI_WALL_SEGMENT blocks with AI_WALL_GAP free cells between. */
export const AI_WALL_RING = 4;
export const AI_WALL_SEGMENT = 8;
/** Wider than WALL_FILL_GAP, so the gates are never filled in. */
export const AI_WALL_GAP = 6;
/**
 * AI: walls and gates go up only when the nation needs them — enemy units near the capital, one of its structures hit
 * in the last AI_WALL_ALERT_SECONDS, or AI_WALL_ENEMY_UNITS enemy ground units (soldiers, vehicles) within
 * AI_WALL_WATCH_CELLS cells of the capital. A nation whose enemies can only come across the sea skips the last test.
 * While needed they come before the bunkers.
 */
export const AI_WALL_ALERT_SECONDS = 120;
export const AI_WALL_WATCH_CELLS = 60;
export const AI_WALL_ENEMY_UNITS = 4;
/**
 * Nation Gate (4 × 1, Defense tab, R turns it 1 × 4): two end pillars in the nation's architecture with a 2-cell way
 * through the middle. Placed like a wall (up to GATE_BUILD_RADIUS cells from an own structure). The AI sets one in
 * each gap of its capital's wall ring.
 */
export const GATE_COST = 300;
export const GATE_HP = 6000;
export const GATE_BUILD_RADIUS = WALL_BUILD_RADIUS;
export const FOOTPRINT_GATE = { w: 4, d: 1 } as const;
/** Radar Tower (2 × 2): runs the nation's radar (minimap); an Airfield needs one. */
export const RADAR_TOWER_COST = 1500;
export const RADAR_TOWER_HP = 1200;
export const FOOTPRINT_RADAR_TOWER = { w: 2, d: 2 } as const;
/** Dearer than a War Factory: it fields aircraft that cost 3000–5200 each. */
export const AIRFIELD_COST = 6000;
/** High-Tech Center (a high-rise): base price; it unlocks the second-tier soldiers and vehicles. */
export const TECH_CENTER_COST = 8000;
/** Second-tier units that need a High-Tech Center: special-forces soldiers and the armoured fighting vehicle. */
export const TECH_TIERS: readonly UnitTier[] = ["special", "demolition"];
export const TECH_VEHICLES: readonly VehicleKind[] = ["ifv", "transport"];
/**
 * Happy City: no limit on how many a nation builds; fixed price (no faction cost multiplier). Every city pays
 * HAPPY_CITY_TAX TB of taxes into its nation's budget every HAPPY_CITY_TAX_PERIOD seconds, each on its own clock.
 */
export const HAPPY_CITY_COST = 12000;
export const HAPPY_CITY_TAX = 600;
export const HAPPY_CITY_TAX_PERIOD = 50;
/** Every other Happy City of the nation raises each city's tax by this share of HAPPY_CITY_TAX (5 cities: ×1.6 each). */
export const HAPPY_CITY_TAX_BONUS = 0.15;
/** Duration of the build-up animation after placing a structure. */
export const BUILD_RISE_SECONDS = 1.2;

// ---------------------------------------------------------------- Infantry
/** Every soldier takes this many times its trainSeconds (+ faction trainDelay) to train. */
export const INFANTRY_TRAIN_FACTOR = 2;
/** Base infantry stats; faction multipliers (cost, armor → hp, unitSpeed) apply on top. */
export const INFANTRY_BASE = {
  regular: { cost: 200, trainSeconds: 5, maxHp: 125, speed: 1.4 },
  special: { cost: 500, trainSeconds: 10, maxHp: 200, speed: 1.7 },
  engineer: { cost: 400, trainSeconds: 6, maxHp: 100, speed: 1.3 },
  /** Two men counted as one: the flag bearer and his escort (hp covers both). */
  squatters: { cost: 1400, trainSeconds: 12, maxHp: 320, speed: 1.4 },
  /** Crazy Soldier (Islamic only): unarmed, plants timed charges (see DEMO_*). */
  demolition: { cost: 900, trainSeconds: 10, maxHp: 110, speed: 1.6 },
} as const;
/**
 * BuildLimit: how many orders a nation may have waiting at once (the one being made included). Any type may be
 * ordered; a slot frees up as soon as an order is completed. Army size is capped by MAX_SOLDIERS / MAX_GROUND_VEHICLES.
 */
export const BUILD_LIMIT_SOLDIERS = 15;
export const BUILD_LIMIT_VEHICLES = 10;
/** Army caps per nation (player and AI alike): keeps the unit count, route work and frame time bounded. */
export const MAX_SOLDIERS = 120;
export const MAX_GROUND_VEHICLES = 60;
export const MAX_TRANSPORTS = 8;
/**
 * Elite (second-tier) soldiers are never more than the regular (first-tier) ones, at most 2 for every 3
 * regulars: with 5 soldiers that is 3 regular + 2 elite. Alive soldiers and soldiers on order both count.
 */
export const eliteCap = (regulars: number): number =>
  Math.floor((regulars * 2) / 3);
/**
 * Crazy Soldier (like RA2's Crazy Ivan): ordered onto an enemy structure or unit, he runs up to it, plants a charge
 * (DEMO_PLANT_CELLS away at most) and walks on; DEMO_FUSE_SECONDS later it blows. He may plant again after
 * DEMO_RELOAD_SECONDS. The blast:
 *  - a structure of at most DEMO_SMALL_CELLS cells (footprint) is destroyed; a larger one loses DEMO_LARGE_DAMAGE of its max health;
 *  - the enemy combat units (armed, on the ground) within DEMO_GROUP_RADIUS_CELLS of the charge: DEMO_GROUP_SIZE or
 *    fewer all die, more than that half of them (the nearest).
 */
export const DEMO_FUSE_SECONDS = 4;
export const DEMO_PLANT_CELLS = 1.5;
export const DEMO_RELOAD_SECONDS = 5;
export const DEMO_SMALL_CELLS = 16;
export const DEMO_LARGE_DAMAGE = 0.4;
export const DEMO_GROUP_RADIUS_CELLS = 2.5;
export const DEMO_GROUP_SIZE = 8;
/** X key formation: blocks of FORMATION_RANKS ranks × FORMATION_COLS units, one empty rank between blocks. */
export const FORMATION_COLS = 5;
export const FORMATION_RANKS = 3;
/** Special-forces soldiers swim; they move at this fraction of their speed in water. */
export const SWIM_SPEED_FACTOR = 0.6;
/**
 * The world's great mountain ranges (the top 5, plus the Altai, Ural, Pamir and Karakoram that wall off Russia, China and the Middle East) (RA2-style relief), on their true crest lines (lon, lat points). Across a range:
 *  - the crest (MOUNTAIN_CREST_CELLS either side of the line): peaks of real height, impassable;
 *  - ledges (high ground) on both sides: walkable and buildable, a defensive position: units there hit
 *    HIGH_GROUND_DAMAGE harder and reach HIGH_GROUND_RANGE farther, and take LOW_GROUND_DAMAGE from units below;
 *  - passes: MOUNTAIN_PASSES per range, evenly along it, a slope MOUNTAIN_PASS_CELLS wide cut through the crest
 *    (the only way across; slow: MOUNTAIN_PASS_SPEED_*).
 * The band is about MOUNTAIN_HALF_WIDTH_CELLS either side of the crest; its edge wanders naturally.
 */
export const MOUNTAIN_RANGES: readonly {
  name: string;
  points: readonly (readonly [number, number])[];
  passes?: number;
}[] = [
  // Himalaya: Nanga Parbat (west, by the Indus bend) over Nanda Devi, Dhaulagiri, Everest, Kangchenjunga to Namcha Barwa (east, by the Yarlung Tsangpo bend).
  {
    name: "Himalaya",
    points: [
      [74.59, 35.24],
      [76.0, 34.0],
      [77.5, 32.8],
      [79.0, 31.0],
      [79.97, 30.38],
      [81.5, 29.8],
      [83.49, 28.7],
      [85.5, 28.1],
      [86.93, 27.99],
      [88.15, 27.7],
      [89.5, 27.9],
      [91.5, 27.95],
      [93.5, 28.6],
      [95.06, 29.63],
    ],
  },
  {
    name: "Andes",
    points: [
      [-78.0, 2.0],
      [-79.0, -2.0],
      [-77.0, -8.0],
      [-72.5, -14.0],
      [-69.0, -17.0],
      [-68.5, -22.0],
      [-69.0, -27.0],
      [-70.0, -33.0],
      [-71.0, -38.0],
      [-71.7, -43.0],
      [-73.0, -48.0],
    ],
  },
  {
    name: "Rocky Mountains",
    points: [
      [-122.0, 55.0],
      [-118.0, 51.5],
      [-114.0, 48.0],
      [-110.5, 44.0],
      [-107.0, 40.0],
      [-106.5, 37.0],
      [-106.0, 33.0],
    ],
  },
  {
    name: "Alps",
    points: [
      [6.5, 44.2],
      [6.9, 45.8],
      [8.0, 46.4],
      [10.0, 46.5],
      [12.3, 47.0],
      [14.0, 47.3],
    ],
  },
  {
    name: "Altai",
    points: [
      [82.0, 49.8],
      [85.0, 49.5],
      [88.0, 49.6],
      [91.0, 49.2],
      [94.0, 49.3],
      [97.0, 48.9],
      [100.0, 48.8],
      [103.0, 48.5],
    ],
  },
  // Vesi (fictional): one straight wall between Russia / Central Asia and China, from the Pamir (75.44°E 39.87°N) to
  // the Altai's west end (82.16°E 47.68°N). No trail: armies must march round one of its ends.
  {
    name: "Vesi",
    passes: 0,
    points: [
      [75.44, 39.87],
      [82.16, 47.68],
    ],
  },
  {
    name: "Ural",
    points: [
      [59.5, 68.0],
      [60.0, 65.0],
      [59.3, 62.0],
      [59.2, 59.0],
      [59.5, 56.0],
      [58.5, 53.5],
      [58.8, 51.5],
    ],
  },
  // Pamir ("Roof of the World") and Karakoram: the icy wall between West / South Asia and China (Xinjiang).
  {
    name: "Pamir",
    points: [
      [69.5, 39.3],
      [71.5, 39.5],
      [73.5, 39.4],
      [74.5, 38.7],
      [75.1, 37.8],
      [74.9, 36.9],
    ],
  },
  {
    name: "Karakoram",
    points: [
      [74.5, 36.3],
      [75.5, 36.0],
      [76.5, 35.8],
      [77.5, 35.3],
      [78.5, 34.7],
    ],
  },
  {
    name: "Caucasus",
    points: [
      [39.5, 43.6],
      [42.4, 43.3],
      [44.5, 42.7],
      [47.0, 41.8],
      [49.0, 41.0],
    ],
  },
];
export const MOUNTAIN_HALF_WIDTH_CELLS = 6;
export const MOUNTAIN_CREST_CELLS = 1.3;
/** Passes per range, unless the range sets its own `passes`. */
export const MOUNTAIN_PASSES = 2;
export const MOUNTAIN_PASS_CELLS = 3;
export const MOUNTAIN_PASS_SPEED_INFANTRY = 0.6;
export const MOUNTAIN_PASS_SPEED_VEHICLE = 0.45;
/** Path cost per pass cell (they are slow). */
export const MOUNTAIN_PATH_COST = 2;
export const HIGH_GROUND_DAMAGE = 1.25;
export const HIGH_GROUND_RANGE = 1.2;
export const LOW_GROUND_DAMAGE = 0.75;
/** TileMap.mountain codes. */
export const MOUNTAIN_LEDGE = 1;
export const MOUNTAIN_PASS = 3;
export const MOUNTAIN_CREST = 4;
/** Special forces never swim farther than this many cells from land. */
export const SWIM_MAX_CELLS = 5;
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
  rifle: {
    kind: "rifle",
    damage: 9,
    range: 32,
    cooldown: 0.75,
    vsBuilding: 0.4,
    hitsAir: false,
    splash: 0,
  },
  smg: {
    kind: "smg",
    damage: 6,
    range: 30,
    cooldown: 0.22,
    vsBuilding: 0.35,
    hitsAir: true,
    splash: 0,
  },
  sniper: {
    kind: "sniper",
    damage: 45,
    range: 56,
    cooldown: 2.2,
    vsBuilding: 0.15,
    hitsAir: false,
    splash: 0,
  },
  mg: {
    kind: "mg",
    damage: 5,
    range: 30,
    cooldown: 0.18,
    vsBuilding: 0.3,
    hitsAir: true,
    splash: 0,
  },
  cannon: {
    kind: "cannon",
    damage: 60,
    range: 50,
    cooldown: 1.8,
    vsBuilding: 1.6,
    hitsAir: false,
    splash: 7,
  },
  autocannon: {
    kind: "autocannon",
    damage: 16,
    range: 42,
    cooldown: 0.5,
    vsBuilding: 0.7,
    hitsAir: true,
    splash: 0,
  },
  bomb: {
    kind: "bomb",
    damage: 140,
    range: 14,
    cooldown: 3.2,
    vsBuilding: 2.2,
    hitsAir: false,
    splash: 10,
  },
  missile: {
    kind: "missile",
    damage: 45,
    range: 60,
    cooldown: 1.4,
    vsBuilding: 1.3,
    hitsAir: true,
    splash: 4,
  },
};
/** Which weapon each vehicle carries. */
export const VEHICLE_WEAPON: Readonly<
  Partial<Record<VehicleKind, WeaponKind>>
> = {
  light: "mg",
  tank: "cannon",
  ifv: "autocannon",
  jet: "missile",
  heli: "missile",
  mantis: "missile",
  bomber: "bomb",
};
/** Soldiers only shoot at enemies within this many cells (vehicles keep their own, longer ranges). */
export const INFANTRY_MAX_RANGE_CELLS = 3;
/** How often (s) an idle armed unit looks for a new target / repaths while chasing. */
export const ACQUIRE_PERIOD = 0.3;
export const CHASE_PERIOD = 0.8;
/** Ground vehicles give up a chase once they are this many cells from where it started (no hunting a fleeing enemy home). */
export const CHASE_LIMIT_CELLS = 5;
/** After giving up a chase, the target is left alone this long (s) unless it comes into weapon range. */
export const CHASE_GIVE_UP_SECONDS = 8;
/** A retreat protects a unit only from nations it traded fire with within this many seconds; any other nation may attack it. */
export const FIGHT_MEMORY_SECONDS = 20;
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
  /** Aircraft carrier: sea only, slow, very tough, unarmed, carries up to CARRIER_JETS fighters on its deck (AircraftSystem.onDeck). Not built: a fleet of CARRIER_FLEET starts near the capital. */
  carrier: { cost: 0, trainSeconds: 0, maxHp: 4000, speed: 0.9, radius: 10 },
  light: { cost: 600, trainSeconds: 8, maxHp: 180, speed: 2.4, radius: 3.4 },
  tank: { cost: 1200, trainSeconds: 14, maxHp: 420, speed: 1.4, radius: 4.2 },
  ifv: { cost: 900, trainSeconds: 11, maxHp: 300, speed: 1.8, radius: 4.0 },
  jet: { cost: 1600, trainSeconds: 16, maxHp: 220, speed: 9, radius: 3.2 },
  /** Attack helicopter: slow (well under the fighter and the transport), built at the Airfield like it. */
  heli: { cost: 1300, trainSeconds: 14, maxHp: 200, speed: 3, radius: 3.4 },
  /** Self-propelled air-defence vehicle (NOMADS for the USA and Europe, Buk-M3 for the others): dear, slow, tank-like health; shoots aircraft only (see MANTIS_FIREPOWER). */
  mantis: { cost: 3000, trainSeconds: 18, maxHp: 460, speed: 1.1, radius: 4.4 },
  /** Unarmed cargo aircraft: slower than the fighter. */
  transport: {
    cost: 1400,
    trainSeconds: 14,
    maxHp: 260,
    speed: 5.5,
    radius: 3.6,
  },
  /** National heavy bomber (Russia's Tu-160, the USA's B-1A Lancer; no other nation has one): tough, flattens ground targets and structures; cannot hit aircraft. */
  bomber: {
    cost: 2600,
    trainSeconds: 22,
    maxHp: 380,
    speed: 10.9,
    radius: 3.8,
  },
  /** National armoured recovery vehicle (Russia's BREM-1): slow and unarmed, it mends friendly ground vehicles (see REPAIR_VEHICLE_*). */
  repair: { cost: 800, trainSeconds: 10, maxHp: 360, speed: 1.0, radius: 4.2 },
  /** National army truck (KamAZ: Russia, China, the Islamic world; Oshkosh MTVR: USA; Mercedes-Benz Zetros: Europe), a little bigger than a tank: unarmed, faster than soldiers and tanks, carries
   * TRUCK_SOLDIERS soldiers (no vehicles); ground only. */
  truck: { cost: 700, trainSeconds: 9, maxHp: 240, speed: 2.1, radius: 4.6 },
  /** National kamikaze drone (the Islamic world's B-767), built at the Airfield (one order = one drone); unarmed: ordered onto an enemy structure it dives into it (DRONE_*) and is gone.
   * Cheaper than the fighter. */
  drone: { cost: 900, trainSeconds: 12, maxHp: 90, speed: 7, radius: 3.0 },
  /** Armoured bridge layer: slow, tough, unarmed; one use — it unfolds into a BRIDGE_W × BRIDGE_L Bridge across water (see Bridge). */
  bridgeLayer: {
    cost: 1000,
    trainSeconds: 12,
    maxHp: 400,
    speed: 1.0,
    radius: 4.4,
  },
} as const;

/** Kamikaze drone: the share of a structure's max health its dive takes. */
export const DRONE_DAMAGE_SHARE = 0.5;
/** A fighter (player's or AI's) without an attack order shoots down an enemy drone diving at its own nation as a danger,
 * before any other target, once the drone is within this many times its weapon range. */
export const FIGHTER_DRONE_ALERT = 3;
/** How close (cells) to the target's centre the drone must get to crash into it and explode. */
export const DRONE_STRIKE_CELLS = 0.6;
/** Over its last this-many cells to the target the drone dives from cruise height down to the ground. */
export const DRONE_DIVE_CELLS = 6;

/**
 * Soldiers and ground vehicles move this much faster than their base speed (a little quicker on the bigger map,
 * still slow enough to follow on screen).
 */
export const GROUND_SPEED_SCALE = 1.3;
/** The slowest aircraft (a transport of the slowest nation, unitSpeed 0.85) flies from the far west to the far east in this many seconds. */
export const AIR_CROSSING_SECONDS = 600;
/**
 * Top long-haul boost of an aircraft (Vehicle.cruiseBoost): far from its destination it flies this many times its
 * base speed, so the slowest one crosses the map in about AIR_CROSSING_SECONDS; near the destination (and on the
 * runway, circling, in a fight) it flies at its base speed so it can be followed on screen.
 */
export const AIR_SPEED_SCALE =
  GRID_WIDTH / (AIR_CROSSING_SECONDS * VEHICLE_BASE.transport.speed * 0.85);
export const AIR_BOOST_NEAR_CELLS = 40;
/** Turbo (T / Turbo button): an aircraft in flight flies TURBO_MULT× faster for TURBO_SECONDS, then the turbo
 * recharges for TURBO_RECHARGE_SECONDS before it can be used again. */
export const TURBO_MULT = 2;
export const TURBO_SECONDS = 15;
export const TURBO_RECHARGE_SECONDS = 40;
export const AIR_BOOST_FAR_CELLS = 400;

/** Bomber payload: bombs carried per sortie (reloaded on its airfield) and bombs released per drop. */
export const BOMBER_BOMBS = 6;
export const BOMBS_PER_DROP = 2;
/** Seconds from release until a bomb hits the ground and explodes: its damage lands only then. */
export const BOMB_FALL_SECONDS = 0.9;
/** Fighters carry this many bombs, one per drop: the only way they can hit a structure (JET_BOMB_VS_STRUCTURE of
 * its max health each). While any are left they are also dropped on ground units (JET_BOMB_VS_VEHICLE of a
 * vehicle's max health, a soldier killed); aircraft, and ground units once the bombs are gone, get the guns. */
export const JET_BOMBS = 2;
/**
 * A helicopter never out-fights a fighter of its nation: it fires the same missile at this share of the damage, has
 * less health (VEHICLE_BASE), shoots soldiers and ground vehicles (each hit weaker than a tank's cannon) and carries no bombs.
 */
export const HELI_FIREPOWER = 0.75;
/** Air-defence vehicle (`mantis`): its missile hits this many times as hard as the base missile, and reaches MANTIS_RANGE_CELLS cells for every nation (no faction range bonus); aircraft only. */
export const MANTIS_FIREPOWER = 3.5 / 3;
export const MANTIS_RANGE_CELLS = 14;
/** Air-defence vehicle: every veteran star adds this share to its missile damage (and one cell of range). */
export const MANTIS_RANK_BONUS = 0.05;
/** Idle air-defence vehicle hit by something it cannot shoot back: it pulls back this many cells away from the attacker. */
export const MANTIS_EVADE_CELLS = 6;
/** Every missile of the air-defence vehicle that hits an aircraft takes this share of the aircraft's full health. */
export const MANTIS_HIT_SHARE = 0.25 / 3;
/** Every hit of an attack helicopter on an air-defence vehicle takes this share of the vehicle's full health. */
export const HELI_VS_MANTIS_SHARE = 1 / 6;
/** Every bomb of a fighter that hits an air-defence vehicle takes this share of the vehicle's full health (its guns never hurt it). */
export const JET_VS_MANTIS_SHARE = 1 / 3;
/** Every missile of the air-defence vehicle that hits a fighter takes this share of the fighter's full health. */
export const MANTIS_VS_JET_SHARE = 1 / 4;
/** Every missile of the air-defence vehicle that hits a helicopter takes this share of the helicopter's full health. */
export const MANTIS_VS_HELI_SHARE = 1 / 3;
/** Air-defence vehicle: seconds between two missiles (longer than a missile's flight, so no missile chases a dead aircraft). */
export const MANTIS_RELOAD = 0.5;
/** AI air defence: at least this many air-defence vehicles at home, plus one for every AI_AIR_DEFENCE_PER_CITIES Happy Cities. */
export const AI_AIR_DEFENCE = 2;
export const AI_AIR_DEFENCE_PER_CITIES = 4;
/** …standing on a ring this many cells round the capital. */
export const AI_AIR_DEFENCE_RING = 8;
export const JET_BOMB_VS_STRUCTURE = 0.1;
export const JET_BOMB_VS_VEHICLE = 0.6;
/** A fighter's bomb costs this much to load (a bomber's costs BOMB_COST). */
export const JET_BOMB_COST = 400;
/** Reloading on the airfield is not free: each bomb costs this much, loaded one every BOMB_LOAD_SECONDS. */
export const BOMB_COST = 800;
export const BOMB_LOAD_SECONDS = 3;
/** One drop destroys a structure outright, except these kinds, which lose this share of their max health. */
export const BOMB_TOUGH_STRUCTURES: readonly string[] = [
  "happyCity",
  "airfield",
];
export const BOMB_TOUGH_DAMAGE = 0.5;
/** A drop on troops hits the whole group within this many cells of the impact: below BOMB_GROUP_SIZE soldiers /
 * vehicles all of them die, from BOMB_GROUP_SIZE up a third of them (the ones nearest the impact). */
export const BOMB_GROUP_RADIUS_CELLS = 2.5;
export const BOMB_GROUP_SIZE = 10;
/** A full transport tank flies 1.25 × the map's height (north pole to south pole plus a quarter more) before it must
 * land to refuel: the pole-to-pole tank plus the quarter its former aerial tanker used to hand over. */
export const TRANSPORT_FUEL_CELLS = GRID_HEIGHT * 1.25;

/** Aircraft are built at the Airfield and use its runway; everything else rolls out of the War Factory. */
export const isAircraftKind = (kind: VehicleKind): boolean =>
  kind === "jet" ||
  kind === "heli" ||
  kind === "transport" ||
  kind === "bomber" ||
  kind === "drone";

/** Aircraft are built at, park at and take off from an airfield. */
export const needsAirfield = (kind: VehicleKind): boolean =>
  isAircraftKind(kind);

/** A full bomb load costs an aircraft this share of its top speed (less as the bombs are dropped). */
export const BOMB_LOAD_SLOWDOWN = 0.2;

/**
 * Marching on foot tires soldiers out (every soldier except special forces): after INFANTRY_MARCH_CELLS unit cells of
 * walking a soldier halts where he is for INFANTRY_REST_SECONDS, then marches on — to the end of any order, fights
 * included. Riding a truck or a transport aircraft costs no strength. Standing INFANTRY_RECOVER_SECONDS rests him too.
 */
export const INFANTRY_MARCH_CELLS = Math.round(52 * GROUND_SPEED_SCALE);
export const INFANTRY_REST_SECONDS = 35;
export const INFANTRY_RECOVER_SECONDS = 10;

/** Army truck load: soldiers only, never a vehicle. */
export const TRUCK_SOLDIERS = 8;
/** An army truck only drives with at least this many soldiers aboard (rolling out of the factory excepted). */
export const TRUCK_MIN_RIDERS = 6;
/** ...except inside its own base: a truck heading for a spot within this many cells of one of its nation's buildings drives with any load (even empty). */
export const TRUCK_HOME_CELLS = 20;

/**
 * Temporary: only these vehicles can be produced (sidebar and AI). The rest stay in the code but are
 * hidden until they are wanted again — add a kind here to bring it back.
 */
export const AVAILABLE_VEHICLES: readonly VehicleKind[] = [
  "tank",
  "jet",
  "heli",
  "bomber",
  "transport",
  "repair",
  "truck",
  "mantis",
  "drone",
  "bridgeLayer",
];

/**
 * Repair vehicle (BREM-1): ordered onto a damaged friendly ground vehicle (right-click), it drives up to it and,
 * while within REPAIR_VEHICLE_RANGE_CELLS of its hull, restores REPAIR_VEHICLE_HEAL_SHARE of the target's max HP
 * every REPAIR_VEHICLE_INTERVAL seconds until it is full. Soldiers, aircraft and structures are not repaired.
 */
export const REPAIR_VEHICLE_HEAL_SHARE = 0.05;
export const REPAIR_VEHICLE_INTERVAL = 2;
/** Gap (cells) between the two hulls within which the repair works. */
export const REPAIR_VEHICLE_RANGE_CELLS = 1.2;
/** Seconds between re-plans of the route while following a target that drives off. */
export const REPAIR_VEHICLE_REPATH = 1;
/**
 * A repair vehicle ordered onto one vehicle of a group (right-click) mends every damaged ground vehicle within this
 * many cells of that spot, the worst first, one after the other.
 */
export const REPAIR_GROUP_CELLS = 6;
/**
 * War Factory workshop: a damaged ground vehicle sent onto its own War Factory drives in through the door, is
 * repaired inside at FACTORY_REPAIR_SHARE of its max HP per second, and drives out again when whole.
 */
export const FACTORY_REPAIR_SHARE = 0.08;
/** How close (cells) to the factory door a vehicle must come to drive in. */
export const FACTORY_REPAIR_REACH_CELLS = 1.5;

/**
 * Transport aircraft load: soldiers only → 12; soldiers + a vehicle → 8 soldiers and 1 vehicle;
 * vehicles only → 4 (2 to 4 vehicles leave no room for soldiers).
 */
export const TRANSPORT_SOLDIERS = 12;
export const TRANSPORT_MIXED_SOLDIERS = 8;
export const TRANSPORT_VEHICLES = 4;
/** Attack helicopter load: up to 8 soldiers; it carries no vehicles. */
export const HELI_SOLDIERS = 8;
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
 * What each rank (none / Veteran / Elite / Elite+) is worth in battle, for every soldier and vehicle (engineers
 * included; Squatters never earn ranks): damage dealt, seconds between shots, damage taken, and speed.
 */
export const RANK_FIREPOWER = [1, 1.2, 1.4, 1.6] as const;
export const RANK_RELOAD = [1, 0.9, 0.8, 0.7] as const;
export const RANK_ARMOR = [1, 0.9, 0.8, 0.65] as const;
export const RANK_SPEED = [1, 1.1, 1.2, 1.3] as const;
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

/**
 * Engineers repair from inside the building: each one restores this share of the building's full health per
 * second until it is back to 100%, then they walk out. Hits keep taking health off meanwhile.
 */
export const ENGINEER_REPAIR_SHARE = 0.06;

/** Engineer in an enemy capital, embargo: that nation's treasury and oil stock drop to 0, and it can neither earn nor spend for this many seconds. */
export const CAPITAL_EMBARGO_SECONDS = 180;
/** AI engineer in an enemy capital: embargo when that nation holds at least this many TB, else take it over. */
export const AI_EMBARGO_CREDITS = 1000;

/** Every nation starts broke; oil derricks are the only source of TB. */
export const STARTING_CREDITS = 0;

/** Owner id of neutral entities (not a player). */
export const NEUTRAL_OWNER = 0;

/** Faction order used for player ids, sidebar listing and hotkeys 1..5. */
export const FACTION_ORDER: readonly FactionId[] = [
  "usa",
  "russia",
  "china",
  "europe",
  "islamic",
];

// ---------------------------------------------------------------- Unit prices & national strength
/**
 * Price (TB) of each nation's own machine, set per vehicle: base price × √(its real unit cost ÷ the median real
 * cost of that kind), so a dear model (Leopard 2, F-22, C-17) costs more than a cheap one (Karrar, Su-57, Il-76) without wrecking the economy. Fighters (√ softened to the 0.3 power, from 3600) and bombers
 * (5200) always cost more than any air-defence vehicle (≤ 3000). Kinds not listed here: VEHICLE_BASE cost × the nation's cost factor.
 */
export const VEHICLE_PRICE: Readonly<
  Record<FactionId, Partial<Record<VehicleKind, number>>>
> = {
  usa: {
    tank: 1610,
    heli: 1920,
    mantis: 2680,
    jet: 4250,
    transport: 2260,
    bomber: 5200,
  },
  russia: {
    tank: 1140,
    heli: 1300,
    mantis: 3000,
    jet: 3050,
    transport: 870,
    bomber: 5200,
  },
  china: { tank: 1200, heli: 1260, mantis: 3000, jet: 3420, transport: 1550 },
  europe: { tank: 1780, heli: 1920, mantis: 2680, jet: 3940, transport: 1230 },
  // The B-767 kamikaze drone is cheap: the Islamic world fields it in numbers.
  islamic: { tank: 760, heli: 1300, mantis: 3000, jet: 3600, drone: 500 },
};

/**
 * National strength scale (0–10) per arm — land: soldiers, tanks, air defence and every ground vehicle; air: fighters,
 * bombers, helicopters, transport aircraft, drones; sea: aircraft carriers. Health and firepower are base × score ÷
 * STRENGTH_REF (9 = the base stats); this replaces the nation's armor / firepower factors.
 */
export const STRENGTH_REF = 9;
export const NATION_STRENGTH: Readonly<
  Record<FactionId, { land: number; air: number; sea: number }>
> = {
  usa: { land: 9.0, air: 10.0, sea: 10.0 },
  europe: { land: 8.5, air: 9.0, sea: 8.5 },
  russia: { land: 9.5, air: 9.0, sea: 8.0 },
  china: { land: 9.0, air: 9.0, sea: 9.0 },
  islamic: { land: 7.5, air: 7.0, sea: 6.5 },
};

// ---------------------------------------------------------------- Landmarks (real coordinates)
/** Nations with aircraft carriers, and how many start at sea near the capital (only moving for now). */
export const CARRIER_NATIONS: readonly FactionId[] = ["usa", "europe", "china"];
export const CARRIER_FLEET = 2;
/** Fighters a carrier can carry on its deck. */
export const CARRIER_JETS = 4;
export const CAPITAL_LOCATIONS: Readonly<Record<FactionId, NamedSite>> = {
  usa: { lon: -77.04, lat: 38.9, name: "Washington, D.C." },
  russia: { lon: 37.62, lat: 55.75, name: "Moscow" },
  china: { lon: 116.4, lat: 39.9, name: "Beijing" },
  europe: { lon: 2.35, lat: 48.86, name: "Paris" },
  islamic: { lon: 46.68, lat: 24.71, name: "Riyadh" },
};
/** Zürich (47.37°N 8.54°E), moved ~5 cells north (8.94 cells per degree of latitude) so the Alps do not hide it. */
export const WORLD_BANK_LOCATION: GeoPoint = { lon: 8.54, lat: 47.93 };
/** Pyramids of Giza, a little west of the real site (29.98°N 31.13°E) so the plot clears the Nile drawn on the map. */
export const PYRAMIDS_LOCATION: GeoPoint = { lon: 30.45, lat: 29.95 };

/**
 * Contested nations: independent states that belong to no faction. Their capitals stand on the map from the start,
 * owned by nobody; they can never be damaged or destroyed, only taken by an engineer (of any nation, from anyone).
 * The nation holding one is paid NATION_PRESENCE_FEE TB every NATION_PRESENCE_PERIOD seconds (military presence fee)
 * and may build its own structures next to it (like an Allied Building). An AI holder keeps a garrison there.
 */
export type ContestedNationId =
  | "northKorea"
  | "southKorea"
  | "japan"
  | "australia"
  | "brazil"
  | "unitedKingdom"
  | "canada"
  | "cuba";
export interface ContestedNation {
  name: string;
  /** Name of the capital building shown in game. */
  capital: string;
  site: NamedSite;
}
export const CONTESTED_NATIONS: Readonly<
  Record<ContestedNationId, ContestedNation>
> = {
  northKorea: {
    name: "North Korea",
    capital: "Pyongyang Palace",
    site: { lon: 125.75, lat: 39.02, name: "Pyongyang" },
  },
  southKorea: {
    name: "South Korea",
    capital: "Seoul Blue House",
    site: { lon: 126.98, lat: 37.57, name: "Seoul" },
  },
  japan: {
    name: "Japan",
    capital: "Tokyo Kantei",
    site: { lon: 139.69, lat: 35.69, name: "Tokyo" },
  },
  australia: {
    name: "Australia",
    capital: "Canberra Parliament",
    site: { lon: 149.13, lat: -35.28, name: "Canberra" },
  },
  brazil: {
    name: "Brazil",
    capital: "Brasília Planalto",
    site: { lon: -47.88, lat: -15.79, name: "Brasília" },
  },
  // Out of the European Union since Brexit: Great Britain is independent land, no longer part of Europe's territory.
  unitedKingdom: {
    name: "United Kingdom",
    capital: "10 Downing Street",
    site: { lon: -0.13, lat: 51.5, name: "London" },
  },
  // Canada is its own nation: its land is no longer part of the USA's territory.
  canada: {
    name: "Canada",
    capital: "Parliament Hill",
    site: { lon: -75.7, lat: 45.42, name: "Ottawa" },
  },
  // Cuba: an island nation of its own, off the tip of Florida (not part of the USA's territory).
  cuba: {
    name: "Cuba",
    capital: "El Capitolio",
    site: { lon: -82.36, lat: 23.13, name: "Havana" },
  },
};
/** Presence fee of an occupied capital with no entry in NATION_PRESENCE_FEES (an unplayed faction's capital). */
export const NATION_PRESENCE_FEE = 1200;
/**
 * Military presence fee (TB per NATION_PRESENCE_PERIOD) by the occupied nation's real economy:
 * 1200 × √(GDP ÷ 2 000 bn USD, the median of the eight) — rich lands pay more, poor ones still a little.
 * GDP used (nominal, ~2024, rough): Japan 4 100, UK 3 600, Canada 2 200, Brazil 2 200, Australia 1 800,
 * South Korea 1 700, Cuba 100, North Korea 30 bn USD. Cuba (560) and North Korea (320) raised by hand.
 */
export const NATION_PRESENCE_FEES: Readonly<Record<ContestedNationId, number>> =
  {
    japan: 1720,
    unitedKingdom: 1610,
    canada: 1260,
    brazil: 1260,
    australia: 1140,
    southKorea: 1110,
    cuba: 560,
    northKorea: 320,
  };
export function presenceFee(nation: string): number {
  return (
    (NATION_PRESENCE_FEES as Record<string, number>)[nation] ??
    NATION_PRESENCE_FEE
  );
}

/**
 * Antarctic oil: unowned derricks spread across Antarctica. They pump under the usual oil rules for whoever holds
 * them, can never be destroyed, and an engineer of any nation takes one over (from nobody or from its holder).
 */
export const ANTARCTIC_OIL_SITES: readonly GeoPoint[] = [
  { lon: -150, lat: -78 },
  { lon: -80, lat: -77 },
  { lon: -8, lat: -76 },
  { lon: 66, lat: -74 },
  { lon: 136, lat: -75 },
];
export const NATION_PRESENCE_PERIOD = 120;
/** Soldiers / vehicles an AI keeps stationed at each contested capital it holds, and how near (cells) counts as there. */
export const NATION_GARRISON = 6;
export const NATION_GARRISON_CELLS = 10;

// ---------------------------------------------------------------- Oil (replaces RA2 ore)
/** Barrels of oil pumped per second by each derrick while it is pumping (oil is sold to the Global Monitoring Center for TB). */
export const OIL_DERRICK_OUTPUT = 0.08; // barrels/s per derrick
/** Every nation starts with some oil in stock, so the first sale can pay for the first buildings. */
export const STARTING_OIL = 20;
/**
 * Global Monitoring Center oil market: one price for everybody (TB per barrel). It rises and falls mainly with
 *   - FLOW: barrels the nations sold to the Center lately (more oil sold → cheaper) against barrels the Center had
 *     to sell them for their power grids (more bought → dearer), both remembered over ~OIL_FLOW_MEMORY seconds;
 *   - WEALTH: the average net worth of the nations still in the war (richer world → dearer oil);
 *   - a small mean-reverting market mood (±OIL_MOOD_MAX) so the chart never sits flat.
 *   target = OIL_PRICE_START × wealthFactor × flowFactor × (1 + mood), clamped to [MIN, MAX];
 * the posted price eases towards that target every OIL_PRICE_INTERVAL seconds.
 */
export const OIL_PRICE_START = 900;
export const OIL_PRICE_MIN = 360;
export const OIL_PRICE_MAX = 2100;
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
 * Global Monitoring Center credit: when the treasury is at 0 TB the player may press "Get a loan" (never automatic). No interest.
 * The Center lends against what the nation could sell to pay it back (its collateral):
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
/** The Center never buys more than this share of the offered stock in one sale. */
export const WB_MAX_SHARE = 0.25;
/** A nation may make OIL_SALE_BURST offers in a row, then must wait OIL_SALE_COOLDOWN seconds before the next one. */
export const OIL_SALE_BURST = 6;
export const OIL_SALE_COOLDOWN = 3;
/** Barrels that always stay in the nation's stock: a sale never dips below this reserve. */
export const OIL_RESERVE = 1.0;
/** Oil derricks per nation, built in one straight row on the safest ground: 2 each, but 3 for the Islamic world (the Middle East oil fields). */
export const OIL_DERRICK_COUNT: Readonly<Record<FactionId, number>> = {
  usa: 2,
  russia: 2,
  china: 2,
  europe: 2,
  islamic: 3,
};
/**
 * Real oil regions some nations must put their field in (centre within 16 cells, widened to 24 / 32 only if needed,
 * inside their own land unless listed in OIL_SITES_ABROAD): the Islamic world's goes to Abu Dhabi
 * (UAE, inside its homeland); Russia's to West Siberia (Samotlor, near Nizhnevartovsk);
 * China's to Xinjiang (Karamay, Junggar Basin); the USA's to Texas (Permian Basin, near Midland);
 * Europe's inland in the Nordic countries (central Sweden: the widest stretch of land with no sea or lake near).
 */
export const OIL_SITES: Readonly<Partial<Record<FactionId, NamedSite>>> = {
  islamic: { lon: 54.0, lat: 23.3, name: "Abu Dhabi oil fields" },
  russia: { lon: 76.6, lat: 61.1, name: "West Siberia oil fields (Samotlor)" },
  china: { lon: 84.9, lat: 45.6, name: "Xinjiang oil fields (Karamay)" },
  usa: { lon: -102.1, lat: 31.9, name: "Texas oil fields (Permian Basin)" },
  europe: {
    lon: 15.0,
    lat: 61.2,
    name: "Central Sweden oil field (inland Nordic)",
  },
};
/** Nations whose OIL_SITES field may stand outside their own land (on neutral ground). */
export const OIL_SITES_ABROAD: ReadonlySet<FactionId> = new Set<FactionId>([]);
/**
 * Oil cartel (FactionConfig.oilCartel, like OPEC): its production policy scales the cartel's own derrick output and
 * the world price the market heads for, as in real life — a cut pumps less but lifts the price for everybody, a flood
 * pumps more and crashes it (a price war hurting rivals who live off oil). The posted price still eases towards the
 * target, so a policy takes a few revisions to bite. It can be changed once every OIL_POLICY_COOLDOWN seconds.
 */
export const OIL_POLICIES: Readonly<
  Record<OilPolicy, { label: string; output: number; price: number }>
> = {
  cut: { label: t("Cut output"), output: 0.5, price: 1.35 },
  hold: { label: t("Hold"), output: 1, price: 1 },
  flood: { label: t("Flood market"), output: 1.6, price: 0.7 },
};
export const OIL_POLICY_COOLDOWN = 90;
/**
 * Oil leases (FactionConfig.leasesOil): another nation sends an engineer into one of the cartel's derricks and leases
 * it for OIL_LEASE_SECONDS. Meanwhile the derrick pumps into the lessee's stock; when that oil is sold, the cartel
 * gets OIL_LEASE_CARTEL_SHARE of the money (the lessee the rest). Then the derrick goes back to the cartel.
 */
export const OIL_LEASE_SECONDS = 180;
export const OIL_LEASE_CARTEL_SHARE = 0.3;
/** At most this many of the cartel's derricks may be leased at once (engineers already on their way count too). */
export const OIL_LEASE_MAX = 4;
/** Oil derricks heal by themselves: this share of their max health per second while alive (temporary rule). */
export const OIL_DERRICK_REGEN = 0.01;
/** Most derricks in one row; a bigger field (the Islamic world's) gets several rows. */
export const OIL_ROW_MAX = 4;
/** No derrick may stand within this many cells of another nation's derrick (oil fields never share ground). */
export const OIL_FIELD_SPACING = 40;
/** Oil cycle: pump for 3 minutes, then rest 1 minute while the field recovers. */
export const OIL_MINE_SECONDS = 180;
export const OIL_REST_SECONDS = 60;

// ---------------------------------------------------------------- Power (nuclear plants burn oil)
/**
 * Every structure drains power (units/s, see each entity's powerDrain). Nuclear plants turn the nation's oil
 * stock into energy, counted in joules (J): 0.001 barrel → 1 J, so a plant burning at full rate uses 0.025 bbl/s for 25 J/s.
 * One plant covers exactly one of each: capital 1 + barracks 1 + war factory 3 + airfield 4 +
 * tech center 6 + city 8 = 25. Anything beyond that needs another plant (or the nation is short of power). Each plant also stores up to POWER_PLANT_STORAGE; a new plant starts empty (0).
 * When the grid runs dry (drain > generation and storage empty) the Global Monitoring Center is forced to sell the missing
 * oil at OIL_GRID_MARKUP × the posted price; with an empty treasury the nation falls into a blackout (low power).
 */
export const POWER_PER_BARREL = 1000;
export const POWER_PLANT_OUTPUT = 25;
export const POWER_PLANT_STORAGE = 300;
export const POWER_PLANT_COST = 1500;
export const OIL_GRID_MARKUP = 1.25;

/** Price-equivalent of a destroyed structure, for veteran experience (default 1000). */
export const BUILDING_VALUE: Readonly<Partial<Record<BuildingType, number>>> = {
  barracks: BARRACKS_COST,
  bunker: BUNKER_COST,
  wall: WALL_COST,
  gate: GATE_COST,
  warFactory: WAR_FACTORY_COST,
  airfield: AIRFIELD_COST,
  radarTower: RADAR_TOWER_COST,
  techCenter: TECH_CENTER_COST,
  happyCity: HAPPY_CITY_COST,
  powerPlant: POWER_PLANT_COST,
  flagpole: FLAGPOLE_COST,
  alliedBuilding: ALLIED_BUILDING_COST,
  capital: 4000,
  nationCapital: 5000,
  oilDerrick: 1500,
};

/** Waypoint mode (Z): most points a route may have. */
export const MAX_WAYPOINTS = 5;

/** In a DEMO game every structure, soldier and vehicle costs this much. */
export const DEMO_PRICE = 100;
/** In a DEMO game finances are off: the budget (and oil stock) is held at this amount all the time. */
export const DEMO_CREDITS = 999_999;
/** In a DEMO game the player starts with this many of every soldier, vehicle and aircraft. */
export const DEMO_UNITS_EACH = 2;
/** DEMO: free cells kept between the starting structures (the most the build radius BUILD_RADIUS = 3 allows), room for their wall rings. */
export const DEMO_SPREAD = 3;
/** Capitals keep this many cells of land (more than 3) between their footprint and the sea. */
export const CAPITAL_SEA_CLEARANCE = 4;
/** How far (cells) a capital may be moved inland from its real spot to clear the coast. */
export const CAPITAL_INLAND_SEARCH = 20;
