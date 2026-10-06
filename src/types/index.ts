/**
 * Shared type definitions. Keep this module free of runtime code so every
 * layer (core, map, entities, systems, ui) can depend on it safely.
 */

export type FactionId = 'usa' | 'china' | 'russia' | 'europe';

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
}

export interface CapitalSpec {
  name: string;
  city: string;
  description: string;
  maxHp: number;
  powerOutput: number;
}

// ---------------------------------------------------------------- Weapons

export type WeaponKind = 'rifle' | 'smg' | 'sniper' | 'mg' | 'cannon' | 'autocannon' | 'missile';

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
export type VehicleKind = 'light' | 'tank' | 'ifv' | 'jet' | 'transport';

export interface VehicleProfile {
  name: string;
  description: string;
}

// ---------------------------------------------------------------- Infantry

/** Every nation fields a regular line infantry and a special-forces unit. */
export type UnitTier = 'regular' | 'special' | 'president' | 'engineer';

/** Procedural look of a soldier (team colour is added as a vest stripe). */
export interface InfantryLook {
  uniform: string;
  trousers: string;
  headgear: 'helmet' | 'beret' | 'cap' | 'ushanka' | 'balaclava' | 'boonie' | 'hardhat' | 'none';
  headColor: string;
  weapon: 'rifle' | 'smg' | 'sniper' | 'wrench' | 'none';
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
  doctrine: string;
  colors: FactionColors;
  stats: FactionStats;
  capital: CapitalSpec;
  /** Ground forces trained at the Barracks. */
  infantry: Readonly<Record<UnitTier, InfantryProfile>>;
  /** Vehicles (War Factory) and aircraft (Airfield). */
  vehicles: Readonly<Record<VehicleKind, VehicleProfile>>;
}

// ---------------------------------------------------------------- Players & buildings

export interface PlayerState {
  id: number;
  name: string;
  faction: FactionId;
  isHuman: boolean;
  /** Treasury in TB. */
  credits: number;
  /** Oil in stock (barrels): pumped by the derricks, sold to the World Bank for TB. */
  oil: number;
  /** Set when the nation's capital has been destroyed: it has lost the war. */
  defeated: boolean;
  powerProduced: number;
  powerConsumed: number;
}

export type BuildingType =
  | 'capital'
  | 'constructionYard'
  | 'powerPlant'
  | 'barracks'
  | 'warFactory'
  | 'refinery'
  | 'bank'
  | 'chhg'
  | 'hospital'
  | 'warFactory'
  | 'airfield'
  | 'oilDerrick';

/** Who may be stationed inside a building, and how many. */
export interface GarrisonSpec {
  capacity: number;
  /** 'president' = only the nation's President; 'wounded' = anyone below full health. */
  accepts: 'president' | 'wounded';
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
  /** Can hold people inside (capital: the President; hospital: wounded soldiers). */
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
