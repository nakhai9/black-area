import type { FactionConfig } from "../types";

/** Russia — long-range artillery and hardened defences. */
export const RUSSIA: FactionConfig = {
  id: "russia",
  name: "Russia",
  shortName: "Russia",
  leader: { title: "President", name: "Vladimir Putin" },
  doctrine:
    "Artillery and defence: long-range firepower behind fortified lines.",
  colors: { primary: "#d22b2b", light: "#ff9c9c", dark: "#5e0e0e" },
  stats: {
    unitSpeed: 0.95,
    armor: 1.1,
    firepower: 1.2,
    range: 1.3,
    buildSpeed: 0.95,
    cost: 1.0,
    trainDelay: 0,
  },
  capital: {
    name: "The Kremlin",
    city: "Moscow",
    description:
      "Fortress of the Russian high command behind crenellated red walls.",
    maxHp: 16500,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: "Red Army",
      description: "Massed Russian conscript riflemen, tough in the cold.",
      look: {
        uniform: "#5f6b34",
        trousers: "#4a5428",
        headgear: "ushanka",
        headColor: "#56602f",
        weapon: "rifle",
        sprite: "ruRegular",
      },
    },
    special: {
      name: "Spetsnaz",
      description: "Special-purpose commandos for sabotage and raids.",
      look: {
        uniform: "#2b3a32",
        trousers: "#212d27",
        headgear: "balaclava",
        headColor: "#121212",
        weapon: "rifle",
        camo: true,
        sprite: "ruSpecial",
      },
    },
    engineer: {
      name: "Engineer",
      description:
        "Russian sapper: repairs buildings and captures enemy structures.",
      look: {
        uniform: "#7c7552",
        trousers: "#4f4a34",
        headgear: "hardhat",
        headColor: "#f2c230",
        weapon: "wrench",
        sprite: "ruEngineer",
      },
    },
    squatters: {
      name: "Squatters",
      description:
        "Russian flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone.",
      look: {
        uniform: "#2b3a32",
        trousers: "#212d27",
        headgear: "balaclava",
        headColor: "#121212",
        weapon: "rifle",
        camo: true,
        sprite: "ruSquatters",
      },
    },
  },
  vehicles: {
    light: {
      name: "UAZ Patrol",
      description: "Russian light patrol vehicle, cheap and quick.",
    },
    tank: {
      name: "T-90",
      description: "T-90 main battle tank, tough and long-ranged.",
    },
    ifv: {
      name: "BMP-3",
      description: "BMP-3 armoured fighting vehicle with a heavy autocannon.",
    },
    jet: {
      name: "Su-57",
      description: "Su-57 stealth air superiority fighter.",
    },
    transport: {
      name: "Il-76",
      description:
        "Il-76 military transport aircraft: carries soldiers and vehicles; unarmed.",
    },
    bomber: {
      name: "Tu-16",
      description:
        "Tu-16 strategic bomber, Russia only: heavy bombs that flatten ground forces and structures; cannot hit aircraft.",
    },
    truck: {
      name: "KamAZ",
      description:
        "KamAZ army truck: unarmed and faster than soldiers or tanks; carries up to 8 soldiers under its canvas cover, or one tank on its flatbed (never both). Ground only — it cannot cross the sea. Select soldiers or a tank and click the truck to board; select the truck and press U to unload.",
    },
    repair: {
      name: "BREM-1",
      description:
        "BREM-1 armoured recovery vehicle, Russia only: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s).",
    },
    tanker: {
      name: "Il-78",
      description:
        "Il-78 aerial tanker: flies escort behind its Il-76 and keeps it fuelled; unarmed.",
    },
  },
};
