import { CELL_SIZE, NEUTRAL_OWNER, TICK_RATE } from '../constants';
import type { Entity } from '../entities/Entity';
import { Infantry } from '../entities/Infantry';
import type { Unit } from '../entities/Unit';
import { canTarget, isHostile } from '../systems/CombatSystem';
import type { AIHost } from '../systems/AISystem';
import type { PlayerState, WorldPoint } from '../types';
import { FAST_TIER_SECONDS, THROTTLE, type AIMatchStats, type Doctrine } from './AIDoctrine';

/** Squad roles of the AI's combat units (AISystem.army sets them every think). */
export type AIRole = 'strike' | 'raid' | 'hold' | 'guard' | 'defender' | 'station' | 'flak';

/** Roles whose squads focus their fire in the fast tier. */
const FOCUS_ROLES: ReadonlySet<AIRole> = new Set<AIRole>(['strike', 'raid', 'hold', 'guard', 'defender']);
/** Units of one role within this many cells of each other fight as one squad (one focus target). */
const SQUAD_CELLS = 8;

interface OrderRecord {
  at: number;
  key: string;
}

/**
 * Two-tier AI (idea from ys118/ra2web-jev-player): AISystem.think is the slow tier (plans every 1.5 s: economy, squads
 * by role, where each squad goes); this is the fast tier (every FAST_TIER_SECONDS: focus fire), plus the throttle every
 * AI unit order goes through, and the per-match stats for the self-review (AIDoctrine.reviewMatch).
 */
export class AITactics {
  private time = 0;
  private timer = 0;
  private readonly roles = new Map<number, AIRole>();
  private readonly last = new Map<number, OrderRecord>();
  /** Combat units of each AI nation seen alive at the last fast tick (to count losses). */
  private readonly alive = new Map<number, Set<number>>();
  /** Enemy unit id → AI nation focusing it (a kill when it dies). */
  private readonly focus = new Map<number, number>();
  private readonly stats = new Map<number, { lost: number; killed: number; retreats: number }>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly host: AIHost,
    private readonly doctrine: Doctrine,
  ) {
    for (const p of players) this.stats.set(p.id, { lost: 0, killed: 0, retreats: 0 });
  }

  setRoles(roles: ReadonlyMap<number, AIRole>): void {
    for (const [id, r] of roles) this.roles.set(id, r);
  }

  noteRetreat(owner: number): void {
    const s = this.stats.get(owner);
    if (s) s.retreats++;
  }

  /** Running stats (saved with the match, so a continued save keeps counting). */
  exportStats(): Record<number, { lost: number; killed: number; retreats: number }> {
    return Object.fromEntries([...this.stats].map(([id, s]) => [id, { ...s }]));
  }

  restoreStats(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const s = this.stats.get(Number(id));
      const o = v as Record<string, unknown> | null;
      if (!s || !o) continue;
      for (const k of ['lost', 'killed', 'retreats'] as const) if (typeof o[k] === 'number' && Number.isFinite(o[k])) s[k] = o[k] as number;
    }
  }

  /** Stats of every AI nation for the self-review. `survivors`: AI nations still in the game at the end. */
  matchStats(survivors: ReadonlySet<number>): AIMatchStats[] {
    return this.players.map((p) => {
      const s = this.stats.get(p.id) ?? { lost: 0, killed: 0, retreats: 0 };
      return { won: survivors.has(p.id), lost: s.lost, killed: s.killed, retreats: s.retreats };
    });
  }

  /**
   * Order throttle (per unit): no new order within THROTTLE.unitCooldownTicks of the last one; the same order (same
   * kind, same cell / target) not again within THROTTLE.sameOrderSeconds; a unit already busy (moving / attacking) is
   * not sent somewhere else within its role's THROTTLE.roleSeconds. Focus-fire orders skip the role wait. Idle units
   * are never held back by the role wait, so nobody stands about waiting for the throttle.
   */
  private allow(u: Unit, key: string, focus: boolean): boolean {
    const rec = this.last.get(u.id);
    if (rec) {
      const since = this.time - rec.at;
      if (since * TICK_RATE < THROTTLE.unitCooldownTicks) return false;
      if (rec.key === key && since < THROTTLE.sameOrderSeconds) return false;
      if (!focus) {
        const role = this.roles.get(u.id);
        const wait = role ? ((THROTTLE.roleSeconds as Record<string, number>)[role] ?? 0) : 0;
        const busy = u.moving || u.attackTarget !== null || u.attackMove !== null;
        if (busy && since < wait) return false;
      }
    }
    this.last.set(u.id, { at: this.time, key });
    return true;
  }

  /** The host as AISystem sees it: move / attack-move / attack orders pass the throttle first. */
  gatedHost(): AIHost {
    const host = this.host;
    const cell = (p: WorldPoint): string => `${Math.floor(p.x / CELL_SIZE)},${Math.floor(p.y / CELL_SIZE)}`;
    const overrides: Partial<AIHost> = {
      orderMoveUnits: (units, target) => {
        const ok = units.filter((u) => this.allow(u, `mv:${cell(target)}`, false));
        if (ok.length > 0) host.orderMoveUnits(ok, target);
      },
      orderAttackMove: (units, target) => {
        const ok = units.filter((u) => this.allow(u, `am:${cell(target)}`, false));
        if (ok.length > 0) host.orderAttackMove(ok, target);
      },
      orderAttackTarget: (units, target: Entity) => {
        const ok = units.filter((u) => this.allow(u, `at:${target.id}`, true));
        if (ok.length > 0) host.orderAttackTarget(ok, target);
      },
    };
    const bound = new Map<PropertyKey, unknown>();
    return new Proxy(host, {
      get(t, k) {
        if (k in overrides) return (overrides as Record<PropertyKey, unknown>)[k];
        const v = Reflect.get(t, k, t) as unknown;
        if (typeof v !== 'function') return v;
        let f = bound.get(k);
        if (!f) {
          f = (v as (...a: unknown[]) => unknown).bind(t);
          bound.set(k, f);
        }
        return f;
      },
    });
  }

  /** Fast tier. */
  update(dt: number, time: number, rolesOf: (owner: number) => ReadonlyMap<number, AIRole> | undefined): void {
    this.time = time;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = FAST_TIER_SECONDS;
    const movers = this.host.entities.fieldMovers();
    // Kills: focused enemies that died.
    for (const [id, owner] of this.focus) {
      const e = this.host.entities.get(id);
      if (e && e.alive) continue;
      this.focus.delete(id);
      const s = this.stats.get(owner);
      if (s) s.killed++;
    }
    for (const p of this.players) {
      if (p.defeated) continue;
      // Losses: combat units seen last tick that are gone now.
      const now = new Set<number>();
      for (const u of movers) if (u.owner === p.id && u.alive && u.weapon !== null) now.add(u.id);
      const before = this.alive.get(p.id);
      const s = this.stats.get(p.id);
      if (before && s) for (const id of before) if (!now.has(id) && !this.host.entities.get(id)?.alive) s.lost++;
      this.alive.set(p.id, now);
      const roles = rolesOf(p.id);
      if (roles) this.focusFire(p, roles, movers);
    }
    // Forget units that are gone (no unbounded maps).
    if (this.last.size > 4000) {
      for (const id of [...this.last.keys()]) if (!this.host.entities.get(id)?.alive) {
        this.last.delete(id);
        this.roles.delete(id);
      }
    }
  }

  /**
   * Focus fire: each squad (units of one role within SQUAD_CELLS of each other) fires on the enemy unit nearest its
   * centre within doctrine.focusRadiusCells, infantry preferred (distance × doctrine.infantryBias). A unit gets the
   * order only when its target changes.
   */
  private focusFire(p: PlayerState, roles: ReadonlyMap<number, AIRole>, movers: readonly Unit[]): void {
    const mine = movers.filter((u) => {
      const r = roles.get(u.id);
      return u.owner === p.id && u.alive && u.weapon !== null && !u.retreating && r !== undefined && FOCUS_ROLES.has(r);
    });
    if (mine.length === 0) return;
    const first = mine[0]!;
    const enemies = movers.filter((e) => e.alive && e.owner !== p.id && e.owner !== NEUTRAL_OWNER && isHostile(first, e));
    if (enemies.length === 0) return;
    const reach = this.doctrine.focusRadiusCells * CELL_SIZE;
    const squad = SQUAD_CELLS * CELL_SIZE;
    const done = new Set<number>();
    for (const seed of mine) {
      if (done.has(seed.id)) continue;
      const role = roles.get(seed.id);
      const group = mine.filter((u) => !done.has(u.id) && roles.get(u.id) === role && Math.abs(u.px - seed.px) < squad && Math.abs(u.py - seed.py) < squad);
      for (const u of group) done.add(u.id);
      const cx = group.reduce((a, u) => a + u.px, 0) / group.length;
      const cy = group.reduce((a, u) => a + u.py, 0) / group.length;
      let best: Unit | null = null;
      let bestScore = Infinity;
      for (const e of enemies) {
        const dx = e.px - cx;
        const dy = e.py - cy;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;
        const score = d * (e instanceof Infantry ? this.doctrine.infantryBias : 1);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (!best) continue;
      const target = best;
      const shooters = group.filter((u) => u.attackTarget !== target.id && canTarget(u, target));
      if (shooters.length === 0) continue;
      this.focus.set(target.id, p.id);
      // Per unit, only when its target changes (and through the same throttle as every other AI order).
      const ok = shooters.filter((u) => this.allow(u, `at:${target.id}`, true));
      if (ok.length > 0) this.host.orderAttackTarget(ok, target);
    }
  }
}
