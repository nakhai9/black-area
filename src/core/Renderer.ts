import { demoActive } from './Demo';
import { ChevronDown } from 'lucide';
import { BUILD_RISE_SECONDS, CELL_SIZE, CRUISE_ALTITUDE, ISO_X, ISO_Y } from '../constants';
import { blitUnit, unitSprite } from '../render/UnitSprites';
import type { Building } from '../entities/Building';
import { Infantry } from '../entities/Infantry';
import type { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import { SQUASH, drawVehicle } from '../render/VehicleArt';
import { isoHeading, worldToIso } from './IsoView';
import type { Effect } from './Effects';
import { drawSoldier, drawSoldierDeath, drawsOwnSwim, drawsSquad } from '../render/InfantryArt';
import { drawCarriedFlag } from '../render/Flags';
import { drawAircraftSheet } from '../render/AircraftSheets';
import { drawFlagOnPole, drawNationalPole } from '../render/Flags';
import { drawRepairDeath, drawRepairSheet } from '../render/RepairSheets';
import { drawTruckDeath, drawTruckSheet } from '../render/TruckSheets';
import { drawTankDeath, drawTankSheet } from '../render/TankSheets';
import { FACTIONS, teamColors } from '../factions';
import type { TerrainRenderer } from '../map/TerrainRenderer';
import { createCanvas, get2d } from '../render/Canvas';
import { withAlpha } from '../render/Color';
import { IsoPainter } from '../render/IsoPainter';
import type { Sprite, SpriteCache } from '../render/SpriteCache';
import type { FactionId, Rect } from '../types';
import type { Camera } from './Camera';
import { drawBombBlast, drawBombFall } from '../render/BombSheets';
import { drawMissile, drawMissileBlast } from '../render/MissileSheet';
import { drawShell, drawShellImpact } from '../render/ShellSheet';
import { drawBullet, drawBulletImpact } from '../render/BulletSheet';
import { drawCharge, drawDemolitionBlast } from '../render/DemolitionArt';

/** Structure being positioned by the player (cells), with its legality. */
export interface PlacementGhost {
  readonly spriteKey: string;
  readonly faction: FactionId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  /** Turned 90°: the art is drawn mirrored. */
  readonly mirrored: boolean;
  readonly ok: boolean;
  readonly reason: string | null;
}

/** An enemy the player's army is fighting. `strong` = targeted by a selected unit or under the cursor. */
export interface FocusTarget {
  readonly entity: Unit | Building;
  readonly strong: boolean;
  /** One of my combat units is actually attacking it (not only the cursor aiming at it). */
  readonly engaged?: boolean;
  /** One of my aircraft has locked onto it (air unit or structure): drawn with the targeting-pod reticle. */
  readonly airLock?: boolean;
}

export interface RenderScene {
  readonly buildings: readonly Building[];
  readonly selectedId: number | null;
  readonly hoveredId: number | null;
  /** Screen-space drag rectangle (box selection), if any. */
  readonly selectionRect: Rect | null;
  readonly time: number;
  /** Placement preview while positioning a finished structure. */
  readonly ghost?: PlacementGhost | null;
  /** World rects where the player may build (shown while placing). */
  readonly buildZones?: readonly Rect[];
  /** Green safe zones of the Global Financial Center (world px). */
  readonly safeZones?: readonly Rect[];
  readonly units?: readonly Unit[];
  /** Tracers, flashes, explosions and smoke. */
  readonly effects?: readonly Effect[];
  readonly selectedUnits?: ReadonlySet<number>;
  readonly hoveredUnitId?: number | null;
  /** Enemies that are being attacked (or are about to be, under the cursor): drawn with red focus marks. */
  readonly focus?: readonly FocusTarget[];
  /** Last move order (world px) and when it was given, for the RA2-style marker. */
  readonly moveMarker?: { x: number; y: number; at: number } | null;
  /** A right-clicked moving unit whose line to its destination is shown even when it is not selected. */
  readonly pathPeekId?: number | null;
  /** Waypoint mode: the route being plotted (first point = the selection, then the clicked points). */
  readonly waypointPlan?: readonly { x: number; y: number }[] | null;
  /** Selected Squatters teams standing still: a "Double-click / F: plant flag" hint above their heads. */
  readonly flagHints?: ReadonlySet<number>;
}


const HEALTH_PIPS = 24;

/** Where a bomber's bomb bars sit (iso px): a row centred just above the airframe. */
function bombRow(v: Vehicle): { x0: number; y: number; bar: number; gap: number; h: number } {
  const P = worldToIso(v.px, v.py);
  const bar = 0.35;
  const gap = 0.25;
  const h = 0.9;
  const w = v.maxBombs * bar + (v.maxBombs - 1) * gap;
  return { x0: P.x - w / 2, y: P.y - v.altitude - v.bodyHeight - 0.4 - h, bar, gap, h };
}
/** Structures whose art has no flag of its own (sprite key kinds): the renderer gives them a flag pole. */
const FLAGLESS_ART: ReadonlySet<string> = new Set(['oil', 'airfield', 'techCenter', 'powerPlant', 'happyCity']);
const FLAG_POLE_HEIGHT = 30;
/** How long an RA2 order line stays on screen after the order (s). */
const ORDER_LINE_SECONDS = 1;
/** Aircraft target lock colour (earth orange). */
const LOCK_COLOR = '#c4622d';
/** How long the RA2 move marker (green arrows) stays on screen (s). */
const MOVE_MARKER_SECONDS = 0.9;
/** Draw scale of tanks, armoured cars and other ground vehicles. */
const GROUND_VEHICLE_SCALE = 0.7;
/** Pre-rendered unit poses: heading buckets for vehicles, walk frames for soldiers, and picture boxes (iso px). */
const HEADINGS = 48;
/**
 * Aircraft get their own, coarser pose grid. A cruising aircraft's picture is ~5× the area of a ground
 * vehicle's (it spans from its ground shadow up to cruise altitude), so every extra pose costs real memory
 * and a multi-millisecond bake the first time it is needed — which is what made long flights stutter.
 */
const AIR_HEADINGS = 24;
const AIR_BURNER_FRAMES = 2;
/** Walk cycle buckets: 24 is a multiple of every sheet's walk frames (GI 4, Ranger 6, Spetsnaz 8). */
const GI_WALK_FRAMES = 24;
/** Squatters: world px between the unit's position and each of its two men (bearer ahead, escort behind). */
const SQUATTERS_GAP = 0.9;
const GI_FIRE_FRAMES = 3;
/** How long the muzzle-flash poses play after each shot. */
const GI_FIRE_SECONDS = 0.3;
const GROUND_BOX = { w: 26, h: 22, ox: 13, oy: 15 };
const AIR_PARKED_BOX = { w: 30, h: 20, ox: 15, oy: 12 };
const AIR_CRUISE_BOX = { w: 34, h: CRUISE_ALTITUDE + 30, ox: 15, oy: CRUISE_ALTITUDE + 10 };

/** Lucide's ChevronDown path (24×24 grid): drawn 1–3 times above a veteran unit. */
const CHEVRON = new Path2D(String((ChevronDown[0]?.[1] as { d?: string } | undefined)?.d ?? 'm6 9 6 6 6-6'));

/**
 * Draws one frame: terrain blit → water shimmer → selection ring →
 * depth-sorted buildings (+ animated layers) → HUD overlays → screen FX.
 */
const SMOKE = 'rgb(70,66,62)';
let blast: HTMLCanvasElement | null = null;
/** Fireball picture (radial gradient), drawn once and reused for every explosion. */
function blastSprite(): HTMLCanvasElement {
  if (blast) return blast;
  const { canvas, ctx } = createCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,170,1)');
  g.addColorStop(0.45, 'rgba(255,140,50,0.85)');
  g.addColorStop(1, 'rgba(90,40,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blast = canvas;
  return canvas;
}

/** Painter's order (back to front). */
const byDepth = (a: { depth: number }, b: { depth: number }): number => a.depth - b.depth;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Per-frame scratch lists, reused so drawing a frame allocates no new arrays. */
  private readonly visibleBuildings: Building[] = [];
  private readonly visibleUnits: Unit[] = [];
  private readonly drawables: (Building | Unit)[] = [];
  private readonly focusedIds = new Set<number>();
  private readonly unitDepth = new Map<number, number>();
  private dpr = 1;
  private vignette: CanvasGradient | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly terrain: TerrainRenderer,
    private readonly sprites: SpriteCache,
  ) {
    this.ctx = get2d(canvas, { alpha: false });
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.camera.resize(r.width, r.height);

    const cx = r.width / 2;
    const cy = r.height / 2;
    const g = this.ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.8, cx, cy, Math.hypot(cx, cy));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    this.vignette = g;
  }

  /** Ground plane: world px → screen through the isometric transform (circles become 2:1 ellipses). */
  private ground(): void {
    const { camera } = this;
    const z = camera.zoom * this.dpr;
    this.ctx.setTransform(z * ISO_X, z * ISO_Y, -z * ISO_X, z * ISO_Y, -camera.x * z, -camera.y * z);
  }

  /** Upright things (units, building art, bars, labels): iso-space px, drawn at worldToIso(position). */
  private upright(): void {
    const { camera } = this;
    const z = camera.zoom * this.dpr;
    this.ctx.setTransform(z, 0, 0, z, -camera.x * z, -camera.y * z);
  }

  render(scene: RenderScene): void {
    const { ctx, camera } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const view = camera.viewRect();
    // Viewport culling: only what is on screen (plus a margin for tall art and flying aircraft) is drawn.
    // Without it every building and unit of the whole planet was painted each frame, so the game slowed down
    // as the nations grew.
    const margin = 80;
    const left = camera.x - margin;
    const top = camera.y - margin;
    const right = camera.x + camera.viewWidth / camera.zoom + margin;
    const bottom = camera.y + camera.viewHeight / camera.zoom + margin * 0.5;
    const onScreen = (wx: number, wy: number, extra = 0): boolean => {
      const p = worldToIso(wx, wy);
      return p.x >= left - extra && p.x <= right + extra && p.y >= top && p.y <= bottom + extra;
    };

    // The Earth lies on the ground plane of the isometric view.
    this.ground();
    this.terrain.drawTiles(ctx, view, camera.zoom);
    this.terrain.drawWaterShimmer(ctx, view, scene.time);
    // DEMO: the whole grid of unit cells (ô đơn vị) over land and sea, to see exactly where everything stands.
    if (demoActive) this.drawCellGrid(view);
    this.upright();
    this.terrain.drawTrees(ctx, view, camera.zoom);

    this.ground();
    // Scratch arrays reused every frame (no new arrays at 60 fps); depth order barely changes between frames.
    const sorted = this.visibleBuildings;
    sorted.length = 0;
    for (const b of scene.buildings) {
      const c = b.centerWorld();
      if (b.id === scene.selectedId || onScreen(c.x, c.y, (b.w + b.d) * CELL_SIZE)) sorted.push(b);
    }
    sorted.sort(byDepth);
    const selected = sorted.find((b) => b.id === scene.selectedId) ?? null;
    if (selected) this.drawFootprint(selected, scene.time);
    if (scene.safeZones?.length) this.drawSafeZones(scene.safeZones, scene.time);
    if (scene.buildZones?.length) this.drawBuildZones(scene.buildZones, scene.ghost?.faction);

    // Buildings and soldiers share one painter's-algorithm pass (by depth).
    const units = this.visibleUnits;
    units.length = 0;
    for (const u of scene.units ?? []) if (onScreen(u.px, u.py)) units.push(u);
    const selUnits = scene.selectedUnits ?? new Set<number>();
    for (const u of units) if (selUnits.has(u.id)) this.drawUnitRing(u, '#5cff6a');
    const hovered = units.find((u) => u.id === scene.hoveredUnitId);
    if (hovered && !selUnits.has(hovered.id)) this.drawUnitRing(hovered, 'rgba(255,255,255,0.6)');
    if (scene.moveMarker) this.drawMoveMarker(scene.moveMarker, scene.time);
    if (scene.waypointPlan) this.drawWaypointPlan(scene.waypointPlan);
    const focus = scene.focus ?? [];
    for (const f of focus) if (f.entity.kind !== 'building' && !f.airLock) this.drawFocusRing(f.entity, f.strong, scene.time);

    this.upright();
    // Structures under attack by my units: a red border round their cells, under the art.
    for (const f of focus) if (f.entity.kind === 'building' && f.engaged) this.drawTargetBorder(f.entity);
    const drawables = this.drawables;
    drawables.length = 0;
    for (const b of sorted) drawables.push(b);
    for (const u of units) if (!u.flies) drawables.push(u);
    // A unit beside a big structure is ordered against the structure's edges, not its centre:
    // in front of the near edge it is drawn after it, behind the far edge before it.
    const unitDepth = this.unitDepth;
    unitDepth.clear();
    for (const u of units) if (!u.flies) unitDepth.set(u.id, this.depthNear(u, sorted));
    const depthOf = (d: Building | Unit): number => (d.kind === 'building' ? d.depth : (unitDepth.get(d.id) ?? d.depth));
    drawables.sort((a, b) => depthOf(a) - depthOf(b));
    for (const d of drawables) {
      if (d.kind === 'building') this.drawBuilding(d, scene.time);
      else this.drawUnit(d);
    }
    // Order lines go over the structures (a route across a base must not vanish under it), under the aircraft.
    this.ground();
    for (const u of units) if (!(u instanceof Vehicle) && (selUnits.has(u.id) || u.id === scene.pathPeekId)) this.drawOrderLine(u, scene.time);
    this.upright();
    // Vehicles: the line leaves from the top of the vehicle and ends on the top of the vehicle it goes for.
    for (const u of units) if (u instanceof Vehicle && (selUnits.has(u.id) || u.id === scene.pathPeekId)) this.drawOrderLine(u, scene.time);
    // Aircraft fly above everything on the ground.
    for (const u of units) if (u.flies) this.drawUnit(u);
    if (scene.ghost) this.drawGhost(scene.ghost);
    this.upright();
    for (const f of focus) if (f.entity.kind !== 'building' && !f.airLock) this.drawFocusMarks(f.entity, f.strong);
    for (const f of focus) if (f.airLock) this.drawAirLock(f.entity);
    for (const u of units) if (selUnits.has(u.id) || u.hp < u.maxHp) this.drawUnitHealth(u);
    // The fuel gauge shows only while the transport is out on a sortie; parked or taxiing at home it is idle (hidden).
    for (const u of units) if (u instanceof Vehicle && u.maxBombs > 0) this.drawBombs(u);
    for (const u of units) if (u instanceof Vehicle && u.isTransport && u.flight !== 'parked' && u.flight !== 'taxi' && u.flight !== 'taxiHome') this.drawFuel(u);
    for (const f of focus) if (f.entity.kind !== 'building' && !selUnits.has(f.entity.id) && f.entity.hp >= f.entity.maxHp) this.drawUnitHealth(f.entity);
    const hints = scene.flagHints;
    if (hints?.size) for (const u of units) if (hints.has(u.id)) this.drawFlagHint(u);
    for (const u of units) if (u.restLeft > 0 && !hints?.has(u.id)) this.drawTag(u, `Resting ${Math.ceil(u.restLeft)}s`, '#9fd3ff');
    for (const u of units) {
      if (u.rank > 0) this.drawRank(u);
      if (u instanceof Vehicle && u.isCarrier && (u.cargo.length > 0 || u.incoming > 0)) this.drawCargoBadge(u);
    }
    // Effects are stored in iso px already.
    const isoIn = (x: number, y: number): boolean => x >= left && x <= right && y >= top && y <= bottom + margin;
    if (scene.effects) this.drawEffects(scene.effects.filter((e) => (e.kind === 'tracer' || e.kind === 'bombFall' || e.kind === 'missile' || e.kind === 'shell' || e.kind === 'bullet' ? isoIn(e.x0, e.y0) || isoIn(e.x1, e.y1) : isoIn(e.x, e.y))));

    const focused = this.focusedIds;
    focused.clear();
    for (const f of focus) focused.add(f.entity.id);
    for (const b of sorted) {
      if (b === selected) this.drawSelectionOverlay(b);
      else if (focused.has(b.id)) this.drawSelectionOverlay(b);
      else if (b.id === scene.hoveredId) this.drawLabel(b, 0.8);
    }

    // Screen space.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (scene.selectionRect) {
      const r = scene.selectionRect;
      ctx.fillStyle = 'rgba(92,255,106,0.08)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#5cff6a';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    }
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    }
  }

  /** Draw depth of a ground unit, adjusted so the ground slab of a nearby structure never covers it. */
  private depthNear(u: Unit, buildings: readonly Building[]): number {
    let depth = u.depth;
    if (u instanceof Vehicle && u.drawDepth !== null && u.fixed) return depth; // on its airfield: already placed
    const cx = u.px / CELL_SIZE;
    const cy = u.py / CELL_SIZE;
    const r = u.radius / CELL_SIZE;
    for (const b of buildings) {
      if (cx < b.x - 3 || cy < b.y - 3 || cx > b.x + b.w + 3 || cy > b.y + b.d + 3) continue;
      // Behind only when wholly past the far edges; anything else (touching or overlapping the near edges) is in front.
      const behind = cx + r <= b.x || cy + r <= b.y;
      const inFront = !behind;
      if (inFront && depth <= b.depth) depth = b.depth + 0.01;
      else if (behind && depth >= b.depth) depth = b.depth - 0.01;
    }
    return depth;
  }

  private sprite(b: Building): Sprite {
    return this.sprites.get(b.spriteKey, b.rotated);
  }

  /** Sprite scale: its art diamond is exactly the diamond the grid footprint covers on screen. */
  private scaleOf(b: Building): number {
    return this.sprites.fitScale(b.spriteKey);
  }

  private drawBuilding(b: Building, time: number): void {
    const s = this.sprite(b);
    const cw = b.centerWorld();
    const c = worldToIso(cw.x, cw.y);
    const k = this.scaleOf(b);
    const { ctx } = this;

    // Build-up animation: the structure rises from the ground after placement.
    const rise = b.placedAt === null ? 1 : Math.min(1, (time - b.placedAt) / BUILD_RISE_SECONDS);
    if (rise < 1) {
      const r = this.spriteRect(b);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x - 2, r.y + r.h * (1 - rise), r.w + 4, r.h * rise + 2);
      ctx.clip();
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.drawImage(s.canvas, -s.centerX * k, -s.centerY * k, s.width * k, s.height * k);
    ctx.restore();
    if (rise < 1) {
      ctx.restore();
      this.ground();
      this.drawBuildDust(b, rise);
      this.upright();
      return;
    }

    if (s.art.drawAnimated) {
      // Same local art space as the static sprite.
      ctx.save();
      ctx.translate(c.x, c.y);
      const a = k * s.artScale;
      ctx.scale(b.rotated ? -a : a, a);
      s.art.drawAnimated(new IsoPainter(ctx, s.originX / s.artScale, s.originY / s.artScale), time, b.active);
      ctx.restore();
    }
    // Every structure flies its owner's national flag: ones whose art has no flag get a pole at their front corner.
    const kind = b.spriteKey.split(':')[0] ?? '';
    if (FLAGLESS_ART.has(kind) && b.faction !== 'neutral') {
      ctx.save();
      ctx.translate(c.x, c.y);
      const a = k * s.artScale;
      ctx.scale(b.rotated ? -a : a, a);
      const p = new IsoPainter(ctx, s.originX / s.artScale, s.originY / s.artScale);
      const u = s.art.footprint.w - 0.35;
      const v = s.art.footprint.d - 0.35;
      drawNationalPole(p, b.faction, u, v, 0, FLAG_POLE_HEIGHT);
      drawFlagOnPole(p, b.faction, u, v, FLAG_POLE_HEIGHT, time, (b.id % 7) * 0.9, 15, 9);
      ctx.restore();
    }
  }

  private drawUnit(u: Unit): void {
    const f = FACTIONS[u.faction as keyof typeof FACTIONS];
    if (!f) return;
    const { ctx } = this;
    const P = worldToIso(u.px, u.py);
    if (u instanceof Vehicle) {
      if (u.aircraft && drawAircraftSheet(ctx, u, P.x, P.y)) return;
      if (u.type === 'tank' && drawTankSheet(ctx, u, P.x, P.y)) return;
      if (u.type === 'repair' && drawRepairSheet(ctx, u, P.x, P.y)) return;
      if (u.type === 'truck' && drawTruckSheet(ctx, u, P.x, P.y)) return;
      const heading = isoHeading(u.heading, u.aircraft ? 0.8 : SQUASH);
      // On the iso ground a vehicle's neighbours are half as far apart on screen: ground vehicles are drawn a bit
      // smaller so they never look piled on top of each other (their collision circles keep them apart).
      const scale = u.aircraft ? 1 : GROUND_VEHICLE_SCALE;
      const faction = u.faction as keyof typeof FACTIONS;
      // Cached poses: ground vehicles always; aircraft when cruising or parked (take-off / landing are drawn live).
      const cruising = u.aircraft && u.altitude === CRUISE_ALTITUDE;
      const parked = u.aircraft && u.altitude <= 0;
      if (!u.aircraft || cruising || parked) {
        const steps = u.aircraft ? AIR_HEADINGS : HEADINGS;
        const hb = ((Math.round((heading / (Math.PI * 2)) * steps) % steps) + steps) % steps;
        const qh = (hb / steps) * Math.PI * 2;
        let frame: number;
        let phase: number;
        if (u.aircraft) {
          frame = Math.floor(((u.walkPhase * 3.1) / (Math.PI * 2)) * AIR_BURNER_FRAMES) % AIR_BURNER_FRAMES; // afterburner flicker
          phase = (frame / AIR_BURNER_FRAMES) * ((Math.PI * 2) / 3.1);
        } else {
          frame = u.moving ? Math.floor(((u.walkPhase % 0.8) + 0.8) % 0.8 / 0.2) : -1; // track links
          phase = Math.max(0, frame) * 0.2;
        }
        const alt = parked ? 0 : u.altitude;
        const moving = u.aircraft ? !parked || u.moving : frame >= 0;
        const box = u.aircraft ? (parked ? AIR_PARKED_BOX : AIR_CRUISE_BOX) : GROUND_BOX;
        const sprite = unitSprite(`v:${faction}:${u.type}:${hb}:${frame}:${parked ? 'p' : cruising ? 'c' : 'g'}:${moving ? 1 : 0}`, box.w, box.h, box.ox, box.oy, (c) =>
          drawVehicle(c, { x: 0, y: 0, heading: qh, phase, moving, altitude: alt }, u.type, faction),
        );
        blitUnit(ctx, sprite, P.x, P.y, scale);
        return;
      }
      ctx.save();
      ctx.translate(P.x, P.y);
      ctx.scale(scale, scale);
      drawVehicle(ctx, { x: 0, y: 0, heading, phase: u.walkPhase, moving: u.moving, altitude: u.altitude }, u.type, faction);
      ctx.restore();
      return;
    }
    if (!(u instanceof Infantry)) return;
    const pose = { x: P.x, y: P.y, facing: u.facing, walkPhase: u.walkPhase, moving: u.moving };
    if (!u.inWater) {
      const special = u.tier === 'special';
      const frame = u.moving ? ((Math.floor((u.walkPhase / (Math.PI * 2)) * GI_WALK_FRAMES) % GI_WALK_FRAMES) + GI_WALK_FRAMES) % GI_WALK_FRAMES : -1;
      const sinceShot = u.weapon ? u.weapon.cooldown - u.cooldown : Infinity;
      const fire = sinceShot >= 0 && sinceShot < GI_FIRE_SECONDS ? Math.min(GI_FIRE_FRAMES - 1, Math.floor((sinceShot / GI_FIRE_SECONDS) * GI_FIRE_FRAMES)) : -1;
      const aiming = !u.moving && u.engaged;
      const oct = ((Math.round(u.heading / (Math.PI / 8)) % 16) + 16) % 16;
      const look = u.profile.look;
      const soldier = (fire: number, aiming: boolean) => unitSprite(`${look.sprite ?? 'gi'}:${f.colors.primary}:${special ? 1 : 0}:${oct}:${frame}:${fire}:${aiming ? 1 : 0}`, 6, 6, 3, 5, (c) =>
        drawSoldier(
          c,
          {
            x: 0,
            y: 0,
            facing: u.facing,
            heading: (oct * Math.PI) / 8,
            walkPhase: ((Math.max(0, frame) + 0.5) / GI_WALK_FRAMES) * Math.PI * 2,
            moving: frame >= 0,
            fire: fire >= 0 ? (fire + 0.5) / GI_FIRE_FRAMES : -1,
            aiming,
          },
          look,
          f.colors.primary,
          special,
        ),
      );
      if (u.isSquatters && drawsSquad(look)) {
        // Squad sheet: bearer, escort and flag in one picture (too tall for the cached soldier box: drawn live).
        drawSoldier(ctx, { x: P.x, y: P.y, facing: u.facing, heading: u.heading, walkPhase: u.walkPhase, moving: u.moving, fire: fire >= 0 ? (fire + 0.5) / GI_FIRE_FRAMES : -1, aiming }, look, f.colors.primary, true);
        return;
      }
      if (u.isSquatters) {
        this.drawSquatters(u, P, (bearer) => (bearer ? soldier(-1, false) : soldier(fire, aiming)));
        return;
      }
      blitUnit(ctx, soldier(fire, aiming), P.x, P.y);
      return;
    }
    // Swimming: a 16-direction sheet has its own swimming poses with ripples.
    if (drawsOwnSwim(u.profile.look)) {
      drawSoldier(ctx, { ...pose, heading: u.heading, swimming: true }, u.profile.look, f.colors.primary, true);
      return;
    }
    // Older sheets: body sinks to the chest, paddling with ripples around it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x - 3, P.y - 6, 6, 6 - 0.55 + 0.0);
    ctx.clip();
    drawSoldier(ctx, { ...pose, y: P.y + 0.9, moving: false, heading: u.heading }, u.profile.look, f.colors.primary, true);
    ctx.restore();
    const t = u.walkPhase;
    ctx.strokeStyle = 'rgba(230,240,255,0.75)';
    ctx.lineWidth = 0.18;
    for (let i = 0; i < 2; i++) {
      const r = 0.9 + ((t * 0.12 + i * 0.5) % 1) * 0.9;
      ctx.globalAlpha = 1 - (r - 0.9) / 0.9;
      ctx.beginPath();
      ctx.ellipse(P.x, P.y - 0.45, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Squatters: the flag bearer walks in front, his rifleman escort right behind him (SQUATTERS_GAP world px apart
   * along the heading), the nearer one drawn last. The bearer carries the nation's flag on a pole.
   */
  private drawSquatters(u: Infantry, P: { x: number; y: number }, sprite: (bearer: boolean) => ReturnType<typeof unitSprite>): void {
    const { ctx } = this;
    const dx = Math.cos(u.heading) * SQUATTERS_GAP;
    const dy = Math.sin(u.heading) * SQUATTERS_GAP;
    const front = worldToIso(dx, dy);
    const men = [
      { bearer: true, x: P.x + front.x, y: P.y + front.y },
      { bearer: false, x: P.x - front.x, y: P.y - front.y },
    ].sort((a, b) => a.y - b.y);
    for (const m of men) {
      blitUnit(ctx, sprite(m.bearer), m.x, m.y);
      if (m.bearer) drawCarriedFlag(ctx, u.faction as FactionId, m.x + 0.9, m.y - 2.6, 4.2, performance.now() / 1000 + u.id);
    }
  }

  /** RA2-style selection ring under a unit's feet: a circle on the ground, so an ellipse on screen (ground transform). */
  private drawUnitRing(u: Unit, color: string): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(u.px, u.py, Math.max(1.8, u.radius * 1.35), 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Thin dashed line in the team colour from a selected unit along its remaining route to the destination (ground transform). */
  /**
   * RA2 order line: right after an order a solid line runs from the unit to where it was sent (green, with a dot
   * at both ends) or to what it attacks (red), then fades out.
   */
  private drawOrderLine(u: Unit, time: number): void {
    const f = u.orderFlash;
    if (!f) return;
    const age = time - f.at;
    if (age < 0 || age > ORDER_LINE_SECONDS) return;
    let end: { x: number; y: number } | undefined;
    // Vehicles are drawn in the upright (iso) transform: from the top of the hull to the top of a target vehicle.
    const iso = u instanceof Vehicle;
    const t = f.target;
    if (f.kind === 'attack' && (!t || !t.alive)) return;
    if (t && t.alive && (f.kind === 'attack' || t instanceof Vehicle)) {
      if ('centerWorld' in t) {
        const c = (t as Building).centerWorld();
        end = iso ? worldToIso(c.x, c.y) : c;
      } else end = iso ? this.unitTop(t as Unit) : { x: (t as Unit).px, y: (t as Unit).py };
    } else {
      const path = u.waypoints();
      const last = path[path.length - 1];
      end = last && iso ? worldToIso(last.x, last.y) : last;
    }
    if (!end) return;
    const start = iso ? this.unitTop(u) : { x: u.px, y: u.py };
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const color = f.kind === 'attack' ? '#ff2a1a' : '#2bff3a';
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, age - ORDER_LINE_SECONDS * 0.6) / (ORDER_LINE_SECONDS * 0.4);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    for (const p of [start, end]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Thin lines along every unit-cell border inside `view` (world px, ground transform). */
  private drawCellGrid(view: Rect): void {
    const { ctx } = this;
    const x0 = Math.max(0, Math.floor(view.x / CELL_SIZE));
    const y0 = Math.max(0, Math.floor(view.y / CELL_SIZE));
    const x1 = Math.ceil((view.x + view.w) / CELL_SIZE);
    const y1 = Math.ceil((view.y + view.h) / CELL_SIZE);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      ctx.moveTo(x * CELL_SIZE, y0 * CELL_SIZE);
      ctx.lineTo(x * CELL_SIZE, y1 * CELL_SIZE);
    }
    for (let y = y0; y <= y1; y++) {
      ctx.moveTo(x0 * CELL_SIZE, y * CELL_SIZE);
      ctx.lineTo(x1 * CELL_SIZE, y * CELL_SIZE);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Top of a unit's picture in iso px (above the hull / the aircraft at its altitude). */
  private unitTop(u: Unit): { x: number; y: number } {
    const P = worldToIso(u.px, u.py);
    const lift = u.flies && 'altitude' in u ? Number((u as { altitude: number }).altitude) : 0;
    return { x: P.x, y: P.y - lift - Math.max(u.bodyHeight, 2) - 1.2 };
  }

  /** RA2-style target focus, part 1: a pulsing red ring under the enemy (ground transform). */
  private drawFocusRing(u: Unit, strong: boolean, time: number): void {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    const half = Math.max(2.2, u.radius * 1.5) * (1.05 + (strong ? 0.12 * pulse : 0));
    ctx.save();
    ctx.globalAlpha = strong ? 0.75 + 0.25 * pulse : 0.5;
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = (strong ? 4.5 : 3) / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(u.px, u.py, half * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Part 2: red corner brackets round the unit's picture and, when strong, its name (upright transform). */
  private drawFocusMarks(u: Unit, strong: boolean): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const P = worldToIso(u.px, u.py);
    const lift = u.flies && 'altitude' in u ? Number((u as { altitude: number }).altitude) : 0;
    const half = Math.max(2.2, u.radius * 1.5);
    const top = P.y - lift - Math.max(u.bodyHeight, 2) - 1.6;
    const bottom = P.y - lift + 1.2;
    ctx.save();
    ctx.globalAlpha = strong ? 0.95 : 0.55;
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = (strong ? 1.6 : 1.1) * k;
    const len = Math.min(1.4, half * 0.5);
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [P.x - half, top, 1, 1],
      [P.x + half, top, -1, 1],
      [P.x - half, bottom, 1, -1],
      [P.x + half, bottom, -1, -1],
    ] as const) {
      ctx.moveTo(cx + sx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * len);
    }
    ctx.stroke();
    if (strong) {
      const name = 'name' in u ? String((u as { name: string }).name) : 'Enemy';
      const text = `${name} · ${FACTIONS[u.faction as keyof typeof FACTIONS]?.shortName ?? u.faction}`;
      ctx.font = `600 ${11 * k}px "Segoe UI", system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 10 * k;
      const h = 15 * k;
      const x = P.x - w / 2;
      const y = top - 5.5 - h;
      ctx.fillStyle = 'rgba(8,12,16,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(x, y + h - 2 * k, w, 2 * k);
      ctx.fillStyle = '#f2f5f8';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, x + w / 2, y + h / 2 - k);
    }
    ctx.restore();
  }

  /** Veteran chevrons (Lucide ChevronDown ×1, ×2, ×3) hovering above the unit; on a bomber, left of its bomb row. */
  /** "Double-click / F: plant flag" in a small dark tag above a Squatters team (upright transform). */
  private drawFlagHint(u: Unit): void {
    this.drawTag(u, 'Double-click / F: plant flag', '#ffd84a');
  }

  /** A short line of text in a small dark tag above a soldier's head (upright transform). */
  private drawTag(u: Unit, text: string, color: string): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const P = worldToIso(u.px, u.py);
    ctx.save();
    ctx.font = `700 ${11 * k}px "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 10 * k;
    const h = 15 * k;
    const y = P.y - 7.2 - h; // above the raised flag
    ctx.fillStyle = 'rgba(8,12,16,0.82)';
    ctx.fillRect(P.x - w / 2, y, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, P.x, y + h / 2);
    ctx.restore();
  }

  private drawRank(u: Unit): void {
    const { ctx } = this;
    const lift = (u as { altitude?: number }).altitude ?? 0;
    const size = 2.6; // world px per chevron (24 icon units)
    const sc = size / 24;
    let P = worldToIso(u.px, u.py);
    let top = P.y - lift - u.bodyHeight - 1.4 - 3.4;
    if (u instanceof Vehicle && u.maxBombs > 0) {
      // The stack ends level with the bottom of the bomb bars, just left of them.
      const r = bombRow(u);
      P = { x: r.x0 - 0.4 - size / 2, y: P.y };
      top = r.y + r.h - size * 0.65;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < u.rank; i++) {
      ctx.save();
      ctx.translate(P.x - size / 2, top - (u.rank - 1 - i) * size * 0.34);
      ctx.scale(sc, sc);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 5.2;
      ctx.stroke(CHEVRON);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.stroke(CHEVRON);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Sign on a loaded transport: what is aboard, and a red FULL once nothing more fits. */
  private drawCargoBadge(t: Vehicle): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    // RA2 style: seats taken / seats there are (e.g. 3/12), plus what it is doing.
    const vehicles = t.vehiclesAboard;
    // A truck carries soldiers or one tank, never both: show only what it holds.
    const parts = t.isTruck && vehicles > 0 ? [`${vehicles}/${t.vehicleCapacity} tank`] : [`${t.soldiersAboard}/${t.soldierCapacity} inf`];
    if (vehicles > 0 && !t.isTruck) parts.push(`${vehicles}/${t.vehicleCapacity} veh`);
    const state = t.carrierState;
    const prefix = t.full ? 'FULL · ' : state === 'loading' ? 'LOADING · ' : state === 'unloading' ? 'UNLOADING · ' : '';
    const text = `${prefix}${parts.join(' + ')}`;
    ctx.save();
    ctx.font = `700 ${10 * k}px "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 8 * k;
    const h = 13 * k;
    const P = worldToIso(t.px, t.py);
    const x = P.x - w / 2;
    const y = P.y - t.altitude - 11 - h;
    ctx.fillStyle = t.full ? '#d62d20' : '#e0a21b';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = k;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, P.x, y + h / 2 + 0.3 * k);
    ctx.restore();
  }

  private drawUnitHealth(u: Unit): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const P = worldToIso(u.px, u.py);
    const w = Math.max(2.4, u.radius * 1.6);
    const x = P.x - w / 2;
    // An airborne unit is drawn `altitude` px above its ground point: the bar rides along, never under it.
    const lift = (u as { altitude?: number }).altitude ?? 0;
    const y = P.y - lift - u.bodyHeight - 2.4;
    const ratio = u.hpRatio;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - k, y - k, w + 2 * k, 0.4 + 2 * k);
    ctx.fillStyle = ratio > 0.5 ? '#3fdc4a' : ratio > 0.25 ? '#f0d23a' : '#e8452f';
    ctx.fillRect(x, y, w * ratio, 0.4);
  }

  /** Transport fuel gauge: a black bar just above the health bar, shrinking as the tank empties. */
  private drawFuel(v: Vehicle): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const P = worldToIso(v.px, v.py);
    const w = Math.max(2.4, v.radius * 1.6);
    const x = P.x - w / 2;
    const y = P.y - v.altitude - v.bodyHeight - 2.4 - 0.4 - 3 * k;
    ctx.fillStyle = 'rgba(210,210,210,0.85)';
    ctx.fillRect(x - k, y - k, w + 2 * k, 0.4 + 2 * k);
    ctx.fillStyle = v.fuel > 0.2 ? '#111111' : '#7a1010';
    ctx.fillRect(x, y, w * v.fuel, 0.4);
  }

  /** Bomber payload: a row of small upright green bars right above the airframe, one per bomb (dark when dropped). */
  private drawBombs(v: Vehicle): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const { x0, y, bar, gap, h } = bombRow(v);
    for (let i = 0; i < v.maxBombs; i++) {
      const x = x0 + i * (bar + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - k, y - k, bar + 2 * k, h + 2 * k);
      ctx.fillStyle = i < v.bombs ? '#3ddc4a' : '#1d3320';
      ctx.fillRect(x, y, bar, h);
    }
  }

  private drawEffects(list: readonly Effect[]): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    for (const e of list) {
      if (e.age < 0) continue;
      const t = e.age / e.ttl;
      if (e.kind === 'tracer') {
        const head = e.shell ? Math.min(1, t * 1.15) : 1;
        const tail = e.shell ? Math.max(0, head - 0.25) : Math.max(0, t - 0.2);
        const x0 = e.x0 + (e.x1 - e.x0) * tail;
        const y0 = e.y0 + (e.y1 - e.y0) * tail;
        const x1 = e.x0 + (e.x1 - e.x0) * head;
        const y1 = e.y0 + (e.y1 - e.y0) * head;
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 1 - t * 0.5;
        ctx.lineWidth = e.width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        if (e.shell) {
          ctx.fillStyle = '#fff3c0';
          ctx.beginPath();
          ctx.arc(x1, y1, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 'flash') {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#fff1a8';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * (0.6 + 0.4 * (1 - t)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'blast') {
        // One pre-rendered fireball, scaled and faded (no gradient or colour strings built per blast per frame).
        const r = e.radius * (0.35 + t * 0.9);
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(blastSprite(), e.x - r, e.y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      } else if (e.kind === 'soldierDeath') {
        drawSoldierDeath(ctx, e.look, e.x, e.y, e.heading, e.age, e.ttl);
      } else if (e.kind === 'charge') {
        drawCharge(ctx, e.x, e.y, e.ttl - e.age);
      } else if (e.kind === 'demoBlast') {
        if (!drawDemolitionBlast(ctx, e.x, e.y, t)) {
          const r = 16 * (0.35 + t * 0.9);
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(blastSprite(), e.x - r, e.y - r, r * 2, r * 2);
          ctx.globalAlpha = 1;
        }
      } else if (e.kind === 'bullet') {
        drawBullet(ctx, e.x0, e.y0, e.x1, e.y1, t, e.age, e.size);
      } else if (e.kind === 'bulletHit') {
        drawBulletImpact(ctx, e.x, e.y, e.age, e.ttl, e.size);
      } else if (e.kind === 'shell') {
        drawShell(ctx, e.x0, e.y0, e.x1, e.y1, t, e.age);
      } else if (e.kind === 'shellImpact') {
        drawShellImpact(ctx, e.x, e.y, e.age, e.ttl, e.armour);
      } else if (e.kind === 'missile') {
        drawMissile(ctx, e.x0, e.y0, e.x1, e.y1, t, e.age);
      } else if (e.kind === 'missileBlast') {
        drawMissileBlast(ctx, e.x, e.y, e.age, e.ttl, e.air);
      } else if (e.kind === 'bombFall') {
        drawBombFall(ctx, e.faction, e.x0, e.y0, e.x1, e.y1, e.gx, e.gy, t);
      } else if (e.kind === 'bombBlast') {
        drawBombBlast(ctx, e.faction, e.x, e.y, e.age, e.ttl);
      } else if (e.kind === 'tankDeath') {
        drawTankDeath(ctx, e.faction, e.x, e.y, e.age, e.ttl);
      } else if (e.kind === 'truckDeath') {
        drawTruckDeath(ctx, e.faction, e.heading, e.flatbed, e.x, e.y, e.age, e.ttl);
      } else if (e.kind === 'repairDeath') {
        drawRepairDeath(ctx, e.faction, e.heading, e.x, e.y, e.age, e.ttl);
      } else {
        const r = e.radius * (0.5 + t * 1.2);
        ctx.globalAlpha = 0.5 * (1 - t);
        ctx.fillStyle = SMOKE;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y - t * 6, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    void k;
  }

  /** Shrinking green rings where a move order was given. */
  /** RA2 waypoint route: a light-blue dashed line through the points, with a small square on each. */
  private drawWaypointPlan(points: readonly { x: number; y: number }[]): void {
    if (points.length < 2) return;
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    ctx.save();
    ctx.lineWidth = 2.6 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.strokeStyle = '#8cc8ff';
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fd0ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8 * k;
    const s = 3.2 * k;
    for (const p of points) {
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  private drawMoveMarker(m: { x: number; y: number; at: number }, time: number): void {
    const t = (time - m.at) / MOVE_MARKER_SECONDS;
    if (t < 0 || t > 1) return;
    const { ctx } = this;
    // Kept a readable size on screen at any zoom.
    const k = 0.4 * Math.min(1.2, Math.max(0.8, 1 / this.camera.zoom)); // 0.4: kept small and neat
    // RA2: four big green arrowheads close in on the spot from all sides, then vanish.
    const r = (2 + 8 * (1 - Math.min(1, t * 1.6))) * k;
    const s = 3.4 * k;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 2.5 * (1 - t));
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#3dff4c';
    ctx.strokeStyle = '#063d0c';
    ctx.lineWidth = 1 * k;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const c = Math.cos(a);
      const n = Math.sin(a);
      const tipX = m.x + c * r;
      const tipY = m.y + n * r;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + c * s * 1.7 - n * s, tipY + n * s * 1.7 + c * s);
      ctx.lineTo(tipX + c * s * 1.1, tipY + n * s * 1.1);
      ctx.lineTo(tipX + c * s * 1.7 + n * s, tipY + n * s * 1.7 - c * s);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    // Bright dot on the spot itself.
    ctx.beginPath();
    ctx.arc(m.x, m.y, 1.1 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** Dust puffs around the footprint while a structure rises. */
  private drawBuildDust(b: Building, rise: number): void {
    const f = b.footprintWorld();
    const { ctx } = this;
    ctx.fillStyle = `rgba(200,185,150,${(0.45 * (1 - rise)).toFixed(3)})`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rise * 2;
      ctx.beginPath();
      ctx.arc(f.x + f.w / 2 + Math.cos(a) * f.w * 0.55, f.y + f.h * 0.7 + Math.sin(a) * f.h * 0.3, 0.8 + rise * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Allowed build area around the player's buildings (soft tint + dashed edge). */
  /** Safe zones: a green square on the ground with a pulsing border and a SAFE ZONE marking. */
  private drawSafeZones(zones: readonly Rect[], time: number): void {
    const { ctx } = this;
    const k = 3 / this.camera.zoom;
    const pulse = 0.65 + Math.sin(time * 3) * 0.25;
    for (const z of zones) {
      ctx.fillStyle = 'rgba(60,200,90,0.32)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = `rgba(110,255,140,${pulse.toFixed(3)})`;
      ctx.lineWidth = k;
      ctx.strokeRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = 'rgba(235,255,238,0.9)';
      ctx.font = `700 ${Math.max(3, z.w * 0.14)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SAFE ZONE', z.x + z.w / 2, z.y + z.h / 2);
    }
  }

  private drawBuildZones(zones: readonly Rect[], faction?: FactionId): void {
    const { ctx } = this;
    const color = faction ? teamColors(faction).primary : '#ffffff';
    const k = 3 / this.camera.zoom;
    ctx.fillStyle = withAlpha(color, 0.07);
    for (const z of zones) ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([3 * k, 3 * k]);
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = k;
    for (const z of zones) ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([]);
  }

  /** Translucent structure + green/red cells under the cursor (the hidden iso grid made visible), and why it is blocked. */
  private drawGhost(g: PlacementGhost): void {
    const { ctx } = this;
    const k = 3 / this.camera.zoom;
    const ku = 1 / this.camera.zoom;
    const fx = g.x * CELL_SIZE;
    const fy = g.y * CELL_SIZE;
    const fw = g.w * CELL_SIZE;
    const fh = g.d * CELL_SIZE;

    // The footprint cells are diamonds on the ground (ground transform).
    this.ground();
    ctx.fillStyle = g.ok ? 'rgba(80,230,110,0.28)' : 'rgba(240,70,60,0.32)';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = g.ok ? 'rgba(120,255,150,0.9)' : 'rgba(255,110,100,0.95)';
    ctx.lineWidth = k;
    ctx.beginPath();
    for (let i = 0; i <= g.w; i++) {
      ctx.moveTo(fx + i * CELL_SIZE, fy);
      ctx.lineTo(fx + i * CELL_SIZE, fy + fh);
    }
    for (let j = 0; j <= g.d; j++) {
      ctx.moveTo(fx, fy + j * CELL_SIZE);
      ctx.lineTo(fx + fw, fy + j * CELL_SIZE);
    }
    ctx.stroke();

    // The art stands on that diamond (upright transform).
    this.upright();
    const s = this.sprites.get(g.spriteKey, g.mirrored);
    const scale = this.sprites.fitScale(g.spriteKey);
    const c = worldToIso(fx + fw / 2, fy + fh / 2);
    ctx.globalAlpha = g.ok ? 0.75 : 0.45;
    ctx.drawImage(s.canvas, c.x - s.centerX * scale, c.y - s.centerY * scale, s.width * scale, s.height * scale);
    ctx.globalAlpha = 1;

    if (g.reason) {
      const south = worldToIso(fx + fw, fy + fh);
      ctx.font = `600 ${11 * ku}px "Segoe UI", system-ui, sans-serif`;
      const w = ctx.measureText(g.reason).width + 10 * ku;
      const h = 16 * ku;
      const x = c.x - w / 2;
      const y = south.y + 4 * ku;
      ctx.fillStyle = 'rgba(40,8,6,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ffd2cc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.reason, c.x, y + h / 2);
    }
  }

  /** Occupied grid cells (team colour) with cell lines, so the footprint reads clearly. */
  private drawFootprint(b: Building, time: number): void {
    const { ctx } = this;
    const f = b.footprintWorld();
    const color = teamColors(b.faction).primary;
    const k = 3 / this.camera.zoom;
    ctx.fillStyle = withAlpha(color, 0.18);
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = withAlpha(color, 0.45);
    ctx.lineWidth = k;
    ctx.beginPath();
    for (let x = f.x + CELL_SIZE; x < f.x + f.w; x += CELL_SIZE) {
      ctx.moveTo(x, f.y);
      ctx.lineTo(x, f.y + f.h);
    }
    for (let y = f.y + CELL_SIZE; y < f.y + f.h; y += CELL_SIZE) {
      ctx.moveTo(f.x, y);
      ctx.lineTo(f.x + f.w, y);
    }
    ctx.stroke();
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.lineDashOffset = -time * 12 * k;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * k;
    ctx.strokeRect(f.x, f.y, f.w, f.h);
    ctx.setLineDash([]);
  }

  /** Iso-space rect of the sprite's opaque pixels (for brackets, labels and the rise clip). */
  private spriteRect(b: Building): Rect {
    const s = this.sprite(b);
    const cw = b.centerWorld();
    const c = worldToIso(cw.x, cw.y);
    const k = this.scaleOf(b);
    return { x: c.x + (s.bounds.x - s.centerX) * k, y: c.y + (s.bounds.y - s.centerY) * k, w: s.bounds.w * k, h: s.bounds.h * k };
  }

  /** Brackets hug the footprint's grid diamond (sides and bottom); the top follows the art, never below the diamond. */
  private footprintRect(b: Building): Rect {
    const f = b.footprintWorld();
    const pts = [worldToIso(f.x, f.y), worldToIso(f.x + f.w, f.y), worldToIso(f.x + f.w, f.y + f.h), worldToIso(f.x, f.y + f.h)];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const bottom = Math.max(...ys);
    const top = Math.min(Math.min(...ys), this.spriteRect(b).y);
    return { x, y: top, w: Math.max(...xs) - x, h: bottom - top };
  }

  /**
   * Attack target: a 2px dark red border just outside the grid cells the structure stands on. Drawn before the
   * art and pushed out by half its width, so it never covers the building.
   */
  private drawTargetBorder(b: Building): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const f = b.footprintWorld();
    const [t, r, bt, l] = [worldToIso(f.x, f.y), worldToIso(f.x + f.w, f.y), worldToIso(f.x + f.w, f.y + f.h), worldToIso(f.x, f.y + f.h)];
    // Iso edges run 2:1, so a 1px normal offset moves the side corners √5 px and the top/bottom ones √5/2 px.
    const o = k * Math.sqrt(5);
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - o / 2);
    ctx.lineTo(r.x + o, r.y);
    ctx.lineTo(bt.x, bt.y + o / 2);
    ctx.lineTo(l.x - o, l.y);
    ctx.closePath();
    ctx.strokeStyle = '#a10d0d';
    ctx.lineWidth = 2 * k;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  /** Aircraft target lock (targeting-pod look): crosshair lines across the view and a box round the target, earth orange. */
  private drawAirLock(e: Unit | Building): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    // Structure: the box hugs the iso grid cells it stands on (a diamond); a unit gets a plain rectangle.
    let outline: { x: number; y: number }[];
    if (e.kind === 'building') {
      const f = e.footprintWorld();
      outline = [worldToIso(f.x, f.y), worldToIso(f.x + f.w, f.y), worldToIso(f.x + f.w, f.y + f.h), worldToIso(f.x, f.y + f.h)];
    } else {
      const P = worldToIso(e.px, e.py);
      const lift = e.flies && 'altitude' in e ? Number((e as { altitude: number }).altitude) : 0;
      const half = Math.max(3, e.radius * 2);
      const top = P.y - lift - Math.max(e.bodyHeight, 2) - 1.6;
      const bottom = P.y - lift + 1.6;
      const x0 = P.x - half * 1.6;
      const x1 = P.x + half * 1.6;
      outline = [{ x: x0, y: top }, { x: x1, y: top }, { x: x1, y: bottom }, { x: x0, y: bottom }];
    }
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const v = this.camera.viewRect();
    const p0 = worldToIso(v.x, v.y);
    const span = Math.max(v.w, v.h) * 4 + 4000;
    const shape = (): void => {
      ctx.moveTo(outline[0].x, outline[0].y);
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
      ctx.closePath();
    };
    ctx.save();
    ctx.strokeStyle = LOCK_COLOR;
    // Crosshair lines across the view, cut away inside the outline.
    ctx.save();
    ctx.beginPath();
    ctx.rect(p0.x - span * 2, p0.y - span * 2, span * 4, span * 4);
    shape();
    ctx.clip('evenodd');
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.moveTo(p0.x - span, cy);
    ctx.lineTo(p0.x + span, cy);
    ctx.moveTo(cx, p0.y - span);
    ctx.lineTo(cx, p0.y + span);
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 2 * k;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    shape();
    ctx.stroke();
    ctx.restore();
  }

  /** Pip health bar + name label (no corner brackets). */
  private drawSelectionOverlay(b: Building, _bracket = '#ffffff', _width = 1.5): void {
    const { ctx } = this;
    const r = this.footprintRect(b);
    const k = 1 / this.camera.zoom;

    const pipW = 3 * k;
    const gap = 1 * k;
    const total = HEALTH_PIPS * (pipW + gap) - gap;
    const x0 = r.x + r.w / 2 - total / 2;
    const y0 = r.y - 9 * k;
    const ratio = b.hpRatio;
    const lit = Math.ceil(ratio * HEALTH_PIPS);
    // Protected buildings show gold pips: they can never lose health.
    const color = b.indestructible ? '#f2c94c' : ratio > 0.5 ? '#3fdc4a' : ratio > 0.25 ? '#f0d23a' : '#e8452f';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x0 - k, y0 - k, total + 2 * k, 7 * k);
    for (let i = 0; i < HEALTH_PIPS; i++) {
      ctx.fillStyle = i < lit ? color : '#2a2f33';
      ctx.fillRect(x0 + i * (pipW + gap), y0, pipW, 5 * k);
    }
    this.drawLabel(b, 1, y0 - 6 * k);
  }

  private drawLabel(b: Building, alpha: number, bottomY?: number): void {
    const { ctx } = this;
    const k = 1 / this.camera.zoom;
    const r = this.spriteRect(b);
    const inside = b.garrison.length > 0 ? ` · ${b.garrison.length} inside` : '';
    const managed = 'bankManaged' in b && (b as { bankManaged: boolean }).bankManaged;
    const health = `${Math.max(0, Math.ceil((b.hp / b.maxHp) * 100))}%`;
    const text = managed
      ? `${b.spec.name} · ${health} · Global Financial Center managed`
      : b.indestructible
        ? `${b.spec.name} · ${health} · Neutral · Protected`
        : `${b.spec.name} · ${health}${inside}`;
    ctx.font = `600 ${12 * k}px "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 12 * k;
    const h = 18 * k;
    const x = r.x + r.w / 2 - w / 2;
    const y = (bottomY ?? r.y - 6 * k) - h;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8,12,16,0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = teamColors(b.faction).primary;
    ctx.fillRect(x, y + h - 2 * k, w, 2 * k);
    ctx.fillStyle = '#f2f5f8';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2 - k);
    ctx.globalAlpha = 1;
  }
}
