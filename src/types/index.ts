/**
 * Shared type definitions. Keep this module free of runtime code so every
 * layer (core, map, entities, systems, ui) can depend on it safely.
 */

export type FactionId = 'usa' | 'china' | 'russia' | 'europe' | 'islamic';

/** The oil cartel's production policy (OPEC-style): cut output to lift the world price, hold, or flood the market. */
export type OilPolicy = 'cut' | 'hold' | 'flood';

/** Who an entity belongs to: a faction, or nobody (shared world landmarks). */
export type Allegiance = FactionId | 'neutral';

/** Integer cell coordinate on the logic grid. */
export interface GridPoint {
  x: number;
  y: number;
}

/** A point in world pixel space. */
export interface WorldPoint {
  x: number;
  y: number;
}

/** Geographic coordinate in degrees. */
export interface GeoPoint {
  lon: number;
  lat: number;
}

/** A named real-world location. */
export interface NamedSite extends GeoPoint {
  name: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- Terrain

export type TerrainType = 'water' | 'sand' | 'grass' | 'forest' | 'desert' | 'rock' | 'snow';

// ---------------------------------------------------------------- Factions

export interface FactionColors {
  primary: string;
  light: string;
  dark: string;
}

/** Multipliers applied on top of base unit/building stats (1.0 = baseline). */
export interface FactionStats {
  unitSpeed: number;
  armor: number;
  firepower: number;
  range: number;
  buildSpeed: number;
  /** Extra seconds added to every soldier / vehicle training time (rich nations train slower). */
  trainDelay: number;
  cost: number;
  /** Extra multipliers for soldiers only, on top of cost / unitSpeed (default 1). */
  infantryCost?: number;
  infantrySpeed?: number;
}

export interface CapitalSpec {
  name: string;
  city: string;
  description: string;
  maxHp: number;
  powerOutput: number;
}

// ---------------------------------------------------------------- Weapons

export type WeaponKind = 'rifle' | 'smg' | 'sniper' | 'mg' | 'cannon' | 'autocannon' | 'missile' | 'bomb';

export interface WeaponSpec {
  kind: WeaponKind;
  damage: number;
  /** Reach in world px. */
  range: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Damage multiplier against buildings. */
  vsBuilding: number;
  /** Can shoot aircraft. */
  hitsAir: boolean;
  /** Splash radius in world px (0 = single target). */
  splash: number;
}

// ---------------------------------------------------------------- Vehicles

/** Light car, main battle tank, armoured vehicle (IFV) and fighter aircraft. */
/** `bomber` is a national special: only nations that list it in their `vehicles` can build it (Russia's Tu-16, the USA's B-52). */
/** `repair` is a national special too: an unarmed armoured recovery vehicle that mends friendly ground vehicles (Russia's BREM-1). */
export type VehicleKind = 'light' | 'tank' | 'ifv' | 'jet' | 'transport' | 'tanker' | 'bomber' | 'repair' | 'truck' | 'heli';

export interface VehicleProfile {
  name: string;
  description: string;
}

// ---------------------------------------------------------------- Infantry

/** Every nation fields a regular line infantry and a special-forces unit. */
/** `squatters`: a flag bearer and his rifleman escort, trained, selected and moved as one unit (see Infantry). */
/** `demolition`: a national special (only nations that list it in `infantry` train it) — plants timed charges. */
export type UnitTier = 'regular' | 'special' | 'engineer' | 'squatters' | 'demolition';

/** Soldier sprite sheets in public/sprites (see render/InfantryArt). */
export type SoldierSheetId = 'gi' | 'ranger' | 'spetsnaz' | 'conscript' | 'usRegular' | 'usSpecial' | 'ruRegular' | 'ruSpecial' | 'cnRegular' | 'cnSpecial' | 'euRegular' | 'euSpecial' | 'usEngineer' | 'ruEngineer' | 'cnEngineer' | 'euEngineer' | 'euSquatters' | 'ruSquatters' | 'usSquatters' | 'cnSquatters' | 'islamicRegular' | 'islamicSpecial' | 'islamicSquatters' | 'islamicEngineer' | 'islamicDemolition';

/** Procedural look of a soldier (team colour is added as a vest stripe). */
export interface InfantryLook {
  uniform: string;
  trousers: string;
  headgear: 'helmet' | 'beret' | 'cap' | 'reverseCap' | 'ushanka' | 'balaclava' | 'boonie' | 'hardhat' | 'none';
  headColor: string;
  weapon: 'rifle' | 'smg' | 'sniper' | 'wrench' | 'none';
  /** Camouflage blotches on the uniform. */
  camo?: boolean;
  /** Sprite sheet to draw with (default GI). */
  sprite?: SoldierSheetId;
}

export interface InfantryProfile {
  name: string;
  description: string;
  look: InfantryLook;
}

export interface FactionConfig {
  id: FactionId;
  name: string;
  shortName: string;
  /** Current head of the nation (title and name), shown in the sidebar. */
  leader: { title: string; name: string };
  doctrine: string;
  colors: FactionColors;
  stats: FactionStats;
  capital: CapitalSpec;
  /** Ground forces trained at the Barracks. */
  infantry: Readonly<Record<Exclude<UnitTier, 'demolition'>, InfantryProfile>> & { readonly demolition?: InfantryProfile };
  /** Vehicles (War Factory) and aircraft (Airfield). */
  vehicles: Readonly<Record<Exclude<VehicleKind, 'bomber' | 'repair' | 'truck' | 'transport' | 'tanker' | 'heli'>, VehicleProfile>> & {
    readonly bomber?: VehicleProfile;
    /** Attack helicopter (built at the Airfield). */
    readonly heli?: VehicleProfile;
    readonly repair?: VehicleProfile;
    /** Army truck (KamAZ): only nations that field one. */
    readonly truck?: VehicleProfile;
    /** Transport aircraft and its escort tanker: a nation without them flies no airlifts. */
    readonly transport?: VehicleProfile;
    readonly tanker?: VehicleProfile;
  };
  /** Leads the world oil cartel (like OPEC in real life): sets a production policy that moves the global oil price. */
  oilCartel?: boolean;
  /** Temporarily kept out of the fighting: trains no soldiers and builds no vehicles or aircraft (economy and oil only). */
  peaceful?: boolean;
  /** Its derricks can be leased by other nations' engineers (see OIL_LEASE_*), and cannot be destroyed or captured for now. */
  leasesOil?: boolean;
}

// ---------------------------------------------------------------- Players & buildings

export interface PlayerState {
  id: number;
  name: string;
  faction: FactionId;
  isHuman: boolean;
  /** Treasury in TB. */
  credits: number;
  /** Oil in stock (barrels): pumped by the derricks, sold to the Global Financial Center for TB. */
  oil: number;
  /** Part of `oil` pumped from leased derricks: when sold, the cartel takes its share (OIL_LEASE_CARTEL_SHARE). */
  leasedOil: number;
  /** TB owed to the Global Financial Center (emergency loans); income pays it back automatically. */
  debt: number;
  /** Credit frozen by the Global Financial Center after reaching its credit line; lifted once DEBT ≤ DEBT_RESUME_SHARE of the line. */
  creditFrozen: boolean;
  /** Set when the nation's capital has been destroyed: it has lost the war. */
  defeated: boolean;
  /** Its own capital was destroyed or captured: the nation can no longer buy anything. */
  capitalLost: boolean;
  /** Power generated by the nuclear plants (units/s, last tick). */
  powerProduced: number;
  /** Power drained by every structure (units/s). */
  powerConsumed: number;
  /** Power stored in the nation's plants, and their total storage. */
  powerStored: number;
  powerCapacity: number;
  /** The grid ran dry and the treasury could not buy oil from the Global Financial Center. */
  blackout: boolean;
  /** Most the nation's nuclear plants can generate (J/s, scaled by their health). */
  powerSupply: number;
  /** Not enough power: supply below drain, or a blackout. No construction (but plants), vehicles or take-offs. */
  powerShort: boolean;
  /** Building id chosen by double-click per producer type (barracks / warFactory / airfield): new units come out there. */
  primaryBuilding?: Partial<Record<string, number>>;
}

export type BuildingType =
  | 'capital'
  | 'constructionYard'
  | 'powerPlant'
  | 'barracks'
  | 'warFactory'
  | 'refinery'
  | 'bank'
  | 'hospital'
  | 'warFactory'
  | 'airfield'
  | 'techCenter'
  | 'happyCity'
  | 'flagpole'
  | 'alliedBuilding'
  | 'oilDerrick'
  | 'bunker';

/** Who may be stationed inside a building, and how many. */
export interface GarrisonSpec {
  capacity: number;
  /** 'wounded' = anyone below full health. */
  accepts: 'wounded';
  /** HP restored per second to everyone inside. */
  healPerSecond?: number;
}

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  /** Footprint in grid cells (fixed: 4×3 or 3×3). */
  footprint: { w: number; d: number };
  maxHp: number;
  powerOutput: number;
  powerDrain: number;
  /** Barrels of oil produced per second for the owner (oil derricks). */
  incomePerSecond: number;
  /** Key into the sprite/art registry. */
  spriteKey: string;
  /** Cannot be damaged or destroyed by anyone (default false). */
  indestructible?: boolean;
  /** Cannot be captured / occupied by any nation (default false). */
  uncapturable?: boolean;
  /** Naval structure: must be placed entirely on water (default false = land only). */
  naval?: boolean;
  /** Can hold people inside (hospital: wounded soldiers). */
  garrison?: GarrisonSpec;
}

/** A faction's home region on the world map (lon/lat polygon). */
export interface Territory {
  faction: FactionId;
  name: string;
  polygon: readonly GeoPoint[];
}

// ---------------------------------------------------------------- Events

export type GameEvents = {
  'selection:changed': { entityId: number | null };
  'camera:focus': WorldPoint;
};
