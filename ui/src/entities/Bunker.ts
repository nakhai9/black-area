import { BUNKER_COOLDOWN, BUNKER_DAMAGE, BUNKER_HP, BUNKER_POWER_DRAIN, BUNKER_RANGE, BUNKER_VS_VEHICLE, FOOTPRINT_BUNKER } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Bunker (1×1): a machine-gun pillbox that fires on its own (see CombatSystem.bunkers) at enemy soldiers and
 * ground vehicles within BUNKER_RANGE; aircraft are out of its reach. No garrison needed.
 */
export class Bunker extends Building {
  /** Seconds until the gun may fire again. */
  cooldown = 0;
  /** Seconds the muzzle flashes stay visible after a burst (drives the animated layer). */
  firing = 0;
  /** World heading of the gun (towards the last target; starts facing screen south). */
  aimHeading = Math.PI / 4;

  constructor(owner: number, faction: FactionId, center: WorldPoint, kind: { name?: string; maxHp?: number } = {}) {
    super(owner, faction, center, {
      type: 'bunker',
      name: kind.name ?? 'Bunker',
      footprint: FOOTPRINT_BUNKER,
      maxHp: kind.maxHp ?? BUNKER_HP,
      powerOutput: 0,
      powerDrain: BUNKER_POWER_DRAIN,
      incomePerSecond: 0,
      spriteKey: `bunker:${faction}`,
    });
  }

  /** Reach (world px, from its edge), damage per shot, seconds between shots (overridden by the LDEW emplacement). */
  get range(): number {
    return BUNKER_RANGE;
  }
  get shotDamage(): number {
    return BUNKER_DAMAGE;
  }
  get shotCooldown(): number {
    return BUNKER_COOLDOWN;
  }
  /** Damage factor against vehicles. */
  get vsVehicle(): number {
    return BUNKER_VS_VEHICLE;
  }
  /** Can it shoot aircraft in flight? */
  get hitsAir(): boolean {
    return false;
  }

  /** Firing: the art shows muzzle flashes at the slits. */
  override get active(): boolean {
    return this.firing > 0;
  }
}
