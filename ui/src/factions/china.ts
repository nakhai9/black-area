import type { FactionConfig } from "../types";
import { t } from "../i18n";

/** China — heavy armour and mass production; cheap and tough, with cheap, fast and nimble infantry (it has no heavy bomber). */
export const CHINA: FactionConfig = {
  id: "china",
  name: "China",
  shortName: "China",
  leader: { title: "President", name: "Xi Jinping" },
  doctrine:
    t("Heavy armour and mass: cheap, durable units fielded in overwhelming numbers."),
  colors: { primary: "#e8b10a", light: "#ffe48a", dark: "#6b4b00" },
  stats: {
    unitSpeed: 0.85,
    armor: 1.3,
    firepower: 1.0,
    range: 0.95,
    buildSpeed: 1.2,
    cost: 0.85,
    trainDelay: 0,
    // No heavy bomber (Tu-160 / B-1A Lancer): China's edge is its foot soldiers — cheap, quick and nimble.
    infantryCost: 0.7,
    infantrySpeed: 1.35,
  },
  capital: {
    name: "Zhongnanhai",
    city: "Beijing",
    description:
      t("Leadership compound of the People’s Republic, behind the Xinhuamen gate."),
    maxHp: 18000,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: "PLA",
      description: t("Disciplined Chinese line infantry, cheap and numerous."),
      look: {
        uniform: "#5b6a3a",
        trousers: "#47532c",
        headgear: "helmet",
        headColor: "#4e5b31",
        weapon: "rifle",
        camo: true,
        sprite: "cnRegular",
      },
    },
    special: {
      name: "Tiger",
      description: t("Elite marine commandos trained for amphibious assault."),
      look: {
        uniform: "#5b6a3a",
        trousers: "#47532c",
        headgear: "helmet",
        headColor: "#4e5b31",
        weapon: "rifle",
        camo: true,
        sprite: "cnSpecial",
      },
    },
    engineer: {
      name: "Engineer",
      description:
        t("PLA engineer: repairs buildings and captures enemy structures."),
      look: {
        uniform: "#6e7a4a",
        trousers: "#4b5533",
        headgear: "hardhat",
        headColor: "#f2c230",
        weapon: "wrench",
        sprite: "cnEngineer",
      },
    },
    squatters: {
      name: "Squatters",
      description:
        t("PLA flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone."),
      look: {
        uniform: "#5b6a3a",
        trousers: "#47532c",
        headgear: "helmet",
        headColor: "#4e5b31",
        weapon: "rifle",
        camo: true,
        sprite: "cnSquatters",
      },
    },
  },
  vehicles: {
    carrier: { name: "Type 004", description: t("Type 004 nuclear aircraft carrier: sails the open sea only. Can carry 4 fighters on its deck (coming later); for now it can only move.") },
    light: {
      name: "Dongfeng Scout",
      description: t("Chinese light reconnaissance vehicle."),
    },
    tank: {
      name: "Type 99",
      description: t("Type 99 main battle tank, produced in large numbers."),
    },
    ifv: { name: "ZBD-04", description: t("ZBD-04 armoured fighting vehicle.") },
    heli: { name: "Z-10", description: t("Changhe Z-10 attack helicopter: guided missiles against ground vehicles only. Carries up to 8 soldiers (no vehicles) and sets down anywhere on open ground.") },
    mantis: { name: "Buk-M3", description: t("Buk-M3 (9K317) self-propelled air-defence vehicle: long-range missiles that hit aircraft only (fighters, bombers, helicopters, transports), never ground units or structures. Expensive and slow, armoured like a tank.") },
    jet: { name: "J-31", description: t("Shenyang J-31 Gyrfalcon stealth multirole fighter.") },
    transport: {
      name: "Y-20",
      description:
        t("Y-20 heavy transport aircraft: carries soldiers and vehicles; unarmed."),
    },
    truck: {
      name: "KamAZ",
      description:
        t("KamAZ army truck: unarmed and faster than soldiers or tanks; carries up to 8 soldiers under its canvas cover (no vehicles). Ground only — it cannot cross the sea. Select soldiers or a tank and click the truck to board; select the truck and press U to unload."),
    },
    repair: {
      name: "Type 99II",
      description:
        t("Type 99II armoured recovery vehicle: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s)."),
    },
  },
};
