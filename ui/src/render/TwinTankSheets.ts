import { ISO_X, ISO_Y } from '../constants';
import type { Vehicle } from '../entities/Vehicle';
import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { lazyImage } from './onDemand';
import { spriteUrl } from './spriteUrl';
import { tintedCell } from './TeamTint';

/**
 * Twins Shots Tank (Japan's holder), rendered once by tools/blender/twintank_render.py in neutral grey: a hull
 * sheet (tank-twin-hull, with its shadow) and a turret sheet (tank-twin-turret, both guns) drawn over it and turned on
 * its own, each with a faction mask (-team) tinted with the owner's colour. The turret sheets have two rows: row 0 guns
 * level, row 1 guns raised at a helicopter (Vehicle.gunsUp). 32 columns — screen headings clockwise from
 * N — 96 px layout cells stored at 384 px; both share the ground point under the turret ring (PIVOT_Y).
 */
const DIRS = 32;
const CELL = 96;
const PIVOT_Y = 54;
/** Iso px per layout px: the same px per metre as the other ground sheets. */
const SCALE = 0.1693;

const load = (file: string): HTMLImageElement => {
  return lazyImage(spriteUrl(file));
};
const HULL = load('tank-twin-hull.webp');
const HULL_TEAM = load('tank-twin-hull-team.webp');
const TURRET = load('tank-twin-turret.webp');
const TURRET_TEAM = load('tank-twin-turret-team.webp');
const loaded = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

function blit(ctx: CanvasRenderingContext2D, faction: FactionId, hullCol: number, turretCol: number, x: number, y: number, size: number, gunsUp = false): boolean {
  if (!loaded(HULL) || !loaded(TURRET)) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const hex = FACTIONS[faction].colors.primary;
  const left = x - size / 2;
  const top = y - (PIVOT_Y / CELL) * size;
  for (const [img, team, key, col, row] of [[HULL, HULL_TEAM, 'twin-hull', hullCol, 0], [TURRET, TURRET_TEAM, 'twin-turret', turretCol, gunsUp ? 1 : 0]] as const) {
    const src = img.naturalWidth / DIRS;
    ctx.drawImage(img, col * src, row * src, src, src, left, top, size, size);
    if (loaded(team)) ctx.drawImage(tintedCell(team, key, col, DIRS, hex, row), left, top, size, size);
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Draws a Twins Shots Tank at iso ground point (x, y); false while its sheets are loading. */
export function drawTwinTankSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  return blit(ctx, v.faction as FactionId, direction(v.heading), direction(v.turretHeading), x, y, CELL * SCALE, v.gunsUp);
}

/** Sidebar cameo in `faction` colours; false while the sheets are loading. */
export function drawTwinTankPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const d = direction(heading);
  return blit(ctx, faction, d, d, w / 2, h * 0.62, Math.min(w, h) * 1.25);
}
