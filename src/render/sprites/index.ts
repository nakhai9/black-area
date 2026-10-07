import { createAirfieldArt } from './Airfield';
import { createBarracksArt } from './Barracks';
import { createFlagpoleArt } from './Flagpole';
import { createHappyCityArt } from './HappyCity';
import { createHospitalArt } from './Hospital';
import { createTechCenterArt } from './TechCenter';
import { createWarFactoryArt } from './WarFactory';
import { BeijingZhongnanhaiArt } from './BeijingZhongnanhai';
import { BrusselsEUHeadquartersArt } from './BrusselsEUHeadquarters';
import { ChhgArt } from './Chhg';
import type { BuildingArt } from './BuildingArt';
import { MoscowKremlinArt } from './MoscowKremlin';
import { createOilDerrickArt } from './OilDerrick';
import { createPowerPlantArt } from './PowerPlant';
import { WashingtonWhiteHouseArt } from './WashingtonWhiteHouse';
import { WorldBankArt } from './WorldBank';
import { FACTIONS } from '../../factions';

/** Sprite key → artwork. Register new building art here. */
export const BUILDING_ART: Readonly<Record<string, BuildingArt>> = {
  'capital:usa': WashingtonWhiteHouseArt,
  'capital:russia': MoscowKremlinArt,
  'capital:china': BeijingZhongnanhaiArt,
  'capital:europe': BrusselsEUHeadquartersArt,
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
};

export type { BuildingArt } from './BuildingArt';
