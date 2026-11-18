import { ISO_X, ISO_Y } from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { spriteUrl } from './spriteUrl';

/**
 * Missile-launcher emplacements of the Defense tab (R-12 Dvina), each drawn from three Blender sheets of
 * 32 facings in one row (tools/blender/dvina_sheet.py):
 *   <id>-base      fixed ground part (cell k carries the ground shadow of the launcher facing k), optional "<id>-base-team" mask
 *   <id>-launcher  turning launcher, plus "<id>-launcher-team" (faction band, tinted with the owner's hex colour)
 *   <id>-missile   the missiles alone on their rails - drawn only while loaded (separate, so they can be reused)
 */
export type SiteId = 'dvina';

interface SiteSheet {
  /** Layout grid px per cell (stored cell is 3× this), its ground point, and metres per grid px. */
  grid: number;
  pivot: [number, number];
  /** Height (m) where the missile leaves the rail. */
  railM: number;
}

const DIRS = 32;
const M_TO_GRID = 42 / 7.77;
/** Same draw scale as the LDEW emplacement: about 3 m across one tile (7 iso px wide). */
const PX_PER_M = 7 / 3;
const SITES: Record<SiteId, SiteSheet> = {
  dvina: { grid: 128, pivot: [64, 84], railM: 2.6 },
};

const IMAGES = new Map<string, HTMLImageElement>();
function image(file: string): HTMLImageElement {
  let img = IMAGES.get(file);
  if (!img) {
    img = new Image();
    img.src = spriteUrl(`${file}.webp`);
    IMAGES.set(file, img);
  }
  return img;
}
const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;
for (const id of Object.keys(SITES)) for (const p of ['base', 'base-team', 'launcher', 'launcher-team', 'missile']) image(`${id}-${p}`);

const TINTED = new Map<string, HTMLCanvasElement>();
function tinted(file: string, dir: number, hex: string): HTMLCanvasElement {
  const key = `${file}:${dir}:${hex}`;
  let c = TINTED.get(key);
  if (c) return c;
  const mask = image(file);
  const cell = mask.naturalHeight;
  c = document.createElement('canvas');
  c.width = c.height = cell;
  const g = c.getContext('2d')!;
  g.drawImage(mask, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = hex;
  g.fillRect(0, 0, cell, cell);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  TINTED.set(key, c);
  return c;
}

/** Sheet facing (0–31, clockwise from screen North) for a world heading. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** Draws the emplacement, ground point at iso (x, y); false while its sheets load. */
export function drawSite(ctx: CanvasRenderingContext2D, id: SiteId, b: { faction: string; aimHeading: number; loaded: boolean }, x: number, y: number, zoom = 1): boolean {
  const s = SITES[id];
  const base = image(`${id}-base`);
  const top = image(`${id}-launcher`);
  if (!ready(base) || !ready(top)) return false;
  const size = (s.grid / M_TO_GRID) * PX_PER_M * zoom;
  const left = x - (s.pivot[0] / s.grid) * size;
  const up = y - (s.pivot[1] / s.grid) * size;
  const d = direction(b.aimHeading);
  const hex = FACTIONS[b.faction as FactionId]?.colors.primary ?? '#c8c8c8';
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const cell = (img: HTMLImageElement): void => {
    if (ready(img)) ctx.drawImage(img, d * img.naturalHeight, 0, img.naturalHeight, img.naturalHeight, left, up, size, size);
  };
  // Faction band masks (Dvina: on the launcher cabinets), tinted with the owner's colour.
  const band = (file: string): void => {
    const m = image(file);
    if (ready(m)) ctx.drawImage(tinted(file, d, hex), 0, 0, m.naturalHeight, m.naturalHeight, left, up, size, size);
  };
  cell(base);
  band(`${id}-base-team`);
  cell(top);
  band(`${id}-launcher-team`);
  if (b.loaded) cell(image(`${id}-missile`));
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Height (iso px) above the ground point where the missile leaves the rail. */
export const siteRailHeight = (id: SiteId): number => SITES[id].railM * Math.cos(Math.PI / 6) * PX_PER_M;

/** Defense-tab cameo in `faction` colours (null while the sheets load). */
export function sitePreview(id: SiteId, faction: FactionId): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  // Fit about 12 m of launcher across the cameo.
  return drawSite(c.getContext('2d')!, id, { faction, aimHeading: Math.PI * 0.75, loaded: true }, 64, 70, 128 / (12 * PX_PER_M)) ? c : null;
}

// R-12 Dvina shorthands.
export const drawDvina = (ctx: CanvasRenderingContext2D, b: { faction: string; aimHeading: number; loaded: boolean }, x: number, y: number): boolean => drawSite(ctx, 'dvina', b, x, y);
export const dvinaRailHeight = (): number => siteRailHeight('dvina');
export const dvinaPreview = (faction: FactionId): HTMLCanvasElement | null => sitePreview('dvina', faction);
