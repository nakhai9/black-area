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

  /** Damage state from HP left: 0 above 75%, 1 above 50%, 2 above 25%, 3 below (partly collapsed). */
  get damageLevel(): number {
    const r = this.hpRatio;
    return r > 0.75 ? 0 : r > 0.5 ? 1 : r > 0.25 ? 2 : 3;
  }

  override get spriteKey(): string {
    const base = this.joins ? `${super.spriteKey}|${this.joins}` : super.spriteKey;
    const dmg = this.damageLevel;
    return dmg ? `${base}~${dmg}` : base;
  }
}
