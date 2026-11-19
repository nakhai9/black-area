import { FACTIONS } from '../factions';
import type { FactionId } from '../types';
import { lazyImage } from './onDemand';
import { spriteUrl } from './spriteUrl';

/**
 * RS-24 Yars missile (tools/blender/yars_render.py): 32 facings in one row, "yars-missile" plus the faction band mask
 * "yars-missile-team" (tinted with the owner's hex colour). Used by the Defense-tab cameo and the ICBM in flight (drawYarsMissile).
 */
const IMAGES = new Map<string, HTMLImageElement>();
function image(file: string): HTMLImageElement {
  let img = IMAGES.get(file);
  if (!img) {
    img = lazyImage(spriteUrl(`${file}.webp`));
    IMAGES.set(file, img);
  }
  return img;
}
const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;
image('yars-missile');
image('yars-missile-team');

/** Facing shown on the cameo: nose to the upper right (NE). */
const CAMEO_DIR = 4;

/** Defense-tab cameo in `faction` colours (null while the sheets load). */
export function yarsPreview(faction: FactionId): HTMLCanvasElement | null {
  const body = image('yars-missile');
  const team = image('yars-missile-team');
  if (!ready(body) || !ready(team)) return null;
  const cell = body.naturalHeight;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  // The missile fills about the middle 70 % of the stored cell: crop to it.
  const crop = cell * 0.7;
  const sx = CAMEO_DIR * cell + (cell - crop) / 2;
  const sy = (cell - crop) / 2;
  const size = 116;
  const dx = (c.width - size) / 2;
  const dy = (c.height - size) / 2;
  g.imageSmoothingEnabled = true;
  g.drawImage(body, sx, sy, crop, crop, dx, dy, size, size);
  // Faction band: mask tinted with the owner's colour.
  const t = document.createElement('canvas');
  t.width = c.width;
  t.height = c.height;
  const tg = t.getContext('2d')!;
  tg.drawImage(team, sx, sy, crop, crop, dx, dy, size, size);
  tg.globalCompositeOperation = 'multiply';
  tg.fillStyle = FACTIONS[faction]?.colors.primary ?? '#c8c8c8';
  tg.fillRect(0, 0, t.width, t.height);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(team, sx, sy, crop, crop, dx, dy, size, size);
  g.drawImage(t, 0, 0);
  return c;
}

/** Sheet scale (tools/blender/yars_render.py): GRID px cell, M_TO_GRID grid px per metre, 32 facings (0 = screen North, clockwise). */
const GRID = 160;
const M_TO_GRID = 42 / 7.77;
const DIRS = 32;
/** Iso px per metre on the battlefield, and the same 0.5 game scale as the Dvina missile (22.6 m → ~26 iso px). */
const PX_PER_M = 7 / 3;
const GAME_SCALE = 0.5;
/** Opaque-pixel centre of each facing (cell px), measured once. */
const CENTRE = new Map<number, { x: number; y: number } | null>();
/** Faction-tinted copy of each facing, per owner colour. */
const TINTED = new Map<string, HTMLCanvasElement>();

function centre(img: HTMLImageElement, dir: number): { x: number; y: number } | null {
  if (CENTRE.has(dir)) return CENTRE.get(dir)!;
  const cell = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = c.height = cell;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  const data = g.getImageData(0, 0, cell, cell).data;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (data[(y * cell + x) * 4 + 3]! > 40) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  const out = n > 0 ? { x: sx / n, y: sy / n } : null;
  CENTRE.set(dir, out);
  return out;
}

function tinted(body: HTMLImageElement, team: HTMLImageElement, dir: number, color: string): HTMLCanvasElement {
  const key = `${dir}:${color}`;
  let c = TINTED.get(key);
  if (c) return c;
  const cell = body.naturalHeight;
  c = document.createElement('canvas');
  c.width = c.height = cell;
  const g = c.getContext('2d')!;
  g.drawImage(body, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  const t = document.createElement('canvas');
  t.width = t.height = cell;
  const tg = t.getContext('2d')!;
  tg.drawImage(team, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  tg.globalCompositeOperation = 'multiply';
  tg.fillStyle = color;
  tg.fillRect(0, 0, cell, cell);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(team, dir * cell, 0, cell, cell, 0, 0, cell, cell);
  g.drawImage(t, 0, 0);
  TINTED.set(key, c);
  return c;
}

/** Iso px from the missile's centre to its tail (motor flame) on the battlefield. */
export const YARS_HALF_LENGTH = (22.6 / 2) * PX_PER_M * GAME_SCALE;

/**
 * The Yars ICBM in flight, centred at iso (x, y), nose along the unit screen vector (ux, uy), in `faction` colours.
 * False while the sheets load (the caller draws its fallback).
 */
export function drawYarsMissile(ctx: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, faction: FactionId): boolean {
  const body = image('yars-missile');
  const team = image('yars-missile-team');
  if (!ready(body) || !ready(team)) return false;
  const a = Math.atan2(ux, -uy);
  const d = ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
  const m = centre(body, d);
  if (!m) return false;
  const cell = body.naturalHeight;
  const size = (GRID / M_TO_GRID) * PX_PER_M * GAME_SCALE;
  const k = size / cell;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tinted(body, team, d, FACTIONS[faction]?.colors.primary ?? '#c8c8c8'), x - m.x * k, y - m.y * k, size, size);
  ctx.imageSmoothingEnabled = prev;
  return true;
}
