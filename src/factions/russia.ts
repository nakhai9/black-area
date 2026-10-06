import type { FactionConfig } from '../types';

/** Russia — long-range artillery and hardened defences. */
export const RUSSIA: FactionConfig = {
  id: 'russia',
  name: 'Russian Federation',
  shortName: 'Russia',
  doctrine: 'Artillery and defence: long-range firepower behind fortified lines.',
  colors: { primary: '#d22b2b', light: '#ff9c9c', dark: '#5e0e0e' },
  stats: { unitSpeed: 0.95, armor: 1.1, firepower: 1.2, range: 1.3, buildSpeed: 0.95, cost: 1.0, trainDelay: 0 },
  capital: {
    name: 'The Kremlin',
    city: 'Moscow',
    description: 'Fortress of the Russian high command behind crenellated red walls.',
    maxHp: 5500,
    powerOutput: 200,
  },
  infantry: {
    regular: {
      name: 'Red Army',
      description: 'Massed Russian conscript riflemen, tough in the cold.',
      look: { uniform: '#8a8466', trousers: '#5c5a48', headgear: 'ushanka', headColor: '#6e6a60', weapon: 'rifle' },
    },
    special: {
      name: 'Spetsnaz',
      description: 'Special-purpose commandos for sabotage and raids.',
      look: { uniform: '#3a3f44', trousers: '#2c3034', headgear: 'balaclava', headColor: '#1f2226', weapon: 'smg' },
    },
    president: {
      name: 'President',
      description: "President of the Russian Federation, head of state and symbol of the nation.",
      look: { uniform: '#2b2b30', trousers: '#1f1f23', headgear: 'none', headColor: '#000000', weapon: 'none' },
    },
    engineer: {
      name: 'Engineer',
      description: "Russian sapper: repairs buildings and captures enemy structures.",
      look: { uniform: '#7c7552', trousers: '#4f4a34', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench' },
    },
  },
  vehicles: {
    light: { name: "UAZ Patrol", description: "Russian light patrol vehicle, cheap and quick." },
    tank: { name: "T-90", description: "T-90 main battle tank, tough and long-ranged." },
    ifv: { name: "BMP-3", description: "BMP-3 armoured fighting vehicle with a heavy autocannon." },
    jet: { name: "Su-27", description: "Su-27 long-range air superiority fighter." },
    transport: { name: "Il-76", description: "Il-76 military transport aircraft: carries soldiers and vehicles; unarmed." },
  },
};
