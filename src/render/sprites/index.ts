import { createAirfieldArt } from './Airfield';
import { createAlliedBuildingArt } from './AlliedBuilding';
import { createBarracksArt } from './Barracks';
import { createFlagpoleArt } from './Flagpole';
import { createHappyCityArt } from './HappyCity';
import { createHospitalArt } from './Hospital';
import { createTechCenterArt } from './TechCenter';
import { createWarFactoryArt } from './WarFactory';
import { createBeijingZhongnanhaiArt } from './BeijingZhongnanhai';
import { createBrusselsEUHeadquartersArt } from './BrusselsEUHeadquarters';
import { ChhgArt } from './Chhg';
import type { BuildingArt } from './BuildingArt';
import { createMoscowKremlinArt } from './MoscowKremlin';
import { createOilDerrickArt } from './OilDerrick';
import { createPowerPlantArt } from './PowerPlant';
import { createWashingtonWhiteHouseArt } from './WashingtonWhiteHouse';
import { WorldBankArt } from './WorldBank';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';

/** Sprite key → artwork. Register new building art here. */
export const BUILDING_ART: Readonly<Record<string, BuildingArt>> = {
  'capital:usa': createWashingtonWhiteHouseArt(),
  'capital:russia': createMoscowKremlinArt(),
  'capital:china': createBeijingZhongnanhaiArt(),
  'capital:europe': createBrusselsEUHeadquartersArt(),
  'bank:world': WorldBankArt,
  'chhg:world': ChhgArt,
  // Oil derricks in each nation's team colour.
  'oil:usa': createOilDerrickArt(FACTIONS.usa.colors),
  'oil:russia': createOilDerrickArt(FACTIONS.russia.colors),
  'oil:china': createOilDerrickArt(FACTIONS.china.colors),
  'oil:europe': createOilDerrickArt(FACTIONS.europe.colors),
  // Barracks in each nation's team colour.
  'barracks:usa': createBarracksArt('usa'),
  'barracks:russia': createBarracksArt('russia'),
  'barracks:china': createBarracksArt('china'),
  'barracks:europe': createBarracksArt('europe'),
  // Hospital and airfield in each nation's team colour.
  'hospital:usa': createHospitalArt('usa'),
  'hospital:russia': createHospitalArt('russia'),
  'hospital:china': createHospitalArt('china'),
  'hospital:europe': createHospitalArt('europe'),
  'warFactory:usa': createWarFactoryArt('usa'),
  'warFactory:russia': createWarFactoryArt('russia'),
  'warFactory:china': createWarFactoryArt('china'),
  'warFactory:europe': createWarFactoryArt('europe'),
  'airfield:usa': createAirfieldArt('usa'),
  'airfield:russia': createAirfieldArt('russia'),
  'airfield:china': createAirfieldArt('china'),
  'airfield:europe': createAirfieldArt('europe'),
  // The high-rise High-Tech Center in each nation's team colour.
  'techCenter:usa': createTechCenterArt('usa'),
  'techCenter:russia': createTechCenterArt('russia'),
  'techCenter:china': createTechCenterArt('china'),
  'techCenter:europe': createTechCenterArt('europe'),
  // Nuclear power plant in each nation's team colour.
  'powerPlant:usa': createPowerPlantArt('usa'),
  'powerPlant:russia': createPowerPlantArt('russia'),
  'powerPlant:china': createPowerPlantArt('china'),
  'powerPlant:europe': createPowerPlantArt('europe'),
  // Happy City in each nation's own architecture.
  'happyCity:usa': createHappyCityArt('usa'),
  'happyCity:russia': createHappyCityArt('russia'),
  'happyCity:china': createHappyCityArt('china'),
  'happyCity:europe': createHappyCityArt('europe'),
  // National flagpoles (one cell).
  'flagpole:usa': createFlagpoleArt('usa'),
  'flagpole:russia': createFlagpoleArt('russia'),
  'flagpole:china': createFlagpoleArt('china'),
  'flagpole:europe': createFlagpoleArt('europe'),
  // Allied Building in the architecture of the nation the ally follows.
  'alliedBuilding:usa': createAlliedBuildingArt('usa'),
  'alliedBuilding:russia': createAlliedBuildingArt('russia'),
  'alliedBuilding:china': createAlliedBuildingArt('china'),
  'alliedBuilding:europe': createAlliedBuildingArt('europe'),
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
          : createBrusselsEUHeadquartersArt)(flag),
  alliedBuilding: (design, flag) => createAlliedBuildingArt(design, flag),
};

/** Art for a `kind:design@flag` sprite key, or undefined when the key is not one. */
export function flagVariantArt(key: string): BuildingArt | undefined {
  const m = /^(\w+):(\w+)@(\w+)$/.exec(key);
  const make = m ? FLAG_VARIANTS[m[1]!] : undefined;
  return m && make ? make(m[2] as FactionId, m[3] as FactionId) : undefined;
}

export type { BuildingArt } from './BuildingArt';
