import { CELL_SIZE, RANK_KILL_MULTIPLES, STEP_PHASE_PER_PX } from '../constants';
import { movesRight } from '../core/IsoView';
import type { Allegiance, WeaponSpec, WorldPoint } from '../types';
import { Entity } from './Entity';

/** Seconds a unit stays blocked (re-routes included) before it gives up and stops. */
const BLOCKED_GIVE_UP = 4;

/** A standing order with a building as its target. */
export interface UnitTask {
  type: 'enter' | 'repair' | 'capture' | 'lease';
  buildingId: number;
}

/**
 * Anything that moves around the map under orders: soldiers, vehicles and
 * aircraft. Position is in world px (where it touches the ground); movement
 * follows a list of waypoints with acceleration, braking and a limited turn
 * rate, and notices when it is stuck.
 */
/** A ground vehicle pointing farther than this (radians) from its next waypoint stops and turns on the spot first. */
const PIVOT_ANGLE = 0.45;

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
  /**
   * Machines (vehicles, aircraft) only ever travel the way their nose points, like RA2 vehicles: a ground vehicle
   * stops and turns on the spot towards its next cell before it rolls, an aircraft banks round in an arc. Soldiers
   * (false) simply step towards the next point.
   */
  protected drivesForward = false;

  px: number;
  py: number;
  /** -1 faces left, 1 faces right. */
  facing: 1 | -1 = 1;
  /** Direction of travel in radians (0 = +x, towards the right of the screen). */
  heading = 0.6;
  /** Heading to turn to once the current path ends (formations); cleared by any new order. */
  faceOnArrival: number | null = null;
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
  /** Seconds spent blocked since it last made real progress (kept across re-routes): too long and it gives up. */
  private blockedFor = 0;
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
  /** World heading to the current combat target (tank turrets track it); meaningful while `combatTarget` is set. */
  aimHeading = 0;
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
  /** Nations this unit has traded fire with → combat time of the last shot. A retreat only protects it from these. */
  fightingWith = new Map<number, number>();
  /** Ground vehicles: where the current chase started (and of whom); the chase is dropped CHASE_LIMIT_CELLS from here. */
  chaseFrom: { x: number; y: number; target: number } | null = null;
  /** Targets this unit gave up chasing → combat time until which it leaves them alone (unless they come into range). */
  ignoreUntil = new Map<number, number>();
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

  /**
   * Bumped by every new route or stop: a route planned in the background (PathService) is only handed over if the
   * unit got no other order meanwhile.
   */
  pathTicket = 0;
  /** Speed share allowed by traffic this tick (queueing behind a slower unit ahead); 1 = free road. */
  crowdFactor = 1;
  /** Seconds it has been waiting at a crossing for another unit to go by. */
  crossingWait = 0;
  /** World px it may walk before it must rest (Infinity: never tires — vehicles, special forces). */
  protected marchLimit = Infinity;
  /** Seconds the rest takes. */
  protected restSeconds = 0;
  /** Seconds standing that count as a rest. */
  protected recoverSeconds = 0;
  /** World px walked since the last rest. */
  marched = 0;
  /** Seconds of rest still to go (it stands still, keeping its orders). */
  restLeft = 0;
  /** Seconds it has stood still (a long enough halt counts as a rest). */
  private stoodFor = 0;

  /** Replaces the current orders with a new path (world px waypoints). */
  follow(path: readonly WorldPoint[], keepFacing = false): void {
    this.pathTicket++;
    this.path = [...path];
    if (!keepFacing) this.faceOnArrival = null;
    this.destination = path.length > 0 ? (path[path.length - 1] ?? null) : null;
    this.stuckFor = 0;
    this.needsRepath = false;
  }

  stop(): void {
    this.pathTicket++;
    this.blockedFor = 0;
    this.path = [];
    this.destination = null;
    this.needsRepath = false;
  }

  /** Remaining waypoints (for drawing the move line and for route checks). */
  waypoints(): readonly WorldPoint[] {
    return this.path;
  }

  override update(dt: number): void {
    // Resting after a long march: it stands where it is, orders kept, and sets off again when rested.
    if (this.restLeft > 0) {
      this.restLeft = Math.max(0, this.restLeft - dt);
      this.speedRatio = 0;
      this.stuckFor = 0;
      this.blockedFor = 0;
      return;
    }
    // A vehicle almost on its final spot does not pivot round and round for the last few pixels (pushed about by
    // its neighbours): it has arrived.
    const end = this.path.length === 1 ? this.path[0] : undefined;
    if (end && this.drivesForward && this.turnsToMove && Math.hypot(end.x - this.px, end.y - this.py) < this.radius * 0.6) {
      this.path.length = 0;
      this.destination = null;
    }
    const moving = this.path.length > 0;
    this.trackProgress(dt, moving);

    // Accelerate while there is somewhere to go, brake smoothly on the last stretch.
    const goal = this.path[this.path.length - 1];
    const toEnd = goal ? Math.hypot(goal.x - this.px, goal.y - this.py) : 0;
    let target = moving ? 1 : 0;
    if (moving && this.path.length === 1) target = Math.min(1, Math.max(0.3, toEnd / (this.speed * 0.3)));
    if (moving && this.drivesForward && this.turnsToMove) target *= this.rollAlignment();
    else if (moving && this.turnsToMove) target *= this.alignment();
    const rate = dt / this.accelTime;
    this.speedRatio += Math.sign(target - this.speedRatio) * Math.min(Math.abs(target - this.speedRatio), rate);

    const total = this.speed * this.speedFactor() * this.terrainFactor * this.crowdFactor * this.speedRatio * dt;
    let budget = total;
    // A machine turns towards its next waypoint even while it stands (pivoting on the spot before it rolls).
    const first = this.path[0];
    if (this.drivesForward && first && budget <= 0 && Math.hypot(first.x - this.px, first.y - this.py) > 0.05) {
      this.turnTowards(Math.atan2(first.y - this.py, first.x - this.px), dt);
    }
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
      } else if (this.drivesForward && !this.insideTurn(dist, Math.atan2(dy, dx))) {
        // Along the nose, never sideways: the hull (or airframe) carries the machine, so it follows its heading
        // and curves onto the route as it turns instead of gliding straight at the point.
        this.px += Math.cos(this.heading) * budget;
        this.py += Math.sin(this.heading) * budget;
        budget = 0;
      } else {
        this.px += (dx / dist) * budget;
        this.py += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (this.path.length === 0 && moving) this.destination = null;
    if (this.path.length === 0 && this.faceOnArrival !== null) {
      this.turnTowards(this.faceOnArrival, dt);
      if (Math.abs(Math.sin(this.heading - this.faceOnArrival)) < 1e-3 && Math.cos(this.heading - this.faceOnArrival) > 0) this.faceOnArrival = null;
    }
    this.walkPhase += (total - budget) * STEP_PHASE_PER_PX;
    this.tire(total - budget, dt);
    this.x = this.px / CELL_SIZE;
    this.y = this.py / CELL_SIZE;
  }

  /** Counts the march: after marchLimit px on foot it halts to rest; a long enough halt rests it as well. */
  private tire(walked: number, dt: number): void {
    if (!Number.isFinite(this.marchLimit)) return;
    if (walked > 0.001) {
      this.stoodFor = 0;
      this.marched += walked;
      if (this.marched >= this.marchLimit && this.path.length > 0) {
        this.marched = 0;
        this.restLeft = this.restSeconds;
      }
      return;
    }
    this.stoodFor += dt;
    if (this.stoodFor >= this.recoverSeconds) this.marched = 0;
  }

  /** Signed angle (radians, -π..π) from the heading to the direction of `bearing`. */
  private turnLeft(bearing: number): number {
    let diff = bearing - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  /**
   * Ground vehicle throttle while turning (RA2): pointing well away from the next waypoint it stops and pivots on the
   * spot; nearly lined up it rolls, slower the more it still has to turn.
   */
  private rollAlignment(): number {
    const next = this.path[0];
    if (!next) return 1;
    const off = Math.abs(this.turnLeft(Math.atan2(next.y - this.py, next.x - this.px)));
    if (off > PIVOT_ANGLE) return 0;
    return 1 - (off / PIVOT_ANGLE) * 0.7;
  }

  /**
   * The waypoint lies inside the circle the machine would have to turn round (too close and too far to the side to
   * reach along the nose): it is steered straight onto it instead of circling it forever.
   */
  private insideTurn(dist: number, bearing: number): boolean {
    // Ground vehicles never need it: they stop and pivot on the spot instead.
    if (this.turnsToMove) return false;
    const off = Math.abs(this.turnLeft(bearing));
    if (off < 0.35) return false;
    const radius = (this.speed * this.speedFactor() * Math.max(0.2, this.speedRatio)) / Math.max(0.1, this.turnRate);
    return dist < radius * 2.2 * Math.sin(Math.min(off, Math.PI / 2));
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
    const expected = this.speed * this.terrainFactor * this.crowdFactor * dt;
    const blocked = moved < expected * 0.2;
    this.stuckFor = blocked ? this.stuckFor + dt : Math.max(0, this.stuckFor - dt * 2);
    this.blockedFor = blocked ? this.blockedFor + dt : Math.max(0, this.blockedFor - dt * 2);
    // Something stands in the way and re-routing did not help: stop where it is instead of pushing on.
    if (this.blockedFor > BLOCKED_GIVE_UP) {
      this.stop();
      this.stuckFor = 0;
      return;
    }
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
