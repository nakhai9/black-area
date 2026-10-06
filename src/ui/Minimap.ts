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
  ) {
    this.ctx = get2d(canvas);
    canvas.addEventListener('pointerdown', (e) => {
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
      ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
      ctx.strokeRect(c.x - 3, c.y - 3, 6, 6);
    }

    for (const u of units) {
      if (!shown(u.owner)) continue;
      const c = this.toMinimap({ x: u.px, y: u.py });
      ctx.fillStyle = teamColors(u.faction).primary;
      ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
    }

    const v = this.camera.viewRect();
    const a = this.toMinimap({ x: v.x, y: v.y });
    const b = this.toMinimap({ x: v.x + v.w, y: v.y + v.h });
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x - 1, b.y - a.y - 1);
  }

  private toMinimap(w: WorldPoint): WorldPoint {
    return { x: w.x * this.scale + this.offX, y: w.y * this.scale + this.offY };
  }

  private navigate(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.onNavigate({
      x: (e.clientX - r.left - this.offX) / this.scale,
      y: (e.clientY - r.top - this.offY) / this.scale,
    });
  }
}
