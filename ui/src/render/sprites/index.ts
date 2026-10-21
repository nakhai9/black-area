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
import { createGrandMosqueArt } from './GrandMosque';
import { createWashingtonWhiteHouseArt } from './WashingtonWhiteHouse';
import { WorldBankArt } from './WorldBank';
import { PyramidsArt } from './Pyramids';
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
  // Capitals of the contested independent nations (neutral until an engineer takes one).
  'nation:northKorea': createNationCapitalArt('northKorea'),
  'nation:southKorea': createNationCapitalArt('southKorea'),
  'nation:japan': createNationCapitalArt('japan'),
  'nation:australia': createNationCapitalArt('australia'),
  'nation:brazil': createNationCapitalArt('brazil'),
  'nation:unitedKingdom': createNationCapitalArt('unitedKingdom'),
  'nation:canada': createNationCapitalArt('canada'),
  'nation:cuba': createNationCapitalArt('cuba'),
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
      Array.from({ length: 4 * BRIDGE_DAMAGE_LEVELS }, (_, i) => [`bridge:${f}|${i % 4}~${Math.floor(i / 4)}`, createBridgeArt(f, i % 4, Math.floor(i / 4))] as const),
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
