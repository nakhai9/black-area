import { CELL_SIZE, FOOTPRINT_SILO, SILO_HP, SILO_LID_HOLD, SILO_LID_MOVE, SILO_POWER_DRAIN, SILO_RANGE_CELLS } from '../constants';
import type { FactionId, WorldPoint } from '../types';
import { Building } from './Building';

/**
 * Underground missile silo (3 × 3, Defense tab, shop name "RS-24 Yars"): needs a Tech Center and a Radar Tower and
 * draws SILO_POWER_DRAIN power, far more than any other structure. It holds one RS-24 Yars ICBM at a time: each is
 * paid (SILO_MISSILE_COST) and loaded in SILO_RELOAD s, then fired only on an order at any point in range
 * (CombatSystem.silos). The launch lid swings open for the launch and closes after it. Player and AI alike.
 */
export class MissileSilo extends Building {
  /** Pays SILO_MISSILE_COST for the next missile (wired by Game: owner's treasury, player and AI alike). */
  static payMissile: (s: MissileSilo) => boolean = () => true;
  /** A missile stands ready in the shaft. */
  loaded = false;
  /** A paid missile is being loaded: seconds left (counts only while the owner has power). */
  loading = false;
  loadClock = 0;
  /** Point (world px) the owner ordered the next launch at; kept until the missile goes. */
  strike: WorldPoint | null = null;
  /** Seconds into the launch sequence (lid opens, missile goes, lid holds, lid closes); null when idle. */
  launchClock: number | null = null;
  /** The launch already fired in this sequence. */
  launched = false;

  constructor(owner: number, faction: FactionId, center: WorldPoint) {
    super(owner, faction, center, {
      type: 'missileSilo',
      name: 'RS-24 Yars',
      footprint: FOOTPRINT_SILO,
      maxHp: SILO_HP,
      powerOutput: 0,
      powerDrain: SILO_POWER_DRAIN,
      incomePerSecond: 0,
      spriteKey: `missileSilo:${faction}`,
    });
  }

  /** Reach (world px) from the silo's centre. */
  get range(): number {
    return SILO_RANGE_CELLS * CELL_SIZE;
  }

  /** Lid opening 0 (closed) .. 1 (open), from the launch sequence. */
  get lid(): number {
    const t = this.launchClock;
    if (t === null) return 0;
    if (t < SILO_LID_MOVE) return t / SILO_LID_MOVE;
    if (t < SILO_LID_MOVE + SILO_LID_HOLD) return 1;
    return Math.max(0, 1 - (t - SILO_LID_MOVE - SILO_LID_HOLD) / SILO_LID_MOVE);
  }
}
