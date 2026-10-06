import {
  DEBT_RESUME_SHARE,
  LOAN_MIN,
  LOAN_SHARE,
  LOAN_TO_VALUE,
  RESALE_SHARE,
  VEHICLE_BASE,
  OIL_DEMAND_BASE,
  OIL_DEMAND_PER_SOLDIER,
  OIL_DEMAND_PER_VEHICLE,
  OIL_PRICE_EASE,
  OIL_PRICE_INTERVAL,
  OIL_PRICE_MAX,
  OIL_PRICE_MIN,
  OIL_PRICE_START,
  OIL_RESERVE,
  OIL_SALE_COOLDOWN,
  OIL_SUPPLY_FLOOR,
  WB_MAX_SHARE,
} from '../constants';
import type { EntityManager } from '../entities/EntityManager';
import { OilDerrick } from '../entities/OilDerrick';
import type { FactionId, PlayerState } from '../types';
import { BUILD_OPTIONS, buildCost } from './ConstructionSystem';
import type { GameSystem } from './GameSystem';

export type SaleResult =
  | { kind: 'sold'; barrels: number; price: number; revenue: number; repaid: number }
  | { kind: 'declined'; reason: string };

export type LoanResult = { kind: 'granted'; amount: number; debt: number } | { kind: 'refused'; reason: string };

/** Smallest stock worth offering to the World Bank (barrels). */
export const MIN_SALE_STOCK = 0.5;

/**
 * The World Bank (Zürich): a neutral, purely financial institution. It runs the oil market and emergency
 * credit automatically and never takes sides.
 *
 * Price — never random: the balance of RegulatedSupply (the one Bank-monitored derrick of every nation that is
 * pumping right now; their oil still belongs to their nations) against Demand (power drain of every structure
 * plus every army). The posted price eases towards that balance every OIL_PRICE_INTERVAL seconds.
 *
 * Credit — a nation at 0 TB may take an emergency loan (DEBT); income from oil sales pays the debt back first.
 */
export class OilMarket implements GameSystem {
  /** Current price and the one before it (TB per barrel). */
  price = OIL_PRICE_START;
  previous = OIL_PRICE_START;
  /** Last measured RegulatedSupply share (0..1) and Demand (demand units), for the UI. */
  supply = 1;
  demand = 0;
  private clock = OIL_PRICE_INTERVAL;
  /** Market time (s) and the times each nation offered oil lately (rate limit). */
  private now = 0;
  private readonly offers = new Map<number, number>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
  ) {}

  /** Seconds until the Bank posts a new price. */
  get secondsToChange(): number {
    return Math.max(0, this.clock);
  }

  update(dt: number): void {
    this.now += dt;
    this.clock -= dt;
    while (this.clock <= 0) {
      this.clock += OIL_PRICE_INTERVAL;
      this.reprice();
    }
  }

  /** Price at which Demand balances RegulatedSupply. */
  balancePrice(): number {
    const live = new Set(this.players.filter((p) => !p.defeated).map((p) => p.id));
    let monitored = 0;
    let pumping = 0;
    let demand = 0;
    for (const b of this.entities.buildings()) {
      if (!b.alive) continue;
      if (b instanceof OilDerrick && b.bankManaged) {
        monitored++;
        if (live.has(b.owner) && b.pumping) pumping++;
      }
      if (live.has(b.owner)) demand += b.spec.powerDrain;
    }
    for (const u of this.entities.units()) if (u.alive && live.has(u.owner)) demand += OIL_DEMAND_PER_SOLDIER;
    for (const v of this.entities.vehicles()) if (v.alive && live.has(v.owner)) demand += OIL_DEMAND_PER_VEHICLE;
    this.supply = monitored > 0 ? pumping / monitored : 0;
    this.demand = demand;
    const ratio = (OIL_DEMAND_BASE + demand) / OIL_DEMAND_BASE / Math.max(OIL_SUPPLY_FLOOR, this.supply);
    return Math.max(OIL_PRICE_MIN, Math.min(OIL_PRICE_MAX, OIL_PRICE_START * ratio));
  }

  private reprice(): void {
    this.previous = this.price;
    const target = this.balancePrice();
    this.price = Math.round(this.price + (target - this.price) * OIL_PRICE_EASE);
  }

  /** Seconds until the nation may sell again (0 when it can sell now): one offer every OIL_SALE_COOLDOWN seconds. */
  waitSeconds(player: PlayerState): number {
    const last = this.offers.get(player.id);
    if (last === undefined) return 0;
    return Math.max(0, Math.ceil(OIL_SALE_COOLDOWN - (this.now - last)));
  }

  /** Barrels the nation could offer right now (everything above the OIL_RESERVE kept in stock). */
  sellable(player: PlayerState): number {
    return Math.max(0, player.oil - OIL_RESERVE);
  }

  /**
   * `player` offers all of its oil. The Bank buys a share of the stock — the cheaper the oil, the larger the share
   * (never more than WB_MAX_SHARE) — and pays barrels × the posted price; any DEBT is paid back first.
   */
  sell(player: PlayerState): SaleResult {
    if (player.defeated) return { kind: 'declined', reason: 'your nation has fallen' };
    const wait = this.waitSeconds(player);
    if (wait > 0) return { kind: 'declined', reason: `one sale every ${OIL_SALE_COOLDOWN} seconds — try again in ${wait} s` };
    const stock = this.sellable(player);
    if (stock < MIN_SALE_STOCK) return { kind: 'declined', reason: `not enough oil to offer (${OIL_RESERVE.toFixed(1)} barrels stay in reserve)` };
    this.offers.set(player.id, this.now);
    const appetite = 1 - (0.6 * this.price) / OIL_PRICE_MAX; // 1 at a price of 0 … 0.4 at the maximum
    const barrels = Math.min(stock, stock * WB_MAX_SHARE * appetite);
    const revenue = Math.round(barrels * this.price);
    player.oil -= barrels;
    const repaid = this.receive(player, revenue);
    return { kind: 'sold', barrels, price: this.price, revenue, repaid };
  }

  /** What the nation could sell to repay the Bank: oil at the posted price + resale value of structures and vehicles. */
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

  /** The most the nation may owe the Bank right now (rounded down to 100 TB). */
  creditLine(player: PlayerState): number {
    return Math.floor((LOAN_TO_VALUE * this.collateral(player)) / 100) * 100;
  }

  /** Size of the next loan: LOAN_SHARE of the line (≥ LOAN_MIN), never past the line. */
  loanSize(player: PlayerState): number {
    const line = this.creditLine(player);
    return Math.max(0, Math.min(line - player.debt, Math.max(LOAN_MIN, Math.round((line * LOAN_SHARE) / 100) * 100)));
  }

  /** Income for `player`: the Bank automatically takes what is owed first. Returns the amount repaid. */
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
