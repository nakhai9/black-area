import { CELL_SIZE, DVINA_DAMAGE, DVINA_HP, DVINA_POWER_DRAIN, DVINA_RANGE_CELLS, DVINA_RELOAD, FOOTPRINT_DVINA } from '../constants';
import type { SiteId } from '../render/DvinaSheets';
import type { FactionId, WorldPoint } from '../types';
import { Bunker } from './Bunker';

/**
 * R-12 Dvina missile launcher (2×2, Defense tab): sold only to the holder of Havana (BuildOption.nation). A bunker to
 * the rest of the game (placement, capture, AI), but it fires one heavy missile at a time (CombatSystem.bunkers) at
 * aircraft, ground units and structures; the launcher turns towards the target and the rail stays empty while it
 * reloads (drawn from the dvina sheets: stand, launcher, missile).
 */
export class DvinaLauncher extends Bunker {
  /** Which sheets draw it. */
  get site(): SiteId {
    return 'dvina';
  }

  constructor(owner: number, faction: FactionId, center: WorldPoint, kind: { name: string; maxHp: number; powerDrain: number; footprint: { w: number; d: number } } = { name: 'R-12 Dvina', maxHp: DVINA_HP, powerDrain: DVINA_POWER_DRAIN, footprint: FOOTPRINT_DVINA }) {
    super(owner, faction, center, kind);
  }

  override get range(): number {
    return DVINA_RANGE_CELLS * CELL_SIZE;
  }
  override get shotDamage(): number {
    return DVINA_DAMAGE;
  }
  override get shotCooldown(): number {
    return DVINA_RELOAD;
  }
  override get vsVehicle(): number {
    return 1;
  }
  override get hitsAir(): boolean {
    return true;
  }
  override get hitsStructures(): boolean {
    return true;
  }
  /** A missile sits on the rail (none while it reloads). */
  get loaded(): boolean {
    return this.cooldown <= 0;
  }
}

