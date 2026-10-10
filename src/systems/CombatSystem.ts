import { movesRight } from '../core/IsoView';
import { BOMB_FALL_SECONDS, BUNKER_COOLDOWN, BUNKER_DAMAGE, BUNKER_RANGE, BUNKER_VS_VEHICLE, JET_BOMB_VS_STRUCTURE, JET_BOMB_VS_VEHICLE, ACQUIRE_PERIOD, RANK_FIREPOWER, RANK_RELOAD, BOMB_GROUP_RADIUS_CELLS, BOMB_GROUP_SIZE, BOMB_TOUGH_DAMAGE, BOMB_TOUGH_STRUCTURES, BOMBS_PER_DROP, CELL_SIZE, CHASE_GIVE_UP_SECONDS, CHASE_LIMIT_CELLS, CHASE_PERIOD, FIGHT_MEMORY_SECONDS, GUARD_VISION_FACTOR, NEUTRAL_OWNER, RETALIATE_RANGE_FACTOR, WEAPONS } from '../constants';
import { Building } from '../entities/Building';
import { Bunker } from '../entities/Bunker';
import type { Entity } from '../entities/Entity';
import type { EntityManager } from '../entities/EntityManager';
import { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import type { Pathfinder } from '../map/Pathfinder';
import type { WeaponSpec, WorldPoint } from '../types';
import type { GameSystem } from './GameSystem';

export interface CombatHooks {
  /** A shot was fired: draw tracers and play the sound. `impact` is where it lands (world px). */
  onFire(shooter: Unit, target: Entity, weapon: WeaponSpec, impact: WorldPoint): void;
  /** A bunker's machine gun fired at `target`: tracer and muzzle flash. */
  onBunkerFire(bunker: Bunker, target: Unit): void;
  /** An entity ran out of health: remove it and show the explosion. */
  onDeath(entity: Entity, killer: Entity | undefined): void;
  /** `nation` let the retreating `fugitive` go instead of chasing it (once per nation per retreat). */
  onSpare(nation: number, fugitive: Unit): void;
  /** Is (x, y) inside a safe zone of the Global Financial Center? Nobody fights there. */
  safeAt(x: number, y: number): boolean;
  /** Structure that may not be attacked right now (the player's derricks during their grace period). */
  shielded(target: Entity): boolean;
}

/** Two entities are enemies when they belong to different nations (neutral ones are never targets). */
export function isHostile(a: Entity, b: Entity): boolean {
  // An engineer on his way to lease a derrick is a customer, not a target, for the derrick's owner.
  if (b instanceof Unit && b.task?.type === 'lease' && b.task.lessor === a.owner) return false;
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
/** Longest weapon range in the game (world px, before faction multipliers), with room for them. */
const MAX_WEAPON_RANGE = Math.max(...Object.values(WEAPONS).map((w) => w.range)) * 1.5;
/** A retreating unit's group (one order = one group), or the unit alone. */
const retreatKey = (u: Unit): string => (u.retreatGroup > 0 ? `g${u.retreatGroup}` : `u${u.id}`);

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
  private readonly grid = new Map<number, Unit[]>();
  private readonly pool: Unit[][] = [];
  /**
   * Retreating groups still caught among a nation's units this tick, as `group:nation` keys: at least one member of the
   * group stands within weapon range of one of that nation's units. Rebuilt every tick (see markEntangled).
   */
  private readonly entangled = new Set<string>();
  /** Bomb hits still falling: each lands (deals its damage) at `at` — a bomber's stick, or one fighter bomb. Plain data (saved games). */
  private readonly falling: { at: number; kind: 'stick' | 'jet'; shooter: Vehicle; target: Entity; impact: WorldPoint }[] = [];

  constructor(
    private readonly entities: EntityManager,
    private readonly pathfinder: Pathfinder,
    private readonly hooks: CombatHooks,
  ) {}

  update(dt: number): void {
    this.time += dt;
    if (this.falling.length > 0) {
      const due = this.falling.filter((f) => f.at <= this.time);
      if (due.length > 0) {
        this.falling.splice(0, this.falling.length, ...this.falling.filter((f) => f.at > this.time));
        for (const f of due) this.land(f);
      }
    }
    const movers = this.entities.fieldMovers();
    // Spatial hash reused every tick: emptied bucket arrays go back to a pool instead of becoming garbage.
    const grid = this.grid;
    for (const list of grid.values()) {
      list.length = 0;
      this.pool.push(list);
    }
    grid.clear();
    const key = (cx: number, cy: number): number => cx * 100003 + cy;
    for (const u of movers) {
      if (!u.alive) continue;
      const k = key(Math.floor(u.px / HASH), Math.floor(u.py / HASH));
      const list = grid.get(k);
      if (list) list.push(u);
      else {
        const fresh = this.pool.pop() ?? [];
        fresh.push(u);
        grid.set(k, fresh);
      }
    }
    this.markEntangled(movers, grid, key);
    for (const s of movers) {
      if (!s.alive) continue;
      s.cooldown = Math.max(0, s.cooldown - dt);
      if (s.weapon && s.canFight) this.think(s, grid);
    }
    this.bunkers(dt, grid, key);
    this.reap();
  }

  // ------------------------------------------------------------------ bunkers

  /** Self-firing bunkers: each shoots the nearest enemy soldier or ground vehicle in range (never aircraft). */
  private bunkers(dt: number, grid: Map<number, Unit[]>, key: (cx: number, cy: number) => number): void {
    for (const b of this.entities.buildings()) {
      if (!(b instanceof Bunker) || !b.alive || b.owner === NEUTRAL_OWNER) continue;
      b.cooldown = Math.max(0, b.cooldown - dt);
      b.firing = Math.max(0, b.firing - dt);
      if (b.cooldown > 0) continue;
      const c = b.centerWorld();
      if (this.hooks.safeAt(c.x, c.y)) continue;
      const f = b.footprintWorld();
      let best: Unit | undefined;
      let bestD = Infinity;
      const r = Math.ceil((BUNKER_RANGE + f.w) / HASH);
      const hx = Math.floor(c.x / HASH);
      const hy = Math.floor(c.y / HASH);
      for (let gy = hy - r; gy <= hy + r; gy++) {
        for (let gx = hx - r; gx <= hx + r; gx++) {
          for (const o of grid.get(key(gx, gy)) ?? []) {
            if (o.flies || !isHostile(b, o) || this.sheltered(o)) continue;
            // Range is measured from the bunker's edge.
            const d = Math.hypot(Math.max(f.x - o.px, 0, o.px - (f.x + f.w)), Math.max(f.y - o.py, 0, o.py - (f.y + f.h)));
            if (d <= BUNKER_RANGE && d < bestD) {
              bestD = d;
              best = o;
            }
          }
        }
      }
      if (!best) continue;
      b.cooldown = BUNKER_COOLDOWN;
      b.firing = 0.3;
      best.damage(BUNKER_DAMAGE * (best instanceof Vehicle ? BUNKER_VS_VEHICLE : 1));
      best.lastAttackerId = b.id;
      best.lastAttackedAt = this.time;
      best.fightingWith.set(b.owner, this.time);
      this.hooks.onBunkerFire(b, best);
    }
  }

  // ------------------------------------------------------------------ per-unit logic

  private think(s: Unit, grid: Map<number, Unit[]>): void {
    const w = s.weapon;
    if (!w) return;
    // Out of bombs: a bomber is done and flies home at once to rearm; a fighter sent against a structure (which
    // only bombs can hit) does the same, otherwise it keeps fighting with its guns.
    const bombingOrder = s.attackTarget !== null && this.entities.get(s.attackTarget) instanceof Building;
    if (s instanceof Vehicle && s.maxBombs > 0 && s.bombs <= 0 && (s.type === 'bomber' || bombingOrder)) {
      if (s.flies && !s.returningHome) {
        s.combatTarget = null;
        s.attackTarget = null;
        s.attackMove = null;
        s.engaged = false;
        s.stop();
        s.returningHome = true; // even while selected it does not wait for orders
        s.idleFor = Number.POSITIVE_INFINITY;
      }
      return;
    }
    // Safe zone: units inside it never fight.
    if (this.hooks.safeAt(s.px, s.py)) {
      s.combatTarget = null;
      s.attackTarget = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }
    if (!s.moving) {
      s.chasing = false;
      s.retreating = false;
    }
    let target = this.currentTarget(s);

    // Explicit attack order beats everything else.
    if (s.attackTarget !== null) {
      const ordered = this.entities.get(s.attackTarget);
      if (!ordered || !ordered.alive || !isHostile(s, ordered) || !this.canHit(s, w, ordered) || this.sheltered(ordered)) s.attackTarget = null;
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
    // A transport's escorting tanker is shot down first, while it is close enough to be hit (not when the transport
    // itself is the locked target of an explicit order: a locked target is the only one attacked).
    const tankerId = (target as { tankerId?: number | null } | undefined)?.tankerId;
    if (target && tankerId != null && s.attackTarget === null) {
      const tanker = this.entities.get(tankerId);
      if (tanker && tanker.alive && isHostile(s, tanker) && this.canHit(s, w, tanker) && !this.sheltered(tanker) && distanceTo(s.px, s.py, tanker) <= w.range * GUARD_VISION_FACTOR)
        target = tanker;
    }
    s.combatTarget = target?.id ?? null;

    if (!target) {
      // Back home (or stopped) with nobody to fight: the next chase measures from here.
      if (!s.moving) s.chaseFrom = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }

    const d = distanceTo(s.px, s.py, target);
    // A retreating enemy may be shot while in range, but never chased.
    if (target instanceof Unit && this.protectedFrom(s, target) && d > w.range) {
      if (!target.sparedBy.has(s.owner)) {
        target.sparedBy.add(s.owner);
        this.hooks.onSpare(s.owner, target);
      }
      if (s.attackTarget === target.id) s.attackTarget = null;
      s.combatTarget = null;
      s.engaged = false;
      this.resumeAttackMove(s);
      return;
    }
    const tx = target instanceof Unit ? target.px : target instanceof Building ? target.centerWorld().x : s.px;
    const ty = target instanceof Unit ? target.py : target instanceof Building ? target.centerWorld().y : s.py;
    s.aimHeading = Math.atan2(ty - s.py, tx - s.px);
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
    if (!e || !e.alive || !isHostile(s, e) || !s.weapon || !this.canHit(s, s.weapon, e)) return undefined;
    if (e instanceof Unit && !e.visible) return undefined;
    if (this.sheltered(e)) return undefined;
    return e;
  }

  /** A unit standing (or flying) inside a safe zone may not be attacked. */
  private sheltered(e: Entity): boolean {
    if (e instanceof Unit) return this.hooks.safeAt(e.px, e.py);
    return this.hooks.shielded(e);
  }

  private canHit(s: Unit, _w: WeaponSpec, t: Entity): boolean {
    // Aircraft hit structures only with bombs; a fighter fights every other unit with its guns.
    if (s instanceof Vehicle && s.type === 'jet' && t instanceof Building && s.bombs <= 0) return false;
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
        const cell = grid.get((cx + dx) * 100003 + cy + dy);
        if (!cell) continue;
        for (const o of cell) {
          if (!isHostile(s, o) || !this.canHit(s, w, o)) continue;
          const d = Math.hypot(o.px - s.px, o.py - s.py);
          if ((this.protectedFrom(s, o) && d > w.range) || this.sheltered(o)) continue;
          if (d > w.range && (s.ignoreUntil.get(o.id) ?? 0) > this.time) continue;
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
      if (a && a.alive && isHostile(s, a) && this.canHit(s, w, a) && !this.sheltered(a) && (s.ignoreUntil.get(a.id) ?? 0) <= this.time && distanceTo(s.px, s.py, a) < w.range * RETALIATE_RANGE_FACTOR) return a;
    }
    return undefined;
  }

  /**
   * Does `s` have to let the retreating `o` go (shoot only while in range, never chase)? Only for nations `o` was
   * fighting: a nation that stayed out of that fight may attack a retreating unit passing by like any other enemy.
   */
  private protectedFrom(s: Unit, o: Unit): boolean {
    if (!o.retreating) return false;
    const at = o.fightingWith.get(s.owner);
    if (at === undefined || this.time - at > FIGHT_MEMORY_SECONDS) return false;
    // Still caught among that nation's units: while any unit of the retreating group is within weapon range of one of
    // them, the whole group may be fought (and chased) by that nation. The retreat protects it only once every unit of
    // the group is out of that nation's range.
    return !this.entangled.has(`${retreatKey(o)}:${s.owner}`);
  }

  /** Finds the retreating groups still within weapon range of some unit of each hostile nation (see `entangled`). */
  private markEntangled(movers: readonly Unit[], grid: Map<number, Unit[]>, key: (cx: number, cy: number) => number): void {
    this.entangled.clear();
    const reach = Math.ceil(MAX_WEAPON_RANGE / HASH);
    for (const o of movers) {
      if (!o.alive || !o.retreating || this.sheltered(o)) continue;
      const cx = Math.floor(o.px / HASH);
      const cy = Math.floor(o.py / HASH);
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        for (let gy = cy - reach; gy <= cy + reach; gy++) {
          for (const m of grid.get(key(gx, gy)) ?? []) {
            const w = m.weapon;
            if (!w || !m.alive || !m.canFight || !isHostile(m, o) || !this.canHit(m, w, o)) continue;
            if (Math.hypot(m.px - o.px, m.py - o.py) <= w.range) this.entangled.add(`${retreatKey(o)}:${m.owner}`);
          }
        }
      }
    }
  }

  /**
   * A bomber's drop (BOMBS_PER_DROP bombs): a structure is destroyed outright (cities and airfields lose
   * BOMB_TOUGH_DAMAGE of their max health instead); on troops the whole group around the impact is hit — a group
   * smaller than BOMB_GROUP_SIZE is wiped out, a bigger one loses a third (nearest the impact first).
   */
  private dropBombs(s: Vehicle, t: Entity, impact: WorldPoint): void {
    s.bombs = Math.max(0, s.bombs - BOMBS_PER_DROP); // the last bomb is dropped alone
    // Nothing is hit until the bombs reach the ground and explode.
    this.falling.push({ at: this.time + BOMB_FALL_SECONDS, kind: 'stick', shooter: s, target: t, impact });
  }

  /** A falling bomb reaches the ground. */
  private land(f: { kind: 'stick' | 'jet'; shooter: Vehicle; target: Entity; impact: WorldPoint }): void {
    const { shooter: s, target: t } = f;
    if (!s || !t) return; // (a saved game whose bomber or target no longer exists)
    if (f.kind === 'stick') {
      this.bombsLand(s, t, f.impact);
      return;
    }
    if (!t.alive) return;
    t.damage(t instanceof Building ? t.maxHp * JET_BOMB_VS_STRUCTURE : t instanceof Vehicle ? t.maxHp * JET_BOMB_VS_VEHICLE : Infinity); // a soldier: dead, veteran or not
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
  }

  /** The bomber's stick explodes: a structure is flattened (tough ones lose half), or the troops round the impact die. */
  private bombsLand(s: Vehicle, t: Entity, impact: WorldPoint): void {
    const hit = (o: Entity, amount: number): void => {
      if (!o.alive) return;
      o.damage(amount);
      o.lastAttackerId = s.id;
      o.lastAttackedAt = this.time;
    };
    if (t instanceof Building) {
      hit(t, BOMB_TOUGH_STRUCTURES.includes(t.spec.type) ? t.maxHp * BOMB_TOUGH_DAMAGE : t.hp);
      return;
    }
    const at = t instanceof Unit ? { x: t.px, y: t.py } : impact;
    const group = this.entities
      .fieldMovers()
      .filter((o) => o.alive && !o.flies && isHostile(s, o) && !this.sheltered(o) && Math.hypot(o.px - at.x, o.py - at.y) <= BOMB_GROUP_RADIUS_CELLS * CELL_SIZE)
      .sort((a, b) => Math.hypot(a.px - at.x, a.py - at.y) - Math.hypot(b.px - at.x, b.py - at.y));
    const dead = group.length < BOMB_GROUP_SIZE ? group.length : Math.round(group.length / 3);
    for (const o of group.slice(0, dead)) hit(o, Infinity);
  }

  private fire(s: Unit, t: Entity, w: WeaponSpec): void {
    s.cooldown = w.cooldown * RANK_RELOAD[s.rank];
    s.fightingWith.set(t.owner, this.time);
    if (t instanceof Unit) t.fightingWith.set(s.owner, this.time);
    const impact = this.impactPoint(t);
    if (s instanceof Vehicle && s.type === 'bomber') {
      this.dropBombs(s, t, impact);
      s.engaged = true;
      this.hooks.onFire(s, t, w, impact);
      return;
    }
    if (s instanceof Vehicle && s.type === 'jet' && s.bombs > 0 && !(t instanceof Unit && t.flies)) {
      // Fighter on a ground target with a bomb left: a tenth of a structure, 60% of a vehicle, a soldier dead.
      // (Aircraft, and ground units once the bombs are gone, get the guns below.)
      s.bombs--;
      // The damage lands when the bomb explodes, BOMB_FALL_SECONDS after release.
      this.falling.push({ at: this.time + BOMB_FALL_SECONDS, kind: 'jet', shooter: s, target: t, impact });
      s.engaged = true;
      this.hooks.onFire(s, t, { ...w, kind: 'bomb' }, impact);
      return;
    }
    const dmg = w.damage * RANK_FIREPOWER[s.rank] * (t instanceof Building ? w.vsBuilding : 1);
    t.damage(dmg);
    t.lastAttackerId = s.id;
    t.lastAttackedAt = this.time;
    if (w.splash > 0) {
      for (const o of this.entities.fieldMovers()) {
        if (o === t || !isHostile(s, o) || !this.canHit(s, w, o) || this.sheltered(o)) continue;
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
    // Ground vehicles never hunt a fleeing enemy far: CHASE_LIMIT_CELLS from where the chase began they give up and
    // head back there on their own (an explicit order to attack that target is exempt).
    if (s instanceof Vehicle && !s.aircraft && s.attackTarget === null) {
      // The spot is kept while it switches from one target to the next: the limit counts from where the fighting began.
      if (!s.chaseFrom) s.chaseFrom = { x: s.px, y: s.py, target: t.id };
      const from = s.chaseFrom;
      if (Math.hypot(s.px - from.x, s.py - from.y) > CHASE_LIMIT_CELLS * CELL_SIZE) {
        s.ignoreUntil.set(t.id, this.time + CHASE_GIVE_UP_SECONDS);
        s.chaseFrom = null;
        s.combatTarget = null;
        s.engaged = false;
        s.chasing = false;
        const back = this.pathfinder.nearestPassable(Math.floor(from.x / CELL_SIZE), Math.floor(from.y / CELL_SIZE), 6, undefined, s.swims);
        if (back) s.follow(this.pathfinder.find({ x: s.px, y: s.py }, back, s.swims));
        else s.stop();
        return;
      }
    }
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
