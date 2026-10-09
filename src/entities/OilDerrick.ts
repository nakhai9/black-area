import {
  FOOTPRINT_SMALL,
  OIL_DERRICK_OUTPUT,
  OIL_LEASE_SECONDS,
  OIL_MINE_SECONDS,
  OIL_REST_SECONDS,
} from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { FACTIONS } from '../factions';
import { Building } from './Building';

const CYCLE = OIL_MINE_SECONDS + OIL_REST_SECONDS;

/**
 * Pumpjack in a nation's oil row — the only source of oil (sold to the Global Financial Center for TB). One derrick of every row is managed by
 * the Global Financial Center: it still belongs to its nation (its oil money goes to that nation's budget) but
 * nobody can destroy or capture it. It pumps for
 * OIL_MINE_SECONDS, then rests for OIL_REST_SECONDS while the reservoir
 * recovers. Derricks of one row start at staggered points of the cycle so
 * income stays smooth.
 */
export class OilDerrick extends Building {
  readonly description: string;
  /** Managed by the Global Financial Center: owned by its nation but protected from destruction and capture. */
  readonly bankManaged: boolean;
  private mining = true;
  /** Seconds left in the current phase. */
  private remaining = OIL_MINE_SECONDS;
  /** Leased to another nation (player id) for `leaseLeft` more seconds: it pumps into that nation's stock. */
  lessee: number | null = null;
  leaseLeft = 0;

  constructor(owner: number, faction: FactionId, center: WorldPoint, rowIndex: number, bankManaged = false) {
    super(owner, faction, center, {
      type: 'oilDerrick',
      name: 'Oil Derrick',
      footprint: FOOTPRINT_SMALL,
      maxHp: 1000,
      powerOutput: 0,
      powerDrain: 0,
      incomePerSecond: OIL_DERRICK_OUTPUT,
      spriteKey: `oil:${faction}`,
      // A leasing nation's derricks (FactionConfig.leasesOil) are protected for now, like the Center's.
      indestructible: bankManaged || FACTIONS[faction].leasesOil === true,
      uncapturable: bankManaged || FACTIONS[faction].leasesOil === true,
    });
    this.bankManaged = bankManaged;
    this.description = bankManaged
      ? `Managed by the Global Financial Center: its TB still goes to its nation, and it cannot be destroyed or captured.`
      : `Pumps oil for the nation to sell to the Global Financial Center. Pumps ${OIL_MINE_SECONDS} s, then rests ${OIL_REST_SECONDS} s while the field recovers.`;
    // Stagger neighbours (0 s, 40 s, 80 s … into the 240 s cycle) so they never all rest together.
    const t = (rowIndex * 40) % CYCLE;
    this.mining = t < OIL_MINE_SECONDS;
    this.remaining = this.mining ? OIL_MINE_SECONDS - t : CYCLE - t;
  }

  /** Can it be leased now (a leasing nation's derrick, not already leased)? */
  get leasable(): boolean {
    return this.alive && this.lessee === null && this.faction !== 'neutral' && FACTIONS[this.faction].leasesOil === true;
  }

  /** Starts a lease to `player` for OIL_LEASE_SECONDS. */
  lease(player: number): void {
    this.lessee = player;
    this.leaseLeft = OIL_LEASE_SECONDS;
  }

  /** Who receives its oil right now: the lessee during a lease, otherwise the owner. */
  get oilOwner(): number {
    return this.lessee ?? this.owner;
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
    if (this.lessee !== null) {
      this.leaseLeft -= dt;
      if (this.leaseLeft <= 0) {
        this.lessee = null;
        this.leaseLeft = 0;
      }
    }
    this.remaining -= dt;
    while (this.remaining <= 0) {
      this.mining = !this.mining;
      this.remaining += this.mining ? OIL_MINE_SECONDS : OIL_REST_SECONDS;
    }
  }
}
