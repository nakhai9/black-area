import {
  DEBT_RESUME_SHARE,
  LOAN_MIN,
  LOAN_SHARE,
  LOAN_TO_VALUE,
  MAP_SEED,
  RESALE_SHARE,
  VEHICLE_BASE,
  OIL_FLOW_MEMORY,
  OIL_FLOW_REF,
  OIL_FLOW_WEIGHT,
  OIL_MOOD_MAX,
  OIL_MOOD_PULL,
  OIL_MOOD_STEP,
  OIL_PRICE_EASE,
  OIL_PRICE_INTERVAL,
  OIL_PRICE_MAX,
  OIL_PRICE_MIN,
  OIL_PRICE_START,
  OIL_RESERVE,
  OIL_SALE_BURST,
  OIL_SALE_COOLDOWN,
  OIL_WEALTH_REF,
  OIL_WEALTH_WEIGHT,
  WB_MAX_SHARE,
} from '../constants';
import { mulberry32 } from '../core/Random';
import type { EntityManager } from '../entities/EntityManager';
import type { FactionId, PlayerState } from '../types';
import { BUILD_OPTIONS, buildCost } from './ConstructionSystem';
import type { GameSystem } from './GameSystem';

export type SaleResult =
  | { kind: 'sold'; barrels: number; price: number; revenue: number; repaid: number }
  | { kind: 'declined'; reason: string };

export type LoanResult = { kind: 'granted'; amount: number; debt: number } | { kind: 'refused'; reason: string };

/** Price revisions kept for the chart (10 s each → the last 5 minutes). */
const PRICE_HISTORY = 30;

/** Smallest stock worth offering to the Global Financial Center (barrels). */
export const MIN_SALE_STOCK = 0.5;

/**
 * The Global Financial Center (Zürich): a neutral, purely financial institution. It runs the oil market and emergency
 * credit automatically and never takes sides.
 *
 * Price — see the OIL_* constants: it falls when nations sell a lot of oil, rises when the Center has to sell oil
 * to their power grids and when the world grows richer, plus a small seeded market mood. The posted price eases
 * towards that target every OIL_PRICE_INTERVAL seconds.
 *
 * Credit — a nation at 0 TB may take an emergency loan (DEBT); income from oil sales pays the debt back first.
 */
export class OilMarket implements GameSystem {
  /** Current price and the one before it (TB per barrel). */
  price = OIL_PRICE_START;
  previous = OIL_PRICE_START;
  /** Posted prices, oldest first (the last PRICE_HISTORY revisions), for the Price page chart. */
  readonly history: number[] = [OIL_PRICE_START];
  /** Barrels sold to the Center / bought from it for power grids lately (decaying memory), and the mood (±). */
  sold = 0;
  bought = 0;
  mood = 0;
  private readonly rng = mulberry32(MAP_SEED ^ 0x0b1);
  private clock = OIL_PRICE_INTERVAL;
  /** Market time (s) and the times each nation offered oil lately (rate limit). */
  private now = 0;
  private readonly offers = new Map<number, number>();
  /** Offers made in the current burst, per player (see OIL_SALE_BURST). */
  private readonly streak = new Map<number, number>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
  ) {}

  /** Seconds until the Center posts a new price. */
  get secondsToChange(): number {
    return Math.max(0, this.clock);
  }

  update(dt: number): void {
    this.now += dt;
    const fade = Math.exp(-dt / OIL_FLOW_MEMORY);
    this.sold *= fade;
    this.bought *= fade;
    this.clock -= dt;
    while (this.clock <= 0) {
      this.clock += OIL_PRICE_INTERVAL;
      this.reprice();
    }
  }

  /** Average net worth of the nations still at war: budget + oil + resale value of assets − debt. */
  averageWealth(): number {
    const live = this.players.filter((p) => !p.defeated);
    if (live.length === 0) return 0;
    const total = live.reduce((sum, p) => sum + Math.max(0, p.credits + this.collateral(p) - p.debt), 0);
    return total / live.length;
  }

  /** Price the market is heading for (before the mood): wealth × flow. */
  balancePrice(): number {
    const wealth = Math.pow((OIL_WEALTH_REF + this.averageWealth()) / OIL_WEALTH_REF, OIL_WEALTH_WEIGHT);
    const flow = Math.pow((OIL_FLOW_REF + this.bought) / (OIL_FLOW_REF + this.sold), OIL_FLOW_WEIGHT);
    return OIL_PRICE_START * wealth * flow;
  }

  private reprice(): void {
    this.previous = this.price;
    this.mood += (this.rng() * 2 - 1) * OIL_MOOD_STEP - this.mood * OIL_MOOD_PULL;
    this.mood = Math.max(-OIL_MOOD_MAX, Math.min(OIL_MOOD_MAX, this.mood));
    const target = Math.max(OIL_PRICE_MIN, Math.min(OIL_PRICE_MAX, this.balancePrice() * (1 + this.mood)));
    this.price = Math.round(this.price + (target - this.price) * OIL_PRICE_EASE);
    this.history.push(this.price);
    if (this.history.length > PRICE_HISTORY) this.history.shift();
  }

  /** Seconds until the nation may sell again (0 when it can sell now): OIL_SALE_BURST offers, then OIL_SALE_COOLDOWN s rest. */
  waitSeconds(player: PlayerState): number {
    const last = this.offers.get(player.id);
    if (last === undefined || (this.streak.get(player.id) ?? 0) < OIL_SALE_BURST) return 0;
    return Math.max(0, Math.ceil(OIL_SALE_COOLDOWN - (this.now - last)));
  }

  /** Barrels the nation could offer right now (everything above the OIL_RESERVE kept in stock). */
  sellable(player: PlayerState): number {
    return Math.max(0, player.oil - OIL_RESERVE);
  }

  /**
   * `player` offers all of its oil. The Center buys a share of the stock — the cheaper the oil, the larger the share
   * (never more than WB_MAX_SHARE) — and pays barrels × the posted price; any DEBT is paid back first.
   */
  sell(player: PlayerState): SaleResult {
    if (player.defeated) return { kind: 'declined', reason: 'your nation has fallen' };
    const wait = this.waitSeconds(player);
    if (wait > 0) return { kind: 'declined', reason: `${OIL_SALE_BURST} sales in a row, then a ${OIL_SALE_COOLDOWN} s pause — try again in ${wait} s` };
    const stock = this.sellable(player);
    if (stock < MIN_SALE_STOCK) return { kind: 'declined', reason: `not enough oil to offer (${OIL_RESERVE.toFixed(1)} barrels stay in reserve)` };
    // A new burst starts once the last one has rested (OIL_SALE_COOLDOWN s since the previous offer).
    const last = this.offers.get(player.id);
    const rested = last === undefined || this.now - last >= OIL_SALE_COOLDOWN;
    this.streak.set(player.id, (rested ? 0 : (this.streak.get(player.id) ?? 0)) + 1);
    this.offers.set(player.id, this.now);
    const appetite = 1 - (0.6 * this.price) / OIL_PRICE_MAX; // 1 at a price of 0 … 0.4 at the maximum
    const barrels = Math.min(stock, stock * WB_MAX_SHARE * appetite);
    const revenue = Math.round(barrels * this.price);
    player.oil -= barrels;
    this.sold += barrels;
    const repaid = this.receive(player, revenue);
    return { kind: 'sold', barrels, price: this.price, revenue, repaid };
  }

  /**
   * Forced sale to a power grid that ran dry: the Center sells up to `barrels` at `markup` × the posted price,
   * as much as the treasury can pay. Returns the barrels delivered (burned straight into the grid).
   */
  sellForGrid(player: PlayerState, barrels: number, markup: number): number {
    if (player.capitalLost) return 0; // a nation without its capital cannot buy, not even oil for its grid
    const unit = this.price * markup;
    const delivered = Math.max(0, Math.min(barrels, player.credits / unit));
    player.credits -= delivered * unit;
    this.bought += delivered;
    return delivered;
  }

  /** What the nation could sell to repay the Center: oil at the posted price + resale value of structures and vehicles. */
  collateral(player: PlayerState): number {
    let assets = 0;
    for (const b of this.entities.buildings()) {
      if (b.owner !== player.id || !b.alive || b.indestructible) continue;
      const option = BUILD_OPTIONS.find((o) => o.id === b.spec.type);
      if (option) assets += buildCost(option, b.faction as FactionId) * (b.hp / b.maxHp);
    }
    for (const v of this.entities.vehicles()) if (v.owner === player.id && v.alive) assets += VEHICLE_BASE[v.type].cost;
    return Math.max(0, player.oil) * this.price + RESALE_SHARE * assets;
  }

  /** The most the nation may owe the Center right now (rounded down to 100 TB). */
  creditLine(player: PlayerState): number {
    return Math.floor((LOAN_TO_VALUE * this.collateral(player)) / 100) * 100;
  }

  /** Size of the next loan: LOAN_SHARE of the line (≥ LOAN_MIN), never past the line. */
  loanSize(player: PlayerState): number {
    const line = this.creditLine(player);
    return Math.max(0, Math.min(line - player.debt, Math.max(LOAN_MIN, Math.round((line * LOAN_SHARE) / 100) * 100)));
  }

  /** Income for `player`: the Center automatically takes what is owed first. Returns the amount repaid. */
  receive(player: PlayerState, amount: number): number {
    const repaid = Math.min(player.debt, amount);
    player.debt -= repaid;
    this.checkFreeze(player);
    player.credits += amount - repaid;
    return repaid;
  }

  /** Lifts a credit freeze once the debt is back down to DEBT_RESUME_SHARE of the current line. */
  private checkFreeze(player: PlayerState): void {
    if (player.creditFrozen && player.debt <= this.creditLine(player) * DEBT_RESUME_SHARE) player.creditFrozen = false;
  }

  /** Why an emergency loan would be refused right now (null = it would be granted). */
  loanBlocker(player: PlayerState): string | null {
    if (player.defeated) return 'your nation has fallen';
    if (player.credits >= 1) return 'loans are only for an empty treasury (0 TB)';
    this.checkFreeze(player);
    const line = this.creditLine(player);
    if (player.creditFrozen) {
      const due = Math.ceil(player.debt - line * DEBT_RESUME_SHARE);
      return `credit frozen — repay ${due} more to borrow again (credit line ${line}, based on your oil and assets)`;
    }
    if (this.loanSize(player) < 100) return `credit line of ${line} reached — it is based on your oil stock and assets`;
    return null;
  }

  /** Emergency loan, only on the player's request: sized by the nation's oil and assets, added to DEBT. */
  borrow(player: PlayerState): LoanResult {
    const reason = this.loanBlocker(player);
    if (reason) return { kind: 'refused', reason };
    const amount = this.loanSize(player);
    player.credits += amount;
    player.debt += amount;
    if (player.debt >= this.creditLine(player) - 100) player.creditFrozen = true;
    return { kind: 'granted', amount, debt: player.debt };
  }
}
