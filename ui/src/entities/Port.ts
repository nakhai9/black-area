import { FOOTPRINT_PORT, PORT_HP, PORT_POWER_DRAIN, PORT_PIER, PORT_QUAY } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/** Naval Port: a U-shaped harbour on the coast; ships moor in its basin (see FOOTPRINT_PORT). */
export class Port extends Building {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'port',
      name: 'Naval Port',
      footprint: FOOTPRINT_PORT,
      maxHp: PORT_HP,
      powerOutput: 0,
      powerDrain: PORT_POWER_DRAIN,
      incomePerSecond: 0,
      spriteKey: `port:${faction}`,
    });
  }

  /** The water basin between the piers (cells): opens toward +y, or toward +x when turned. */
  basin(): { x: number; y: number; w: number; d: number } {
    return this.rotated
      ? { x: this.x + PORT_QUAY, y: this.y + PORT_PIER, w: this.w - PORT_QUAY, d: this.d - PORT_PIER * 2 }
      : { x: this.x + PORT_PIER, y: this.y + PORT_QUAY, w: this.w - PORT_PIER * 2, d: this.d - PORT_QUAY };
  }
}
