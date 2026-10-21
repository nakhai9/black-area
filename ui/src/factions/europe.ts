import type { FactionConfig } from '../types';
import { t } from "../i18n";

/** European Union — economic powerhouse and coalition defence. */
export const EUROPE: FactionConfig = {
  id: 'europe',
  name: 'European Union',
  shortName: 'Europe',
  leader: { title: 'Commission President', name: 'Ursula von der Leyen' },
  doctrine: t('Economic power and coalition: strong income, advanced air defence and balanced forces.'),
  colors: { primary: '#6532d6', light: '#a487ec', dark: '#28155e' },
  stats: { unitSpeed: 1.05, armor: 1.0, firepower: 1.05, range: 1.1, buildSpeed: 1.05, cost: 1.25, trainDelay: 2 },
  capital: {
    name: 'EU Headquarters',
    city: 'Paris',
    description: t('Unified command of the European Union, flanked by the flags of its member states.'),
    maxHp: 15600,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: 'Eurocorps',
      description: t('Combined European infantry with modern kit.'),
      look: { uniform: '#5e6c78', trousers: '#4a5661', headgear: 'helmet', headColor: '#515d68', weapon: 'rifle', camo: true, sprite: 'euRegular' },
    },
    special: {
      name: 'EU Spec',
      description: t('European special operators — long-range precision marksmen.'),
      look: { uniform: '#5e6c78', trousers: '#4a5661', headgear: 'reverseCap', headColor: '#3f4a54', weapon: 'rifle', camo: true, sprite: 'euSpecial' },
    },
    engineer: {
      name: 'Engineer',
      description: t("EU engineer: repairs buildings and captures enemy structures."),
      look: { uniform: '#6a6a50', trousers: '#4a4a38', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench', sprite: 'euEngineer' },
    },
    squatters: {
      name: 'Squatters',
      description: t("EU flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone."),
      look: { uniform: '#5e6c78', trousers: '#4a5661', headgear: 'reverseCap', headColor: '#3f4a54', weapon: 'rifle', camo: true, sprite: 'euSquatters' },
    },
  },
  vehicles: {
    carrier: { name: "HMS Queen Elizabeth (R08)", description: t("Queen Elizabeth-class aircraft carrier: sails the open sea only. Carries up to 4 fighters on its deck (right-click it with fighters selected); they sink with it.") },
    light: { name: "VBL Scout", description: t("Light armoured European reconnaissance vehicle.") },
    tank: { name: "Leopard 2", description: t("Leopard 2 main battle tank, precise and well protected.") },
    ifv: { name: "Puma", description: t("Puma armoured fighting vehicle, modern and fast.") },
    heli: { name: "AH-64 Apache", description: t("AH-64 Apache attack helicopter: anti-tank missiles against ground vehicles only. Carries up to 8 soldiers (no vehicles) and sets down anywhere on open ground.") },
    mantis: { name: "NOMADS", description: t("NOMADS self-propelled air-defence vehicle: long-range missiles that hit aircraft only (fighters, bombers, helicopters, transports), never ground units or structures. Expensive and slow, armoured like a tank.") },
    jet: { name: "Rafale", description: t("Dassault Rafale multirole fighter.") },
    transport: { name: "C-130", description: t("C-130 transport aircraft: carries soldiers and vehicles; unarmed.") },
    truck: {
      name: "Zetros",
      description:
        t("Mercedes-Benz Zetros army truck: unarmed and faster than soldiers or tanks; carries up to 8 soldiers under its canvas cover (no vehicles). Ground only — it cannot cross the sea. Select soldiers or a tank and click the truck to board; select the truck and press U to unload."),
    },
    repair: {
      name: "M88",
      description:
        t("M88 armoured recovery vehicle: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s)."),
    },
    bridgeLayer: {
      name: "Leguan",
      description:
        t("Armoured bridge layer: slow and unarmed. Select it, press the Bridge button (B) and click a spot across a river or shallow water: it drives there and unfolds into a 2 × 3 bridge that soldiers and vehicles can cross (used once). Bridges laid end to end join into one long bridge. Enemies can destroy the vehicle and the bridge."),
    },
  },
};
