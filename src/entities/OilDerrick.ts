import {
  FOOTPRINT_SMALL,
  OIL_DERRICK_INCOME,
  OIL_MINE_SECONDS,
  OIL_REST_SECONDS,
} from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

const CYCLE = OIL_MINE_SECONDS + OIL_REST_SECONDS;

/**
 * Pumpjack in a nation's oil row — the only source of TB. It pumps for
 * OIL_MINE_SECONDS, then rests for OIL_REST_SECONDS while the reservoir
 * recovers. Derricks of one row start at staggered points of the cycle so
 * income stays smooth.
 */
export class OilDerrick extends Building {
  readonly description = `The nation's only source of TB. Pumps ${OIL_MINE_SECONDS} s, then rests ${OIL_REST_SECONDS} s while the field recovers.`;
  private mining = true;
  /** Seconds left in the current phase. */
  private remaining = OIL_MINE_SECONDS;

  constructor(owner: number, faction: FactionId, center: WorldPoint, rowIndex: number) {
    super(owner, faction, center, {
      type: 'oilDerrick',
      name: 'Oil Derrick',
      footprint: FOOTPRINT_SMALL,
      maxHp: 1000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: OIL_DERRICK_INCOME,
      spriteKey: `oil:${faction}`,
    });
    // Stagger neighbours (0 s, 40 s, 80 s … into the 240 s cycle) so they never all rest together.
    const t = (rowIndex * 40) % CYCLE;
    this.mining = t < OIL_MINE_SECONDS;
    this.remaining = this.mining ? OIL_MINE_SECONDS - t : CYCLE - t;
  }

  get pumping(): boolean {
    return this.mining;
  }

  override get active(): boolean {
    return this.mining;
  }

  override get income(): number {
    return this.mining ? this.spec.incomePerSecond : 0;
  }

  /** Seconds until the next phase change. */
  get phaseSecondsLeft(): number {
    return this.remaining;
  }

  override update(dt: number): void {
    this.remaining -= dt;
    while (this.remaining <= 0) {
      this.mining = !this.mining;
      this.remaining += this.mining ? OIL_MINE_SECONDS : OIL_REST_SECONDS;
    }
  }
}
