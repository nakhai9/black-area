import type { EntityManager } from '../entities/EntityManager';
import { FACTIONS } from '../factions';
import type { BuildingType, FactionId, PlayerState } from '../types';

/**
 * Order key of something designed by another nation: `base@faction` (a plain `base` is the nation's own design).
 * Taken over by an engineer: a capital lets its holder build that nation's structures, a Ministry of Defence / War
 * Factory / Airfield lets it buy that nation's soldiers / vehicles / aircraft.
 */
export type ForeignKey<T extends string> = T | `${T}@${FactionId}`;

export function splitKey<T extends string>(key: ForeignKey<T>): { base: T; faction: FactionId | null } {
  const i = key.indexOf('@');
  return i < 0 ? { base: key as T, faction: null } : { base: key.slice(0, i) as T, faction: key.slice(i + 1) as FactionId };
}

/** Other nations whose designs `player` holds: captured capitals ('capital') or captured structures of `type`. */
export function takenNations(entities: EntityManager, player: PlayerState, type: BuildingType): FactionId[] {
  const out = new Set<FactionId>();
  for (const b of entities.buildings()) {
    if (b.owner !== player.id || !b.alive) continue;
    let f: string | undefined;
    if (type !== 'capital') f = b.spec.type === type ? b.origin : undefined;
    // A nation's capital, or the neutral-standing capital of a nation absent from the game (a NationCapital).
    else if (b.spec.type === 'capital') f = /^capital:(\w+)$/.exec(b.spec.spriteKey)?.[1];
    else if (b.spec.type === 'nationCapital' && 'nation' in b) f = String(b.nation);
    if (f && f !== player.faction && f in FACTIONS) out.add(f as FactionId);
  }
  return [...out].sort();
}
