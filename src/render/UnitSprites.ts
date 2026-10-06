import { createCanvas } from './Canvas';

/**
 * Pre-rendered unit pictures. Vehicles and soldiers are drawn procedurally (many paths, gradients and stacked
 * layers each), which is far too slow to repeat for every unit every frame once armies grow. Each distinct
 * pose — faction, kind, heading bucket, animation frame — is painted once into a small offscreen canvas at
 * RES pixels per iso px and then simply blitted.
 */
const RES = 6;
/** Oldest entries are dropped past this many pictures (they are rebuilt on demand). */
const LIMIT = 4000;

export interface UnitSprite {
  canvas: HTMLCanvasElement;
  /** Iso px from the canvas' top-left corner to the unit's ground point. */
  ox: number;
  oy: number;
  /** Size in iso px. */
  w: number;
  h: number;
}

const sprites = new Map<string, UnitSprite>();

/**
 * Returns the cached picture for `key`, painting it with `draw` the first time. `draw` paints the unit with its
 * ground point at (0, 0) in iso px; the box (w × h, ground point at ox, oy) must contain everything it paints.
 */
export function unitSprite(key: string, w: number, h: number, ox: number, oy: number, draw: (ctx: CanvasRenderingContext2D) => void): UnitSprite {
  let s = sprites.get(key);
  if (s) return s;
  const { canvas, ctx } = createCanvas(w * RES, h * RES);
  ctx.scale(RES, RES);
  ctx.translate(ox, oy);
  draw(ctx);
  s = { canvas, ox, oy, w, h };
  sprites.set(key, s);
  if (sprites.size > LIMIT) {
    const oldest = sprites.keys().next().value;
    if (oldest !== undefined) sprites.delete(oldest);
  }
  return s;
}

/** Draws `s` with its ground point at (x, y), scaled by `scale`. */
export function blitUnit(ctx: CanvasRenderingContext2D, s: UnitSprite, x: number, y: number, scale = 1): void {
  ctx.drawImage(s.canvas, x - s.ox * scale, y - s.oy * scale, s.w * scale, s.h * scale);
}

/** Stable small id for an object (used to key looks / profiles in sprite keys). */
const ids = new WeakMap<object, number>();
let nextId = 1;
export function objectKey(o: object): number {
  let id = ids.get(o);
  if (id === undefined) {
    id = nextId++;
    ids.set(o, id);
  }
  return id;
}
