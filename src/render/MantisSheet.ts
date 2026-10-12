import type { Vehicle } from '../entities/Vehicle';
import { ISO_X, ISO_Y } from '../constants';

/**
 * MANTIS air-defence vehicle sheet (tools/mantis_sheet.py): one row of 96 px cells. Cells 0–11 are the vehicle from
 * 12 angles (the launcher always raised); LEAN gives each view's barrel lean on screen (-1 left … +1 right), and a
 * heading is drawn with the view whose lean is closest to its own. Cells 12–15: launch flash, small blast, big blast,
 * burning wreck. Shared by every nation.
 */
const CELL = 96;
const LEAN = [0.75, 0.88, -0.66, 0.77, -0.76, 0.02, 0.81, -0.86, -0.7, -0.88, 0.76, -0.64];
const WRECK = 15;
const BLASTS = [13, 14];
const BLAST_FRAME_SECONDS = 0.25;
/** Iso px per sheet px: the hull drawn about tank-sized. */
const SCALE = 0.125;
const FADE_SECONDS = 0.8;
export const MANTIS_DEATH_SECONDS = 3;

const url = `${import.meta.env.BASE_URL}sprites/mantis.png`;
const image = new Image();
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the MANTIS sheet download. */
export function loadMantisSprites(): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load MANTIS sprites '${url}'.`));
    image.src = url;
  });
  return loaded;
}

const ready = (): boolean => image.complete && image.naturalWidth > 0;

/** True once the sheet is loaded (MANTIS deaths then use its wreck). */
export function hasMantisSheet(): boolean {
  return ready();
}

/** Sheet view for a world heading: the one whose barrel leans the way the heading points on screen. */
function view(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const lean = Math.sin(Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y));
  let best = 0;
  for (let i = 1; i < LEAN.length; i++) if (Math.abs((LEAN[i] ?? 0) - lean) < Math.abs((LEAN[best] ?? 0) - lean)) best = i;
  return best;
}

function blit(ctx: CanvasRenderingContext2D, col: number, x: number, y: number): void {
  const size = CELL * SCALE;
  ctx.drawImage(image, col * CELL, 0, CELL, CELL, x - size / 2, y - size * 0.62, size, size);
}

/** Draws a MANTIS with its ground point at (x, y) in iso px. Returns false when the sheet is not loaded. */
export function drawMantisSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (v.type !== 'mantis' || !ready()) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  blit(ctx, view(v.heading), x, y);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Sidebar cameo. Returns false when the sheet is not loaded. */
export function drawMantisPortrait(ctx: CanvasRenderingContext2D, w: number, h: number, heading: number): boolean {
  if (!ready()) return false;
  const size = Math.min(w, h) * 1.25;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, view(heading) * CELL, 0, CELL, CELL, (w - size) / 2, (h - size) / 2, size, size);
  ctx.restore();
  return true;
}

/** A MANTIS's death (`age` s into a `ttl` s effect) at iso ground point (x, y): the blasts over its burning wreck, fading out. */
export function drawMantisDeath(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, ttl: number): void {
  if (!ready()) return;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  blit(ctx, WRECK, x, y);
  const frame = Math.floor(age / BLAST_FRAME_SECONDS);
  const blast = BLASTS[frame];
  if (blast !== undefined) blit(ctx, blast, x, y);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
