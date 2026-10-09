import type { FactionConfig } from "../types";

/** China — heavy armour and mass production; slower but cheap and tough. */
export const CHINA: FactionConfig = {
  id: "china",
  name: "China",
  shortName: "China",
  leader: { title: "President", name: "Xi Jinping" },
  doctrine:
    "Heavy armour and mass: cheap, durable units fielded in overwhelming numbers.",
  colors: { primary: "#e8b10a", light: "#ffe48a", dark: "#6b4b00" },
  stats: {
    unitSpeed: 0.85,
    armor: 1.3,
    firepower: 1.0,
    range: 0.95,
    buildSpeed: 1.2,
    cost: 0.85,
    trainDelay: 0,
  },
  capital: {
    name: "Zhongnanhai",
    city: "Beijing",
    description:
      "Leadership compound of the People’s Republic, behind the Xinhuamen gate.",
    maxHp: 18000,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: "PLA",
      description: "Disciplined Chinese line infantry, cheap and numerous.",
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
      description: "Elite marine commandos trained for amphibious assault.",
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
        "PLA engineer: repairs buildings and captures enemy structures.",
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
        "PLA flag bearer and rifleman escort, moving as one: flown by transport to unclaimed land, they plant the national flag there (F key) — their mission done, they are gone.",
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
    light: {
      name: "Dongfeng Scout",
      description: "Chinese light reconnaissance vehicle.",
    },
    tank: {
      name: "Type 99",
      description: "Type 99 main battle tank, produced in large numbers.",
    },
    ifv: { name: "ZBD-04", description: "ZBD-04 armoured fighting vehicle." },
    jet: { name: "J-15", description: "J-15 carrier-based multirole fighter." },
    transport: {
      name: "Y-20",
      description:
        "Y-20 heavy transport aircraft: carries soldiers and vehicles; unarmed.",
    },
    repair: {
      name: "Type 90 II",
      description:
        "Type 90 II armoured recovery vehicle: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s).",
    },
    tanker: {
      name: "YY-20",
      description:
        "YY-20 aerial tanker: flies escort behind its Y-20 and keeps it fuelled; unarmed.",
    },
  },
};
