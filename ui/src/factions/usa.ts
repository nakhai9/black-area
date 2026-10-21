import type { FactionConfig } from '../types';
import { t } from "../i18n";

/** United States — high-tech, fast and precise; slightly pricier units. */
export const USA: FactionConfig = {
  id: 'usa',
  name: 'United States',
  shortName: 'USA',
  leader: { title: 'President', name: 'Donald Trump' },
  doctrine: t('High-tech mobility: fast units, air superiority and precision strikes.'),
  colors: { primary: '#2f6fe0', light: '#9cc0ff', dark: '#14306b' },
  stats: { unitSpeed: 1.25, armor: 0.9, firepower: 1.0, range: 1.05, buildSpeed: 1.1, cost: 1.3, trainDelay: 2 },
  capital: {
    name: 'The White House',
    city: 'Washington, D.C.',
    description: t('Seat of Allied command. Losing it collapses the U.S. war effort.'),
    maxHp: 15000,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: 'GI',
      description: t('Versatile U.S. rifleman — the backbone of the Allied army.'),
      look: { uniform: '#7d8083', trousers: '#5f6265', headgear: 'helmet', headColor: '#62666a', weapon: 'rifle', camo: true, sprite: 'usRegular' },
    },
    special: {
      name: 'Ranger',
      description: t('Elite light infantry: fast, accurate and deadly at close range.'),
      look: { uniform: '#7d8083', trousers: '#5f6265', headgear: 'boonie', headColor: '#6e7275', weapon: 'rifle', camo: true, sprite: 'usSpecial' },
    },
    engineer: {
      name: 'Engineer',
      description: t("U.S. Army engineer: repairs buildings and captures enemy structures."),
      look: { uniform: '#8a7a55', trousers: '#5a5038', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench', sprite: 'usEngineer' },
    },
    squatters: {
      name: 'Squatters',
      description: t("U.S. flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone."),
      look: { uniform: '#7d8083', trousers: '#5f6265', headgear: 'boonie', headColor: '#6e7275', weapon: 'rifle', camo: true, sprite: 'usSquatters' },
    },
  },
  vehicles: {
    light: { name: "Humvee", description: t("Fast U.S. light scout car with a mounted machine gun.") },
    tank: { name: "Abrams", description: t("M1 Abrams main battle tank: heavy armour and a powerful gun.") },
    ifv: { name: "Bradley", description: t("M2 Bradley armoured fighting vehicle for infantry support.") },
    heli: { name: "AH-64 Apache", description: t("AH-64 Apache attack helicopter: anti-tank missiles against ground vehicles only. Carries up to 8 soldiers (no vehicles) and sets down anywhere on open ground.") },
    mantis: { name: "NOMADS", description: t("NOMADS self-propelled air-defence vehicle: long-range missiles that hit aircraft only (fighters, bombers, helicopters, transports), never ground units or structures. Expensive and slow, armoured like a tank.") },
    jet: { name: "F-22", description: t("F-22 Raptor stealth air superiority fighter.") },
    transport: { name: "C-17", description: t("Heavy transport aircraft: carries soldiers and vehicles; unarmed.") },
    bomber: { name: "B-1A Lancer", description: t("B-1A Lancer supersonic long-range bomber, USA only: heavy bombs that flatten ground forces and structures; cannot hit aircraft.") },
    truck: {
      name: "MTVR",
      description:
        t("Oshkosh MTVR army truck: unarmed and faster than soldiers or tanks; carries up to 8 soldiers under its canvas cover (no vehicles). Ground only — it cannot cross the sea. Select soldiers or a tank and click the truck to board; select the truck and press U to unload."),
    },
    carrier: { name: "USS Enterprise (CVN-80)", description: t("Gerald R. Ford-class nuclear aircraft carrier: sails the open sea only. Carries up to 4 fighters on its deck (right-click it with fighters selected); they sink with it.") },
    repair: {
      name: "M88",
      description:
        t("M88 armoured recovery vehicle: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s)."),
    },
    bridgeLayer: {
      name: "M104 Wolverine",
      description:
        t("Armoured bridge layer: slow and unarmed. Select it, press the Bridge button (B) and click a spot across a river or shallow water: it drives there and unfolds into a 2 × 3 bridge that soldiers and vehicles can cross (used once). Bridges laid end to end join into one long bridge. Enemies can destroy the vehicle and the bridge."),
    },
  },
};
