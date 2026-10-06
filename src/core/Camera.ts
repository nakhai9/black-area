import { ZOOM_MAX, ZOOM_MIN } from '../constants';
import type { Rect, WorldPoint } from '../types';
import { isoToWorld, worldToIso } from './IsoView';
import { clamp } from './MathUtils';

/**
 * Fixed-angle isometric camera: pan + zoom only (see IsoView). `x`/`y` are the top-left corner of the
 * viewport in iso space; the centre of the view is kept on the map.
 */
export class Camera {
  /** Iso-space coordinate of the viewport's top-left corner (px at zoom 1). */
  x = 0;
  y = 0;
  zoom = 1;
  viewWidth = 1;
  viewHeight = 1;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {}

  get minZoom(): number {
    return ZOOM_MIN;
  }

  resize(width: number, height: number): void {
    const center = this.screenToWorld(this.viewWidth / 2, this.viewHeight / 2);
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.zoom = clamp(this.zoom, this.minZoom, ZOOM_MAX);
    this.centerOn(center.x, center.y);
  }

  /** Iso-space point under a screen pixel. */
  screenToIso(sx: number, sy: number): WorldPoint {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }

  screenToWorld(sx: number, sy: number): WorldPoint {
    const i = this.screenToIso(sx, sy);
    return isoToWorld(i.x, i.y);
  }

  worldToScreen(wx: number, wy: number): WorldPoint {
    const i = worldToIso(wx, wy);
    return { x: (i.x - this.x) * this.zoom, y: (i.y - this.y) * this.zoom };
  }

  /** World-space bounding box of everything visible (the view is a diamond-ish area on the map). */
  viewRect(): Rect {
    const corners = [this.screenToWorld(0, 0), this.screenToWorld(this.viewWidth, 0), this.screenToWorld(this.viewWidth, this.viewHeight), this.screenToWorld(0, this.viewHeight)];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  /** Pans by screen-direction deltas given in iso px (screen px / zoom). */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    const i = worldToIso(wx, wy);
    this.x = i.x - this.viewWidth / this.zoom / 2;
    this.y = i.y - this.viewHeight / this.zoom / 2;
    this.clamp();
  }

  /** Sets an absolute zoom level, keeping the current view centre. */
  setZoom(zoom: number): void {
    const c = this.screenToWorld(this.viewWidth / 2, this.viewHeight / 2);
    this.zoom = clamp(zoom, this.minZoom, ZOOM_MAX);
    this.centerOn(c.x, c.y);
  }

  /** Zooms while keeping the point under (sx, sy) fixed on screen. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const anchor = this.screenToIso(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, ZOOM_MAX);
    this.x = anchor.x - sx / this.zoom;
    this.y = anchor.y - sy / this.zoom;
    this.clamp();
  }

  /** The centre of the view always stays on the map. */
  private clamp(): void {
    const cx = this.x + this.viewWidth / this.zoom / 2;
    const cy = this.y + this.viewHeight / this.zoom / 2;
    const w = isoToWorld(cx, cy);
    const kx = clamp(w.x, 0, this.worldWidth);
    const ky = clamp(w.y, 0, this.worldHeight);
    if (kx === w.x && ky === w.y) return;
    const i = worldToIso(kx, ky);
    this.x = i.x - this.viewWidth / this.zoom / 2;
    this.y = i.y - this.viewHeight / this.zoom / 2;
  }
}
