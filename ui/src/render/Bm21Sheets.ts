import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { spriteUrl } from './spriteUrl';

/**
 * BM-21 Grad, rendered by tools/blender/bm21_render.py: the Ural-4320 truck in its owner's colours
 * (ural4320-<faction>-chassis, with the truck's shadow) and the launcher module drawn over it (bm21-launcher, the same
 * for every nation, its own shadow, cut away where the truck stands in front of it). 32 columns each — screen headings
 * clockwise from N — 64 px layout cells stored at 256 px, the ground point at PIVOT.
 */
const DIRS = 32;
const CELL = 64;
const PIVOT_Y = 41;
/** Iso px per layout px: the modular trucks' true scale (TruckSheets KAMAZ_SCALE). */
export const BM21_SCALE = 0.1693;

const sheet = (file: string): HTMLImageElement => {
  const img = new Image();
  img.src = spriteUrl(`${file}.webp`);
  return img;
};
const FACTIONS: readonly FactionId[] = ['usa', 'russia', 'china', 'europe', 'islamic'];
const CHASSIS = new Map<FactionId, HTMLImageElement>(FACTIONS.map((f) => [f, sheet(`ural4320-${f}-chassis`)]));
const LAUNCHER = sheet('bm21-launcher');
const loaded = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

/** Sheet column (0–31, clockwise from screen North) for a world heading, as the truck sheets. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** Truck then launcher, column `col`, ground point at (x, y), one layout cell drawn `size` px square. */
function blit(ctx: CanvasRenderingContext2D, faction: FactionId, col: number, x: number, y: number, size: number, filter = ''): boolean {
  const chassis = CHASSIS.get(faction) ?? CHASSIS.get('russia');
  if (!loaded(chassis) || !loaded(LAUNCHER)) return false;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevFilter = ctx.filter;
  ctx.imageSmoothingEnabled = true;
  if (filter) ctx.filter = filter;
  const top = y - (PIVOT_Y / CELL) * size;
  for (const img of [chassis, LAUNCHER]) {
    const src = img.naturalWidth / DIRS;
    ctx.drawImage(img, col * src, 0, src, src, x - size / 2, top, size, size);
  }
  ctx.filter = prevFilter;
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Draws a BM-21 at iso ground point (x, y); false while its sheets are loading. */
export function drawBm21Sheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  return blit(ctx, v.faction as FactionId, direction(v.heading), x, y, CELL * BM21_SCALE);
}

/** Sidebar cameo in `faction` colours; false while the sheets are loading. */
export function drawBm21Portrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  return blit(ctx, faction, direction(heading), w / 2, h * 0.66, Math.min(w, h) * 1.3);
}
