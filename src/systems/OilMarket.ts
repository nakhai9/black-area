import { OIL_PRICE_INTERVAL, OIL_PRICE_MAX, OIL_PRICE_START, WB_MAX_SHARE } from '../constants';
import type { PlayerState } from '../types';
import type { GameSystem } from './GameSystem';

export type SaleResult =
  | { kind: 'sold'; barrels: number; price: number; revenue: number }
  | { kind: 'declined'; reason: string };

/** Smallest stock worth offering to the World Bank (barrels). */
export const MIN_SALE_STOCK = 0.5;

/**
 * The World Bank's oil market. One price for every nation, set by the Bank (TB per barrel, between 0
 * and OIL_PRICE_MAX) and revised every OIL_PRICE_INTERVAL seconds — up or down. A nation sells its
 * stock to the Bank; the Bank decides whether to buy and how much (never more than WB_MAX_SHARE of the
 * offered stock per sale) and pays barrels × the posted price into the nation's treasury.
 */
export class OilMarket implements GameSystem {
  /** Current price and the one before it (TB per barrel). */
  price = OIL_PRICE_START;
  previous = OIL_PRICE_START;
  private clock = OIL_PRICE_INTERVAL;

  constructor(private readonly random: () => number = Math.random) {}

  /** Seconds until the Bank posts a new price. */
  get secondsToChange(): number {
    return Math.max(0, this.clock);
  }

  update(dt: number): void {
    this.clock -= dt;
    while (this.clock <= 0) {
      this.clock += OIL_PRICE_INTERVAL;
      this.reprice();
    }
  }

  /** A random walk that always moves (some rises, some falls) and never leaves 0…OIL_PRICE_MAX. */
  private reprice(): void {
    this.previous = this.price;
    let step = (this.random() - 0.5) * 600; // ±300 TB
    if (Math.abs(step) < 40) step = step < 0 ? -40 : 40;
    let next = Math.round(this.price + step);
    // Bounce off the limits instead of sticking to them.
    if (next > OIL_PRICE_MAX) next = OIL_PRICE_MAX - Math.round(this.random() * 150);
    if (next < 0) next = Math.round(this.random() * 150);
    this.price = Math.max(0, Math.min(OIL_PRICE_MAX, next));
    // Always a real move: if the bounce landed on the old price, nudge it away from the nearer limit.
    if (this.price === this.previous) this.price = this.previous > OIL_PRICE_MAX / 2 ? this.previous - 40 : this.previous + 40;
  }

  /**
   * `player` offers all of its oil. The Bank may decline (price too low, or simply not interested
   * this time); otherwise it buys a share of the stock — the cheaper the oil, the keener it is.
   */
  sell(player: PlayerState): SaleResult {
    if (player.defeated) return { kind: 'declined', reason: 'your nation has fallen' };
    const stock = player.oil;
    if (stock < MIN_SALE_STOCK) return { kind: 'declined', reason: 'not enough oil to offer' };
    if (this.price < 40) return { kind: 'declined', reason: 'the price is too low — the Bank is not buying' };
    if (this.random() < 0.1) return { kind: 'declined', reason: 'the Bank is not interested right now' };
    const demand = 1 - (0.6 * this.price) / OIL_PRICE_MAX; // 1 at a price of 0 … 0.4 at the maximum
    const share = WB_MAX_SHARE * demand * (0.6 + 0.4 * this.random()); // never above WB_MAX_SHARE
    const barrels = Math.min(stock * WB_MAX_SHARE, stock * share);
    const revenue = Math.round(barrels * this.price);
    player.oil -= barrels;
    player.credits += revenue;
    return { kind: 'sold', barrels, price: this.price, revenue };
  }
}
