import type { FactionConfig } from "../types";
import { t } from "../i18n";

/** Islamic — one nation for the whole Islamic world, seated in Saudi Arabia: sits on the richest oil fields, fields tough, cheap forces. */
export const ISLAMIC: FactionConfig = {
  id: "islamic",
  name: "Islamic Union",
  shortName: "Islamic",
  leader: { title: "Custodian of the Two Holy Mosques", name: "King Salman" },
  doctrine:
    t("Oil and endurance: leads the oil cartel — cutting or flooding production moves the world oil price — and the richest oil fields pay for cheap, hardy forces."),
  oilCartel: true,
  // Other nations may lease its derricks (engineer → derrick) for 3 minutes, 30% of the oil money comes back.
  leasesOil: true,
  colors: { primary: "#1f9d4a", light: "#8fe3a8", dark: "#0b4d22" },
  stats: {
    unitSpeed: 1.0,
    armor: 1.05,
    firepower: 1.0,
    range: 1.0,
    buildSpeed: 1.0,
    cost: 0.95,
    trainDelay: 1,
  },
  capital: {
    name: "Al Yamamah Palace",
    city: "Riyadh",
    description:
      t("Al-Yamamah Palace is the official seat of governance in the Islamic Union"),
    maxHp: 16000,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: "Basij",
      description: t("Islamic volunteer riflemen, numerous and determined."),
      look: {
        uniform: "#6b6a4a",
        trousers: "#53523a",
        headgear: "helmet",
        headColor: "#5c5b40",
        weapon: "rifle",
        camo: true,
        sprite: "islamicRegular",
      },
    },
    special: {
      name: "Quds Force",
      description: t("Elite Islamic special operators."),
      look: {
        uniform: "#4f5a3a",
        trousers: "#3d4630",
        headgear: "balaclava",
        headColor: "#1a1a1a",
        weapon: "rifle",
        camo: true,
        sprite: "islamicSpecial",
      },
    },
    engineer: {
      name: "Engineer",
      description:
        t("Islamic combat engineer: repairs buildings and captures enemy structures."),
      look: {
        uniform: "#7c7552",
        trousers: "#4f4a34",
        headgear: "hardhat",
        headColor: "#f2c230",
        weapon: "wrench",
        sprite: "islamicEngineer",
      },
    },
    demolition: {
      name: "Crazy Soldier",
      description:
        t("Demolition expert, like Crazy Ivan: runs up to an enemy structure or unit and plants a timed charge. Small structures are destroyed, large ones lose 40%; a group of 8 or fewer combat units dies, a bigger one loses half. Needs a High-Tech Center."),
      look: {
        uniform: "#4f5a3a",
        trousers: "#3d4630",
        headgear: "helmet",
        headColor: "#2f6b35",
        weapon: "none",
        camo: true,
        sprite: "islamicDemolition",
      },
    },
    squatters: {
      name: "Squatters",
      description:
        t("Islamic flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone."),
      look: {
        uniform: "#4f5a3a",
        trousers: "#3d4630",
        headgear: "balaclava",
        headColor: "#1a1a1a",
        weapon: "rifle",
        camo: true,
        sprite: "islamicSquatters",
      },
    },
  },
  vehicles: {
    light: {
      name: "Safir Jeep",
      description: t("Light jeep with a mounted machine gun."),
    },
    tank: {
      name: "Karrar",
      description:
        t("Karrar main battle tank, heavy armour of the Islamic world."),
    },
    ifv: {
      name: "BMP-2",
      description: t("BMP-2 armoured fighting vehicle for infantry support."),
    },
    heli: { name: "Ka-52", description: t("Ka-52 attack helicopter of the Islamic air force: guided missiles against ground vehicles only. Carries up to 8 soldiers (no vehicles) and sets down anywhere on open ground.") },
    mantis: { name: "Buk-M3", description: t("Buk-M3 (9K317) self-propelled air-defence vehicle: long-range missiles that hit aircraft only (fighters, bombers, helicopters, transports), never ground units or structures. Expensive and slow, armoured like a tank.") },
    jet: {
      name: "Su-35",
      description:
        t("Su-35 multirole air superiority fighter of the Islamic air force."),
    },
    truck: {
      name: "KamAZ",
      description:
        t("KamAZ army truck: unarmed and faster than soldiers or tanks; carries up to 8 soldiers under its canvas cover (no vehicles). Ground only — it cannot cross the sea. Select soldiers or a tank and click the truck to board; select the truck and press U to unload."),
    },
    drone: {
      name: "B-767",
      description: t("B-767 kamikaze drone, built at the Airfield and parked there; cheaper than the fighter. Unarmed: order them onto an enemy structure (never an oil derrick), ground vehicle or soldier (it stays locked as their target; aircraft in the air, such as fighters and helicopters, cannot be targeted) and they fly there, the second 3 cells behind the first, and each dives into it — a structure or vehicle loses 50% of its max health, a soldier dies — and is destroyed. They can fire the turbo like any aircraft. Only fighters and air-defence vehicles can shoot them down."),
    },
    repair: {
      name: "Type 99II",
      description:
        t("Type 99II armoured recovery vehicle: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s)."),
    },
  },
};
