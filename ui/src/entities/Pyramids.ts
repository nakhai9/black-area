import { FOOTPRINT_PYRAMIDS, NEUTRAL_OWNER } from '../constants';
import { t } from '../i18n';
import type { WorldPoint } from '../types';
import { Building } from './Building';

/**
 * The Pyramids of Giza — a neutral monument on the Nile's west bank. Scenery only: it can never be destroyed,
 * damaged, captured or occupied, and blocks the ground like any structure.
 */
export class Pyramids extends Building {
  readonly city = 'Giza';
  readonly description = t('The Pyramids of Giza: an ancient wonder. Cannot be destroyed or occupied.');

  constructor(center: WorldPoint) {
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'monument',
      name: 'Pyramids of Giza',
      footprint: FOOTPRINT_PYRAMIDS,
      maxHp: 3000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: 'monument:giza',
      indestructible: true,
      uncapturable: true,
    });
  }
}
