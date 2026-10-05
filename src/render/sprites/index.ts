import { createAirfieldArt } from './Airfield';
import { createBarracksArt } from './Barracks';
import { createHospitalArt } from './Hospital';
import { createRadarArt } from './Radar';
import { createWarFactoryArt } from './WarFactory';
import { BeijingForbiddenCityArt } from './BeijingForbiddenCity';
import { BrusselsEUHeadquartersArt } from './BrusselsEUHeadquarters';
import { ChhgArt } from './Chhg';
import type { BuildingArt } from './BuildingArt';
import { MoscowKremlinArt } from './MoscowKremlin';
import { createOilDerrickArt } from './OilDerrick';
import { WashingtonCapitolArt } from './WashingtonCapitol';
import { WorldBankArt } from './WorldBank';
import { FACTIONS } from '../../factions';

/** Sprite key → artwork. Register new building art here. */
export const BUILDING_ART: Readonly<Record<string, BuildingArt>> = {
  'capital:usa': WashingtonCapitolArt,
  'capital:russia': MoscowKremlinArt,
  'capital:china': BeijingForbiddenCityArt,
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
  'radar:usa': createRadarArt('usa'),
  'radar:russia': createRadarArt('russia'),
  'radar:china': createRadarArt('china'),
  'radar:europe': createRadarArt('europe'),
  'warFactory:usa': createWarFactoryArt('usa'),
  'warFactory:russia': createWarFactoryArt('russia'),
  'warFactory:china': createWarFactoryArt('china'),
  'warFactory:europe': createWarFactoryArt('europe'),
  'airfield:usa': createAirfieldArt('usa'),
  'airfield:russia': createAirfieldArt('russia'),
  'airfield:china': createAirfieldArt('china'),
  'airfield:europe': createAirfieldArt('europe'),
};

export type { BuildingArt } from './BuildingArt';
