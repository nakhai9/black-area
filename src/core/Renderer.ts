import { ChevronDown } from 'lucide';
import { BUILD_RISE_SECONDS, CELL_SIZE, ISO_X, ISO_Y, WORLD_SCALE } from '../constants';
import type { Building } from '../entities/Building';
import { Infantry } from '../entities/Infantry';
import type { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import { SQUASH, drawVehicle } from '../render/VehicleArt';
import { isoHeading, worldToIso } from './IsoView';
import type { Effect } from './Effects';
import { drawSoldier } from '../render/InfantryArt';
import { FACTIONS, teamColors } from '../factions';
import type { TerrainRenderer } from '../map/TerrainRenderer';
import { get2d } from '../render/Canvas';
import { withAlpha } from '../render/Color';
import { IsoPainter } from '../render/IsoPainter';
import type { Sprite, SpriteCache } from '../render/SpriteCache';
import type { FactionId, Rect } from '../types';
import type { Camera } from './Camera';
import { clamp } from './MathUtils';

/** Structure being positioned by the player (cells), with its legality. */
export interface PlacementGhost {
  readonly spriteKey: string;
  readonly faction: FactionId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly ok: boolean;
  readonly reason: string | null;
}

/** An enemy the player's army is fighting. `strong` = targeted by a selected unit or under the cursor. */
export interface FocusTarget {
  readonly entity: Unit | Building;
  readonly strong: boolean;
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
  readonly units?: readonly Unit[];
  /** Tracers, flashes, explosions and smoke. */
  readonly effects?: readonly Effect[];
  readonly selectedUnits?: ReadonlySet<number>;
  readonly hoveredUnitId?: number | null;
  /** Enemies that are being attacked (or are about to be, under the cursor): drawn with red focus marks. */
  readonly focus?: readonly FocusTarget[];
  /** Last move order (world px) and when it was given, for the RA2-style marker. */
  readonly moveMarker?: { x: number; y: number; at: number } | null;
}

const HEALTH_PIPS = 24;

/** Lucide's ChevronDown path (24×24 grid): drawn 1–3 times above a veteran unit. */
const CHEVRON = new Path2D(String((ChevronDown[0]?.[1] as { d?: string } | undefined)?.d ?? 'm6 9 6 6 6-6'));

/**
 * Draws one frame: terrain blit → water shimmer → selection ring →
 * depth-sorted buildings (+ animated layers) → HUD overlays → screen FX.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
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

    // The Earth lies on the ground plane of the isometric view.
    this.ground();
    this.drawTerrain(view);
    this.terrain.drawDetail(ctx, view, camera.zoom);
    this.terrain.drawWaterShimmer(ctx, view, scene.time);
    this.upright();
    this.terrain.drawTrees(ctx, view, camera.zoom);

    this.ground();
    const sorted = [...scene.buildings].sort((a, b) => a.depth - b.depth);
    const selected = sorted.find((b) => b.id === scene.selectedId) ?? null;
    if (selected) this.drawFootprint(selected, scene.time);
    if (scene.buildZones?.length) this.drawBuildZones(scene.buildZones, scene.ghost?.faction);
    for (const b of sorted) this.drawContactShadow(b);

    // Buildings and soldiers share one painter's-algorithm pass (by depth).
    const units = scene.units ?? [];
    const selUnits = scene.selectedUnits ?? new Set<number>();
    for (const u of units) if (selUnits.has(u.id)) this.drawUnitRing(u, '#5cff6a');
    const hovered = units.find((u) => u.id === scene.hoveredUnitId);
    if (hovered && !selUnits.has(hovered.id)) this.drawUnitRing(hovered, 'rgba(255,255,255,0.6)');
    if (scene.moveMarker) this.drawMoveMarker(scene.moveMarker, scene.time);
    const focus = scene.focus ?? [];
    for (const f of focus) if (f.entity.kind !== 'building') this.drawFocusRing(f.entity, f.strong, scene.time);

    this.upright();
    const drawables: (Building | Unit)[] = [...sorted, ...units.filter((u) => !u.flies)];
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) {
      if (d.kind === 'building') this.drawBuilding(d, scene.time);
      else this.drawUnit(d);
    }
    // Aircraft fly above everything on the ground.
    for (const u of units) if (u.flies) this.drawUnit(u);
    if (scene.ghost) this.drawGhost(scene.ghost);
    this.upright();
    for (const f of focus) if (f.entity.kind !== 'building') this.drawFocusMarks(f.entity, f.strong);
    for (const u of units) if (selUnits.has(u.id) || u.hp < u.maxHp) this.drawUnitHealth(u);
    for (const f of focus) if (f.entity.kind !== 'building' && !selUnits.has(f.entity.id) && f.entity.hp >= f.entity.maxHp) this.drawUnitHealth(f.entity);
    for (const u of units) {
      if (u.rank > 0) this.drawRank(u);
      if (u instanceof Vehicle && u.isTransport && u.cargo.length > 0) this.drawCargoBadge(u);
    }
    if (scene.effects) this.drawEffects(scene.effects);

    for (const b of sorted) {
      if (b === selected) this.drawSelectionOverlay(b);
      else if (focus.some((f) => f.entity === b)) this.drawSelectionOverlay(b, '#ff3b30');
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

  /** Blits only the visible part of the prerendered Earth. */
  private drawTerrain(view: Rect): void {
    const t = this.terrain;
    // The base canvas holds Earth texels; one texel covers WORLD_SCALE world px.
    const k = WORLD_SCALE;
    const sx = Math.floor(clamp(view.x / k, 0, t.canvas.width));
    const sy = Math.floor(clamp(view.y / k, 0, t.canvas.height));
    const ex = Math.ceil(clamp((view.x + view.w) / k, 0, t.canvas.width));
    const ey = Math.ceil(clamp((view.y + view.h) / k, 0, t.canvas.height));
    if (ex <= sx || ey <= sy) return;
    this.ctx.drawImage(t.canvas, sx, sy, ex - sx, ey - sy, sx * k, sy * k, (ex - sx) * k, (ey - sy) * k);
  }

  private sprite(b: Building): Sprite {
    return this.sprites.get(b.spriteKey);
  }

  /** Sprite scale: its art diamond is exactly the diamond the grid footprint covers on screen. */
  private scaleOf(b: Building): number {
    return this.sprites.fitScale(b.spriteKey);
  }

  /** Soft ambient-occlusion blob that seats the building onto the terrain. */
  private drawContactShadow(b: Building): void {
    const f = b.footprintWorld();
    const cx = f.x + f.w / 2 - f.w * 0.08;
    const cy = f.y + f.h / 2 + f.h * 0.12;
    const r = Math.max(f.w, f.h) * 0.75;
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, f.h / f.w);
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, 'rgba(20,16,8,0.45)');
    g.addColorStop(1, 'rgba(20,16,8,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
      ctx.scale(k, k);
      s.art.drawAnimated(new IsoPainter(ctx, s.originX, s.originY), time, b.active);
      ctx.restore();
    }
  }

  private drawUnit(u: Unit): void {
    const f = FACTIONS[u.faction as keyof typeof FACTIONS];
    if (!f) return;
    const { ctx } = this;
    const P = worldToIso(u.px, u.py);
    if (u instanceof Vehicle) {
      const heading = isoHeading(u.heading, u.aircraft ? 0.8 : SQUASH);
      drawVehicle(ctx, { x: P.x, y: P.y, heading, phase: u.walkPhase, moving: u.moving, altitude: u.altitude }, u.type, u.faction as keyof typeof FACTIONS);
      return;
    }
    if (!(u instanceof Infantry)) return;
    const pose = { x: P.x, y: P.y, facing: u.facing, walkPhase: u.walkPhase, moving: u.moving };
    if (!u.inWater) {
      drawSoldier(ctx, pose, u.profile.look, f.colors.primary, u.tier === 'special');
      return;
    }
    // Swimming: body sinks to the chest, paddling with ripples around it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x - 3, P.y - 6, 6, 6 - 0.55 + 0.0);
    ctx.clip();
    drawSoldier(ctx, { ...pose, y: P.y + 0.9, moving: false }, u.profile.look, f.colors.primary, true);
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

  /** RA2-style selection ring under a unit's feet: a circle on the ground, so an ellipse on screen (ground transform). */
  private drawUnitRing(u: Unit, color: string): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(u.px, u.py, Math.max(1.8, u.radius * 1.35), 0, Math.PI * 2);
    ctx.stroke();
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

  /** Veteran chevrons (Lucide ChevronDown ×1, ×2, ×3) hovering above the unit. */
  private drawRank(u: Unit): void {
    const { ctx } = this;
    const lift = (u as { altitude?: number }).altitude ?? 0;
    const size = 2.6; // world px per chevron (24 icon units)
    const sc = size / 24;
    const P = worldToIso(u.px, u.py);
    const top = P.y - (u.aircraft ? lift + 3 : u.bodyHeight + 1.4) - 3.4;
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
    const soldiers = t.soldiersAboard;
    const vehicles = t.vehiclesAboard;
    const parts: string[] = [];
    if (soldiers > 0) parts.push(`${soldiers} soldier${soldiers > 1 ? 's' : ''}`);
    if (vehicles > 0) parts.push(`${vehicles} vehicle${vehicles > 1 ? 's' : ''}`);
    const text = `${t.full ? 'FULL · ' : ''}${parts.join(' + ')}`;
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
    const y = P.y - u.bodyHeight - 2.4;
    const ratio = u.hpRatio;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - k, y - k, w + 2 * k, 0.4 + 2 * k);
    ctx.fillStyle = ratio > 0.5 ? '#3fdc4a' : ratio > 0.25 ? '#f0d23a' : '#e8452f';
    ctx.fillRect(x, y, w * ratio, 0.4);
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
        const r = e.radius * (0.35 + t * 0.9);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, `rgba(255,240,170,${(1 - t).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(255,140,50,${(0.85 * (1 - t)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(90,40,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = e.radius * (0.5 + t * 1.2);
        ctx.fillStyle = `rgba(70,66,62,${(0.5 * (1 - t)).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y - t * 6, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    void k;
  }

  /** Shrinking green rings where a move order was given. */
  private drawMoveMarker(m: { x: number; y: number; at: number }, time: number): void {
    const t = (time - m.at) / 0.6;
    if (t < 0 || t > 1) return;
    const { ctx } = this;
    ctx.strokeStyle = `rgba(92,255,106,${(1 - t).toFixed(3)})`;
    ctx.lineWidth = 3 / this.camera.zoom;
    for (const r of [4.2 * (1 - t) + 1, 2.2 * (1 - t) + 0.5]) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    const s = this.sprites.get(g.spriteKey);
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

  /** RA2-style white corner brackets + pip health bar + name label. */
  private drawSelectionOverlay(b: Building, bracket = '#ffffff'): void {
    const { ctx } = this;
    const r = this.spriteRect(b);
    const k = 1 / this.camera.zoom;
    const len = 10 * k;
    ctx.strokeStyle = bracket;
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [r.x, r.y, 1, 1],
      [r.x + r.w, r.y, -1, 1],
      [r.x, r.y + r.h, 1, -1],
      [r.x + r.w, r.y + r.h, -1, -1],
    ] as const) {
      ctx.moveTo(cx + sx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * len);
    }
    ctx.stroke();

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
    const text = managed ? `${b.spec.name} · World Bank managed` : b.indestructible ? `${b.spec.name} · Neutral · Protected` : `${b.spec.name}${inside}`;
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
