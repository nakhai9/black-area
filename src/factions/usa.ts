import type { FactionConfig } from '../types';

/** United States — high-tech, fast and precise; slightly pricier units. */
export const USA: FactionConfig = {
  id: 'usa',
  name: 'United States',
  shortName: 'USA',
  leader: { title: 'President', name: 'Donald Trump' },
  doctrine: 'High-tech mobility: fast units, air superiority and precision strikes.',
  colors: { primary: '#2f6fe0', light: '#9cc0ff', dark: '#14306b' },
  stats: { unitSpeed: 1.25, armor: 0.9, firepower: 1.0, range: 1.05, buildSpeed: 1.1, cost: 1.3, trainDelay: 2 },
  capital: {
    name: 'The White House',
    city: 'Washington, D.C.',
    description: 'Seat of Allied command. Losing it collapses the U.S. war effort.',
    maxHp: 15000,
    powerOutput: 0,
  },
  infantry: {
    regular: {
      name: 'GI',
      description: 'Versatile U.S. rifleman — the backbone of the Allied army.',
      look: { uniform: '#7d8083', trousers: '#5f6265', headgear: 'helmet', headColor: '#62666a', weapon: 'rifle', camo: true, sprite: 'usRegular' },
    },
    special: {
      name: 'Ranger',
      description: 'Elite light infantry: fast, accurate and deadly at close range.',
      look: { uniform: '#7d8083', trousers: '#5f6265', headgear: 'boonie', headColor: '#6e7275', weapon: 'rifle', camo: true, sprite: 'usSpecial' },
    },
    engineer: {
      name: 'Engineer',
      description: "U.S. Army engineer: repairs buildings and captures enemy structures.",
      look: { uniform: '#8a7a55', trousers: '#5a5038', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench', sprite: 'usEngineer' },
    },
    squatters: {
      name: 'Squatters',
      description: "U.S. flag bearer and rifleman escort, moving as one: sent on foot or by transport to unclaimed land, they plant the national flag there (double-click the team once it stands still) — their mission done, they are gone.",
      look: { uniform: '#7d8083', trousers: '#5f6265', headgear: 'boonie', headColor: '#6e7275', weapon: 'rifle', camo: true, sprite: 'usSquatters' },
    },
  },
  vehicles: {
    light: { name: "Humvee", description: "Fast U.S. light scout car with a mounted machine gun." },
    tank: { name: "Abrams", description: "M1 Abrams main battle tank: heavy armour and a powerful gun." },
    ifv: { name: "Bradley", description: "M2 Bradley armoured fighting vehicle for infantry support." },
    jet: { name: "F-22", description: "F-22 Raptor stealth air superiority fighter." },
    helicopter: { name: "AH-64 Apache", description: "AH-64 Apache attack helicopter of the U.S. Army aviation: slower than a fighter; fires missiles at ground units, aircraft and structures; carries up to 8 soldiers (no vehicles). Built at the War Factory, it takes off and sets down anywhere on solid ground." },
    transport: { name: "C-17", description: "Heavy transport aircraft: carries soldiers and vehicles; unarmed." },
    bomber: { name: "B-52", description: "B-52 Stratofortress long-range heavy bomber, USA only: heavy bombs that flatten ground forces and structures; cannot hit aircraft." },
    repair: {
      name: "M88",
      description:
        "M88 armoured recovery vehicle: slow and unarmed; click a damaged friendly ground vehicle to drive up and repair it, or select damaged vehicles and click it to send them in for repair (5% of its max health every 2 s).",
    },
    tanker: { name: "KC-46", description: "KC-46 Pegasus aerial tanker: flies escort behind its C-17 and keeps it fuelled; unarmed." },
  },
};
