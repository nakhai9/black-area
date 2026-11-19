import { CELL_SIZE, DVINA_BLAST_CELLS, DVINA_DAMAGE, DVINA_HP, DVINA_POWER_DRAIN, DVINA_RANGE_CELLS, DVINA_RELOAD, FOOTPRINT_DVINA } from '../constants';
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
  /** Pays DVINA_MISSILE_COST for the next missile (wired by Game: owner's treasury, player and AI alike). */
  static payMissile: (b: DvinaLauncher) => boolean = () => true;
  /** A missile is on the rail or being loaded (paid for); false once fired until the next one is paid. */
  armed = true;
  /** World heading the owner turned the launcher to (left-click on the ground); null = free. */
  aimOrder: number | null = null;
  /** forcedTarget came from the owner's attack order (true) or from its own pick of an aircraft (false). */
  ordered = false;

  /** Default heading: screen-left (world 3π/4 → iso -x); the launcher turns back to it once it has no target or order. */
  get restHeading(): number {
    return Math.PI * 0.75;
  }

  /** Which sheets draw it. */
  get site(): SiteId {
    return 'dvina';
  }

  constructor(owner: number, faction: FactionId, center: WorldPoint, kind: { name: string; maxHp: number; powerDrain: number; footprint: { w: number; d: number } } = { name: 'R-12 Dvina', maxHp: DVINA_HP, powerDrain: DVINA_POWER_DRAIN, footprint: FOOTPRINT_DVINA }) {
    super(owner, faction, center, kind);
    // Faces screen-left when placed (world heading 3π/4 → iso -x).
    this.aimHeading = this.restHeading;
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
    return this.armed && this.cooldown <= 0;
  }
  /** Blast radius round the impact (world px). */
  get blastRadius(): number {
    return DVINA_BLAST_CELLS * CELL_SIZE;
  }
}

