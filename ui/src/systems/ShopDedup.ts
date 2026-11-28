import type { FactionId } from '../types';

/**
 * One cameo per design in the shop: soldiers, vehicles or structures with the same code (tier / kind / structure id
 * plus the model name: another nation's model, e.g. a captured factory's T-90 next to the own M1A2, is a different design and
 * is sold too) and the same job are listed once, whichever nation designed them (the first in the list wins: the own nation's,
 * else the first captured one). A nation's version with a privilege of its own (an extra job the others lack) is a
 * different design and keeps its own cameo. Same rule for the player and the AI (both read the shop from here).
 */

/** Privileges by nation and code: what that nation's version can do that the others' cannot. */
const PRIVILEGES: Partial<Record<FactionId, Readonly<Record<string, string>>>> = {
  // Islamic engineers and Crazy Soldiers lay land mines (Game: canLayMine).
  islamic: { engineer: 'mines', demolition: 'mines' },
  // Chinese bombers carry 4 bombs (BOMBER_BOMBS_BY_FACTION).
  china: { bomber: 'bombs4' },
};

/** That nation's privilege for `code`, or '' when its version works like everyone else's. */
export function privilegeOf(faction: FactionId, code: string): string {
  return PRIVILEGES[faction]?.[code] ?? '';
}

/**
 * Soldiers / machines with a job only, the same for every nation: listed once by job (own first), whatever they look
 * like (engineers, flag bearers, recovery vehicles, bridge layers). A nation's privilege still splits them off.
 */
const JOB_ONLY: ReadonlySet<string> = new Set(['engineer', 'squatters', 'repair', 'bridgeLayer']);

/** Shop identity: job-only codes by job; every other design by its own design (code + model). */
export function designKey(code: string, model: string): string {
  return JOB_ONLY.has(code) ? code : `${code}|${model}`;
}

/** Keeps the first option of every (code, privilege) pair. */
export function onePerDesign<T>(list: readonly T[], code: (o: T) => string, faction: (o: T) => FactionId): T[] {
  const seen = new Set<string>();
  return list.filter((o) => {
    const c = code(o);
    const key = `${c}|${privilegeOf(faction(o), c.split('|')[0]!)}`; // privileges are keyed by the bare code
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
