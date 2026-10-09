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

/** DEMO: skip the faction screen and start a solo test game as Russia (no AI opponents). Set to false for production. */
export const DEMO_MODE = false;

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
export const CRUISE_ALTITUDE =
  Math.ceil(TALLEST_BUILDING_ART * SPRITE_SCALE) + 6;
/** Large structures (War Factory, Hospital) occupy 5×4 cells, everything else 4×4 (7 px cells). */
export const FOOTPRINT_LARGE = { w: 5, d: 4 } as const;
export const FOOTPRINT_SMALL = { w: 4, d: 4 } as const;
/** Flagpole: exactly one cell. */
export const FOOTPRINT_FLAGPOLE = { w: 1, d: 1 } as const;
/**
 * Capitals sit on a 5 × 8 plot: the palace itself on roughly 5 × 5, and the nation's ceremonial approach
 * (the Mall, Red Square, the outer courtyard, the esplanade) on the 5 × 3 in front of it. The art is
 * authored in 4 × 6.4 units and drawn 1.25× to fill the plot.
 */
export const FOOTPRINT_CAPITAL = { w: 5, d: 8 } as const;
/** Airfield: a long runway + an apron with nine parking spots, 12×8 tiles. */
export const FOOTPRINT_AIRFIELD = { w: 12, d: 8 } as const;
/** Happy City: a whole city block, 8×8 tiles. */
export const FOOTPRINT_CITY = { w: 8, d: 8 } as const;

// ---------------------------------------------------------------- Simulation & camera
export const TICK_RATE = 30;
/** Mercy bonus: the Global Financial Center pays a nation this much for each retreating enemy group it lets go unchased (once per group, whatever its size). */
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
export const MAX_ALLIES = 3;
export const HOSPITAL_COST = 1200;
export const AIRFIELD_COST = 2000;
/** High-Tech Center (a high-rise): base price; it unlocks the second-tier soldiers and vehicles. */
export const TECH_CENTER_COST = 8000;
/** Second-tier units that need a High-Tech Center: special-forces soldiers and the armoured fighting vehicle. */
export const TECH_TIERS: readonly UnitTier[] = ["special", "demolition"];
export const TECH_VEHICLES: readonly VehicleKind[] = ["ifv", "transport"];
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
  engineer: { cost: 400, trainSeconds: 6, maxHp: 100, speed: 1.3 },
  /** Two men counted as one: the flag bearer and his escort (hp covers both). */
  squatters: { cost: 1400, trainSeconds: 12, maxHp: 320, speed: 1.4 },
  /** Crazy Soldier (Islamic only): unarmed, plants timed charges (see DEMO_*). */
  demolition: { cost: 900, trainSeconds: 10, maxHp: 110, speed: 1.6 },
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
  light: { cost: 600, trainSeconds: 8, maxHp: 180, speed: 2.4, radius: 3.4 },
  tank: { cost: 1200, trainSeconds: 14, maxHp: 420, speed: 1.4, radius: 4.2 },
  ifv: { cost: 900, trainSeconds: 11, maxHp: 300, speed: 1.8, radius: 4.0 },
  jet: { cost: 1600, trainSeconds: 16, maxHp: 220, speed: 9, radius: 3.2 },
  /** Unarmed cargo aircraft: slower than the fighter. */
  transport: {
    cost: 1400,
    trainSeconds: 14,
    maxHp: 260,
    speed: 5.5,
    radius: 3.6,
  },
  /** National heavy bomber (Russia's Tu-16, the USA's B-52; no other nation has one): tough, flattens ground targets and structures; cannot hit aircraft. */
  bomber: { cost: 2600, trainSeconds: 22, maxHp: 380, speed: 8.5, radius: 3.8 },
  /** Aerial refueler: never sold on its own — every transport comes with one that flies escort and keeps it fuelled. */
  tanker: { cost: 0, trainSeconds: 0, maxHp: 160, speed: 6, radius: 3.2 },
} as const;

/** Transport fuel: a full tank lasts this many cells of flight (enough for a round trip to the tanker-escort distance); the escorting tanker refills it. */
/** Bomber payload: bombs carried per sortie (reloaded on its airfield) and bombs released per drop. */
export const BOMBER_BOMBS = 6;
export const BOMBS_PER_DROP = 2;
/** Seconds from release until a bomb hits the ground and explodes: its damage lands only then. */
export const BOMB_FALL_SECONDS = 0.9;
/** Fighters carry this many bombs, one per drop: the only way they can hit a structure (JET_BOMB_VS_STRUCTURE of
 * its max health each). While any are left they are also dropped on ground units (JET_BOMB_VS_VEHICLE of a
 * vehicle's max health, a soldier killed); aircraft, and ground units once the bombs are gone, get the guns. */
export const JET_BOMBS = 2;
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
export const TRANSPORT_FUEL_CELLS = 800;
/** A tanker within this many cells of its transport refuels it, at this many full tanks per second. */
export const REFUEL_RANGE_CELLS = 4;
export const REFUEL_RATE = 0.08;
/** The tanker flies (and sets down) this many cells ahead of its transport's nose — never behind it. */
export const TANKER_LEAD_CELLS = 2.2;
/** Length of a transport aircraft (world px, as drawn). */
export const TRANSPORT_LENGTH = 13;
/** Short hops need no tanker: it only flies with the transport on sorties reaching farther than this from home (px). */
export const TANKER_ESCORT_DISTANCE = 50 * TRANSPORT_LENGTH;

/** Aircraft are built at the Airfield and use its runway; everything else rolls out of the War Factory. */
export const isAircraftKind = (kind: VehicleKind): boolean =>
  kind === "jet" ||
  kind === "transport" ||
  kind === "tanker" ||
  kind === "bomber";

/**
 * Temporary: only these vehicles can be produced (sidebar and AI). The rest stay in the code but are
 * hidden until they are wanted again — add a kind here to bring it back.
 */
export const AVAILABLE_VEHICLES: readonly VehicleKind[] = [
  "tank",
  "jet",
  "bomber",
  "transport",
];

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

/**
 * Engineers repair from inside the building: each one restores this share of the building's full health per
 * second until it is back to 100%, then they walk out. Hits keep taking health off meanwhile.
 */
export const ENGINEER_REPAIR_SHARE = 0.06;
/** Hospital: HP per second restored to each patient inside, and its capacity. */
export const HOSPITAL_HEAL_PER_SECOND = 10;
export const HOSPITAL_CAPACITY = 20;

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

// ---------------------------------------------------------------- Landmarks (real coordinates)
export const CAPITAL_LOCATIONS: Readonly<Record<FactionId, NamedSite>> = {
  usa: { lon: -77.04, lat: 38.9, name: "Washington, D.C." },
  russia: { lon: 37.62, lat: 55.75, name: "Moscow" },
  china: { lon: 116.4, lat: 39.9, name: "Beijing" },
  europe: { lon: 2.35, lat: 48.86, name: "Paris" },
  islamic: { lon: 46.68, lat: 24.71, name: "Riyadh" },
};
export const WORLD_BANK_LOCATION: GeoPoint = { lon: 8.54, lat: 47.37 }; // Zürich

// ---------------------------------------------------------------- Oil (replaces RA2 ore)
/** Barrels of oil pumped per second by each derrick while it is pumping (oil is sold to the Global Financial Center for TB). */
export const OIL_DERRICK_OUTPUT = 0.08; // barrels/s per derrick
/** Every nation starts with some oil in stock, so the first sale can pay for the first buildings. */
export const STARTING_OIL = 20;
/**
 * Global Financial Center oil market: one price for everybody (TB per barrel). It rises and falls mainly with
 *   - FLOW: barrels the nations sold to the Center lately (more oil sold → cheaper) against barrels the Center had
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
 * Global Financial Center credit: when the treasury is at 0 TB the player may press "Emergency loan" (never automatic). No interest.
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
/** Oil derricks per nation, built in one straight row on the safest ground: 2 each, but 8 for the Islamic world (the Middle East oil fields). */
export const OIL_DERRICK_COUNT: Readonly<Record<FactionId, number>> = {
  usa: 2,
  russia: 2,
  china: 2,
  europe: 2,
  islamic: 8,
};
/**
 * Real oil regions some nations must put their field in (centre within 16 cells, widened to 24 / 32 only if needed,
 * always inside their own land): the Islamic world's goes to the Persian Gulf fields (eastern Saudi Arabia, Kuwait,
 * southern Iraq), never to Africa.
 */
export const OIL_SITES: Readonly<Partial<Record<FactionId, NamedSite>>> = {
  islamic: { lon: 48.5, lat: 27, name: "Persian Gulf oil fields" },
};
/**
 * Oil cartel (FactionConfig.oilCartel, like OPEC): its production policy scales the cartel's own derrick output and
 * the world price the market heads for, as in real life — a cut pumps less but lifts the price for everybody, a flood
 * pumps more and crashes it (a price war hurting rivals who live off oil). The posted price still eases towards the
 * target, so a policy takes a few revisions to bite. It can be changed once every OIL_POLICY_COOLDOWN seconds.
 */
export const OIL_POLICIES: Readonly<
  Record<OilPolicy, { label: string; output: number; price: number }>
> = {
  cut: { label: "Cut output", output: 0.5, price: 1.35 },
  hold: { label: "Hold", output: 1, price: 1 },
  flood: { label: "Flood market", output: 1.6, price: 0.7 },
};
export const OIL_POLICY_COOLDOWN = 90;
/**
 * Oil leases (FactionConfig.leasesOil): another nation sends an engineer into one of the cartel's derricks and leases
 * it for OIL_LEASE_SECONDS. Meanwhile the derrick pumps into the lessee's stock; when that oil is sold, the cartel
 * gets OIL_LEASE_CARTEL_SHARE of the money (the lessee the rest). Then the derrick goes back to the cartel.
 */
export const OIL_LEASE_SECONDS = 180;
export const OIL_LEASE_CARTEL_SHARE = 0.3;
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
 * stock into power: 0.001 barrel → 1 power, so a plant burning at full rate uses 0.025 bbl/s for 25 power/s.
 * One plant covers exactly one of each: capital 1 + barracks 1 + hospital 2 + war factory 3 + airfield 4 +
 * tech center 6 + city 8 = 25. Anything beyond that needs another plant (or the nation is short of power). Each plant also stores up to POWER_PLANT_STORAGE; a new plant starts empty (0).
 * When the grid runs dry (drain > generation and storage empty) the Global Financial Center is forced to sell the missing
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
  hospital: HOSPITAL_COST,
  warFactory: WAR_FACTORY_COST,
  airfield: AIRFIELD_COST,
  techCenter: TECH_CENTER_COST,
  happyCity: HAPPY_CITY_COST,
  powerPlant: POWER_PLANT_COST,
  flagpole: FLAGPOLE_COST,
  alliedBuilding: ALLIED_BUILDING_COST,
  capital: 4000,
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
