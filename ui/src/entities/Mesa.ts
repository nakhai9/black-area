import { FOOTPRINT_MESA, NEUTRAL_OWNER } from '../constants';
import { t } from '../i18n';
import type { WorldPoint } from '../types';
import { MESA_BLOCKED, mesaLift } from '../map/MesaField';
import { Building } from './Building';

/**
 * A red sandstone mesa of the American West (Monument Valley). Neutral terrain scenery: never destroyed, damaged,
 * captured or occupied. Only its cliff cells block the ground: units drive up the ramp onto the plateau (MesaField).
 * Player and AI alike.
 */
export class Mesa extends Building {
  readonly description = t('A red sandstone mesa of the American West. Terrain: cannot be destroyed or occupied.');

  constructor(center: WorldPoint) {
    super(NEUTRAL_OWNER, 'neutral', center, {
      type: 'monument',
      name: 'Red Mesa',
      footprint: FOOTPRINT_MESA,
      maxHp: 3000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: 'terrain:mesa',
      indestructible: true,
      uncapturable: true,
    });
  }

  /** Map cells of its cliffs (the only ones it blocks). */
  blockedCells(): { x: number; y: number }[] {
    return MESA_BLOCKED.map((c) => ({ x: this.x + c.x, y: this.y + c.y }));
  }

  /** Screen lift (iso px) of its ground under world cell coordinates (cx, cy); 0 off the plot. */
  liftAt(cx: number, cy: number): number {
    return mesaLift(cx - this.x, cy - this.y);
  }
}
