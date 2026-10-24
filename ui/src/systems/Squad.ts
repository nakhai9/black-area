import { SQUAD_MIN_REGULAR, SQUAD_MIN_SPECIAL, SQUAD_MIN_TANKS } from '../constants';
import { Infantry } from '../entities/Infantry';
import { Vehicle } from '../entities/Vehicle';
import type { Unit } from '../entities/Unit';

/** Which squad rule a unit falls under when it sets off to attack (null: it may go alone). */
function squadKind(u: Unit): 'regular' | 'special' | 'tank' | null {
  if (u instanceof Infantry) return u.tier === 'regular' ? 'regular' : u.tier === 'special' ? 'special' : null;
  if (u instanceof Vehicle && u.type === 'tank') return 'tank';
  return null;
}

const SQUAD_MIN = { regular: SQUAD_MIN_REGULAR, special: SQUAD_MIN_SPECIAL, tank: SQUAD_MIN_TANKS } as const;

/**
 * Attack orders go out in squads only (player and AI alike): regular soldiers, special forces and tanks may set off
 * to attack only when the order has at least SQUAD_MIN_* of their kind; the rest of the order goes as given. Returns
 * the units allowed to attack and the kinds held back for being too few.
 */
export function squadFilter<T extends Unit>(units: readonly T[]): { going: T[]; short: ('regular' | 'special' | 'tank')[] } {
  const count = { regular: 0, special: 0, tank: 0 };
  for (const u of units) {
    const k = squadKind(u);
    if (k) count[k]++;
  }
  const short = (Object.keys(count) as (keyof typeof count)[]).filter((k) => count[k] > 0 && count[k] < SQUAD_MIN[k]);
  const going = units.filter((u) => {
    const k = squadKind(u);
    return k === null || !short.includes(k);
  });
  return { going, short };
}
