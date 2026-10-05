import { ZOOM_MAX, ZOOM_MIN } from '../constants';
import type { Rect, WorldPoint } from '../types';
import { clamp } from './MathUtils';

/**
 * Fixed-angle 2D camera: pan + zoom only. The viewport is always kept fully
 * inside the world, so the map covers the whole screen (no empty borders).
 */
export class Camera {
  /** World coordinate of the viewport's top-left corner. */
  x = 0;
  y = 0;
  zoom = 1;
  viewWidth = 1;
  viewHeight = 1;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {}

  /** Smallest zoom at which the world still fills the viewport. */
  get minZoom(): number {
    return Math.max(ZOOM_MIN, this.viewWidth / this.worldWidth, this.viewHeight / this.worldHeight);
  }

  resize(width: number, height: number): void {
    const center = this.screenToWorld(this.viewWidth / 2, this.viewHeight / 2);
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.zoom = clamp(this.zoom, this.minZoom, ZOOM_MAX);
    this.centerOn(center.x, center.y);
  }

  screenToWorld(sx: number, sy: number): WorldPoint {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }

  worldToScreen(wx: number, wy: number): WorldPoint {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  /** Visible area in world coordinates. */
  viewRect(): Rect {
    return { x: this.x, y: this.y, w: this.viewWidth / this.zoom, h: this.viewHeight / this.zoom };
  }

  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewWidth / this.zoom / 2;
    this.y = wy - this.viewHeight / this.zoom / 2;
    this.clamp();
  }

  /** Sets an absolute zoom level, keeping the current view centre. */
  setZoom(zoom: number): void {
    const c = this.screenToWorld(this.viewWidth / 2, this.viewHeight / 2);
    this.zoom = clamp(zoom, this.minZoom, ZOOM_MAX);
    this.centerOn(c.x, c.y);
  }

  /** Zooms while keeping the world point under (sx, sy) fixed on screen. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const anchor = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, ZOOM_MAX);
    this.x = anchor.x - sx / this.zoom;
    this.y = anchor.y - sy / this.zoom;
    this.clamp();
  }

  private clamp(): void {
    const vw = this.viewWidth / this.zoom;
    const vh = this.viewHeight / this.zoom;
    this.x = clamp(this.x, 0, Math.max(0, this.worldWidth - vw));
    this.y = clamp(this.y, 0, Math.max(0, this.worldHeight - vh));
  }
}
