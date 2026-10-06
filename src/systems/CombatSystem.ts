import { movesRight } from '../core/IsoView';
import { ACQUIRE_PERIOD, CELL_SIZE, CHASE_PERIOD, GUARD_VISION_FACTOR, NEUTRAL_OWNER, RETALIATE_RANGE_FACTOR } from '../constants';
import { Building } from '../entities/Building';
import type { Entity } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Unit } from '../entities/Unit';
import type { Pathfinder } from '../map/Pathfinder';
import type { WeaponSpec, WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

export interface CombatHooks {
  /** A shot was fired: draw tracers and play the sound. `impact` is where it lands (world px). */
  onFire(shooter: Unit, target: Entity, weapon: WeaponSpec, impact: WorldPoint): void;
  /** An entity ran out of health: remove it and show the explosion. */
  onDeath(entity: Entity, killer: Entity | undefined): void;
}

/** Two entities are enemies when they belong to different nations (neutral ones are never targets). */
export function isHostile(a: Entity, b: Entity): boolean {
  return a.owner !== b.owner && a.owner !== NEUTRAL_OWNER && b.owner !== NEUTRAL_OWNER && !b.indestructible && b.alive;
}

/**
 * Can `shooter` hurt `target` at all? Aircraft in flight can only be hit by other aircraft
 * (with a weapon that reaches the air); soldiers and ground vehicles never shoot at them.
 */
export function canTarget(shooter: Unit, target: Entity): boolean {
  const w = shooter.weapon;
  if (!w || !isHostile(shooter, target)) return false;
  if (shooter.unarmedTransport) return false; // transports never attack anything
  if (target instanceof Unit && target.flies) return shooter.aircraft && w.hitsAir;
  return true;
}

/** Distance (world px) from point (x, y) to an entity (to the nearest edge for buildings). */
export function distanceTo(x: number, y: number, e: Entity): number {
  if (e instanceof Building) {
    const f = e.footprintWorld();
    return Math.hypot(Math.max(f.x - x, 0, x - (f.x + f.w)), Math.max(f.y - y, 0, y - (f.y + f.h)));
  }
  if (e instanceof Unit) return Math.hypot(e.px - x, e.py - y);
  return Infinity;
}

const HASH = 48;

/**
 * Fighting: every armed unit shoots the nearest enemy in range (soldiers,
 * vehicles and aircraft — never structures on their own), hits back at attackers, obeys
 * explicit attack orders and attack-move, and chases when ordered to.
 * Damage, splash and kills are resolved here; effects/sound/removal are
 * delegated to `hooks`.
 */
export class CombatSystem implements GameSystem {
  private time = 0;
  private readonly chaseAt = new Map<number, number>();

  constructor(
    private readonly entities: EntityManager,
    private readonly pathfinder: Pathfinder,
    private readonly hooks: CombatHooks,
  ) {}

  update(dt: number): void {
    this.time += dt;
    const movers = this.entities.fieldMovers();
    const grid = new Map<number, Unit[]>();
    const key = (cx: number, cy: number): number => cx * 100003 + cy;
    for (const u of movers) {
      if (!u.alive) continue;
      const k = key(Math.floor(u.px / HASH), Math.floor(u.py / HASH));
      const list = grid.get(k);
      if (list) list.push(u);
      else grid.set(k, [u]);
    }
    for (const s of movers) {
      if (!s.alive) continue;
      s.cooldown = Math.max(0, s.cooldown - dt);
      if (s.weapon && s.canFight) this.think(s, grid);
    }
    this.reap();
  }

  // ------------------------------------------------------------------ per-unit logic

  private think(s: Unit, grid: Map<number, Unit[]>): void {
    const w = s.weapon;
    if (!w) return;
    if (!s.moving) s.chasing = false;
    let target = this.currentTarget(s);

    // Explicit attack order beats everything else.
    if (s.attackTarget !== null) {
      const ordered = this.entities.get(s.attackTarget);
      if (!ordered || !ordered.alive || !isHostile(s, ordered) || !this.canHit(s, w, ordered)) s.attackTarget = null;
      else target = ordered;
    }

    // Auto targets are dropped when they walk too far away.
    if (target && s.attackTarget === null && distanceTo(s.px, s.py, target) > w.range * GUARD_VISION_FACTOR * 1.25) target = undefined;

    if (!target && this.time >= s.nextThink) {
      target = this.acquire(s, w, grid);
      s.nextThink = this.time + ACQUIRE_PERIOD + (s.id % 4) * 0.04;
    }
    // Busy with a building but an enemy soldier / vehicle shows up: deal with that first.
    if (target instanceof Building && s.attackTarget === null && this.time >= s.nextThink) {
      const better = this.acquire(s, w, grid);
      s.nextThink = this.time + ACQUIRE_PERIOD + (s.id % 4) * 0.04;
      if (better) target = better;
    }
    s.combatTarget = target?.id ?? null;

    if (!target) {
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }

    const d = distanceTo(s.px, s.py, target);
    const tx = target instanceof Unit ? target.px : target instanceof Building ? target.centerWorld().x : s.px;
    const ty = target instanceof Unit ? target.py : target instanceof Building ? target.centerWorld().y : s.py;
    if (d <= w.range) {
      s.facing = movesRight(tx - s.px, ty - s.py) ? 1 : -1;
      s.heading = Math.atan2(ty - s.py, tx - s.px);
      // Units on attack orders stand and fight; ones just passing through keep walking and shooting.
      if (s.attackTarget !== null || s.attackMove) s.stop();
      if (s.cooldown <= 0 && this.canHit(s, w, target)) this.fire(s, target, w);
      return;
    }

    // Idle units, attack-movers, attack orders and retaliators move in; units on a plain move order keep walking.
    const mayChase = s.chasing || !s.moving || s.attackTarget !== null || s.attackMove !== null;
    if (mayChase) this.chase(s, target, w);
  }

  private currentTarget(s: Unit): Entity | undefined {
    if (s.combatTarget === null) return undefined;
    const e = this.entities.get(s.combatTarget);
    if (!e || !e.alive || !isHostile(s, e) || !canTarget(s, e)) return undefined;
    if (e instanceof Unit && !e.visible) return undefined;
    return e;
  }

  private canHit(s: Unit, _w: WeaponSpec, t: Entity): boolean {
    return canTarget(s, t);
  }

  /**
   * Nearest enemy soldier, vehicle or aircraft in sight; an attacker that hit us counts too. Structures are never
   * picked here: a unit only attacks a building when it has been ordered to focus on it (attackTarget).
   */
  private acquire(s: Unit, w: WeaponSpec, grid: Map<number, Unit[]>): Entity | undefined {
    const cx = Math.floor(s.px / HASH);
    const cy = Math.floor(s.py / HASH);
    const reach = Math.ceil((w.range * GUARD_VISION_FACTOR) / HASH);
    let best: Entity | undefined;
    let bestD = w.range * GUARD_VISION_FACTOR;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (const o of grid.get((cx + dx) * 100003 + cy + dy) ?? []) {
          if (!isHostile(s, o) || !this.canHit(s, w, o)) continue;
          const d = Math.hypot(o.px - s.px, o.py - s.py);
          if (d < bestD) {
            best = o;
            bestD = d;
          }
        }
      }
    }
    if (best) return best;
    // Hit back at whoever shot us recently, even from beyond our range.
    if (s.lastAttackerId !== null && this.time - s.lastAttackedAt < 6) {
      const a = this.entities.get(s.lastAttackerId);
      if (a && a.alive && isHostile(s, a) && this.canHit(s, w, a) && distanceTo(s.px, s.py, a) < w.range * RETALIATE_RANGE_FACTOR) return a;
    }
    return undefined;
  }

  private fire(s: Unit, t: Entity, w: WeaponSpec): void {
    s.cooldown = w.cooldown;
    const impact = this.impactPoint(t);
    const dmg = w.damage * (t instanceof Building ? w.vsBuilding : 1);
    t.damage(dmg);
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
    if (w.splash > 0) {
      for (const o of this.entities.fieldMovers()) {
        if (o === t || !isHostile(s, o) || !this.canHit(s, w, o)) continue;
        if (Math.hypot(o.px - impact.x, o.py - impact.y) <= w.splash) {
          o.damage(dmg * 0.5);
          o.lastAttackerId = s.id;
          o.lastAttackedAt = this.time;
        }
      }
    }
    s.engaged = true;
    this.hooks.onFire(s, t, w, impact);
  }

  private impactPoint(t: Entity): WorldPoint {
    if (t instanceof Unit) return { x: t.px, y: t.py - t.bodyHeight * 0.6 };
    if (t instanceof Building) {
      const c = t.centerWorld();
      return { x: c.x + ((t.id * 7) % 9) - 4, y: c.y - 6 };
    }
    return { x: 0, y: 0 };
  }

  /** Walks (or flies) towards the target until it is in range. */
  private chase(s: Unit, t: Entity, w: WeaponSpec): void {
    if ((this.chaseAt.get(s.id) ?? 0) > this.time) return;
    this.chaseAt.set(s.id, this.time + CHASE_PERIOD);
    s.chasing = true;
    const target = t instanceof Unit ? { x: t.px, y: t.py } : t instanceof Building ? t.centerWorld() : null;
    if (!target) return;
    if (s.aircraft) {
      const dx = target.x - s.px;
      const dy = target.y - s.py;
      const d = Math.hypot(dx, dy) || 1;
      const stop = Math.max(0, d - w.range * 0.7);
      s.follow([{ x: s.px + (dx / d) * stop, y: s.py + (dy / d) * stop }]);
      return;
    }
    // Nearest standable cell to a point just inside weapon range of the target.
    const cell = this.pathfinder.nearestPassable(Math.floor(target.x / CELL_SIZE), Math.floor(target.y / CELL_SIZE), 12, undefined, s.swims);
    if (!cell) return;
    s.follow(this.pathfinder.find({ x: s.px, y: s.py }, cell, s.swims));
  }

  /** After a fight, an attack-moving unit carries on to its destination. */
  private resumeAttackMove(s: Unit): void {
    const dest = s.attackMove;
    if (!dest || s.moving) return;
    if (Math.hypot(dest.x - s.px, dest.y - s.py) < CELL_SIZE * 2) {
      s.attackMove = null;
      return;
    }
    if (s.aircraft) {
      s.follow([dest]);
      return;
    }
    const cell = this.pathfinder.nearestPassable(Math.floor(dest.x / CELL_SIZE), Math.floor(dest.y / CELL_SIZE), 10, undefined, s.swims);
    if (!cell) {
      s.attackMove = null;
      return;
    }
    s.follow(this.pathfinder.find({ x: s.px, y: s.py }, cell, s.swims));
  }

  /** Housekeeping: forgets chase timers that have run out or belong to units that no longer exist. */
  sweep(): void {
    for (const [id, until] of [...this.chaseAt]) {
      if (until <= this.time || !this.entities.get(id)) this.chaseAt.delete(id);
    }
  }

  /** Removes everything that ran out of health. */
  private reap(): void {
    const dead: Entity[] = [];
    for (const e of this.entities.all()) if (!e.alive) dead.push(e);
    for (const e of dead) {
      const killer = e.lastAttackerId !== null ? this.entities.get(e.lastAttackerId) : undefined;
      this.hooks.onDeath(e, killer);
    }
  }
}
