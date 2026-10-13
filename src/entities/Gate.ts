import { FOOTPRINT_GATE, GATE_HP } from '../constants';
import type { FactionId, GridPoint, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Nation Gate (4 × 1, turned: 1 × 4): two end pillars that block the way like wall blocks, and the two middle cells
 * left open as the way in and out. No power, no income, no weapon.
 */
export class Gate extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'gate',
      name: 'Nation Gate',
      footprint: FOOTPRINT_GATE,
      maxHp: GATE_HP,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: 0,
      spriteKey: `gate:${faction}`,
    });
  }

  /** The two middle cells: never marked as occupied, so every ground unit may pass through. */
  openCells(): GridPoint[] {
    return this.rotated
      ? [
          { x: this.x, y: this.y + 1 },
          { x: this.x, y: this.y + 2 },
        ]
      : [
          { x: this.x + 1, y: this.y },
          { x: this.x + 2, y: this.y },
        ];
  }
}
