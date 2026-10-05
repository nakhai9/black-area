import { HALF_TH, HALF_TW } from '../constants';
import type { Rect } from '../types';
import { createCanvas } from './Canvas';
import { IsoPainter } from './IsoPainter';
import type { BuildingArt } from './sprites';

/** Sprites are rasterised at 2× for crisp results when zoomed in / on HiDPI. */
const RASTER_SCALE = 2;
const MARGIN = 20;
const HIT_ALPHA = 40;

export interface Sprite {
  readonly canvas: HTMLCanvasElement;
  /** Logical size (px at building scale 1). */
  readonly width: number;
  readonly height: number;
  /** Position of the footprint centre (ground level) inside the sprite. */
  readonly centerX: number;
  readonly centerY: number;
  /** Art-space origin (u=0, v=0, z=0) relative to the footprint centre, unmirrored. */
  readonly originX: number;
  readonly originY: number;
  /** Half extents of the footprint diamond (ground plaza). */
  readonly groundHalfW: number;
  readonly groundHalfH: number;
  /** Tight bounds of opaque pixels, relative to the sprite top-left. */
  readonly bounds: Rect;
  readonly art: BuildingArt;
  readonly mirrored: boolean;
  /** Alpha channel at raster resolution, for pixel-perfect picking. */
  readonly alpha: Uint8Array;
}

/**
 * Builds each building sprite once from its procedural art and caches it,
 * in both orientations (normal + mirrored, used for rotating buildings).
 */
export class SpriteCache {
  private readonly sprites = new Map<string, Sprite>();
  private readonly registry: Map<string, BuildingArt>;

  constructor(arts: Readonly<Record<string, BuildingArt>>) {
    this.registry = new Map(Object.entries(arts));
  }

  /** Adds art generated at runtime (e.g. procedural city districts). */
  register(key: string, art: BuildingArt): void {
    this.registry.set(key, art);
  }

  get(key: string, mirrored = false): Sprite {
    const id = `${key}|${mirrored ? 'm' : 'n'}`;
    let s = this.sprites.get(id);
    if (!s) {
      s = this.build(key, mirrored);
      this.sprites.set(id, s);
    }
    return s;
  }

  /** Draw scale that fits the sprite's ground diamond to a footprint `widthPx` wide. */
  fitScale(key: string, widthPx: number): number {
    return widthPx / (2 * this.get(key).groundHalfW);
  }

  /**
   * Pixel-accurate hit test. (dx, dy) is the world offset from the building's
   * footprint centre; `scale` is the building's draw scale.
   */
  hitTest(key: string, mirrored: boolean, dx: number, dy: number, scale: number): boolean {
    const s = this.get(key, mirrored);
    const px = Math.floor((dx / scale + s.centerX) * RASTER_SCALE);
    const py = Math.floor((dy / scale + s.centerY) * RASTER_SCALE);
    const w = s.canvas.width;
    if (px < 0 || py < 0 || px >= w || py >= s.canvas.height) return false;
    return s.alpha[py * w + px] > HIT_ALPHA;
  }

  private build(key: string, mirrored: boolean): Sprite {
    const art = this.registry.get(key);
    if (!art) throw new Error(`No building art registered for '${key}'`);
    const { w, d } = art.footprint;
    const width = (w + d) * HALF_TW + MARGIN * 2;
    const height = (w + d) * HALF_TH + art.height + MARGIN * 2;
    const anchorX = d * HALF_TW + MARGIN;
    const anchorY = art.height + MARGIN;
    const groundCenterX = anchorX + ((w - d) / 2) * HALF_TW;
    const centerX = mirrored ? width - groundCenterX : groundCenterX;
    const centerY = anchorY + ((w + d) / 2) * HALF_TH;

    const { canvas, ctx } = createCanvas(width * RASTER_SCALE, height * RASTER_SCALE);
    ctx.scale(RASTER_SCALE, RASTER_SCALE);
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    art.drawStatic(new IsoPainter(ctx, anchorX, anchorY));

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < alpha.length; i++) {
      const a = data[i * 4 + 3];
      alpha[i] = a;
      if (a > HIT_ALPHA) {
        const x = i % canvas.width;
        const y = (i / canvas.width) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const bounds: Rect = {
      x: minX / RASTER_SCALE,
      y: minY / RASTER_SCALE,
      w: (maxX - minX + 1) / RASTER_SCALE,
      h: (maxY - minY + 1) / RASTER_SCALE,
    };
    return {
      canvas,
      width,
      height,
      centerX,
      centerY,
      originX: anchorX - groundCenterX,
      originY: anchorY - centerY,
      groundHalfW: ((w + d) / 2) * HALF_TW,
      groundHalfH: ((w + d) / 2) * HALF_TH,
      bounds,
      art,
      mirrored,
      alpha,
    };
  }
}
