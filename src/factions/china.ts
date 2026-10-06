import type { FactionConfig } from '../types';

/** China — heavy armour and mass production; slower but cheap and tough. */
export const CHINA: FactionConfig = {
  id: 'china',
  name: "People's Republic of China",
  shortName: 'China',
  doctrine: 'Heavy armour and mass: cheap, durable units fielded in overwhelming numbers.',
  colors: { primary: '#e8b10a', light: '#ffe48a', dark: '#6b4b00' },
  stats: { unitSpeed: 0.85, armor: 1.3, firepower: 1.0, range: 0.95, buildSpeed: 1.2, cost: 0.85, trainDelay: 0 },
  capital: {
    name: 'The Forbidden City',
    city: 'Beijing',
    description: 'Imperial heart of the People’s Army, guarded by the Tiananmen gate.',
    maxHp: 6000,
    powerOutput: 200,
  },
  infantry: {
    regular: {
      name: 'PLA',
      description: 'Disciplined Chinese line infantry, cheap and numerous.',
      look: { uniform: '#5b6a3a', trousers: '#47532c', headgear: 'helmet', headColor: '#4e5b31', weapon: 'rifle', camo: true },
    },
    special: {
      name: 'Tiger',
      description: 'Elite marine commandos trained for amphibious assault.',
      look: { uniform: '#5b6a3a', trousers: '#47532c', headgear: 'helmet', headColor: '#4e5b31', weapon: 'rifle', camo: true },
    },
    president: {
      name: 'President',
      description: "President of the People's Republic of China, head of state and symbol of the nation.",
      look: { uniform: '#5b6a5a', trousers: '#3f4b3e', headgear: 'none', headColor: '#000000', weapon: 'none' },
    },
    engineer: {
      name: 'Engineer',
      description: "PLA engineer: repairs buildings and captures enemy structures.",
      look: { uniform: '#6e7a4a', trousers: '#4b5533', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench' },
    },
  },
  vehicles: {
    light: { name: "Dongfeng Scout", description: "Chinese light reconnaissance vehicle." },
    tank: { name: "Type 99", description: "Type 99 main battle tank, produced in large numbers." },
    ifv: { name: "ZBD-04", description: "ZBD-04 armoured fighting vehicle." },
    jet: { name: "J-11", description: "J-11 heavy air superiority fighter." },
    transport: { name: "Y-20", description: "Y-20 heavy transport aircraft: carries soldiers and vehicles; unarmed." },
  },
};
