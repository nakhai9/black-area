import type { Vehicle } from '../entities/Vehicle';
import type { FactionId } from '../types';
import { ISO_X, ISO_Y } from '../constants';
import { SAM_CELL, samLength, samPivotOffset, samSheetCell } from './SamModel';

/**
 * Air-defence vehicle (`mantis`) in the game: every nation's polygon model from SamModel (Patriot for the USA, SAMP/T NG
 * for Europe, S-400 for Russia, HQ-9 for China, PGZ-09 for the Islamic nations), rendered on demand into cached SAM_CELL
 * px pictures: 32 screen headings and a shadow for the chassis and for the traversing launcher, the burning wreck for 8
 * headings and 8 explosion frames.
 */
const DIRS = 32;
/** Iso px per cell px: every nation's vehicle about as long on screen as a supply truck, however long its model. */
const scale = (f: FactionId): number => 9 / samLength(f);
const BLOW_FRAMES = 8;
const BLOW_FRAME_SECONDS = 0.1;
const FADE_SECONDS = 0.8;
export const MANTIS_DEATH_SECONDS = 3;

/**
 * Blender sheets (tools/blender/mantis_<model>_sheet.py, vehiclekit contract): one row of 32 cells, column 0 = nose
 * up the screen, clockwise; LAYOUT layout px per cell with the vehicle's ground centre at ANCHOR and its overall length
 * spanning LENGTH layout px; the ground shadow is baked in. The polygon models stay as the fallback while a sheet loads.
 */
const SHEET_MODEL: Record<FactionId, string> = { usa: 'patriot', europe: 'sampt', russia: 's400', china: 'hq9', islamic: 'pgz09' };
const LAYOUT = 128;
const ANCHOR = { x: 64, y: 84 };
const LENGTH = 80;
/**
 * Iso px per sheet LENGTH, per nation: the vehicle is 1.5 x as long as the same nation's tank (side-on, column 8,
 * measured on the mantis-*.webp and tank-*-hull.webp sheets). Its width equals the tank's: set by MANTIS_WS in
 * tools/blender/mantis_<model>_sheet.py (the model is narrowed in Blender, not here).
 */
const SHEET_LENGTH_ISO: Record<FactionId, number> = { usa: 11.8, europe: 11.74, russia: 10.9, china: 11.28, islamic: 9.91 };
const SHEETS = new Map<FactionId, HTMLImageElement>();
function sheet(f: FactionId): HTMLImageElement | null {
  let img = SHEETS.get(f);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}sprites/mantis-${SHEET_MODEL[f]}.webp`;
    SHEETS.set(f, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Draws cell `d` of the nation's sheet with the ground centre at (x, y), `iso` iso px per vehicle length. */
function blitSheet(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, d: number, x: number, y: number, iso: number): void {
  const src = img.naturalWidth / DIRS;
  const k = iso / LENGTH; // iso px per layout px
  const size = LAYOUT * k;
  ctx.drawImage(img, d * src, 0, src, img.naturalHeight, x - ANCHOR.x * k, y - ANCHOR.y * k, size, size);
}

/** Starts the sheet downloads (the polygon models are used until they arrive, or if one is missing). */
export function loadMantisSprites(): Promise<void> {
  return Promise.all(
    (Object.keys(SHEET_MODEL) as FactionId[]).map(
      (f) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = `${import.meta.env.BASE_URL}sprites/mantis-${SHEET_MODEL[f]}.webp`;
          SHEETS.set(f, img);
        }),
    ),
  ).then(() => undefined);
}

/** Always true: the models are drawn in code (its air-defence vehicles die with its wreck). */
export function hasMantisSheet(_faction: FactionId): boolean {
  return true;
}

/** Direction (0–31) for a world heading: its direction on screen, clockwise from straight up. */
function direction(heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const a = Math.atan2((c - s) * ISO_X, -(c + s) * ISO_Y);
  return ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
}

/** Draws an air-defence vehicle with its ground point at (x, y) in iso px. False for anything else. */
export function drawMantisSheet(ctx: CanvasRenderingContext2D, v: Vehicle, x: number, y: number): boolean {
  if (v.type !== 'mantis') return false;
  const f = v.faction as FactionId;
  const d = direction(v.heading);
  const img = sheet(f);
  if (img) {
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    blitSheet(ctx, img, d, x, y, SHEET_LENGTH_ISO[f]);
    ctx.imageSmoothingEnabled = prev;
    return true;
  }
  const size = SAM_CELL * scale(f);
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.35;
  // The launcher is fixed to the chassis (drawn at the hull heading).
  const t = d;
  const o = samPivotOffset(f, d);
  const lx = x + o.x * scale(f);
  const ly = y + o.y * scale(f);
  ctx.drawImage(samSheetCell(f, { kind: 'shadow', dir: d }), x - half, y - half, size, size);
  ctx.drawImage(samSheetCell(f, { kind: 'launcherShadow', dir: t }), lx - half, ly - half, size, size);
  ctx.globalAlpha = alpha;
  ctx.drawImage(samSheetCell(f, { kind: 'drive', dir: d }), x - half, y - half, size, size);
  ctx.drawImage(samSheetCell(f, { kind: 'launcher', dir: t }), lx - half, ly - half, size, size);
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/** Sidebar cameo of the nation's air-defence vehicle (`heading` world radians). */
export function drawMantisPortrait(ctx: CanvasRenderingContext2D, faction: FactionId, w: number, h: number, heading: number): boolean {
  const d = direction(heading);
  const img = sheet(faction);
  if (img) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    blitSheet(ctx, img, d, w / 2, h * 0.62, w * 0.8);
    ctx.restore();
    return true;
  }
  const size = Math.min(w, h) * 1.6;
  const o = samPivotOffset(faction, d);
  const k = size / SAM_CELL;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(samSheetCell(faction, { kind: 'drive', dir: d }), (w - size) / 2, (h - size) / 2, size, size);
  ctx.drawImage(samSheetCell(faction, { kind: 'launcher', dir: d }), (w - size) / 2 + o.x * k, (h - size) / 2 + o.y * k, size, size);
  ctx.restore();
  return true;
}

/** An air-defence vehicle's death (`age` s into a `ttl` s effect, world `heading`) at iso ground point (x, y): blast, then its burning wreck, fading out. */
export function drawMantisDeath(ctx: CanvasRenderingContext2D, faction: FactionId, heading: number, x: number, y: number, age: number, ttl: number): void {
  const size = SAM_CELL * scale(faction);
  const half = size / 2;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.max(0, Math.min(1, (ttl - age) / FADE_SECONDS));
  const img = sheet(faction);
  if (img) {
    // Burnt-out wreck: the vehicle's own cell, darkened and desaturated.
    const prevFilter = ctx.filter;
    ctx.filter = 'brightness(0.32) saturate(0.4)';
    blitSheet(ctx, img, direction(heading), x, y, SHEET_LENGTH_ISO[faction]);
    ctx.filter = prevFilter;
  } else ctx.drawImage(samSheetCell(faction, { kind: 'wreck', dir: (Math.round(direction(heading) / 4) % 8) * 4 }), x - half, y - half, size, size);
  if (age < BLOW_FRAMES * BLOW_FRAME_SECONDS) ctx.drawImage(samSheetCell(faction, { kind: 'blast', frame: Math.floor(age / BLOW_FRAME_SECONDS) }), x - half, y - half, size, size);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
