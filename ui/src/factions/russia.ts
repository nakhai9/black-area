import type { FactionConfig } from "../types";
import { t } from "../i18n";

/** Russia — long-range artillery and hardened defences. */
export const RUSSIA: FactionConfig = {
  id: "russia",
  name: "Russia",
  shortName: "Russia",
  leader: { title: "President", name: "Vladimir Putin" },
  doctrine:
    t("Artillery and defence: long-range firepower behind fortified lines."),
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
      t("Fortress of the Russian high command behind crenellated red walls."),
    maxHp: 16500,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: "Red Army",
      description: t("Massed Russian conscript riflemen, tough in the cold."),
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
      description: t("Special-purpose commandos for sabotage and raids."),
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
        t("Russian sapper: repairs buildings and captures enemy structures."),
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
        t("Russian flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone."),
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
      description: t("Russian light patrol vehicle, cheap and quick."),
    },
    tank: {
      name: "T-90",
      description: t("T-90 main battle tank, tough and long-ranged."),
    },
    ifv: {
      name: "BMP-3",
      description: t("BMP-3 armoured fighting vehicle with a heavy autocannon."),
    },
    heli: { name: "Ka-52", description: t("Ka-52 Alligator attack helicopter: coaxial rotors and guided missiles against ground vehicles only. Carries up to 8 soldiers (no vehicles) and sets down anywhere on open ground.") },
    mantis: { name: "Buk-M3", description: t("Buk-M3 (9K317) self-propelled air-defence vehicle: long-range missiles that hit aircraft only (fighters, bombers, helicopters, transports), never ground units or structures. Expensive and slow, armoured like a tank.") },
    jet: {
      name: "Su-57",
      description: t("Su-57 stealth air superiority fighter."),
    },
    transport: {
      name: "Il-76",
      description:
        t("Il-76 military transport aircraft: carries soldiers and vehicles; unarmed."),
    },
    bomber: {
      name: "Tu-160",
      description:
        t("Tu-160 supersonic strategic bomber, Russia only: heavy bombs that flatten ground forces and structures; cannot hit aircraft."),
    },
    truck: {
      name: "KamAZ",
      description:
        t("KamAZ-5330 army truck: unarmed and faster than soldiers or tanks; carries up to 8 soldiers under its canvas cover (no vehicles). Ground only — it cannot cross the sea. Select soldiers or a tank and click the truck to board; select the truck and press U to unload."),
    },
    repair: {
      name: "BREM-1",
      description:
        t("BREM-1 armoured recovery vehicle, Russia only: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s)."),
    },
    bridgeLayer: {
      name: "MTU-72",
      description:
        t("Armoured bridge layer: slow and unarmed. Drive it to the edge of a river or shallow water, facing the water, select it and press the Bridge button (B): it unfolds right where it stands into a 2 × 3 bridge that soldiers and vehicles can cross (used once). Bridges laid end to end join into one long bridge (3 sections at most). Enemies can destroy the vehicle and the bridge."),
    },
  },
};
