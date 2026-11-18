import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { lazyImage } from './onDemand';
import { spriteUrl } from './spriteUrl';

/**
 * VT 1-2 twin-gun turretless tank, rendered by tools/blender/vt12_render.py: one sheet per nation colour
 * (tank-vt12-<faction>, the faction band on the hull sides, with its shadow), 32 columns — screen headings clockwise
 * from N — 96 px layout cells stored at 384 px, the hull centre at PIVOT_Y. The guns are fixed: the hull aims.
 */
const DIRS = 32;
const CELL = 96;
const PIVOT_Y = 54;
/** Iso px per layout px: the trucks' and tanks' true scale (same px per metre as the other ground sheets). */
const SCALE = 0.1693;

const FACTIONS: readonly FactionId[] = ['usa', 'russia', 'china', 'europe', 'islamic'];
const SHEETS = new Map<FactionId, HTMLImageElement>(
  FACTIONS.map((f) => {
    return [f, lazyImage(spriteUrl(`tank-vt12-${f}.webp`))];
  }),
);
const loaded = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

function blit(ctx: CanvasRenderingContext2D, faction: FactionId, col: number, x: number, y: number, size: number): boolean {
  const img = SHEETS.get(faction) ?? SHEETS.get('europe');
  if (!loaded(img)) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const src = img.naturalWidth / DIRS;
  ctx.drawImage(img, col * src, 0, src, src, x - size / 2, y - (PIVOT_Y / CELL) * size, size, size);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Draws a VT 1-2 at iso ground point (x, y); false while its sheet is loading. */
export function drawVt12Sheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  return blit(ctx, v.faction as FactionId, direction(v.heading), x, y, CELL * SCALE);
}

/** Sidebar cameo in `faction` colours; false while the sheet is loading. */
export function drawVt12Portrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  return blit(ctx, faction, direction(heading), w / 2, h * 0.62, Math.min(w, h) * 1.25);
}
