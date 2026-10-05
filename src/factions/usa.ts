import type { FactionConfig } from '../types';

/** United States — high-tech, fast and precise; slightly pricier units. */
export const USA: FactionConfig = {
  id: 'usa',
  name: 'United States',
  shortName: 'USA',
  doctrine: 'High-tech mobility: fast units, air superiority and precision strikes.',
  colors: { primary: '#2f6fe0', light: '#9cc0ff', dark: '#14306b' },
  stats: { unitSpeed: 1.25, armor: 0.9, firepower: 1.0, range: 1.05, buildSpeed: 1.1, cost: 1.3, trainDelay: 2 },
  capital: {
    name: 'The Capitol',
    city: 'Washington, D.C.',
    description: 'Seat of Allied command. Losing it collapses the U.S. war effort.',
    maxHp: 5000,
    powerOutput: 200,
  },
  infantry: {
    regular: {
      name: 'GI',
      description: 'Versatile U.S. rifleman — the backbone of the Allied army.',
      look: { uniform: '#6b7046', trousers: '#4f5236', headgear: 'helmet', headColor: '#5a5f3a', weapon: 'rifle' },
    },
    special: {
      name: 'Ranger',
      description: 'Elite light infantry: fast, accurate and deadly at close range.',
      look: { uniform: '#3d4a3a', trousers: '#2f382d', headgear: 'boonie', headColor: '#7a7350', weapon: 'smg' },
    },
    president: {
      name: 'President',
      description: "President of the United States, head of state and symbol of the nation.",
      look: { uniform: '#1c2748', trousers: '#141c36', headgear: 'none', headColor: '#000000', weapon: 'none' },
    },
    engineer: {
      name: 'Engineer',
      description: "U.S. Army engineer: repairs buildings and captures enemy structures.",
      look: { uniform: '#8a7a55', trousers: '#5a5038', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench' },
    },
  },
  vehicles: {
    light: { name: "Humvee", description: "Fast U.S. light scout car with a mounted machine gun." },
    tank: { name: "Abrams", description: "M1 Abrams main battle tank: heavy armour and a powerful gun." },
    ifv: { name: "Bradley", description: "M2 Bradley armoured fighting vehicle for infantry support." },
    jet: { name: "F-16 Falcon", description: "Agile multirole fighter aircraft." },
  },
};
