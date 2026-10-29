import { MONUMENTS, NEUTRAL_OWNER, type MonumentId } from '../constants';
import { t } from '../i18n';
import type { WorldPoint } from '../types';
import { Building } from './Building';

/**
 * A landmark that is a symbol only (Lenin's Mausoleum, the Statue of Liberty): neutral, never attacked, damaged,
 * captured or occupied; it blocks the ground like any structure.
 */
export class Monument extends Building {
  readonly city: string;
  readonly description: string;

  constructor(
    readonly monument: MonumentId,
    center: WorldPoint,
  ) {
    const m = MONUMENTS[monument];
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'monument',
      name: m.name,
      footprint: m.footprint,
      maxHp: 3000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `monument:${monument}`,
      indestructible: true,
      uncapturable: true,
    });
    this.city = m.city;
    this.description = t('{name}: a symbol only. Cannot be attacked, destroyed or occupied.', { name: m.name });
  }
}
