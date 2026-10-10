/**
 * Explosion + smoke sheet (tools/explosion_sheet.py): 12 frames × 16 variants of 128 px. A flash, the fireball,
 * then black smoke rising and fading. Used whenever a structure, a ground vehicle or an aircraft blows up; its size
 * follows what blew up (see Game.explode).
 */
const CELL = 128;
const FRAMES = 12;
const VARIANTS = 16;
/** Ground point of the blast inside a cell (sheet px). */
const ANCHOR_X = 64;
const ANCHOR_Y = 108;
/** Sheet px across the fireball at its widest: `size` (iso px) maps to this. */
const BODY_PX = 115;
/** Seconds the whole animation lasts; the last FADE_SECONDS fade the smoke out. */
export const EXPLOSION_SECONDS = 1.8;
const FADE_SECONDS = 0.5;

const url = `${import.meta.env.BASE_URL}sprites/explosion.png`;
const image = new Image();
let ready = false;
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the explosion sheet download. */
export function loadExplosionSprites(): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    image.onload = () => {
      ready = true;
      resolve();
    };
    image.onerror = () => reject(new Error(`Could not load explosion sprites '${url}'.`));
    image.src = url;
  });
  return loaded;
}

export function hasExplosionSheet(): boolean {
  return ready;
}

/** Draws the explosion `age` s in, its fireball `size` iso px wide, ground point at (x, y). False if not loaded. */
export function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, size: number, variant: number): boolean {
  if (!ready) return false;
  if (age < 0) return true;
  const frame = Math.min(FRAMES - 1, Math.floor((age / EXPLOSION_SECONDS) * FRAMES));
  const row = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  const k = size / BODY_PX;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.max(0, Math.min(1, (EXPLOSION_SECONDS - age) / FADE_SECONDS));
  ctx.drawImage(image, frame * CELL, row * CELL, CELL, CELL, x - ANCHOR_X * k, y - ANCHOR_Y * k, CELL * k, CELL * k);
  ctx.globalAlpha = prev;
  return true;
}
