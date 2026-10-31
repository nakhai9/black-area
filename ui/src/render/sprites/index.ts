import { createAirfieldArt } from './Airfield';
import { createAlliedBuildingArt } from './AlliedBuilding';
import { createBarracksArt } from './Barracks';
import { createBunkerArt } from './Bunker';
import { createFlagpoleArt } from './Flagpole';
import { WALL_DAMAGE_LEVELS, createWallArt } from './Wall';
import { BRIDGE_DAMAGE_LEVELS, createBridgeArt } from './Bridge';
import { createGateArt } from './Gate';
import { createHappyCityArt } from './HappyCity';
import { createTechCenterArt } from './TechCenter';
import { createWarFactoryArt } from './WarFactory';
import { createBeijingZhongnanhaiArt } from './BeijingZhongnanhai';
import { createBrusselsEUHeadquartersArt } from './BrusselsEUHeadquarters';
import type { BuildingArt } from './BuildingArt';
import { createMoscowKremlinArt } from './MoscowKremlin';
import { createOilDerrickArt } from './OilDerrick';
import { createPowerPlantArt } from './PowerPlant';
import { createRadarTowerArt } from './RadarTower';
import { createGrandMosqueArt } from './GrandMosque';
import { createWashingtonWhiteHouseArt } from './WashingtonWhiteHouse';
import { WorldBankArt } from './WorldBank';
import { PyramidsArt } from './Pyramids';
import { MONUMENT_ARTS } from './Monuments';
import { createNationCapitalArt } from './NationCapital';
import type { ContestedNationId } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';

/** Sprite key → artwork. Register new building art here. */
export const BUILDING_ART: Readonly<Record<string, BuildingArt>> = {
  'capital:usa': createWashingtonWhiteHouseArt(),
  'capital:russia': createMoscowKremlinArt(),
  'capital:china': createBeijingZhongnanhaiArt(),
  'capital:europe': createBrusselsEUHeadquartersArt(),
  'capital:islamic': createGrandMosqueArt(),
  'bank:world': WorldBankArt,
  'monument:giza': PyramidsArt,
  ...MONUMENT_ARTS,
  // Capitals of the contested independent nations (neutral until an engineer takes one).
  'nation:northKorea': createNationCapitalArt('northKorea'),
  'nation:southKorea': createNationCapitalArt('southKorea'),
  'nation:japan': createNationCapitalArt('japan'),
  'nation:australia': createNationCapitalArt('australia'),
  'nation:brazil': createNationCapitalArt('brazil'),
  'nation:unitedKingdom': createNationCapitalArt('unitedKingdom'),
  'nation:canada': createNationCapitalArt('canada'),
  'nation:cuba': createNationCapitalArt('cuba'),
  'nation:belarus': createNationCapitalArt('belarus'),
  // Oil derricks in each nation's team colour.
  'oil:usa': createOilDerrickArt(FACTIONS.usa.colors),
  'oil:russia': createOilDerrickArt(FACTIONS.russia.colors),
  'oil:china': createOilDerrickArt(FACTIONS.china.colors),
  'oil:europe': createOilDerrickArt(FACTIONS.europe.colors),
  'oil:islamic': createOilDerrickArt(FACTIONS.islamic.colors),
  // Unowned Antarctic derricks.
  'oil:neutral': createOilDerrickArt({ primary: '#9aa3ab', light: '#c9d0d6', dark: '#5d646b' }),
  // Barracks in each nation's team colour.
  'barracks:usa': createBarracksArt('usa'),
  'barracks:russia': createBarracksArt('russia'),
  'barracks:china': createBarracksArt('china'),
  'barracks:europe': createBarracksArt('europe'),
  'barracks:islamic': createBarracksArt('islamic'),
  // Airfield in each nation's team colour.
  'warFactory:usa': createWarFactoryArt('usa'),
  'warFactory:russia': createWarFactoryArt('russia'),
  'warFactory:china': createWarFactoryArt('china'),
  'warFactory:europe': createWarFactoryArt('europe'),
  'warFactory:islamic': createWarFactoryArt('islamic'),
  'airfield:usa': createAirfieldArt('usa'),
  'airfield:russia': createAirfieldArt('russia'),
  'airfield:china': createAirfieldArt('china'),
  'airfield:europe': createAirfieldArt('europe'),
  'airfield:islamic': createAirfieldArt('islamic'),
  // The high-rise High-Tech Center in each nation's team colour.
  'techCenter:usa': createTechCenterArt('usa'),
  'techCenter:russia': createTechCenterArt('russia'),
  'techCenter:china': createTechCenterArt('china'),
  'techCenter:europe': createTechCenterArt('europe'),
  'techCenter:islamic': createTechCenterArt('islamic'),
  // Nuclear power plant in each nation's team colour.
  'powerPlant:usa': createPowerPlantArt('usa'),
  'powerPlant:russia': createPowerPlantArt('russia'),
  'powerPlant:china': createPowerPlantArt('china'),
  'powerPlant:europe': createPowerPlantArt('europe'),
  'powerPlant:islamic': createPowerPlantArt('islamic'),
  // Radar Tower (2 × 2): each nation's own pedestal and antenna, turning 360°.
  'radarTower:usa': createRadarTowerArt('usa'),
  'radarTower:russia': createRadarTowerArt('russia'),
  'radarTower:china': createRadarTowerArt('china'),
  'radarTower:europe': createRadarTowerArt('europe'),
  'radarTower:islamic': createRadarTowerArt('islamic'),
  // Happy City in each nation's own architecture.
  'happyCity:usa': createHappyCityArt('usa'),
  'happyCity:russia': createHappyCityArt('russia'),
  'happyCity:china': createHappyCityArt('china'),
  'happyCity:europe': createHappyCityArt('europe'),
  'happyCity:islamic': createHappyCityArt('islamic'),
  // National flagpoles (one cell).
  'flagpole:usa': createFlagpoleArt('usa'),
  'flagpole:russia': createFlagpoleArt('russia'),
  'flagpole:china': createFlagpoleArt('china'),
  'flagpole:europe': createFlagpoleArt('europe'),
  'flagpole:islamic': createFlagpoleArt('islamic'),
  // Allied Building in the architecture of the nation the ally follows.
  'alliedBuilding:usa': createAlliedBuildingArt('usa'),
  'alliedBuilding:russia': createAlliedBuildingArt('russia'),
  'alliedBuilding:china': createAlliedBuildingArt('china'),
  'alliedBuilding:europe': createAlliedBuildingArt('europe'),
  'alliedBuilding:islamic': createAlliedBuildingArt('islamic'),
  // Bunkers: drawn from render/BunkerSheet (west: USA, Europe; east: Russia, China, Islamic).
  'bunker:usa': createBunkerArt(),
  'bunker:russia': createBunkerArt(),
  'bunker:china': createBunkerArt(),
  'bunker:europe': createBunkerArt(),
  'bunker:islamic': createBunkerArt(),
  // Bridges laid by the bridge layers: one sprite per joined-ends mask and damage stage (see createBridgeArt).
  ...Object.fromEntries(
    (['usa', 'russia', 'china', 'europe', 'islamic'] as const).flatMap((f) =>
      Array.from({ length: 16 * BRIDGE_DAMAGE_LEVELS }, (_, i) => [`bridge:${f}|${i % 16}~${Math.floor(i / 16)}`, createBridgeArt(f, i % 16, Math.floor(i / 16))] as const),
    ),
  ),
  // Walls (one cell) in each nation's colour, one sprite per neighbour mask (see createWallArt).
  ...Object.fromEntries(
    (['usa', 'russia', 'china', 'europe', 'islamic'] as const).flatMap((f) =>
      Array.from({ length: 16 * WALL_DAMAGE_LEVELS }, (_, i) => {
        const m = i % 16;
        const dmg = Math.floor(i / 16);
        return [`${m === 0 ? `wall:${f}` : `wall:${f}|${m}`}${dmg ? `~${dmg}` : ''}`, createWallArt(f, m, dmg)] as const;
      }),
    ),
  ),
  // Nation Gates (4 × 1) in each nation's architecture.
  ...Object.fromEntries((['usa', 'russia', 'china', 'europe', 'islamic'] as const).map((f) => [`gate:${f}`, createGateArt(f)] as const)),
};

/** Structures whose art flies a flag of its own: a captured one is redrawn with the new owner's flag. */
const FLAG_VARIANTS: Readonly<Record<string, (design: FactionId, flag: FactionId) => BuildingArt>> = {
  capital: (design, flag) =>
    (design === 'usa'
      ? createWashingtonWhiteHouseArt
      : design === 'russia'
        ? createMoscowKremlinArt
        : design === 'china'
          ? createBeijingZhongnanhaiArt
          : design === 'islamic'
            ? createGrandMosqueArt
            : createBrusselsEUHeadquartersArt)(flag),
  alliedBuilding: (design, flag) => createAlliedBuildingArt(design, flag),
  nation: (design, flag) => createNationCapitalArt(design as unknown as ContestedNationId, flag),
  barracks: (design, flag) => createBarracksArt(design, flag),
  warFactory: (design, flag) => createWarFactoryArt(design, flag),
  flagpole: (design, flag) => createFlagpoleArt(design, flag),
  happyCity: (design, flag) => createHappyCityArt(design, flag),
};

/** Art for a `kind:design@flag` sprite key, or undefined when the key is not one. */
export function flagVariantArt(key: string): BuildingArt | undefined {
  const m = /^(\w+):(\w+)@(\w+)$/.exec(key);
  const make = m ? FLAG_VARIANTS[m[1]!] : undefined;
  return m && make ? make(m[2] as FactionId, m[3] as FactionId) : undefined;
}

export type { BuildingArt } from './BuildingArt';

const FACTION_IDS: readonly string[] = ['usa', 'russia', 'china', 'europe', 'islamic'];
const isFactionId = (s: string | undefined): s is FactionId => s !== undefined && FACTION_IDS.includes(s);

/**
 * Builds the art of a plain (not recoloured) sprite key from scratch, or undefined for keys that cannot be rebuilt.
 * Walls / gates / bunkers / bridges are left out: their colours are building materials, a taken one flies a pole.
 */
function rebuildArt(key: string): BuildingArt | undefined {
  const flag = flagVariantArt(key);
  if (flag) return flag;
  const m = /^(\w+):(\w+)$/.exec(key);
  if (!m || !isFactionId(m[2])) return undefined;
  const f = m[2];
  switch (m[1]) {
    case 'capital':
    case 'alliedBuilding':
    case 'barracks':
    case 'warFactory':
    case 'flagpole':
    case 'happyCity':
      return FLAG_VARIANTS[m[1]]!(f, f);
    case 'oil':
      return createOilDerrickArt(FACTIONS[f].colors);
    case 'airfield':
      return createAirfieldArt(f);
    case 'techCenter':
      return createTechCenterArt(f);
    case 'powerPlant':
      return createPowerPlantArt(f);
    case 'radarTower':
      return createRadarTowerArt(f);
    default:
      return undefined;
  }
}

/** Runs `fn` while nation `design`'s team colours read as those of `paint` (art reads FACTIONS[...].colors). */
function withTeamColors<T>(design: FactionId, paint: FactionId, fn: () => T): T {
  const cfg = FACTIONS[design] as { colors: (typeof FACTIONS)[FactionId]['colors'] };
  const own = cfg.colors;
  cfg.colors = FACTIONS[paint].colors;
  try {
    return fn();
  } finally {
    cfg.colors = own;
  }
}

/**
 * Sprite key of a structure drawn in `owner`'s team colours: a captured (or leased) building keeps its design
 * (`kind:design…`) and only its team-coloured parts take the holder's colour (`…%owner`). Plain key when it
 * already matches or the art cannot be recoloured.
 */
export function teamColoredKey(key: string, owner: string): string {
  const design = /^\w+:(\w+)/.exec(key)?.[1];
  if (!isFactionId(design) || !isFactionId(owner) || design === owner || /^bridge:/.test(key)) return key;
  return `${key}%${owner}`;
}

/** Art for a `…%owner` key (see teamColoredKey): the design's art, every team colour in it swapped for `owner`'s. */
export function teamColoredArt(key: string): BuildingArt | undefined {
  const m = /^((\w+):(\w+).*)%(\w+)$/.exec(key);
  if (!m || !isFactionId(m[3]) || !isFactionId(m[4])) return undefined;
  const design = m[3];
  const paint = m[4];
  const base = withTeamColors(design, paint, () => rebuildArt(m[1]!));
  if (!base) return undefined;
  const art: { -readonly [K in keyof BuildingArt]: BuildingArt[K] } = {
    ...base,
    drawStatic: (p) => withTeamColors(design, paint, () => base.drawStatic(p)),
  };
  const anim = base.drawAnimated?.bind(base);
  if (anim) art.drawAnimated = (p, t, a) => withTeamColors(design, paint, () => anim(p, t, a));
  return art;
}

/** The owner of a `…%owner` key (see teamColoredKey), or null. */
export function teamColorOwner(key: string): FactionId | null {
  const o = /%(\w+)$/.exec(key)?.[1];
  return isFactionId(o) ? o : null;
}

/** The key without its `%owner` suffix. */
export function baseKeyOf(key: string): string {
  return key.replace(/%\w+$/, '');
}

/**
 * A taken structure carries no colour of the nation it was taken from: every coloured pixel of the rendered sprite
 * (saturation above a small threshold — grey stone, steel, glass and shadow stay as they are) takes the owner's hue,
 * keeping its lightness, so the architecture reads exactly as before but wholly in the new owner's colours.
 */
export function recolorPixels(data: Uint8ClampedArray, owner: FactionId): void {
  const c = FACTIONS[owner].colors.primary;
  const n = parseInt(c.slice(1), 16);
  const [th, ts] = rgbToHs((n >> 16) & 255, (n >> 8) & 255, n & 255);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 1e-6) continue;
    const sat = d / (1 - Math.abs(2 * l - 1));
    if (sat < 0.16) continue;
    const s2 = Math.min(1, Math.max(sat, ts) * 0.5 + ts * 0.5);
    const q = (1 - Math.abs(2 * l - 1)) * s2;
    const hp = th * 6;
    const x = q * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [q, x, 0] : hp < 2 ? [x, q, 0] : hp < 3 ? [0, q, x] : hp < 4 ? [0, x, q] : hp < 5 ? [x, 0, q] : [q, 0, x];
    const m = l - q / 2;
    data[i] = (r1 + m) * 255;
    data[i + 1] = (g1 + m) * 255;
    data[i + 2] = (b1 + m) * 255;
  }
}

function rgbToHs(r8: number, g8: number, b8: number): [number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return [h, s];
}
