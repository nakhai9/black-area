import type { FactionConfig } from '../types';

/** European Union — economic powerhouse and coalition defence. */
export const EUROPE: FactionConfig = {
  id: 'europe',
  name: 'European Union',
  shortName: 'Europe',
  doctrine: 'Economic power and coalition: strong income, advanced air defence and balanced forces.',
  colors: { primary: '#8a5cf6', light: '#c9b5ff', dark: '#3b237a' },
  stats: { unitSpeed: 1.05, armor: 1.0, firepower: 1.05, range: 1.1, buildSpeed: 1.05, cost: 1.25, trainDelay: 2 },
  capital: {
    name: 'EU Headquarters',
    city: 'Brussels',
    description: 'Unified command of the European Union, flanked by the flags of its member states.',
    maxHp: 5200,
    powerOutput: 200,
  },
  infantry: {
    regular: {
      name: 'Eurocorps',
      description: 'Combined European infantry with modern kit.',
      look: { uniform: '#5d6a4c', trousers: '#444e38', headgear: 'beret', headColor: '#2b3a7a', weapon: 'rifle' },
    },
    special: {
      name: 'EU Spec',
      description: 'European special operators — long-range precision marksmen.',
      look: { uniform: '#2f3338', trousers: '#24272b', headgear: 'helmet', headColor: '#2a2d31', weapon: 'sniper' },
    },
    president: {
      name: 'President',
      description: "President of the European Union, head of state and symbol of the union.",
      look: { uniform: '#222c4a', trousers: '#192138', headgear: 'none', headColor: '#000000', weapon: 'none' },
    },
    engineer: {
      name: 'Engineer',
      description: "EU engineer: repairs buildings and captures enemy structures.",
      look: { uniform: '#6a6a50', trousers: '#4a4a38', headgear: 'hardhat', headColor: '#f2c230', weapon: 'wrench' },
    },
  },
  vehicles: {
    light: { name: "VBL Scout", description: "Light armoured European reconnaissance vehicle." },
    tank: { name: "Leopard 2", description: "Leopard 2 main battle tank, precise and well protected." },
    ifv: { name: "Puma", description: "Puma armoured fighting vehicle, modern and fast." },
    jet: { name: "Eurofighter", description: "Eurofighter Typhoon multirole fighter." },
  },
};
