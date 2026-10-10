import {
  FOOTPRINT_SMALL,
  OIL_DERRICK_OUTPUT,
  OIL_LEASE_SECONDS,
  OIL_MINE_SECONDS,
  OIL_REST_SECONDS,
  OIL_DERRICK_REGEN,
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
  /**
   * Leased to another nation (player id) for `leaseLeft` more seconds: for that time the derrick is the lessee's
   * (its colours, its oil); `lessor` (the leasing nation) gets it back when the lease ends.
   */
  lessee: number | null = null;
  leaseLeft = 0;
  lessor: number | null = null;
  private lessorFaction: FactionId | null = null;

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

  /** Starts a lease to `player` (of `faction`) for OIL_LEASE_SECONDS: the derrick becomes theirs until it ends. */
  lease(player: number, faction: FactionId): void {
    this.lessor = this.owner;
    this.lessorFaction = this.faction as FactionId;
    this.lessee = player;
    this.leaseLeft = OIL_LEASE_SECONDS;
    this.changeHands(player, faction);
  }

  /** The nation that owns it for good (the leasing nation while it is leased out). */
  get trueOwner(): number {
    return this.lessor ?? this.owner;
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
    // Temporary rule: a damaged derrick restores its health by itself.
    if (this.alive && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * OIL_DERRICK_REGEN * dt);
    if (this.lessee !== null) {
      this.leaseLeft -= dt;
      if (this.leaseLeft <= 0) {
        this.lessee = null;
        this.leaseLeft = 0;
        // The lease is over: the derrick goes back to the leasing nation.
        if (this.lessor !== null && this.lessorFaction !== null) this.changeHands(this.lessor, this.lessorFaction);
        this.lessor = null;
        this.lessorFaction = null;
      }
    }
    this.remaining -= dt;
    while (this.remaining <= 0) {
      this.mining = !this.mining;
      this.remaining += this.mining ? OIL_MINE_SECONDS : OIL_REST_SECONDS;
    }
  }
}
