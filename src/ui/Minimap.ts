import { NEUTRAL_OWNER } from '../constants';
import type { Camera } from '../core/Camera';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import { teamColors } from '../factions';
import type { TerrainRenderer } from '../map/TerrainRenderer';
import { createCanvas, get2d } from '../render/Canvas';
import type { WorldPoint } from '../types';

/**
 * RA2-style radar: a scaled copy of the prerendered Earth, faction markers
 * and the camera frustum. Click or drag to move the camera.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = 1;
  private dragging = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly terrain: TerrainRenderer,
    private readonly camera: Camera,
    private readonly onNavigate: (world: WorldPoint) => void,
    /** Left click on the radar: true when it was taken as an order for the selected units (the camera then stays). */
    private readonly onPick: (world: WorldPoint) => boolean = () => false,
  ) {
    this.ctx = get2d(canvas);
    // Right button: the camera goes there. Left button: the selected units go there (no selection: the camera goes).
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && this.onPick(this.toWorld(e))) return;
      if (e.button !== 0 && e.button !== 2) return;
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
      this.navigate(e);
    });
    canvas.addEventListener('pointermove', (e) => this.dragging && this.navigate(e));
    canvas.addEventListener('pointerup', () => (this.dragging = false));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);

    const t = this.terrain;
    this.scale = Math.min(r.width / t.width, r.height / t.height);
    this.offX = (r.width - t.width * this.scale) / 2;
    this.offY = (r.height - t.height * this.scale) / 2;

    const { canvas, ctx } = createCanvas(this.canvas.width, this.canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      t.canvas,
      this.offX * this.dpr,
      this.offY * this.dpr,
      t.width * this.scale * this.dpr,
      t.height * this.scale * this.dpr,
    );
    this.base = canvas;
  }

  /**
   * Draws the radar. Without an Airfield only your own and neutral things
   * show; with one (it runs the radar), enemy units and buildings appear too.
   */
  render(buildings: readonly Building[], units: readonly Unit[], viewerOwner: number, seesEnemies: boolean): void {
    const shown = (owner: number): boolean => seesEnemies || owner === viewerOwner || owner === NEUTRAL_OWNER;
    if (!this.base) return;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    for (const b of buildings) {
      if (!shown(b.owner)) continue;
      const c = this.toMinimap(b.centerWorld());
      ctx.fillStyle = teamColors(b.faction).primary;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      // A small round dot per structure (radius 2.2 px, outlined in black).
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const u of units) {
      if (!shown(u.owner)) continue;
      const c = this.toMinimap({ x: u.px, y: u.py });
      ctx.fillStyle = teamColors(u.faction).primary;
      ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
    }

    // The isometric view covers a diamond-like quadrilateral of the map.
    const cam = this.camera;
    const corners = [cam.screenToWorld(0, 0), cam.screenToWorld(cam.viewWidth, 0), cam.screenToWorld(cam.viewWidth, cam.viewHeight), cam.screenToWorld(0, cam.viewHeight)].map((c) => this.toMinimap(c));
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
  }

  private toMinimap(w: WorldPoint): WorldPoint {
    return { x: w.x * this.scale + this.offX, y: w.y * this.scale + this.offY };
  }

  private navigate(e: PointerEvent): void {
    this.onNavigate(this.toWorld(e));
  }

  private toWorld(e: PointerEvent): WorldPoint {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.offX) / this.scale,
      y: (e.clientY - r.top - this.offY) / this.scale,
    };
  }
}
