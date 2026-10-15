import { CAPITAL_LOCATIONS, capitalFootprint, CONTESTED_NATIONS, type ContestedNationId, FOOTPRINT_NATION_CAPITAL, NATION_PRESENCE_PERIOD, NEUTRAL_OWNER } from '../constants';
import { t } from '../i18n';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';
import { FACTIONS } from '../factions';

/**
 * A capital that can be occupied: a contested nation, or (multiplayer room with fewer than 5 players) the capital
 * of a nation nobody plays, which then stands on the map like Japan or Korea.
 */
export type NationId = ContestedNationId | FactionId;

export const isFactionNation = (id: NationId): id is FactionId => id in CAPITAL_LOCATIONS;

/** Display name, capital building, city, plot and art of an occupiable capital. */
export function nationInfo(id: NationId): { name: string; capital: string; city: string; footprint: { w: number; d: number }; spriteKey: string } {
  if (isFactionNation(id)) {
    const f = FACTIONS[id];
    return { name: f.name, capital: f.capital.name, city: f.capital.city, footprint: capitalFootprint(id), spriteKey: `capital:${id}` };
  }
  const n = CONTESTED_NATIONS[id];
  return { name: n.name, capital: n.capital, city: n.site.name, footprint: FOOTPRINT_NATION_CAPITAL, spriteKey: `nation:${id}` };
}

/**
 * Capital of a contested independent nation (North / South Korea, Japan, Australia, Brazil). It starts neutral and
 * can never be damaged or destroyed; an engineer of any nation takes it over (from nobody or from its holder). The
 * holder is paid a military presence fee every NATION_PRESENCE_PERIOD seconds (see TaxSystem) and may build its own
 * structures next to it.
 */
export class NationCapital extends Building {
  readonly city: string;
  readonly description: string;
  /** Seconds until the holder's next presence fee (restarts when it changes hands). */
  presenceClock = NATION_PRESENCE_PERIOD;

  constructor(
    readonly nation: NationId,
    center: WorldPoint,
  ) {
    const n = nationInfo(nation);
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'nationCapital',
      name: n.capital,
      footprint: n.footprint,
      maxHp: 5000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: n.spriteKey,
      indestructible: true,
    });
    this.city = n.city;
    this.description = t('Capital of {name}, an independent nation. Cannot be destroyed; an engineer takes it over. Its holder earns a military presence fee every {minutes} minutes and may build next to it.', { name: n.name, minutes: NATION_PRESENCE_PERIOD / 60 });
  }

  /** Nation + holder ("South Korea + Russia": the + is their alliance), or null while neutral. */
  alliance(): string | null {
    if (this.owner === NEUTRAL_OWNER || this.faction === 'neutral') return null;
    return `${nationInfo(this.nation).name} + ${FACTIONS[this.faction].shortName}`;
  }

  override capture(owner: number, faction: import('../types').FactionId): boolean {
    if (!this.alive || owner === this.owner) return false;
    this.changeHands(owner, faction);
    this.presenceClock = NATION_PRESENCE_PERIOD;
    return true;
  }
}
