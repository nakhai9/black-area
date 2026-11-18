import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { lazyImage } from './onDemand';
import { spriteUrl } from './spriteUrl';
import { tintedCell } from './TeamTint';

/**
 * Bushmaster PMV (Australia), rendered once by tools/blender/bushmaster_render.py: a neutral sheet (bushmaster, with
 * its shadow) and its faction mask (bushmaster-team) tinted with the owner's colour. 32 columns — screen headings
 * clockwise from N — 96 px layout cells stored at 384 px, the ground centre at PIVOT_Y.
 */
const DIRS = 32;
const CELL = 96;
const PIVOT_Y = 54;
/** Iso px per layout px: the same px per metre as the other ground sheets. */
const SCALE = 0.1693;

const load = (file: string): HTMLImageElement => {
  return lazyImage(spriteUrl(file));
};
const BASE = load('bushmaster.webp');
const TEAM = load('bushmaster-team.webp');
const loaded = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

function blit(ctx: CanvasRenderingContext2D, faction: FactionId, col: number, x: number, y: number, size: number): boolean {
  if (!loaded(BASE)) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const src = BASE.naturalWidth / DIRS;
  const left = x - size / 2;
  const top = y - (PIVOT_Y / CELL) * size;
  ctx.drawImage(BASE, col * src, 0, src, src, left, top, size, size);
  if (loaded(TEAM)) ctx.drawImage(tintedCell(TEAM, 'bushmaster', col, DIRS, FACTIONS[faction].colors.primary), left, top, size, size);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Draws a Bushmaster at iso ground point (x, y); false while its sheet is loading. */
export function drawBushmasterSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  return blit(ctx, v.faction as FactionId, direction(v.heading), x, y, CELL * SCALE);
}

/** Sidebar cameo in `faction` colours; false while the sheet is loading. */
export function drawBushmasterPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  return blit(ctx, faction, direction(heading), w / 2, h * 0.62, Math.min(w, h) * 1.25);
}
