import { FOOTPRINT_WALL, WALL_HP } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Wall (1×1): a block of its nation's wall that stops enemy ground troops; no power, no income, no weapon. */
export class Wall extends Building {
  /** Which sides touch another wall block of the nation (WALL_N | WALL_E | WALL_S | WALL_W): picks the joined sprite. */
  joins = 0;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'wall',
      name: 'Wall',
      footprint: FOOTPRINT_WALL,
      maxHp: WALL_HP,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `wall:${faction}`,
    });
  }

  override get spriteKey(): string {
    return this.joins ? `${super.spriteKey}|${this.joins}` : super.spriteKey;
  }
}
