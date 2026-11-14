import { CELL_SIZE, FOOTPRINT_BUNKER, LDEW_SITE_COOLDOWN, LDEW_SITE_DAMAGE, LDEW_SITE_HP, LDEW_SITE_RANGE_CELLS } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Bunker } from './Bunker';

/**
 * LDEW laser emplacement (1×1, Defense tab): sold only to the holder of London (BuildOption.nation). It is a bunker to
 * the rest of the game (placement, capture, AI) but fires its own laser (CombatSystem.bunkers): longer range, hits
 * aircraft too, and its head turns towards the target (drawn from the ldew-ground sheets).
 */
export class LdewEmplacement extends Bunker {
  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, { name: 'LDEW Laser', maxHp: LDEW_SITE_HP });
  }

  override get range(): number {
    return LDEW_SITE_RANGE_CELLS * CELL_SIZE;
  }
  override get shotDamage(): number {
    return LDEW_SITE_DAMAGE;
  }
  override get shotCooldown(): number {
    return LDEW_SITE_COOLDOWN;
  }
  override get vsVehicle(): number {
    return 1;
  }
  override get hitsAir(): boolean {
    return true;
  }
}

export { FOOTPRINT_BUNKER as LDEW_FOOTPRINT };
