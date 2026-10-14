import { CONTESTED_NATIONS, type ContestedNationId, FOOTPRINT_NATION_CAPITAL, NATION_PRESENCE_PERIOD, NEUTRAL_OWNER } from '../constants';
import { t } from '../i18n';
import type { WorldPoint } from '../types';
import { Building } from './Building';
import { FACTIONS } from '../factions';

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
    readonly nation: ContestedNationId,
    center: WorldPoint,
  ) {
    const n = CONTESTED_NATIONS[nation];
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'nationCapital',
      name: n.capital,
      footprint: FOOTPRINT_NATION_CAPITAL,
      maxHp: 5000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `nation:${nation}`,
      indestructible: true,
    });
    this.city = n.site.name;
    this.description = t('Capital of {name}, an independent nation. Cannot be destroyed; an engineer takes it over. Its holder earns a military presence fee every {minutes} minutes and may build next to it.', { name: n.name, minutes: NATION_PRESENCE_PERIOD / 60 });
  }

  /** Nation + holder ("South Korea + Russia": the + is their alliance), or null while neutral. */
  alliance(): string | null {
    if (this.owner === NEUTRAL_OWNER || this.faction === 'neutral') return null;
    return `${CONTESTED_NATIONS[this.nation].name} + ${FACTIONS[this.faction].shortName}`;
  }

  override capture(owner: number, faction: import('../types').FactionId): boolean {
    if (!this.alive || owner === this.owner) return false;
    this.changeHands(owner, faction);
    this.presenceClock = NATION_PRESENCE_PERIOD;
    return true;
  }
}
