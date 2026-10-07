import { CELL_SIZE, RANK_KILL_MULTIPLES, STEP_PHASE_PER_PX } from '../constants';
import { movesRight } from '../core/IsoView';
import type { Allegiance, WeaponSpec, WorldPoint } from '../types';
import { Entity } from './Entity';

/** A standing order with a building as its target. */
export interface UnitTask {
  type: 'enter' | 'repair' | 'capture';
  buildingId: number;
}

/**
 * Anything that moves around the map under orders: soldiers, vehicles and
 * aircraft. Position is in world px (where it touches the ground); movement
 * follows a list of waypoints with acceleration, braking and a limited turn
 * rate, and notices when it is stuck.
 */
export abstract class Unit extends Entity {
  readonly kind = 'unit' as const;
  /** World px per second on dry land. */
  abstract readonly speed: number;
  /** Body radius (world px): two units never get closer than the sum of their radii. */
  abstract readonly radius: number;
  /** Height of the body's visual centre above the ground (for picking and health bars). */
  abstract readonly bodyHeight: number;
  /** Seconds to reach full speed from a standstill. */
  protected accelTime = 0.14;
  /** Radians per second the heading can turn. */
  protected turnRate = 14;
  /** Must face its direction of travel before it can drive at full speed (tanks, cars). */
  protected turnsToMove = false;

  px: number;
  py: number;
  /** -1 faces left, 1 faces right. */
  facing: 1 | -1 = 1;
  /** Direction of travel in radians (0 = +x, towards the right of the screen). */
  heading = 0.6;
  /** Advances while moving; drives leg swing / track animation. */
  walkPhase = 0;
  /** Set by the game each tick: standing in water. */
  inWater = false;
  /** Set by the game each tick: 1 = open ground, less in woods. */
  terrainFactor = 1;
  /** Parade-ground slot (barracks id + index) until the player gives a move order. */
  parade: { barracks: number; slot: number } | null = null;
  /** Building order in progress (enter / repair / capture). */
  task: UnitTask | null = null;
  /** RA2 order line: flashed for a moment after a player order (green = move, red = attack). */
  orderFlash: { kind: 'move' | 'attack'; at: number; target: Entity | null } | null = null;
  /** Id of the building this person is stationed inside (hidden from the map), or null. */
  private _insideId: number | null = null;
  /** Bumped whenever any unit goes into or comes out of a building / transport (invalidates cached lists). */
  static insideVersion = 0;
  get insideId(): number | null {
    return this._insideId;
  }
  set insideId(id: number | null) {
    if (id !== this._insideId) Unit.insideVersion++;
    this._insideId = id;
  }
  protected path: WorldPoint[] = [];
  /** Where the current order ends (kept so the game can re-plan if the way gets blocked). */
  destination: WorldPoint | null = null;
  /** Set when the unit has been stuck for a while: the game plans a new route. */
  needsRepath = false;
  /** 0..1 share of full speed currently reached. */
  protected speedRatio = 0;
  private stuckFor = 0;
  private lastX: number;
  private lastY: number;

  // ---- combat
  /** Weapon carried, with faction multipliers applied (null = unarmed). */
  weapon: WeaponSpec | null = null;
  /** Seconds until the weapon can fire again. */
  cooldown = 0;

  // ---- experience
  /** Price of this unit (faction cost applied): its kills are measured against it. */
  abstract readonly value: number;
  /** Total price of the enemies this unit has destroyed (units run over and structures count too). */
  killValue = 0;
  /** Soldier / vehicle (transport boarding): entity id of the transport it is walking to, or null. */
  boardTarget: number | null = null;

  /** Veteran ranks: 0 none, then 1–3 chevrons at 3× / 6× / 9× its own price in kills. */
  get rank(): 0 | 1 | 2 | 3 {
    const ratio = this.killValue / Math.max(1, this.value);
    return ratio >= RANK_KILL_MULTIPLES[2] ? 3 : ratio >= RANK_KILL_MULTIPLES[1] ? 2 : ratio >= RANK_KILL_MULTIPLES[0] ? 1 : 0;
  }
  /** Explicit attack order (entity id), cleared when the target dies. */
  attackTarget: number | null = null;
  /** Attack-move destination: fights anything met on the way, then carries on. */
  attackMove: WorldPoint | null = null;
  /** Entity id the unit is currently shooting at (explicit, auto-acquired or retaliation). */
  combatTarget: number | null = null;
  /** Time of the last acquire / chase update (throttling). */
  nextThink = 0;
  /** True while in a fight; used to trigger the battle cry once per engagement. */
  engaged = false;
  /** Currently walking towards a target it chose itself (guard / retaliation / attack order). */
  chasing = false;
  /** Falling back to its own land: enemies may shoot it while in range but never chase it. Cleared on arrival. */
  retreating = false;
  /** Nations that already let this unit go during the current retreat (each is paid the mercy bonus once). */
  sparedBy = new Set<number>();
  /** Units ordered to fall back together share this number: the mercy bonus is paid once per group, not per unit. */
  retreatGroup = 0;

  constructor(owner: number, faction: Allegiance, at: WorldPoint, maxHp: number) {
    super(owner, faction, at.x / CELL_SIZE, at.y / CELL_SIZE, maxHp);
    this.px = at.x;
    this.py = at.y;
    this.lastX = at.x;
    this.lastY = at.y;
  }

  /** Can cross water (special forces, aircraft). */
  get swims(): boolean {
    return false;
  }

  /** In the air right now: ignores terrain and buildings, moves in straight lines. */
  get flies(): boolean {
    return false;
  }

  /** A transport aircraft: never attacks anything. */
  get unarmedTransport(): boolean {
    return false;
  }

  /** An aircraft (even while parked or on the runway): takes air orders. */
  get aircraft(): boolean {
    return false;
  }

  /** Cannot be shoved around (parked or taking off / landing). */
  get fixed(): boolean {
    return false;
  }

  /** May shoot right now. */
  get canFight(): boolean {
    return true;
  }

  get visible(): boolean {
    return this.insideId === null;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  /** Isometric: larger x + y = in front. Compares with Building.depth (cells). */
  get depth(): number {
    return (this.px + this.py) / CELL_SIZE;
  }

  /** Multiplier on `speed` right now (e.g. swimming is slower). */
  protected speedFactor(): number {
    return 1;
  }

  /** Replaces the current orders with a new path (world px waypoints). */
  follow(path: readonly WorldPoint[]): void {
    this.path = [...path];
    this.destination = path.length > 0 ? (path[path.length - 1] ?? null) : null;
    this.stuckFor = 0;
    this.needsRepath = false;
  }

  stop(): void {
    this.path = [];
    this.destination = null;
    this.needsRepath = false;
  }

  /** Remaining waypoints (for drawing the move line and for route checks). */
  waypoints(): readonly WorldPoint[] {
    return this.path;
  }

  override update(dt: number): void {
    const moving = this.path.length > 0;
    this.trackProgress(dt, moving);

    // Accelerate while there is somewhere to go, brake smoothly on the last stretch.
    const goal = this.path[this.path.length - 1];
    const toEnd = goal ? Math.hypot(goal.x - this.px, goal.y - this.py) : 0;
    let target = moving ? 1 : 0;
    if (moving && this.path.length === 1) target = Math.min(1, Math.max(0.3, toEnd / (this.speed * 0.3)));
    if (moving && this.turnsToMove) target *= this.alignment();
    const rate = dt / this.accelTime;
    this.speedRatio += Math.sign(target - this.speedRatio) * Math.min(Math.abs(target - this.speedRatio), rate);

    const total = this.speed * this.speedFactor() * this.terrainFactor * this.speedRatio * dt;
    let budget = total;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      if (!next) break;
      const dx = next.x - this.px;
      const dy = next.y - this.py;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.05) this.turnTowards(Math.atan2(dy, dx), dt);
      if (Math.abs(dx - dy) > 0.05) this.facing = movesRight(dx, dy) ? 1 : -1; // facing is judged on screen
      if (dist <= budget) {
        this.px = next.x;
        this.py = next.y;
        budget -= dist;
        this.path.shift();
      } else {
        this.px += (dx / dist) * budget;
        this.py += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (this.path.length === 0 && moving) this.destination = null;
    this.walkPhase += (total - budget) * STEP_PHASE_PER_PX;
    this.x = this.px / CELL_SIZE;
    this.y = this.py / CELL_SIZE;
  }

  /** Cosine of the angle between the heading and the direction to the next waypoint (0.15..1). */
  private alignment(): number {
    const next = this.path[0];
    if (!next) return 1;
    let diff = Math.atan2(next.y - this.py, next.x - this.px) - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.max(0.15, 1 - Math.abs(diff) / 1.3);
  }

  /**
   * Notices a unit that is not getting anywhere (blocked by others or a new
   * building). Close to its goal it simply counts as arrived; otherwise it
   * asks the game for a new route.
   */
  private trackProgress(dt: number, moving: boolean): void {
    const moved = Math.hypot(this.px - this.lastX, this.py - this.lastY);
    this.lastX = this.px;
    this.lastY = this.py;
    if (!moving || this.speedRatio < 0.5) {
      this.stuckFor = Math.max(0, this.stuckFor - dt);
      return;
    }
    const expected = this.speed * this.terrainFactor * dt;
    this.stuckFor = moved < expected * 0.2 ? this.stuckFor + dt : Math.max(0, this.stuckFor - dt * 2);
    const goal = this.path[this.path.length - 1];
    const toEnd = goal ? Math.hypot(goal.x - this.px, goal.y - this.py) : 0;
    if (this.stuckFor > 0.7 && toEnd < Math.max(7, this.radius * 3)) {
      this.stop(); // good enough: it has crowded in next to its goal
      this.stuckFor = 0;
    } else if (this.stuckFor > 1.6) {
      this.needsRepath = true;
      this.stuckFor = 0;
    }
  }

  /** Eases the heading towards `target` (radians), taking the short way round. */
  private turnTowards(target: number, dt: number): void {
    let diff = target - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = this.turnRate * dt;
    this.heading += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
  }
}
