import { HALF_TH, HALF_TW, SPRITE_SCALE } from '../constants';
import type { Rect } from '../types';
import { createCanvas } from './Canvas';
import { IsoPainter } from './IsoPainter';
import { applyRa2Finish } from './Ra2Finish';
import { flagVariantArt, type BuildingArt } from './sprites';

/** Sprites are rasterised at 2× for crisp results when zoomed in / on HiDPI. */
const RASTER_SCALE = 2;
const MARGIN = 20;
const HIT_ALPHA = 40;
/** Cast shadow: screen px to the right / down per px of height above the ground. */
const SHADOW_RUN_X = 0.55;
const SHADOW_RUN_Y = 0.22;

/**
 * Main structures are drawn BUILDING_HEIGHT_SCALE times taller than authored (more lifelike proportions next to the
 * units); low pieces that must line up with the ground or each other (walls, gates, bridges, bunkers, flagpoles,
 * airfields) and the Pyramids (real proportions) keep
 * their height.
 */
const BUILDING_HEIGHT_SCALE = 1.35;
const FLAT_PIECES = ['bridge', 'wall', 'gate', 'bunker', 'flag', 'airfield', 'monument'];
function buildingHeightScale(key: string): number {
  const k = key.toLowerCase();
  return FLAT_PIECES.some((f) => k.startsWith(f)) ? 1 : BUILDING_HEIGHT_SCALE;
}

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
  /** BuildingArt.scale, needed by callers that paint the animated layer in the same art space. */
  readonly artScale: number;
  /** Height scale of the art (buildingHeightScale), for the animated layer's painter too. */
  readonly zScale: number;
  /** Half extents of the footprint diamond (ground plaza). */
  readonly groundHalfW: number;
  readonly groundHalfH: number;
  /** Tight bounds of opaque pixels, relative to the sprite top-left. */
  readonly bounds: Rect;
  readonly art: BuildingArt;
  readonly mirrored: boolean;
  /** Alpha channel at raster resolution, for pixel-perfect picking. */
  readonly alpha: Uint8Array;
  /** Halved copies (mip levels: 1×, 0.5× of the logical size…), made on first use. */
  mips?: HTMLCanvasElement[];
}

/**
 * The raster of `s` best suited to draw it at `screenPerPx` screen pixels per logical pixel: the smallest mip level
 * still at least that sharp. A big raster shrunk a lot in one go shimmers and looks rough (the browser only samples
 * a few of its pixels); halving it step by step first keeps the edges and surfaces smooth.
 */
export function spriteRaster(s: Sprite, screenPerPx: number): HTMLCanvasElement {
  let level = s.canvas;
  let density = RASTER_SCALE;
  for (let i = 0; density / 2 >= screenPerPx && i < 3; i++) {
    s.mips ??= [];
    let next = s.mips[i];
    if (!next) {
      const { canvas, ctx } = createCanvas(Math.max(1, Math.round(level.width / 2)), Math.max(1, Math.round(level.height / 2)));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(level, 0, 0, canvas.width, canvas.height);
      s.mips[i] = next = canvas;
    }
    level = next;
    density /= 2;
  }
  return level;
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

  /** Draw scale of every building: its art ground diamond becomes exactly its footprint's diamond on screen. */
  fitScale(_key: string, _widthPx?: number): number {
    return SPRITE_SCALE;
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
    let art = this.registry.get(key);
    if (!art) {
      art = flagVariantArt(key);
      if (art) this.registry.set(key, art);
    }
    if (!art) throw new Error(`No building art registered for '${key}'`);
    // An art piece may be drawn larger than it was authored (see BuildingArt.scale): everything the sprite is
    // measured from — footprint and height — grows with it, and the painter draws into a scaled context.
    const artScale = art.scale ?? 1;
    const w = art.footprint.w * artScale;
    const d = art.footprint.d * artScale;
    const zScale = buildingHeightScale(key);
    const artHeight = art.height * artScale * zScale;
    // Room for the cast shadow, which falls to the lower right (both sides, so the mirrored sprite fits too).
    const marginX = MARGIN + Math.ceil(artHeight * SHADOW_RUN_X);
    const width = (w + d) * HALF_TW + marginX * 2;
    const height = (w + d) * HALF_TH + artHeight + MARGIN * 2 + Math.ceil(artHeight * SHADOW_RUN_Y);
    const anchorX = d * HALF_TW + marginX;
    const anchorY = artHeight + MARGIN;
    const groundCenterX = anchorX + ((w - d) / 2) * HALF_TW;
    const centerX = mirrored ? width - groundCenterX : groundCenterX;
    const centerY = anchorY + ((w + d) / 2) * HALF_TH;

    const { canvas, ctx } = createCanvas(width * RASTER_SCALE, height * RASTER_SCALE);
    ctx.scale(RASTER_SCALE, RASTER_SCALE);
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.save();
    ctx.scale(artScale, artScale);
    art.drawStatic(new IsoPainter(ctx, anchorX / artScale, anchorY / artScale, zScale));
    ctx.restore();

    // Red Alert 2 look: grainy, slightly muted pre-rendered surfaces with a dark rim.
    applyRa2Finish(ctx, canvas.width, canvas.height, !art.noRim);
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
    // Sharp cast shadow on the ground (key light from the upper left): the silhouette above the ground line, sheared
    // to the lower right and laid under the building. Added after the hit mask, so the shadow is never clickable.
    if (!art.noShadow) {
      const cy = centerY * RASTER_SCALE;
      const sil = createCanvas(canvas.width, canvas.height);
      sil.ctx.drawImage(canvas, 0, 0);
      sil.ctx.globalCompositeOperation = 'source-in';
      sil.ctx.fillStyle = 'rgb(8,10,14)';
      sil.ctx.fillRect(0, 0, canvas.width, canvas.height);
      sil.ctx.clearRect(0, cy, canvas.width, canvas.height - cy);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.globalAlpha = 0.34;
      ctx.setTransform(1, 0, -SHADOW_RUN_X, -SHADOW_RUN_Y, SHADOW_RUN_X * cy, cy * (1 + SHADOW_RUN_Y));
      ctx.drawImage(sil.canvas, 0, 0);
      ctx.restore();
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
      artScale,
      zScale,
      groundHalfW: ((w + d) / 2) * HALF_TW,
      groundHalfH: ((w + d) / 2) * HALF_TH,
      bounds,
      art,
      mirrored,
      alpha,
    };
  }
}
